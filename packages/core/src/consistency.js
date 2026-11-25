// Consistency Protection: every number the Habits "Consistency" view shows, as pure functions (no React, no Supabase, nothing written).
//
// The rules, in one place so the screen can print them (nothing here is hidden):
//  1. A day only counts against you when the habit was EXPECTED that day: it is on the schedule, after the start date, not a planned rest day
//     and not inside a pause. Anything else is neutral.
//  2. A check-in is never edited or hidden. "Done" always counts, even on a rest day (a bonus), and a skipped/rest log is neutral.
//  3. Today never counts as missed until it is over.
//  4. Weekly ("X times a week") habits are judged per week against their target, not per day.
import { addDays, diffDays, eachDay, startOfWeek, weekday } from '@lifetrack/utils'
import { isPaused, isScheduled, streaks } from './streaks'

export const RECOVERY_WINDOW_DAYS = 7

const byDate = (logs) => new Map(logs.map((l) => [l.log_date, l]))

/**
 * What a single day was, for one habit. One of:
 * done | recovered (done, but checked in later) | skipped | rest (log) | planned-rest | paused | missed | pending | upcoming | off (not scheduled) | before (before the start)
 */
export function dayKind(habit, logMap, date, today) {
  if (date < habit.start_date) return 'before'
  const l = logMap.get(date)
  if (l?.status === 'done') return l.recovered_at ? 'recovered' : 'done'
  if (l?.status === 'skipped') return 'skipped'
  if (l?.status === 'rest') return 'rest'
  if (isPaused(habit, date)) return 'paused'
  if ((habit.rest_days ?? []).includes(weekday(date))) return 'planned-rest'
  if (date > today) return 'upcoming'
  if (habit.frequency === 'weekly') return date === today ? 'pending' : 'off'
  if (!isScheduled(habit, date)) return 'off'
  return date === today ? 'pending' : 'missed'
}

/** Days of `month` ('yyyy-MM') as [{ date, kind }] for a monthly heatmap, plus the leading blanks for the week layout. */
export function monthMap(habit, logs, month, today, weekStartsOn = 1) {
  const map = byDate(logs)
  const first = `${month}-01`
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1))
  const last = addDays(next.toISOString().slice(0, 10), -1)
  const days = eachDay(first, last).map((date) => ({ date, kind: dayKind(habit, map, date, today) }))
  const lead = (weekday(first) - weekStartsOn + 7) % 7
  return { days, lead }
}

const COUNTS = ['done', 'recovered', 'skipped', 'rest', 'planned-rest', 'paused', 'missed', 'pending', 'upcoming', 'off', 'before']

/** Count the days of [from,to] by kind. */
export function kindCounts(habit, logs, from, to, today) {
  const map = byDate(logs)
  const out = Object.fromEntries(COUNTS.map((k) => [k, 0]))
  for (const d of eachDay(from, to)) out[dayKind(habit, map, d, today)]++
  return out
}

/**
 * This week's consistency, with the working shown. Daily/custom habits: done ÷ expected days so far. Weekly habits: done ÷ target.
 * `expected` never includes rest, paused or skipped days; `neutral` lists what was left out and why.
 */
export function weeklyConsistency(habit, logs, today, weekStartsOn = 1) {
  const start = startOfWeek(today, weekStartsOn)
  const end = addDays(start, 6)
  const c = kindCounts(habit, logs, start, end, today)
  const done = c.done + c.recovered
  if (habit.frequency === 'weekly') {
    const target = habit.weekly_target
    return { unit: 'week', done, expected: target, rate: Math.min(1, done / target), counts: c, start, end, neutral: [] }
  }
  const expected = done + c.missed + c.pending // pending = today, still open: part of the plan, not yet a miss
  const neutral = []
  if (c.skipped + c.rest) neutral.push(`${c.skipped + c.rest} skipped`)
  if (c['planned-rest']) neutral.push(`${c['planned-rest']} planned rest`)
  if (c.paused) neutral.push(`${c.paused} paused`)
  return { unit: 'day', done, expected, rate: expected ? Math.min(1, done / expected) : null, counts: c, start, end, neutral }
}

/** Longest streak, best week and month, totals and the first check-in: records for one habit. All derived, none stored. */
export function personalRecords(habit, logs, today, weekStartsOn = 1) {
  const { longest, unit } = streaks(habit, logs, today, weekStartsOn)
  const done = logs.filter((l) => l.status === 'done')
  const perWeek = new Map()
  const perMonth = new Map()
  for (const l of done) {
    const w = startOfWeek(l.log_date, weekStartsOn)
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1)
    const m = l.log_date.slice(0, 7)
    perMonth.set(m, (perMonth.get(m) ?? 0) + 1)
  }
  const best = (m) => [...m.entries()].reduce((b, e) => (e[1] > (b?.[1] ?? 0) ? e : b), null)
  const bw = best(perWeek)
  const bm = best(perMonth)
  const first = done.reduce((m, l) => (!m || l.log_date < m ? l.log_date : m), null)
  return {
    longestStreak: longest,
    streakUnit: unit,
    totalDone: done.length,
    bestWeek: bw ? { start: bw[0], count: bw[1] } : null,
    bestMonth: bm ? { month: bm[0], count: bm[1] } : null,
    firstDone: first,
    recovered: done.filter((l) => l.recovered_at).length,
  }
}

/**
 * Scheduled days in the last `window` days (today excluded) with no check-in: what a person could still recover.
 * Only daily/custom habits: a weekly habit has no "missed day", the week is simply not over, or it is.
 */
export function missedDays(habit, logs, today, window = RECOVERY_WINDOW_DAYS) {
  if (habit.archived_at || habit.frequency === 'weekly') return []
  const map = byDate(logs)
  const from = addDays(today, -window)
  return eachDay(from < habit.start_date ? habit.start_date : from, addDays(today, -1)).filter(
    (d) => dayKind(habit, map, d, today) === 'missed',
  )
}

/** Everything recoverable across habits: [{ habit, dates }], skipping habits with nothing missed. */
export function recoverable(stats, today, window = RECOVERY_WINDOW_DAYS) {
  return stats
    .filter((s) => !s.habit.archived_at)
    .map((s) => ({ habit: s.habit, dates: missedDays(s.habit, s.logs, today, window) }))
    .filter((r) => r.dates.length)
}

/** Check-ins that were made up after the day, newest first. */
export function recoveryHistory(habits, logs) {
  const name = new Map(habits.map((h) => [h.id, h]))
  return logs
    .filter((l) => l.recovered_at && l.status === 'done' && name.has(l.habit_id))
    .map((l) => ({
      id: l.id,
      habit: name.get(l.habit_id),
      date: l.log_date,
      recoveredAt: l.recovered_at,
      daysLate: Math.max(0, diffDays(l.recovered_at.slice(0, 10), l.log_date)),
    }))
    .sort((a, b) => (a.recoveredAt < b.recoveredAt ? 1 : -1))
}

/** Plain-language account of the current streak: what counted, what was ignored and what ended it. For the "How is this calculated?" panel. */
export function explainStreak(habit, logs, today, weekStartsOn = 1) {
  const { current, longest, unit } = streaks(habit, logs, today, weekStartsOn)
  const lines = []
  if (habit.frequency === 'weekly') {
    lines.push(`A week counts when you check in ${habit.weekly_target}× or more. The running week never breaks your streak.`)
  } else {
    lines.push('Each expected day you check in adds one. Rest days, paused days and skipped days are ignored, not counted against you.')
    const map = byDate(logs)
    let broke = null
    for (let d = today; d >= habit.start_date; d = addDays(d, -1)) {
      if (dayKind(habit, map, d, today) === 'missed') {
        broke = d
        break
      }
    }
    if (broke) lines.push(`Your streak began after the missed day on ${broke}.`)
    else if (current) lines.push('You have not missed an expected day since you started.')
  }
  if ((habit.rest_days ?? []).length) lines.push('Planned rest days are never expected, so they cannot be missed.')
  if (habit.pauses?.length) lines.push('Days inside a pause are neutral. Pausing never erases past check-ins.')
  lines.push('Your history is never edited: only the days that were expected are counted.')
  return { current, longest, unit, lines }
}
