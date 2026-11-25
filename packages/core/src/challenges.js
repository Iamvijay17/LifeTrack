// Personal Challenge Center: the rules, as pure functions shared by web and mobile. Nothing here reads a clock or a database.
//
// A challenge is a DATED commitment with a rhythm (how it differs from a habit: a habit repeats forever, a challenge has a start, an end and a result):
//   daily   `target` units EVERY day (target 1 = a plain yes/no day). A day counts when its amount reaches the target.
//   weekly  `target` check-in days in each 7-day block counted from the start date (the challenge's own weeks, not calendar weeks).
//   total   reach `target` units by the end date, in any pattern; each check-in adds its amount.
// All dates are 'yyyy-MM-dd' in the person's own timezone; `today` is passed in (see challengeToday), so "today" is the same everywhere in this file.
// Paused windows ([{from, to|null}], to = null means still paused) are NEUTRAL days: not expected, never missed, never counted against anyone.
// An optional linked habit lends its "done" days as check-ins (daily and weekly only), so a habit is never logged twice.
import { addDays, diffDays, eachDay, isValidDay, startOfWeek, todayStr } from '@lifetrack/utils'

export const CHALLENGE_KINDS = [
  { key: 'daily', label: 'Daily', hint: 'Do it every day of the challenge.' },
  { key: 'weekly', label: 'Weekly', hint: 'Hit a number of days in each week.' },
  { key: 'total', label: 'Total target', hint: 'Reach a total amount by the end date.' },
]
export const CHALLENGE_STATUSES = ['active', 'paused', 'completed', 'cancelled']
export const CHALLENGE_CATEGORIES = ['Learning', 'Fitness', 'Health', 'Mindfulness', 'Finance', 'Creative', 'Social', 'Personal']
export const CHALLENGE_COLORS = ['#8B5CF6', '#6366F1', '#38BDF8', '#14B8A6', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899']
export const MAX_DURATION_DAYS = 731
export const MAX_EVIDENCE = 5
export const MAX_TARGET = 10000000
export const DEFAULT_MILESTONES = [
  { pct: 25, title: 'A quarter of the way' },
  { pct: 50, title: 'Halfway there' },
  { pct: 75, title: 'Three quarters done' },
  { pct: 100, title: 'Finish line' },
]

/** Ready-made starting points. Picking one only fills the form; the person still chooses the dates. */
export const BUILT_IN_TEMPLATES = [
  { key: 'read-30', name: '30 days of reading', description: 'Read a little every single day.', kind: 'daily', target: 20, unit: 'pages', duration_days: 30, category: 'Learning', color: '#8B5CF6' },
  { key: 'move-daily', name: '21 days of movement', description: 'Move your body for at least 30 minutes a day.', kind: 'daily', target: 30, unit: 'min', duration_days: 21, category: 'Fitness', color: '#F97316' },
  { key: 'gym-weekly', name: '8 weeks of gym', description: 'Train four days every week.', kind: 'weekly', target: 4, unit: '', duration_days: 56, category: 'Fitness', color: '#EF4444' },
  { key: 'steps-total', name: '200,000 steps this month', description: 'Walk a total of 200,000 steps.', kind: 'total', target: 200000, unit: 'steps', duration_days: 30, category: 'Health', color: '#10B981' },
  { key: 'meditate-14', name: '14 days of stillness', description: 'Sit quietly for ten minutes every day.', kind: 'daily', target: 10, unit: 'min', duration_days: 14, category: 'Mindfulness', color: '#38BDF8' },
  { key: 'save-total', name: 'Save 10,000 in 60 days', description: 'Put money aside whenever you can.', kind: 'total', target: 10000, unit: '₹', duration_days: 60, category: 'Finance', color: '#14B8A6' },
  { key: 'write-weekly', name: 'Write three times a week', description: 'Journal or draft on three days each week for ten weeks.', kind: 'weekly', target: 3, unit: '', duration_days: 70, category: 'Creative', color: '#EC4899' },
  { key: 'study-100h', name: '100 hours of study', description: 'Reach 100 hours of focused study in 90 days.', kind: 'total', target: 100, unit: 'hours', duration_days: 90, category: 'Learning', color: '#6366F1' },
]

const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.trunc(n)))
const isInt = (n) => Number.isInteger(n)
const isHex = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)

/** The person's "today" in their timezone: the one place a challenge learns what day it is. */
export const challengeToday = (tz, now = new Date()) => todayStr(tz, now)

export const durationDays = (c) => diffDays(c.end_date, c.start_date) + 1
export const isClosed = (c) => c.status === 'completed' || c.status === 'cancelled'

/** Build a new challenge's fields from a template (built-in or saved) starting on `start`. */
export function challengeFromTemplate(t, start) {
  const days = clampInt(t.duration_days ?? 30, 1, MAX_DURATION_DAYS)
  return {
    title: t.name ?? t.title ?? '',
    description: t.description ?? '',
    kind: t.kind ?? 'daily',
    target: t.target ?? 1,
    unit: t.unit ?? '',
    start_date: start,
    end_date: addDays(start, days - 1),
    category: t.category ?? 'Personal',
    color: t.color ?? '#8B5CF6',
    milestones: Array.isArray(t.milestones) ? t.milestones : [],
    template_key: t.key ?? null,
  }
}

/** The reusable part of a challenge (no dates, no progress): what "save as template" stores. */
export const templateFromChallenge = (c, name = c.title) => ({
  name,
  description: c.description ?? '',
  kind: c.kind,
  target: c.target,
  unit: c.unit ?? '',
  duration_days: durationDays(c),
  category: c.category,
  color: c.color,
  milestones: normalizeMilestones(c.milestones),
})

/** Milestones as {pct 1..100, title}, sorted, one per percentage. An empty list means "use the default four". */
export function normalizeMilestones(list) {
  const seen = new Set()
  const out = []
  for (const m of Array.isArray(list) ? list : []) {
    const pct = Number(m?.pct)
    const title = String(m?.title ?? '').trim().slice(0, 80)
    if (!isInt(pct) || pct < 1 || pct > 100 || seen.has(pct)) continue
    seen.add(pct)
    out.push({ pct, title: title || `${pct}% reached` })
  }
  return out.sort((a, b) => a.pct - b.pct).slice(0, 10)
}
export const effectiveMilestones = (c) => {
  const own = normalizeMilestones(c.milestones)
  return own.length ? own : DEFAULT_MILESTONES
}

/** Field-by-field problems with a challenge a person is about to save. Returns {} when it is fine. */
export function challengeProblems(c) {
  const e = {}
  const title = String(c.title ?? '').trim()
  if (!title) e.title = 'Give your challenge a name.'
  else if (title.length > 120) e.title = 'Keep the name under 120 characters.'
  if (!CHALLENGE_KINDS.some((k) => k.key === c.kind)) e.kind = 'Pick daily, weekly or total.'
  if (!isInt(c.target) || c.target < 1) e.target = 'The target must be a whole number of at least 1.'
  else if (c.target > MAX_TARGET) e.target = 'The target cannot be more than 10,000,000.'
  else if (c.kind === 'weekly' && c.target > 7) e.target = 'A week only has 7 days.'
  if (String(c.unit ?? '').length > 30) e.unit = 'Keep the unit under 30 characters.'
  if (!isValidDay(c.start_date)) e.start_date = 'Pick a start date.'
  if (!isValidDay(c.end_date)) e.end_date = 'Pick an end date.'
  if (!e.start_date && !e.end_date) {
    if (c.end_date < c.start_date) e.end_date = 'The end date cannot be before the start date.'
    else if (durationDays(c) > MAX_DURATION_DAYS) e.end_date = 'A challenge can run for at most two years.'
    else if (c.kind === 'weekly' && durationDays(c) < 7) e.end_date = 'A weekly challenge needs at least one full week.'
  }
  if (c.color != null && !isHex(c.color)) e.color = 'Pick one of the colours.'
  if (c.habit_id && c.kind === 'total') e.habit_id = 'A habit can only be linked to a daily or weekly challenge.'
  if (String(c.description ?? '').length > 1000) e.description = 'Keep the description under 1,000 characters.'
  if (Array.isArray(c.milestones) && c.milestones.length > 10) e.milestones = 'Use at most 10 milestones.'
  return e
}

// --------------------------------------------------------------------------------------------------------------------- pauses
/** Pause windows, cleaned: valid days only, sorted, each as {from, to|null}. */
export function pauseWindows(c) {
  return (Array.isArray(c.pauses) ? c.pauses : [])
    .filter((p) => p && isValidDay(p.from) && (p.to == null || (isValidDay(p.to) && p.to >= p.from)))
    .map((p) => ({ from: p.from, to: p.to ?? null }))
    .sort((a, b) => a.from.localeCompare(b.from))
}
export const openPause = (c) => pauseWindows(c).find((p) => p.to == null) ?? null
export const isPausedOn = (c, day) => pauseWindows(c).some((p) => day >= p.from && (p.to == null || day <= p.to))

/** The pause list after pausing on `today`. A second pause while one is open changes nothing. */
export function withPause(c, today) {
  const list = pauseWindows(c)
  if (list.some((p) => p.to == null)) return list
  return [...list, { from: today, to: null }]
}
/** The pause list after resuming on `today`: the open window ends yesterday, and pausing then resuming on the same day leaves no trace. */
export function withResume(c, today) {
  const end = addDays(today, -1)
  return pauseWindows(c).flatMap((p) => (p.to != null ? [p] : end < p.from ? [] : [{ from: p.from, to: end }]))
}

// ---------------------------------------------------------------------------------------------------------------- check-ins
/**
 * One entry per day of the challenge that counts as checked in: Map day -> { amount, source: 'checkin' | 'habit', checkin }.
 * A real check-in beats the linked habit's log for the same day; days outside the challenge's dates are ignored.
 */
export function effectiveCheckins(c, checkins = [], habitLogs = []) {
  const map = new Map()
  const inside = (d) => d >= c.start_date && d <= c.end_date
  if (c.habit_id && c.kind !== 'total') {
    const amount = c.kind === 'daily' ? c.target : 1
    for (const l of habitLogs) if (l.habit_id === c.habit_id && l.status === 'done' && inside(l.log_date)) map.set(l.log_date, { amount, source: 'habit', checkin: null })
  }
  for (const k of checkins) if (k.challenge_id === c.id && inside(k.checkin_date)) map.set(k.checkin_date, { amount: k.amount, source: 'checkin', checkin: k })
  return map
}

/** Why a check-in cannot be made, in words for the person, or null when it can. `map` comes from effectiveCheckins. */
export function checkinProblem(c, day, today, map, amount = 1) {
  if (c.status === 'completed') return 'This challenge is already completed.'
  if (c.status === 'cancelled') return 'This challenge was cancelled.'
  if (c.status === 'paused') return 'Resume the challenge to check in.'
  if (!isValidDay(day)) return 'Pick a valid day.'
  if (day > today) return 'You cannot check in for a day that has not started yet.'
  if (day < c.start_date) return 'That day is before the challenge started.'
  if (day > c.end_date) return 'That day is after the challenge ended.'
  if (isPausedOn(c, day)) return 'That day was paused.'
  if (!isInt(amount) || amount < 1) return 'Enter a whole amount of at least 1.'
  if (amount > MAX_TARGET) return 'That amount is too large.'
  if (map.get(day)) return map.get(day).source === 'habit' ? 'That day is already counted from your linked habit.' : 'You already checked in for that day.'
  return null
}

// ---------------------------------------------------------------------------------------------------------------- the days
/** Days of the challenge that count (not paused), from the start up to `upto` (default the end date). */
export function countedDays(c, upto = c.end_date) {
  const last = upto < c.end_date ? upto : c.end_date
  if (last < c.start_date) return []
  return eachDay(c.start_date, last).filter((d) => !isPausedOn(c, d))
}

/** What a single day looks like on the progress calendar. */
export function dayState(c, day, map, today) {
  if (day < c.start_date || day > c.end_date) return 'outside'
  const hit = map.get(day)
  const full = hit && (c.kind !== 'daily' || hit.amount >= c.target)
  if (full) return 'done'
  if (hit) return 'partial'
  if (isPausedOn(c, day)) return 'paused'
  if (day > today) return 'upcoming'
  if (day === today) return 'open'
  return c.kind === 'daily' ? 'missed' : 'none'
}

/** The challenge's own 7-day blocks, each with how many check-in days it needs and how many it has. */
export function weekBlocks(c, map, today) {
  const blocks = []
  for (let from = c.start_date, index = 0; from <= c.end_date; from = addDays(from, 7), index++) {
    const to = addDays(from, 6) < c.end_date ? addDays(from, 6) : c.end_date
    const live = eachDay(from, to).filter((d) => !isPausedOn(c, d))
    const need = Math.min(c.target, live.length)
    const done = live.filter((d) => map.has(d)).length
    const left = live.filter((d) => d >= today).length // days still available, today included
    let state = 'upcoming'
    if (need === 0) state = 'paused'
    else if (done >= need) state = 'met'
    else if (to < today || done + left < need) state = 'short'
    else if (from <= today) state = 'open'
    blocks.push({ index, from, to, need, done: Math.min(done, need), extra: Math.max(0, done - need), state })
  }
  return blocks
}

/** Chronological units earned: daily = 1 per full day, weekly = 1 per counted check-in (up to the week's need), total = the amounts. */
export function unitTimeline(c, map, today) {
  const out = []
  if (c.kind === 'total') {
    for (const [day, v] of [...map].sort((a, b) => a[0].localeCompare(b[0]))) out.push({ day, units: v.amount })
  } else if (c.kind === 'daily') {
    for (const [day, v] of [...map].sort((a, b) => a[0].localeCompare(b[0]))) if (v.amount >= c.target && !isPausedOn(c, day)) out.push({ day, units: 1 })
  } else {
    for (const w of weekBlocks(c, map, today)) {
      const days = eachDay(w.from, w.to).filter((d) => map.has(d) && !isPausedOn(c, d)).slice(0, w.need)
      for (const day of days) out.push({ day, units: 1 })
    }
  }
  return out
}

// -------------------------------------------------------------------------------------------------------------- progress
/**
 * Where a challenge stands. `goal` is the number of units that means 100% (total: the target; daily: the counted days; weekly: the sum of each
 * week's need), `units` how many are earned. `pct` is whole percent, never above 100: it only reaches 100 when the goal is met in full.
 */
export function challengeProgress(c, checkins = [], habitLogs = [], today) {
  const map = effectiveCheckins(c, checkins, habitLogs)
  const timeline = unitTimeline(c, map, today)
  const units = timeline.reduce((s, t) => s + t.units, 0)
  const counted = countedDays(c)
  const blocks = c.kind === 'weekly' ? weekBlocks(c, map, today) : []
  const goal = c.kind === 'total' ? c.target : c.kind === 'daily' ? counted.length : blocks.reduce((s, b) => s + b.need, 0)
  const raw = goal > 0 ? (units / goal) * 100 : 0
  const pct = goal > 0 && units >= goal ? 100 : Math.min(99, Math.floor(raw))
  const phase = today < c.start_date ? 'upcoming' : today > c.end_date ? 'ended' : 'running'
  const elapsed = phase === 'upcoming' ? 0 : Math.min(durationDays(c), diffDays(today, c.start_date) + 1)
  const daysLeft = phase === 'ended' ? 0 : Math.max(0, diffDays(c.end_date, today < c.start_date ? c.start_date : today) + (phase === 'upcoming' ? 1 : 0))
  const pace = challengePace(c, map, blocks, counted, units, today)
  const checkinDays = [...map.values()].length
  return {
    map,
    timeline,
    blocks,
    units,
    goal,
    pct,
    rawPct: Math.round(raw * 10) / 10,
    remaining: Math.max(0, goal - units),
    phase,
    elapsed,
    daysLeft,
    checkinDays,
    doneToday: map.has(today),
    ...pace,
    ...challengeStreaks(c, map, blocks, today),
  }
}

/** 'ahead' (everything through today is covered), 'on_track' (nothing missed so far) or 'behind', with how far. */
function challengePace(c, map, blocks, counted, units, today) {
  if (today < c.start_date) return { pace: 'upcoming', missed: 0, behindBy: 0, expectedUnits: 0 }
  const past = counted.filter((d) => d < today)
  if (c.kind === 'daily') {
    const missed = past.filter((d) => !(map.get(d)?.amount >= c.target)).length
    const todayDone = map.get(today)?.amount >= c.target
    return { pace: missed > 0 ? 'behind' : todayDone && !isPausedOn(c, today) ? 'ahead' : 'on_track', missed, behindBy: missed, expectedUnits: past.length }
  }
  if (c.kind === 'weekly') {
    const shortWeeks = blocks.filter((b) => b.state === 'short')
    const behindBy = shortWeeks.reduce((s, b) => s + (b.need - b.done), 0)
    const current = blocks.find((b) => b.from <= today && today <= b.to)
    const coveredNow = !current || current.state === 'met' || current.state === 'paused'
    return { pace: behindBy > 0 ? 'behind' : coveredNow ? 'ahead' : 'on_track', missed: shortWeeks.length, behindBy, expectedUnits: blocks.filter((b) => b.to < today).reduce((s, b) => s + b.need, 0) }
  }
  // total: the share of the target that should be done by now if the effort were spread over the counted days
  const total = counted.length || 1
  const through = (day) => counted.filter((d) => d <= day).length
  const expected = (c.target * through(addDays(today, -1))) / total
  const covered = (c.target * through(today)) / total
  return {
    pace: units >= covered ? 'ahead' : units >= expected ? 'on_track' : 'behind',
    missed: 0,
    behindBy: Math.max(0, Math.ceil(expected - units)),
    expectedUnits: Math.round(expected),
  }
}

/** Current and best run. daily/total: consecutive counted days with a check-in; weekly: consecutive weeks that met their need. */
function challengeStreaks(c, map, blocks, today) {
  if (c.kind === 'weekly') {
    const closed = blocks.filter((b) => b.state !== 'upcoming' && b.state !== 'paused')
    let best = 0
    let run = 0
    for (const b of closed) {
      if (b.state === 'met') best = Math.max(best, ++run)
      else if (b.state === 'short') run = 0 // an open week is neither a break nor a gain yet
    }
    let current = 0
    for (let i = closed.length - 1; i >= 0; i--) {
      const b = closed[i]
      if (b.state === 'met') current++
      else if (b.state === 'open') continue
      else break
    }
    return { streak: current, bestStreak: best }
  }
  const upto = today < c.end_date ? today : c.end_date
  const days = today < c.start_date ? [] : countedDays(c, upto)
  const ok = (d) => (c.kind === 'daily' ? map.get(d)?.amount >= c.target : map.has(d))
  let best = 0
  let run = 0
  for (const d of days) {
    if (ok(d)) best = Math.max(best, ++run)
    else if (d !== today) run = 0 // today is still open: it does not break a run yet
  }
  let current = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (ok(days[i])) current++
    else if (days[i] === today) continue
    else break
  }
  return { streak: current, bestStreak: best }
}

/** For a total challenge: the units needed per remaining counted day to still finish, and the date the current pace would finish on. */
export function totalForecast(c, p, today) {
  if (c.kind !== 'total') return null
  const liveLeft = countedDays(c).filter((d) => d >= (today < c.start_date ? c.start_date : today)).length
  const perDay = p.remaining > 0 && liveLeft > 0 ? Math.ceil(p.remaining / liveLeft) : 0
  const elapsedLive = countedDays(c, today < c.end_date ? today : c.end_date).length
  let finishOn = null
  if (p.remaining === 0) finishOn = p.timeline.length ? p.timeline[p.timeline.length - 1].day : null
  else if (p.units > 0 && elapsedLive > 0) {
    const rate = p.units / elapsedLive
    finishOn = addDays(today < c.start_date ? c.start_date : today, Math.max(0, Math.ceil(p.remaining / rate)))
  }
  return { perDay, finishOn, onTime: finishOn != null && finishOn <= c.end_date }
}

// ---------------------------------------------------------------------------------------------------------------- milestones
/** Each milestone with whether it is reached and the day it was reached (the day the running total crossed it). */
export function milestoneStatus(c, p) {
  const list = effectiveMilestones(c)
  return list.map((m) => {
    const need = p.goal > 0 ? Math.ceil((m.pct / 100) * p.goal) : Infinity
    let run = 0
    let reachedOn = null
    for (const t of p.timeline) {
      run += t.units
      if (run >= need) {
        reachedOn = t.day
        break
      }
    }
    return { ...m, need, reached: p.goal > 0 && p.units >= need, reachedOn }
  })
}
/** The first milestone not yet reached, or null. */
export const nextMilestone = (list) => list.find((m) => !m.reached) ?? null

// ------------------------------------------------------------------------------------------------------------------ status
/**
 * What to do with a challenge that has run its course, or null to leave it alone. Total challenges complete as soon as the target is reached;
 * daily and weekly ones complete the day after the end date (the last day can still be checked in until then). `final_pct` is what was achieved.
 */
export function settlement(c, checkins, habitLogs, today) {
  if (c.status !== 'active' && c.status !== 'paused') return null
  const p = challengeProgress(c, checkins, habitLogs, today)
  if (c.kind === 'total' && p.units >= c.target) return { status: 'completed', final_pct: 100 }
  if (today > c.end_date) return { status: 'completed', final_pct: p.pct }
  return null
}

// ----------------------------------------------------------------------------------------------------- list helpers / views
/** One row per challenge for the page: the challenge, its progress, milestones and the next one to reach. */
export function challengeCards(challenges, checkins, habitLogs, today) {
  return challenges.map((c) => {
    const p = challengeProgress(c, checkins, habitLogs, today)
    const milestones = milestoneStatus(c, p)
    return { challenge: c, progress: p, milestones, next: nextMilestone(milestones), forecast: totalForecast(c, p, today) }
  })
}
const byEnd = (a, b) => a.challenge.end_date.localeCompare(b.challenge.end_date) || a.challenge.created_at?.localeCompare?.(b.challenge.created_at ?? '') || 0
export const activeCards = (cards) => cards.filter((x) => x.challenge.status === 'active' || x.challenge.status === 'paused').sort(byEnd)
/** Finished challenges, newest first: what was achieved, in words. */
export function historyEntries(cards) {
  return cards
    .filter((x) => isClosed(x.challenge))
    .map((x) => {
      const c = x.challenge
      const cancelled = c.status === 'cancelled'
      const pct = cancelled ? x.progress.pct : (c.final_pct ?? x.progress.pct)
      return { ...x, pct, outcome: cancelled ? 'cancelled' : pct >= 100 ? 'achieved' : 'finished', endedOn: (cancelled ? c.cancelled_at : c.completed_at)?.slice(0, 10) ?? c.end_date }
    })
    .sort((a, b) => (b.challenge.completed_at ?? b.challenge.cancelled_at ?? '').localeCompare(a.challenge.completed_at ?? a.challenge.cancelled_at ?? ''))
}

/** Cells for one month's progress calendar: every day of the month with its state. `weekStartsOn` 0|1. */
export function monthCells(c, map, today, monthStartDay, weekStartsOn = 1) {
  const first = monthStartDay.slice(0, 7) + '-01'
  const lead = diffDays(first, startOfWeek(first, weekStartsOn))
  const cells = Array.from({ length: lead }, () => null)
  const last = addDays(addDays(first, 32).slice(0, 7) + '-01', -1)
  for (const day of eachDay(first, last)) cells.push({ day, state: dayState(c, day, map, today), amount: map.get(day)?.amount ?? 0, source: map.get(day)?.source ?? null })
  return cells
}

// ------------------------------------------------------------------------------------------------------------------ analytics
/** Numbers across every challenge. `weeks` = how many recent weeks of check-in activity to chart. */
export function challengeAnalytics(challenges, checkins, habitLogs, today, { weeks = 8, weekStartsOn = 1 } = {}) {
  const cards = challengeCards(challenges, checkins, habitLogs, today)
  const live = cards.filter((x) => x.challenge.status === 'active')
  const done = cards.filter((x) => x.challenge.status === 'completed')
  const achieved = done.filter((x) => (x.challenge.final_pct ?? x.progress.pct) >= 100)
  const thisWeek = startOfWeek(today, weekStartsOn)
  const activity = Array.from({ length: weeks }, (_, i) => ({ from: addDays(thisWeek, -7 * (weeks - 1 - i)), count: 0 }))
  const byDay = new Map()
  const own = new Set(challenges.map((c) => c.id))
  for (const k of checkins) {
    if (!own.has(k.challenge_id)) continue
    byDay.set(k.checkin_date, (byDay.get(k.checkin_date) ?? 0) + 1)
    const w = activity.find((a) => k.checkin_date >= a.from && k.checkin_date <= addDays(a.from, 6))
    if (w) w.count++
  }
  const categories = new Map()
  for (const x of cards) if (x.challenge.status !== 'cancelled') categories.set(x.challenge.category, (categories.get(x.challenge.category) ?? 0) + 1)
  const avg = live.length ? Math.round(live.reduce((s, x) => s + x.progress.pct, 0) / live.length) : null
  return {
    total: challenges.length,
    active: live.length,
    paused: cards.filter((x) => x.challenge.status === 'paused').length,
    completed: done.length,
    cancelled: cards.filter((x) => x.challenge.status === 'cancelled').length,
    achieved: achieved.length,
    successRate: done.length ? Math.round((achieved.length / done.length) * 100) : null,
    averageProgress: avg,
    checkins: checkins.filter((k) => own.has(k.challenge_id)).length,
    activeDays: byDay.size,
    bestStreak: cards.reduce((m, x) => Math.max(m, x.progress.bestStreak), 0),
    currentStreak: live.reduce((m, x) => Math.max(m, x.progress.streak), 0),
    behind: live.filter((x) => x.progress.pace === 'behind').length,
    checkedInToday: live.filter((x) => x.progress.doneToday).length,
    activity,
    categories: [...categories].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byDay,
  }
}

// -------------------------------------------------------------------------------------------------------- calendar markers
/**
 * What a challenge adds to the calendar between `from` and `to`: one marker per counted day of each running or paused challenge, flagged done when
 * that day is covered. Closed challenges leave their dates behind on the calendar only as history, so they are not drawn.
 */
export function calendarMarkers(challenges, checkins, habitLogs, { from, to, today }) {
  const out = []
  for (const c of challenges) {
    if (c.status !== 'active' && c.status !== 'paused') continue
    if (c.end_date < from || c.start_date > to) continue
    const map = effectiveCheckins(c, checkins, habitLogs)
    const lo = c.start_date > from ? c.start_date : from
    const hi = c.end_date < to ? c.end_date : to
    for (const day of eachDay(lo, hi)) {
      const state = dayState(c, day, map, today)
      if (state === 'paused') continue
      out.push({ challenge: c, day, state, done: state === 'done', first: day === c.start_date, last: day === c.end_date, overdue: state === 'missed' })
    }
  }
  return out
}

/** Words for a pace value. */
export const PACE_LABEL = { ahead: 'Ahead of pace', on_track: 'On track', behind: 'Behind', upcoming: 'Not started' }
/** "12 of 30 pages" style text for the headline number of a card. */
export function progressText(c, p) {
  const unit = c.unit ? ` ${c.unit}` : ''
  if (c.kind === 'total') return `${p.units.toLocaleString()} of ${c.target.toLocaleString()}${unit}`
  if (c.kind === 'daily') return `${p.units} of ${p.goal} days`
  return `${p.units} of ${p.goal} check-ins`
}
/** A short description of the rhythm: "20 pages every day", "4 days a week", "200,000 steps in total". */
export function rhythmText(c) {
  const unit = c.unit ? ` ${c.unit}` : ''
  if (c.kind === 'daily') return c.target > 1 || c.unit ? `${c.target.toLocaleString()}${unit} every day` : 'Every day'
  if (c.kind === 'weekly') return `${c.target} day${c.target === 1 ? '' : 's'} a week`
  return `${c.target.toLocaleString()}${unit} in total`
}

// ---------------------------------------------------------------------------------------------------------------- evidence
const EVIDENCE_URL = /^https?:\/\/[^\s]{1,480}$/
export const isEvidenceUrl = (u) => typeof u === 'string' && EVIDENCE_URL.test(u)
/**
 * Evidence is a short list of links (a photo in a shared album, a workout page, a receipt) with an optional label. Only http(s) addresses are
 * kept, so a stored link can never run a script when opened. Returns { list } when fine, or { error } in words for the person.
 */
export function cleanEvidence(input) {
  const raw = Array.isArray(input) ? input : []
  if (raw.length > MAX_EVIDENCE) return { error: `Attach at most ${MAX_EVIDENCE} links.` }
  const list = []
  for (const e of raw) {
    const url = String(e?.url ?? '').trim()
    if (!url) continue
    if (!isEvidenceUrl(url)) return { error: 'Evidence links must start with http:// or https://.' }
    list.push({ label: String(e?.label ?? '').trim().slice(0, 80), url })
  }
  return { list }
}
