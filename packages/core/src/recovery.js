// Smart Recovery & Rescheduling: finds what slipped, ranks it, and proposes free slots, without touching anything. Pure (rows in, plain objects out),
// so web and mobile can share it and a test can pin every rule. No AI and no network: it is a deterministic rule set you can read below.
//
// What it works from (all existing tables, nothing is copied):
//   tasks            candidates to recover; timed ones also block their own slot
//   calendar events  expanded with exceptions by buildCalendarItems: fixed commitments that never move (so are interviews and timed tasks)
//   habits           have no time of day: never moved, they only add to the day's load
//   task_reschedules the history: how often a task has slipped, what was rejected, what was already moved (duplicate guard)
// Dates are 'yyyy-MM-dd' and times are minutes since local midnight in the user's zone `tz`; "now" and "today" are always read in that zone, so the
// day boundary is the user's midnight, not the server's. Slots are wall-clock times: one that does not exist on a clock-change day is never offered.
import { addDays, diffDays, eachDay, isValidDay, localDayMinutes, minutesToTime, timeToMinutes, zonedToMs } from '@lifetrack/utils'
import { buildCalendarItems, isLaneItem, segmentOn } from './calendar'
import { isScheduled } from './streaks'
import { isOpen } from './tasks'

export const RECOVERY_DEFAULTS = {
  workStart: 9 * 60,
  workEnd: 18 * 60,
  capacityMinutes: 8 * 60, // what one day can reasonably hold; above this the day is "overloaded"
  horizonDays: 7, // how far ahead to look for free time, counting today
  defaultDuration: 60, // for a task with no time of day
  step: 15,
  habitMinutes: 15, // each habit due that day counts this much toward its load
  skipWeekends: false,
  dismissDays: 3, // a rejected suggestion stays hidden this long
}
const MIN_DURATION = 15
const MAX_DURATION = 240

const hhmm = (t) => (t ? String(t).slice(0, 5) : null)
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback)

/** Settings live in user_settings.calendar_prefs (no new column): recovery_work_start/end 'HH:MM', recovery_capacity_hours, recovery_horizon_days, recovery_skip_weekends. */
export function recoveryConfig(prefs = {}) {
  const d = RECOVERY_DEFAULTS
  let workStart = timeToMinutes(hhmm(prefs.recovery_work_start)) ?? d.workStart
  let workEnd = timeToMinutes(hhmm(prefs.recovery_work_end)) ?? d.workEnd
  if (workEnd - workStart < MIN_DURATION) [workStart, workEnd] = [d.workStart, d.workEnd]
  return {
    ...d,
    workStart,
    workEnd,
    capacityMinutes: clamp(Math.round(num(prefs.recovery_capacity_hours, d.capacityMinutes / 60) * 60), 60, 1440),
    horizonDays: clamp(Math.round(num(prefs.recovery_horizon_days, d.horizonDays)), 1, 30),
    defaultDuration: clamp(Math.round(num(prefs.default_duration, d.defaultDuration)), MIN_DURATION, MAX_DURATION),
    skipWeekends: prefs.recovery_skip_weekends === true,
  }
}

const PRIORITY_WEIGHT = { urgent: 100, high: 70, medium: 40, low: 15 }
export const PRIORITY_LABEL = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }

// ------------------------------------------------------------------ history helpers
/** The key that makes a move happen once: the same task, from the same place, to the same place. Unique per user while not undone (see 0016). */
export const rescheduleKey = (taskId, from, to) => `rs:${taskId}:${from.date}:${from.start ?? '-'}:${to.date}:${to.start}`
export const dismissKey = (taskId, from, until) => `dismiss:${taskId}:${from.date}:${from.start ?? '-'}:${until}`
const live = (r) => !r.undone_at
export const rescheduledRows = (history) => (history ?? []).filter((r) => r.action === 'rescheduled' && live(r))
/** How many times a task has already been moved (undone moves do not count). */
export function slipCounts(history) {
  const m = new Map()
  for (const r of rescheduledRows(history)) m.set(r.task_id, (m.get(r.task_id) ?? 0) + 1)
  return m
}

// ------------------------------------------------------------------ what slipped
const taskSlot = (t) => ({ date: t.due_date, start: hhmm(t.start_time), end: hhmm(t.end_time) })

/** Open tasks whose time has passed: a dated task before today, or a timed one today whose end is behind us. */
export function isSlipped(t, { today, tz, nowMs }) {
  if (!isOpen(t) || !t.due_date) return false
  if (t.due_date < today) return true
  return t.due_date === today && !!t.end_time && zonedToMs(t.due_date, hhmm(t.end_time), tz) <= nowMs
}

/** Importance = priority first, then how late it is, how often it already slipped, and whether it is under way. Higher means "do it sooner". */
export function importanceScore(task, { today, slips = 0 }) {
  const daysOverdue = task.due_date ? Math.max(0, diffDays(today, task.due_date)) : 0
  const late = Math.min(24, daysOverdue * 6) // capped under the gap between priorities: lateness orders tasks within a tier, never lifts low work over medium
  const slipped = Math.min(20, slips * 5)
  const active = task.status === 'in_progress' ? 10 : 0
  const base = PRIORITY_WEIGHT[task.priority] ?? PRIORITY_WEIGHT.medium
  const reasons = []
  if (task.priority === 'urgent' || task.priority === 'high') reasons.push(`${PRIORITY_LABEL[task.priority]} priority`)
  if (daysOverdue > 0) reasons.push(daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`)
  else if (task.start_time) reasons.push('Time has passed')
  if (slips > 0) reasons.push(slips === 1 ? 'Already moved once' : `Already moved ${slips} times`)
  if (active) reasons.push('In progress')
  return { score: base + late + slipped + active, daysOverdue, reasons }
}

const durationOf = (task, cfg) => {
  const a = timeToMinutes(hhmm(task.start_time))
  const b = timeToMinutes(hhmm(task.end_time))
  if (a != null && b != null && b > a) return clamp(b - a, MIN_DURATION, 1440)
  return Math.ceil(cfg.defaultDuration / cfg.step) * cfg.step
}

// ------------------------------------------------------------------ the day model
const wallExists = (date, minutes, tz) => {
  if (minutes >= 1440) return true
  const back = localDayMinutes(zonedToMs(date, minutesToTime(minutes), tz), tz)
  return back.date === date && back.minutes === minutes
}
const unionMinutes = (blocks) => {
  let total = 0
  let end = -1
  for (const b of [...blocks].sort((x, y) => x.s - y.s)) {
    const s = Math.max(b.s, end)
    if (b.e > s) total += b.e - s
    end = Math.max(end, b.e)
  }
  return total
}
const overlaps = (blocks, s, e) => blocks.filter((b) => b.s < e && b.e > s)

/** Fixed blocks, flexible load and habit load for each day of the window. `ignore` = task ids that are about to move (they must not block themselves). */
function buildModel(d, cfg, { today, tz, nowMs }, { ignore = new Set(), through = null } = {}) {
  const last = through && through > addDays(today, cfg.horizonDays - 1) ? through : addDays(today, cfg.horizonDays - 1)
  const dates = eachDay(today, last)
  const inWindow = new Set(dates)
  const fixed = new Map(dates.map((x) => [x, []]))
  const flex = new Map(dates.map((x) => [x, { taskMin: 0, habitMin: 0, tasks: [] }]))
  const reserved = new Map(dates.map((x) => [x, []])) // slots suggestions have already taken, so later ones cannot reuse them

  const items = buildCalendarItems(d, { from: today, to: last, tz, today, nowMs })
  for (const i of items) {
    if (i.done || i.point || isLaneItem(i) || (i.kind !== 'event' && i.kind !== 'interview' && i.kind !== 'task')) continue
    if (i.kind === 'task' && ignore.has(i.id)) continue
    for (const day of eachDay(i.date, i.endDate)) {
      if (!inWindow.has(day)) continue
      const seg = segmentOn(i, day)
      fixed.get(day).push({ s: seg.startMin, e: Math.min(1440, seg.endMin), title: i.title, key: i.key })
    }
  }
  // Untimed open tasks are "somewhere that day": they take load but not a slot.
  for (const t of d.tasks ?? []) {
    if (!isOpen(t) || t.start_time || !t.due_date || !inWindow.has(t.due_date) || ignore.has(t.id)) continue
    const f = flex.get(t.due_date)
    f.taskMin += durationOf(t, cfg)
    f.tasks.push(t)
  }
  for (const h of d.habits ?? []) {
    if (h.archived_at || (h.frequency !== 'daily' && h.frequency !== 'custom')) continue
    for (const day of dates) {
      if (!isScheduled(h, day)) continue
      const logged = (d.habitLogs ?? []).some((l) => l.habit_id === h.id && l.log_date === day)
      if (!logged) flex.get(day).habitMin += cfg.habitMinutes
    }
  }
  const nowMin = localDayMinutes(nowMs, tz)
  const model = { cfg, today, tz, nowMs, dates, fixed, flex, reserved, nowMinutes: nowMin.date === today ? nowMin.minutes : 0 }
  return model
}

const reservedMin = (m, date) => (m.reserved.get(date) ?? []).reduce((n, b) => n + b.e - b.s, 0)
const dayLoad = (m, date) => unionMinutes(m.fixed.get(date) ?? []) + (m.flex.get(date)?.taskMin ?? 0) + (m.flex.get(date)?.habitMin ?? 0) + reservedMin(m, date)
export const dayLevel = (load, capacity) => (load > capacity ? 'over' : load >= capacity * 0.85 ? 'busy' : 'ok')
const describeDay = (m, date) => {
  const fixedMin = unionMinutes(m.fixed.get(date) ?? [])
  const f = m.flex.get(date)
  const taskMin = f.taskMin + reservedMin(m, date)
  const load = fixedMin + taskMin + f.habitMin
  return { date, load, fixedMin, taskMin, habitMin: f.habitMin, capacity: m.cfg.capacityMinutes, level: dayLevel(load, m.cfg.capacityMinutes) }
}
const dayAllowed = (m, date) => !(m.cfg.skipWeekends && [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()))

/** Free start times on one day for a block of `dur` minutes, earliest first (step-aligned, inside work hours, after "now" today, never on a block). */
function freeStarts(m, date, dur, { after = 0, limit = 1 } = {}) {
  const { cfg } = m
  const blocks = [...(m.fixed.get(date) ?? []), ...(m.reserved.get(date) ?? [])]
  let from = Math.max(cfg.workStart, after)
  if (date === m.today) from = Math.max(from, Math.ceil((m.nowMinutes + 1) / cfg.step) * cfg.step)
  from = Math.ceil(from / cfg.step) * cfg.step
  const out = []
  for (let s = from; s + dur <= cfg.workEnd && out.length < limit; s += cfg.step) {
    if (overlaps(blocks, s, s + dur).length === 0 && wallExists(date, s, m.tz)) out.push(s)
  }
  return out
}

/** Reserves a slot so later suggestions cannot take it. */
const reserve = (m, date, s, e) => m.reserved.get(date).push({ s, e })

/**
 * Finds the best place for a block: the earliest slot on a day that still has room; failing that, the least loaded day that has any slot (flagged).
 * `onlyAfter` limits the search to days after a date (rebalancing never pulls work earlier).
 */
function place(m, dur, { onlyAfter = null, avoidDate = null, taskId = null, series = null, taken = new Set() } = {}) {
  const days = m.dates.filter((x) => dayAllowed(m, x) && (!onlyAfter || x > onlyAfter) && x !== avoidDate && !taken.has(x))
  const options = []
  for (const date of days) {
    const starts = freeStarts(m, date, dur, { limit: 1 })
    if (starts.length) options.push({ date, start: starts[0], load: dayLoad(m, date) })
  }
  if (!options.length) return null
  const roomy = options.find((o) => o.load + dur <= m.cfg.capacityMinutes)
  const pick = roomy ?? options.reduce((a, b) => (b.load < a.load ? b : a))
  return { date: pick.date, start: pick.start, end: pick.start + dur, overload: !roomy, taskId, series }
}

const slot = (p) => ({ date: p.date, start: minutesToTime(p.start), end: minutesToTime(p.end) })

/** Other places a suggestion could go, one per day (the primary day's next free time first), so one click can pick another. */
function alternativesFor(m, dur, primary) {
  const out = []
  for (const date of m.dates) {
    if (!dayAllowed(m, date)) continue
    const after = date === primary.date ? primary.end : 0
    const [s] = freeStarts(m, date, dur, { after, limit: 1 })
    if (s != null) out.push({ date, start: minutesToTime(s), end: minutesToTime(s + dur) })
    if (out.length >= 4) break
  }
  return out
}

// ------------------------------------------------------------------ the plan
/**
 * @param d { tasks, events, exceptions, interviews, reminders, habits, habitLogs, reschedules }
 * @param o { today, tz, nowMs, prefs }  `prefs` = user_settings.calendar_prefs
 * @returns {
 *   suggestions[]  { id, kind: 'recover'|'rebalance', taskId, title, priority, score, daysOverdue, slips, reasons[], from, to|null, durationMin, alternatives[], overload }
 *   days[]         the window as it is now: { date, load, fixedMin, taskMin, habitMin, capacity, level }
 *   daysAfter[]    the same days if every suggestion were applied
 *   overdue, overloaded  counts for headlines
 * }
 * `recover` moves a slipped task to the first free time that fits; `rebalance` lifts the least important flexible work off a day that is over capacity.
 * Fixed events, interviews, timed tasks and habits are never moved.
 */
export function planRecovery(d, { today, tz, nowMs = Date.now(), prefs = {} }) {
  const cfg = recoveryConfig(prefs)
  const history = d.reschedules ?? []
  const slips = slipCounts(history)
  const hidden = new Set()
  for (const r of history)
    if (r.action === 'dismissed' && live(r) && r.hide_until && r.hide_until >= today) hidden.add(`${r.task_id}:${r.from_date}:${hhmm(r.from_start) ?? '-'}`)
  const slippedAll = (d.tasks ?? []).filter((t) => isSlipped(t, { today, tz, nowMs }))
  const ctx = { today, tz, nowMs }
  const m = buildModel(d, cfg, ctx, { ignore: new Set(slippedAll.map((t) => t.id)) })
  const days = m.dates.map((x) => describeDay(m, x))

  const suggestions = []
  const claimedSeries = new Set() // `${series_id}:${date}`: two moves must not land one series on a day twice
  const seriesTaken = (t, date) => !!t.series_id && ((d.tasks ?? []).some((o) => o.id !== t.id && o.series_id === t.series_id && o.due_date === date) || claimedSeries.has(`${t.series_id}:${date}`))
  const finish = (task, kind, scored, dur, { accept = () => true } = {}) => {
    const taken = new Set(m.dates.filter((x) => seriesTaken(task, x)))
    const p = place(m, dur, { taskId: task.id, taken, onlyAfter: kind === 'rebalance' ? task.due_date : null, avoidDate: kind === 'rebalance' ? task.due_date : null })
    const from = taskSlot(task)
    const base = { kind, taskId: task.id, title: task.title, priority: task.priority, score: scored.score, daysOverdue: scored.daysOverdue, slips: slips.get(task.id) ?? 0, from, durationMin: dur, task }
    if (!p) return { ...base, id: `${task.id}:${from.date}:${from.start ?? '-'}`, to: null, alternatives: [], overload: false, reasons: [...scored.reasons, `No free time in the next ${cfg.horizonDays} days`] }
    if (!accept(p)) return { ...base, id: `${task.id}:${from.date}:${from.start ?? '-'}`, to: null, alternatives: [], overload: p.overload, reasons: scored.reasons, rejected: true }
    reserve(m, p.date, p.start, p.end)
    if (task.series_id) claimedSeries.add(`${task.series_id}:${p.date}`)
    const to = slot(p)
    const reasons = [...scored.reasons]
    if (p.overload) reasons.push('Every day is full: this is the lightest one')
    return { ...base, id: `${task.id}:${from.date}:${from.start ?? '-'}`, to, alternatives: alternativesFor(m, dur, p), overload: p.overload, reasons }
  }

  // 1. recover: most important first
  const candidates = slippedAll
    .filter((t) => !hidden.has(`${t.id}:${t.due_date}:${hhmm(t.start_time) ?? '-'}`))
    .map((t) => ({ t, s: importanceScore(t, { today, slips: slips.get(t.id) ?? 0 }) }))
    .sort((a, b) => b.s.score - a.s.score || a.t.due_date.localeCompare(b.t.due_date) || String(a.t.created_at).localeCompare(String(b.t.created_at)))
  for (const { t, s } of candidates) suggestions.push(finish(t, 'recover', s, durationOf(t, cfg)))

  // 2. rebalance: a day over capacity gives up its least important flexible tasks, to later days that have room
  const movable = (t) => !t.series_id && !t.start_time && t.status === 'pending' && t.priority !== 'urgent' && t.priority !== 'high'
  for (const day of days) {
    if (day.level !== 'over') continue
    const f = m.flex.get(day.date)
    const pool = f.tasks
      .filter((t) => movable(t) && !hidden.has(`${t.id}:${t.due_date}:-`))
      .map((t) => ({ t, s: importanceScore(t, { today, slips: slips.get(t.id) ?? 0 }) }))
      .sort((a, b) => a.s.score - b.s.score || String(b.t.created_at).localeCompare(String(a.t.created_at)))
    for (const { t, s } of pool) {
      if (dayLoad(m, day.date) <= cfg.capacityMinutes) break
      const dur = durationOf(t, cfg)
      // moving work from one full day to another full day helps nobody: only places with room count
      const sug = finish(t, 'rebalance', { ...s, reasons: [`${day.date === today ? 'Today is' : 'This day is'} over capacity`, ...s.reasons.filter((r) => r !== 'Time has passed')] }, dur, { accept: (p) => !p.overload })
      if (!sug.to) continue
      f.taskMin -= dur
      suggestions.push(sug)
    }
  }

  const daysAfter = m.dates.map((x) => describeDay(m, x))
  return { suggestions, days, daysAfter, config: cfg, overdue: slippedAll.length, hiddenCount: slippedAll.length - candidates.length, overloaded: days.filter((x) => x.level === 'over').length }
}

/** Day loads after applying a chosen subset of suggestions (or manual adjustments): `changes` = [{ kind, from, to, durationMin }]. */
export function projectLoads(days, changes) {
  const byDate = new Map(days.map((x) => [x.date, { ...x }]))
  for (const c of changes) {
    if (!c.to) continue
    const target = byDate.get(c.to.date)
    if (target) target.taskMin += c.durationMin
    const source = byDate.get(c.from.date)
    if (source && c.kind === 'rebalance') source.taskMin -= c.durationMin
  }
  return [...byDate.values()].map((x) => {
    const load = x.fixedMin + x.taskMin + x.habitMin
    return { ...x, load, level: dayLevel(load, x.capacity) }
  })
}

// ------------------------------------------------------------------ conflicts
/**
 * Whether one task may be put at `{ date, start, end }` ('HH:MM'). Used for manual adjustment and again, on fresh data, right before anything is saved.
 * `accepted` = the other placements in the same batch ([{ taskId, date, start, end }]): two suggestions must not overlap each other.
 * @returns { ok, errors: [{ code, message }], warnings: [{ code, message }] }  Errors block the change; warnings are shown and allowed.
 */
export function checkPlacement(d, { today, tz, nowMs = Date.now(), prefs = {} }, placement, { accepted = [] } = {}) {
  const cfg = recoveryConfig(prefs)
  const errors = []
  const warnings = []
  const fail = (code, message) => errors.push({ code, message })
  const { taskId, date } = placement
  const s = timeToMinutes(placement.start)
  const e = timeToMinutes(placement.end)
  const task = (d.tasks ?? []).find((t) => t.id === taskId)
  if (!task) fail('missing', 'That task no longer exists. It may have been deleted on another device.')
  else if (!isOpen(task)) fail('closed', 'That task is already finished or closed.')
  if (!isValidDay(date) || s == null || e == null || e <= s || e > 1440) {
    fail('bad_time', 'Choose a date, and an end time after the start time.')
    return { ok: false, errors, warnings }
  }
  if (date < today || (date === today && s < localDayMinutes(nowMs, tz).minutes)) fail('past', 'That time has already passed.')
  if (!wallExists(date, s, tz)) fail('dst', 'That time does not exist on that day because the clocks change. Pick a slightly different start.')
  const others = accepted.filter((a) => a.taskId !== taskId)
  const ignore = new Set([taskId, ...others.map((a) => a.taskId)])
  const through = date > addDays(today, cfg.horizonDays - 1) ? date : null
  const m = buildModel(d, cfg, { today, tz, nowMs }, { ignore, through: through && through <= addDays(today, 365) ? through : null })
  const hit = date >= today && m.fixed.has(date) ? overlaps(m.fixed.get(date), s, e) : []
  if (hit.length) fail('overlap', `Overlaps ${[...new Set(hit.map((h) => h.title))].slice(0, 2).join(' and ')}.`)
  const clash = others.find((a) => a.date === date && timeToMinutes(a.start) < e && timeToMinutes(a.end) > s)
  if (clash) fail('overlap_batch', 'Overlaps another change you are about to apply.')
  if (task?.series_id && (d.tasks ?? []).some((o) => o.id !== task.id && o.series_id === task.series_id && o.due_date === date)) fail('series', 'This repeating task already has an occurrence on that day.')
  if (task && taskSlot(task).date === date && taskSlot(task).start === placement.start && taskSlot(task).end === placement.end) fail('no_change', 'It is already there.')
  if (!errors.length) {
    if (s < cfg.workStart || e > cfg.workEnd) warnings.push({ code: 'outside_hours', message: 'Outside your working hours.' })
    const added = others.filter((a) => a.date === date).reduce((n, a) => n + timeToMinutes(a.end) - timeToMinutes(a.start), 0)
    if (m.fixed.has(date) && dayLoad(m, date) + added + (e - s) > cfg.capacityMinutes) warnings.push({ code: 'overloaded', message: 'That day would be over capacity.' })
  }
  return { ok: errors.length === 0, errors, warnings }
}

/** Is a stored task still exactly where a suggestion found it? Guards against applying a plan that went stale (another device moved or finished it). */
export const sameSlot = (task, from) => !!task && task.due_date === from.date && hhmm(task.start_time) === (from.start ?? null) && hhmm(task.end_time) === (from.end ?? null)
