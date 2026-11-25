import { addDays, dateStrInTz, DEFAULT_TZ, diffDays, eachDay, startOfWeek, weekday } from '@lifetrack/utils'

/** Is `date` inside one of the habit's pause windows? `habit.pauses` is [{ start_date, end_date|null }] (attached by buildHabitStats). */
export function isPaused(habit, date) {
  const ps = habit.pauses
  if (!ps?.length) return false
  for (const p of ps) if (date >= p.start_date && (p.end_date == null || date <= p.end_date)) return true
  return false
}

/** The habit rows with their `habit_pauses` rows attached as `habit.pauses` (copies; the stored rows are never modified, a habit without pauses is returned as is). */
export function withPauses(habits, habitPauses) {
  if (!habitPauses?.length) return habits
  const by = new Map()
  for (const p of habitPauses) by.set(p.habit_id, [...(by.get(p.habit_id) ?? []), { start_date: p.start_date, end_date: p.end_date ?? null }])
  return habits.map((h) => (by.has(h.id) ? { ...h, pauses: by.get(h.id) } : h))
}

/** Is `date` a planned rest day (a weekday the person marked as "never expected") or a paused day? Neither can be missed. */
export function isRestDay(habit, date) {
  return (habit.rest_days ?? []).includes(weekday(date)) || isPaused(habit, date)
}

/**
 * Is the habit expected on this calendar day? (weekly habits are expected "some days" — handled separately)
 * Planned rest days and paused days are never expected, so they can be neither missed nor break a streak.
 */
export function isScheduled(habit, date) {
  if (date < habit.start_date) return false
  if (isRestDay(habit, date)) return false
  if (habit.frequency === 'daily') return true
  if (habit.frequency === 'custom') return (habit.days_of_week ?? []).includes(weekday(date))
  return false
}

function buildLogMap(logs) {
  const m = new Map()
  for (const l of logs) m.set(l.log_date, l.status)
  return m
}

function earliest(habit, logs) {
  let e = habit.start_date
  for (const l of logs) if (l.log_date < e) e = l.log_date
  return e
}

/** daily/custom day state: done | skip | miss | pending | off */
function dayState(habit, date, map, today) {
  const st = map.get(date)
  if (st === 'done') return 'done'
  if (st === 'skipped' || st === 'rest') return 'skip'
  if (!isScheduled(habit, date) || date > today) return 'off'
  return date === today ? 'pending' : 'miss'
}

/** A week the habit was paused for all seven days asks nothing of anyone. */
function weekPaused(habit, weekStart) {
  if (!habit.pauses?.length) return false
  for (let i = 0; i < 7; i++) if (!isPaused(habit, addDays(weekStart, i))) return false
  return true
}

function weekDone(map, weekStart) {
  let n = 0
  for (let i = 0; i < 7; i++) if (map.get(addDays(weekStart, i)) === 'done') n++
  return n
}

/**
 * Current and longest streak. Editing a habit never rewrites logs, so history is preserved;
 * a streak is judged against the habit's current schedule.
 *  - daily/custom: unit = day. Missing a scheduled day breaks it; skipped/rest days and unscheduled days are neutral.
 *    Today still pending does not break it.
 *  - weekly: unit = week. A week counts when done >= weekly_target. The running week never breaks the streak.
 */
export function streaks(habit, logs, today, weekStartsOn = 1) {
  const map = buildLogMap(logs)
  const first = earliest(habit, logs)
  if (habit.frequency === 'weekly') {
    const firstWeek = startOfWeek(first, weekStartsOn)
    const thisWeek = startOfWeek(today, weekStartsOn)
    let current = 0
    for (let w = thisWeek; w >= firstWeek; w = addDays(w, -7)) {
      const ok = weekDone(map, w) >= habit.weekly_target
      if (ok) current++
      else if (w !== thisWeek && !weekPaused(habit, w)) break
    }
    let longest = 0,
      run = 0
    for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
      if (weekDone(map, w) >= habit.weekly_target) {
        run++
        longest = Math.max(longest, run)
      } else if (w !== thisWeek && !weekPaused(habit, w)) run = 0
    }
    return { current, longest, unit: 'wk' }
  }
  let current = 0
  for (let d = today; d >= first; d = addDays(d, -1)) {
    const s = dayState(habit, d, map, today)
    if (s === 'done') current++
    else if (s === 'miss') break
  }
  let longest = 0,
    run = 0
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const s = dayState(habit, d, map, today)
    if (s === 'done') {
      run++
      longest = Math.max(longest, run)
    } else if (s === 'miss') run = 0
  }
  return { current, longest, unit: 'd' }
}

/** Completion over [from,to] (clamped to start..today). expected excludes skipped/rest days and a still-pending today. `tz` dates the archive day. */
export function completion(habit, logs, from, to, today, weekStartsOn = 1, tz = DEFAULT_TZ) {
  const map = buildLogMap(logs)
  const lo = from < habit.start_date ? habit.start_date : from
  let hi = to > today ? today : to
  // An archived habit stops accruing "missed" days on the day it was archived (its earlier history still counts).
  const archivedOn = habit.archived_at ? dateStrInTz(habit.archived_at, tz || DEFAULT_TZ) : null
  if (archivedOn && archivedOn < hi) hi = archivedOn
  if (lo > hi) return { done: 0, expected: 0, rate: null }
  if (habit.frequency === 'weekly') {
    let done = 0
    let weeks = 0
    for (let w = startOfWeek(lo, weekStartsOn); w <= hi; w = addDays(w, 7)) {
      if (weekPaused(habit, w)) continue
      weeks++
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i)
        if (d >= lo && d <= hi && map.get(d) === 'done') done++
      }
    }
    const expected = weeks * habit.weekly_target
    return { done: Math.min(done, expected), expected, rate: expected ? Math.min(1, done / expected) : null }
  }
  let done = 0,
    expected = 0
  for (const d of eachDay(lo, hi)) {
    const s = dayState(habit, d, map, today)
    if (s === 'done') {
      done++
      expected++
    } else if (s === 'miss') expected++
  }
  return { done, expected, rate: expected ? done / expected : null }
}

/** Is the habit due to be acted on today (scheduled and no log yet)? Weekly habits are always actionable until target met. */
export function isDueToday(habit, logs, today, weekStartsOn = 1) {
  if (habit.archived_at || today < habit.start_date || isPaused(habit, today)) return false
  const todays = logs.find((l) => l.log_date === today)
  if (todays) return false
  if (habit.frequency === 'weekly') return weekDone(buildLogMap(logs), startOfWeek(today, weekStartsOn)) < habit.weekly_target
  return isScheduled(habit, today)
}

/** Consecutive "active days" (any productive action) ending today, or yesterday if today has nothing yet. */
export function activeDayStreak(activeDates, today) {
  const set = activeDates instanceof Set ? activeDates : new Set(activeDates)
  let d = set.has(today) ? today : addDays(today, -1)
  let n = 0
  while (set.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export const daysSince = (a, b) => diffDays(a, b)
