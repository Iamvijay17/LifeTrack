import { addDays, diffDays, eachDay, startOfWeek, weekday } from '@lifetrack/utils'


/** Is the habit expected on this calendar day? (weekly habits are expected "some days" — handled separately) */
export function isScheduled(habit, date) {
  if (date < habit.start_date) return false
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
      else if (w !== thisWeek) break
    }
    let longest = 0, run = 0
    for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
      if (weekDone(map, w) >= habit.weekly_target) { run++; longest = Math.max(longest, run) }
      else if (w !== thisWeek) run = 0
    }
    return { current, longest, unit: 'wk' }
  }
  let current = 0
  for (let d = today; d >= first; d = addDays(d, -1)) {
    const s = dayState(habit, d, map, today)
    if (s === 'done') current++
    else if (s === 'miss') break
  }
  let longest = 0, run = 0
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const s = dayState(habit, d, map, today)
    if (s === 'done') { run++; longest = Math.max(longest, run) }
    else if (s === 'miss') run = 0
  }
  return { current, longest, unit: 'd' }
}

/** Completion over [from,to] (clamped to start..today). expected excludes skipped/rest days and a still-pending today. */
export function completion(habit, logs, from, to, today, weekStartsOn = 1) {
  const map = buildLogMap(logs)
  const lo = from < habit.start_date ? habit.start_date : from
  const hi = to > today ? today : to
  if (lo > hi) return { done: 0, expected: 0, rate: null }
  if (habit.frequency === 'weekly') {
    let done = 0
    let weeks = 0
    for (let w = startOfWeek(lo, weekStartsOn); w <= hi; w = addDays(w, 7)) {
      weeks++
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i)
        if (d >= lo && d <= hi && map.get(d) === 'done') done++
      }
    }
    const expected = weeks * habit.weekly_target
    return { done: Math.min(done, expected), expected, rate: expected ? Math.min(1, done / expected) : null }
  }
  let done = 0, expected = 0
  for (const d of eachDay(lo, hi)) {
    const s = dayState(habit, d, map, today)
    if (s === 'done') { done++; expected++ }
    else if (s === 'miss') expected++
  }
  return { done, expected, rate: expected ? done / expected : null }
}

/** Is the habit due to be acted on today (scheduled and no log yet)? Weekly habits are always actionable until target met. */
export function isDueToday(habit, logs, today, weekStartsOn = 1) {
  if (habit.archived_at || today < habit.start_date) return false
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
  while (set.has(d)) { n++; d = addDays(d, -1) }
  return n
}

export const daysSince = (a, b) => diffDays(a, b)
