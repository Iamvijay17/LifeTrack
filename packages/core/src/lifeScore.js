// Life Score: the daily score (./score) rolled up over a period, with a per-category breakdown and trend buckets.
// Pure functions over `scoreFor(date) -> dailyScore result`, so the caller decides where the records come from and caches the days.
//
// Rules (shown to the user in the Life Score dialog):
//  1. A day only counts when it has a score. A day with nothing planned or logged has score null, and is left out of every average
//     instead of being treated as a zero.
//  2. A day's score is the sum over its categories of (fraction done × share of the score). `points` below is that product, averaged
//     over the counted days, so the category points always add up to the period score.
//  3. A category that was not planned or logged on a day has no share that day, so a category you do not track never lowers the score.
import { addDays, addMonths, eachDay, fmtDay, monthStart, startOfWeek } from '@lifetrack/utils'
import { SCORE_CATEGORIES } from './score'

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * Roll a list of daily score results up into one score and a breakdown.
 * @param results dailyScore() results (null-scored days allowed)
 * @returns { score, days, scoredDays, categories: [{ key, label, fraction, points, share, applicableDays }] }
 *   `fraction` is the average completion on the days the category applied (null if it never did), `share` the average share of the score
 *   it carried on counted days, `points` what it added to the score (share × fraction), `applicableDays` how many days it applied.
 */
export function summarizeScores(results) {
  const scored = results.filter((r) => r.score != null)
  const categories = SCORE_CATEGORIES.map((c) => {
    const rows = scored.map((r) => r.categories.find((x) => x.key === c.key)).filter((x) => x?.applicable && x.effectiveWeight > 0)
    const points = scored.length
      ? scored.reduce((a, r) => {
          const x = r.categories.find((y) => y.key === c.key)
          return a + (x?.applicable && x.effectiveWeight > 0 ? x.fraction * x.effectiveWeight : 0)
        }, 0) / scored.length
      : 0
    const share = scored.length ? rows.reduce((a, x) => a + x.effectiveWeight, 0) / scored.length : 0
    return {
      key: c.key,
      label: c.label,
      hint: c.hint,
      fraction: rows.length ? mean(rows.map((x) => x.fraction)) : null,
      points,
      share,
      applicableDays: rows.length,
    }
  })
  const score = scored.length ? Math.round(categories.reduce((a, c) => a + c.points, 0)) : null
  return { score, days: results.length, scoredDays: scored.length, categories }
}

/** The dates a period covers, ending today. */
export const PERIODS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
]
export const periodDates = (today, days) => eachDay(addDays(today, -(days - 1)), today)

/**
 * The Life Score for the last `days` days (ending today) and the same-length period before it, so the change can be shown.
 * `change` is null unless both periods have a score.
 */
export function lifeScore(scoreFor, today, days = 7) {
  const current = summarizeScores(periodDates(today, days).map(scoreFor))
  const previous = summarizeScores(periodDates(addDays(today, -days), days).map(scoreFor))
  return { ...current, previous: previous.score, change: current.score != null && previous.score != null ? current.score - previous.score : null }
}

/** The trend charts: `daily` (last 14 days), `weekly` (last 8 weeks) and `monthly` (last 6 months). */
export const TREND_RANGES = [
  { key: 'daily', label: 'Daily', count: 14 },
  { key: 'weekly', label: 'Weekly', count: 8 },
  { key: 'monthly', label: 'Monthly', count: 6 },
]

/**
 * Buckets for a trend chart, oldest first. Each is { key, label, from, to, score, scoredDays, days, partial }. A bucket with no scored
 * day has score null so the chart leaves a gap instead of drawing a zero. The current week or month is `partial`: it only has the days so far.
 */
export function scoreTrend(scoreFor, today, range = 'daily', weekStartsOn = 1) {
  const count = TREND_RANGES.find((r) => r.key === range)?.count ?? 14
  const buckets = []
  if (range === 'daily') {
    for (let i = count - 1; i >= 0; i--) {
      const d = addDays(today, -i)
      buckets.push({ key: d, label: fmtDay(d, 'd MMM'), from: d, to: d })
    }
  } else if (range === 'weekly') {
    const thisWeek = startOfWeek(today, weekStartsOn)
    for (let i = count - 1; i >= 0; i--) {
      const from = addDays(thisWeek, -7 * i)
      buckets.push({ key: from, label: fmtDay(from, 'd MMM'), from, to: addDays(from, 6) })
    }
  } else {
    const thisMonth = monthStart(today)
    for (let i = count - 1; i >= 0; i--) {
      const from = addMonths(thisMonth, -i)
      buckets.push({ key: from, label: fmtDay(from, 'MMM'), from, to: addDays(addMonths(from, 1), -1) })
    }
  }
  return buckets.map((b) => {
    const to = b.to > today ? today : b.to
    const s = summarizeScores(eachDay(b.from, to).map(scoreFor))
    return { ...b, to, score: s.score, scoredDays: s.scoredDays, days: s.days, partial: b.to > today }
  })
}

/** Plain-language account of one period's score: how each category contributed, and why untracked ones were left out. */
export function explainLifeScore(summary) {
  if (summary.score == null) return 'Nothing was planned or recorded in this period, so there is no Life Score yet. Add a task, habit, workout or study session to start.'
  const used = summary.categories.filter((c) => c.points > 0 || c.applicableDays > 0)
  const parts = used.map((c) => `${c.label} ${c.points.toFixed(1)}`)
  const idle = summary.categories.filter((c) => c.applicableDays === 0).map((c) => c.label)
  const days = `${summary.scoredDays} of ${summary.days} day${summary.days === 1 ? '' : 's'} had something planned or recorded`
  return `${parts.join(' + ')} = ${summary.score}. ${days}; the others are not counted.${idle.length ? ` ${idle.join(', ')} had nothing planned or recorded, so ${idle.length > 1 ? 'they do' : 'it does'} not lower the score.` : ''}`
}
