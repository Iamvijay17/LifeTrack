// The calendar's view model. Pure: takes raw table rows, returns plain objects. Shared by web and (later) mobile.
//
// Everything on the calendar is an "item". Items come from existing records, never copies of them:
//   task       a row of `tasks`, optionally with a time of day (start_time / end_time); movable, resizable, completable
//   event      an occurrence of a `calendar_events` row (recurring ones expand into one item per occurrence)
//   interview  a row of `interview_events`; movable (changes scheduled_at)
//   reminder   an active row of `reminders`; movable (changes remind_date / remind_time)
//   deadline   goal / milestone / follow-up / bill / revision dates: shown for context and open their module, never edited here
// All dates are 'yyyy-MM-dd' and all minutes are minutes since local midnight in the user's timezone `tz`.
import { addDays, diffDays, localDayMinutes, minutesToTime, timeToMinutes, zonedToMs } from '@lifetrack/utils'
import { expandEvent } from './calendarRecurrence'
import { byPriority, isInactive, isOpen } from './tasks'

export const CALENDAR_CATEGORIES = [
  { key: 'learning', label: 'Career & Learning', short: 'Learning', color: '#8B5CF6', task: 'Learning', route: '/learning' },
  { key: 'jobs', label: 'Job Applications', short: 'Jobs', color: '#F59E0B', task: 'Job Search', route: '/jobs' },
  { key: 'fitness', label: 'Gym & Fitness', short: 'Gym', color: '#F97316', task: 'Gym', route: '/fitness' },
  { key: 'health', label: 'Sleep & Health', short: 'Health', color: '#38BDF8', task: 'Health', route: '/health' },
  { key: 'finance', label: 'Finance', short: 'Finance', color: '#10B981', task: 'Finance', route: '/finance' },
  { key: 'routine', label: 'Daily Routine', short: 'Routine', color: '#6366F1', task: 'Routine', route: '/habits' },
  { key: 'personal', label: 'Personal', short: 'Personal', color: '#EC4899', task: 'Personal', route: '/planner' },
  { key: 'custom', label: 'Custom', short: 'Custom', color: '#94A3B8', task: 'Custom', route: '/calendar' },
]
export const categoryMeta = (key) => CALENDAR_CATEGORIES.find((c) => c.key === key) ?? CALENDAR_CATEGORIES[6]
/** The calendar category of a task row (tasks keep their own category names). */
export const categoryOfTask = (task) => CALENDAR_CATEGORIES.find((c) => c.task === task.category)?.key ?? 'personal'
export const taskCategoryOf = (key) => categoryMeta(key).task

export const EVENT_COLORS = ['#8B5CF6', '#6366F1', '#38BDF8', '#14B8A6', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#94A3B8']
export const PRIORITY_META = {
  urgent: { label: 'Urgent', rank: 0, color: '#EF4444' },
  high: { label: 'High', rank: 1, color: '#F97316' },
  medium: { label: 'Medium', rank: 2, color: '#6366F1' },
  low: { label: 'Low', rank: 3, color: '#94A3B8' },
}
export const priorityRank = (p) => PRIORITY_META[p]?.rank ?? 2

const REMINDER_CATEGORY = { task: 'personal', study: 'learning', workout: 'fitness', habit: 'routine', bill: 'finance', custom: 'personal' }
const GOAL_CATEGORY = { Learning: 'learning', Career: 'jobs', Fitness: 'fitness', Health: 'health', Finance: 'finance', Personal: 'personal' }
const CLOSED_APPLICATION = ['selected', 'offer', 'rejected', 'withdrawn']
const INTERVIEW_MINUTES = 60
const POINT_MINUTES = 30
const hhmm = (t) => (t ? String(t).slice(0, 5) : null)

const base = (o) => ({
  kind: 'event',
  allDay: false,
  untimed: false,
  point: false,
  done: false,
  overdue: false,
  recurring: false,
  description: '',
  location: '',
  priority: null,
  alertMinutes: [],
  movable: false,
  resizable: false,
  editable: false,
  deletable: false,
  completable: false,
  href: null,
  ...o,
})
/** All-day items and tasks without a time live in the all-day lane; everything else sits on the hour grid. */
export const isLaneItem = (i) => i.allDay || i.untimed

const taskItem = (t, { tz, today, nowMs }) => {
  const timed = !!t.start_time
  const done = t.status === 'done'
  const startMs = zonedToMs(t.due_date, timed ? hhmm(t.start_time) : '00:00', tz)
  const endMs = timed ? zonedToMs(t.due_date, hhmm(t.end_time), tz) : zonedToMs(addDays(t.due_date, 1), '00:00', tz)
  const cat = categoryOfTask(t)
  return base({
    key: `task:${t.id}`,
    kind: 'task',
    sourceType: 'task',
    id: t.id,
    row: t,
    title: t.title,
    description: t.notes ?? '',
    location: t.location ?? '',
    category: cat,
    priority: t.priority,
    color: t.color || categoryMeta(cat).color,
    untimed: !timed,
    date: t.due_date,
    endDate: t.due_date,
    startMin: timed ? timeToMinutes(hhmm(t.start_time)) : 0,
    endMin: timed ? timeToMinutes(hhmm(t.end_time)) : 1440,
    startMs,
    endMs,
    done,
    overdue: !done && (timed ? endMs < nowMs : t.due_date < today),
    recurring: !!t.recurrence && t.recurrence !== 'none',
    alertMinutes: t.alert_minutes ?? [],
    movable: !done,
    resizable: timed && !done,
    editable: true,
    deletable: true,
    completable: true,
  })
}

const eventItem = (o) =>
  base({
    key: `event:${o.key}`,
    kind: 'event',
    sourceType: 'calendar_event',
    id: o.eventId,
    row: o.event,
    occurrence: o,
    occurrenceDate: o.occurrenceDate,
    title: o.title,
    description: o.description,
    location: o.location,
    category: o.category,
    categoryLabel: o.categoryLabel,
    priority: o.priority,
    color: o.color || categoryMeta(o.category).color,
    allDay: o.allDay,
    date: o.date,
    endDate: o.endDate,
    startMin: o.startMin,
    endMin: o.endMin,
    startMs: o.startMs,
    endMs: o.endMs,
    recurring: o.recurring,
    modified: o.modified,
    alertMinutes: o.alertMinutes,
    movable: true,
    resizable: !o.allDay,
    editable: true,
    deletable: true,
  })

function sourceItems(d, { from, to, tz }) {
  const out = []
  const inRange = (day) => !!day && day >= from && day <= to
  const lane = (o) => base({ allDay: true, startMin: 0, endMin: 1440, startMs: zonedToMs(o.date, '00:00', tz), endMs: zonedToMs(addDays(o.date, 1), '00:00', tz), endDate: o.date, ...o })
  const apps = new Map((d.applications ?? []).map((a) => [a.id, a]))

  for (const iv of d.interviews ?? []) {
    if (iv.status === 'cancelled' || !iv.scheduled_at) continue
    const s = localDayMinutes(iv.scheduled_at, tz)
    if (!inRange(s.date)) continue
    const app = apps.get(iv.application_id)
    const startMs = Date.parse(iv.scheduled_at)
    out.push(
      base({
        key: `interview:${iv.id}`,
        kind: 'interview',
        sourceType: 'interview',
        id: iv.id,
        row: iv,
        title: ['Interview', app?.company, iv.round_name && iv.round_name !== 'Interview' ? iv.round_name : null].filter(Boolean).join(' · '),
        description: iv.notes ?? '',
        location: iv.link ?? '',
        category: 'jobs',
        color: categoryMeta('jobs').color,
        date: s.date,
        endDate: s.date,
        startMin: s.minutes,
        endMin: Math.min(1440, s.minutes + INTERVIEW_MINUTES),
        startMs,
        endMs: startMs + INTERVIEW_MINUTES * 60000,
        done: iv.status === 'completed',
        movable: iv.status === 'scheduled',
        href: '/jobs',
      }),
    )
  }

  for (const r of d.reminders ?? []) {
    if (!r.active || !inRange(r.remind_date)) continue
    const m = timeToMinutes(hhmm(r.remind_time)) ?? 540
    const startMs = zonedToMs(r.remind_date, minutesToTime(m), tz)
    out.push(
      base({
        key: `reminder:${r.id}`,
        kind: 'reminder',
        sourceType: 'reminder',
        id: r.id,
        row: r,
        title: r.title,
        category: REMINDER_CATEGORY[r.kind] ?? 'personal',
        color: categoryMeta(REMINDER_CATEGORY[r.kind] ?? 'personal').color,
        point: true,
        recurring: r.repeat !== 'none',
        date: r.remind_date,
        endDate: r.remind_date,
        startMin: m,
        endMin: Math.min(1440, m + POINT_MINUTES),
        startMs,
        endMs: startMs + POINT_MINUTES * 60000,
        movable: true,
        href: '/notifications',
      }),
    )
  }

  const goals = new Map((d.goals ?? []).map((g) => [g.id, g]))
  for (const g of d.goals ?? [])
    if (g.status === 'active' && inRange(g.due_date)) {
      const cat = GOAL_CATEGORY[g.category] ?? 'personal'
      out.push(lane({ key: `goal:${g.id}`, kind: 'deadline', sourceType: 'goal', id: g.id, row: g, title: `Goal due: ${g.title}`, category: cat, color: categoryMeta(cat).color, date: g.due_date, href: '/goals' }))
    }
  for (const m of d.milestones ?? []) {
    const g = goals.get(m.goal_id)
    if (!m.done && g?.status === 'active' && inRange(m.due_date)) {
      const cat = GOAL_CATEGORY[g.category] ?? 'personal'
      out.push(lane({ key: `milestone:${m.id}`, kind: 'deadline', sourceType: 'milestone', id: m.id, row: m, title: `Milestone: ${m.title}`, category: cat, color: categoryMeta(cat).color, date: m.due_date, href: '/goals' }))
    }
  }
  for (const a of d.applications ?? [])
    if (!CLOSED_APPLICATION.includes(a.status) && inRange(a.followup_date))
      out.push(lane({ key: `followup:${a.id}`, kind: 'deadline', sourceType: 'application', id: a.id, row: a, title: `Follow up with ${a.company}`, category: 'jobs', color: categoryMeta('jobs').color, date: a.followup_date, href: '/jobs' }))
  for (const r of d.recurringRules ?? [])
    if (r.active && inRange(r.next_date))
      out.push(lane({ key: `bill:${r.id}`, kind: 'deadline', sourceType: 'recurring_rule', id: r.id, row: r, title: r.note || `${r.category} ${r.type === 'income' ? 'income' : 'payment'}`, category: 'finance', color: categoryMeta('finance').color, date: r.next_date, href: '/finance' }))
  for (const t of d.topics ?? [])
    if (!t.archived)
      for (const day of t.revision_dates ?? [])
        if (inRange(day)) out.push(lane({ key: `revision:${t.id}:${day}`, kind: 'deadline', sourceType: 'topic', id: t.id, row: t, title: `Revise ${t.name}`, category: 'learning', color: categoryMeta('learning').color, date: day, href: '/learning' }))
  return out
}

/**
 * Everything on the calendar between two local dates (inclusive), sorted by start. `from`/`to` are 'yyyy-MM-dd'.
 * @param d { tasks, events, exceptions, interviews, applications, reminders, goals, milestones, recurringRules, topics }
 */
export function buildCalendarItems(d, { from, to, tz, today, nowMs = Date.now() }) {
  const ctx = { tz, today, nowMs, from, to }
  const items = []
  for (const t of d.tasks ?? []) if (t.due_date && t.due_date >= from && t.due_date <= to && !isInactive(t)) items.push(taskItem(t, ctx))
  for (const e of d.events ?? []) for (const o of expandEvent(e, d.exceptions ?? [], from, to)) items.push(eventItem(o))
  items.push(...sourceItems(d, ctx))
  return items.sort(byStart)
}

/** Open tasks whose date has passed, wherever that date is: they stay on their original day, and the agenda lists them together. */
export function overdueItems(d, { tz, today, nowMs = Date.now() }) {
  return (d.tasks ?? [])
    .filter((t) => isOpen(t) && t.due_date && (t.due_date < today || (t.start_time && t.due_date === today)))
    .map((t) => taskItem(t, { tz, today, nowMs }))
    .filter((i) => i.overdue)
    .sort(byStart)
}

/** Open tasks with no date at all: candidates to drag onto the calendar. Most important first. */
export const unscheduledTasks = (tasks) => (tasks ?? []).filter((t) => isOpen(t) && !t.due_date).sort(byPriority)

export function byStart(a, b) {
  return a.date.localeCompare(b.date) || Number(isLaneItem(b)) - Number(isLaneItem(a)) || a.startMin - b.startMin || a.endMin - b.endMin || a.title.localeCompare(b.title)
}

// ------------------------------------------------------------------ filtering
/**
 * @param f { query, hiddenCategories: string[], priorities: string[], status: 'all'|'open'|'done'|'overdue' }
 * Priorities and status only narrow tasks and events; interviews, reminders and deadlines have neither.
 */
export function filterItems(items, { query = '', hiddenCategories = [], priorities = [], status = 'all' } = {}) {
  const q = query.trim().toLowerCase()
  const hidden = new Set(hiddenCategories)
  return items.filter((i) => {
    if (hidden.has(i.category)) return false
    if (priorities.length && (!i.priority || !priorities.includes(i.priority))) return false
    if (status === 'open' && i.done) return false
    if (status === 'done' && !i.done) return false
    if (status === 'overdue' && !i.overdue) return false
    if (q && !`${i.title} ${i.description} ${i.location} ${categoryMeta(i.category).label} ${i.categoryLabel ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
}

// -------------------------------------------------------------------- layout
/** Items that touch a local date (an item can span several). */
export const itemsOnDate = (items, date) => items.filter((i) => i.date <= date && i.endDate >= date)

/** The slice of a timed item that falls on one day, in minutes. */
export function segmentOn(item, date) {
  const start = item.date === date ? item.startMin : 0
  const end = item.endDate === date ? item.endMin : 1440
  return { startMin: start, endMin: Math.max(end, start + 1) }
}

/** The hour-grid and all-day-lane parts of one day. */
export function splitDay(items, date) {
  const on = itemsOnDate(items, date)
  const lane = on.filter(isLaneItem)
  const timed = on.filter((i) => !isLaneItem(i)).map((item) => ({ item, ...segmentOn(item, date) }))
  return { lane, timed }
}

/**
 * Side-by-side columns for overlapping segments, as Google Calendar does: overlapping items split the width, and an item grows to the right
 * while the columns beside it are free. `minLength` is the shortest height (in minutes) an item is drawn at; it counts for overlap too.
 * @param segs [{ key, startMin, endMin }]
 * @returns Map key -> { col, cols, span }
 */
export function layoutSegments(segs, minLength = 20) {
  const items = segs.map((s) => ({ ...s, end: Math.max(s.endMin, s.startMin + minLength) })).sort((a, b) => a.startMin - b.startMin || b.end - a.end)
  const out = new Map()
  let cluster = []
  let clusterEnd = -1
  const flush = () => {
    if (!cluster.length) return
    const colEnds = []
    const placed = cluster.map((s) => {
      let col = colEnds.findIndex((e) => e <= s.startMin)
      if (col < 0) col = colEnds.length
      colEnds[col] = s.end
      return { s, col }
    })
    const cols = colEnds.length
    for (const { s, col } of placed) {
      let span = 1
      for (let c = col + 1; c < cols; c++) {
        if (placed.some((p) => p.col === c && p.s.startMin < s.end && p.s.end > s.startMin)) break
        span++
      }
      out.set(s.key, { col, cols, span })
    }
    cluster = []
  }
  for (const s of items) {
    if (cluster.length && s.startMin >= clusterEnd) flush()
    cluster.push(s)
    clusterEnd = Math.max(clusterEnd, s.end)
  }
  flush()
  return out
}

/** A day's items whose times overlap each other (for the "conflicts with" hint). */
export function conflictsWith(item, items) {
  if (isLaneItem(item) || item.point) return []
  return items.filter((o) => o.key !== item.key && !isLaneItem(o) && !o.point && !o.done && o.startMs < item.endMs && o.endMs > item.startMs)
}

// ------------------------------------------------------------ drag and resize
export const SNAP_MINUTES = 15
export const MIN_DURATION = 15
export const DEFAULT_DURATION = 60
export const snapMinutes = (m, step = SNAP_MINUTES) => Math.round(m / step) * step
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/**
 * Plans moving an item. `target` is where it was dropped:
 *   { date, startMin: number }   onto the hour grid, at this time
 *   { date, startMin: 'keep' }   onto a day cell (month view): change the date, keep the time of day
 *   { date, startMin: null }     onto the all-day lane
 * Returns { preview, change } or null when the item cannot go there.
 *   preview  the item fields to show while the save is in flight (optimistic)
 *   change   what to write: { table, id, patch } for tasks, interviews and reminders; for events { table:'calendar_events', event, occurrenceDate, values }
 */
export function planMove(item, target, { tz, defaultDuration = DEFAULT_DURATION }) {
  if (!item.movable) return null
  const { date } = target
  const dur = Math.max(MIN_DURATION, Math.round((item.endMs - item.startMs) / 60000))
  const keep = target.startMin === 'keep'
  const toLane = target.startMin === null
  const timedNow = !isLaneItem(item)

  if (item.kind === 'task') {
    const wantsTime = !toLane && (!keep || timedNow)
    if (!wantsTime) return { preview: lanePreview(item, date, tz), change: { table: 'tasks', id: item.id, patch: { due_date: date, start_time: null, end_time: null } } }
    const len = timedNow ? item.endMin - item.startMin : Math.min(defaultDuration, 1439)
    const startMin = clamp(keep ? item.startMin : snapMinutes(target.startMin), 0, 1439 - len)
    const patch = { due_date: date, start_time: minutesToTime(startMin), end_time: minutesToTime(startMin + len) }
    return { preview: timedPreview(date, startMin, startMin + len, tz), change: { table: 'tasks', id: item.id, patch } }
  }

  if (item.kind === 'interview' || item.kind === 'reminder') {
    const startMin = clamp(keep || toLane ? item.startMin : snapMinutes(target.startMin), 0, 1439)
    const startMs = zonedToMs(date, minutesToTime(startMin), tz)
    const preview = { ...timedPreview(date, startMin, Math.min(1440, startMin + (item.endMin - item.startMin)), tz), startMs, endMs: startMs + (item.endMs - item.startMs) }
    const patch = item.kind === 'interview' ? { scheduled_at: new Date(startMs).toISOString() } : { remind_date: date, remind_time: minutesToTime(startMin), last_fired_on: null }
    return { preview, change: { table: item.kind === 'interview' ? 'interview_events' : 'reminders', id: item.id, patch } }
  }

  if (item.kind === 'event') {
    let startMs, endMs, allDay
    if (item.allDay && (keep || toLane)) {
      allDay = true
      const days = Math.max(1, diffDays(item.endDate, item.date) + 1)
      startMs = zonedToMs(date, '00:00', tz)
      endMs = zonedToMs(addDays(date, days), '00:00', tz)
    } else if (toLane) {
      allDay = true
      startMs = zonedToMs(date, '00:00', tz)
      endMs = zonedToMs(addDays(date, 1), '00:00', tz)
    } else {
      allDay = false
      const startMin = keep ? item.startMin : clamp(snapMinutes(target.startMin), 0, 1439)
      startMs = zonedToMs(date, minutesToTime(startMin), tz)
      endMs = startMs + (item.allDay ? defaultDuration : dur) * 60000
    }
    const s = localDayMinutes(startMs, tz)
    const last = localDayMinutes(endMs - 1, tz)
    const end = localDayMinutes(endMs, tz)
    const preview = { allDay, untimed: false, date: s.date, endDate: last.date, startMin: allDay ? 0 : s.minutes, endMin: allDay || end.date !== last.date ? 1440 : end.minutes, startMs, endMs }
    return { preview, change: { table: 'calendar_events', event: item.row, occurrenceDate: item.occurrenceDate, values: { all_day: allDay, starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString() } } }
  }
  return null
}

/**
 * Plans dragging one edge of a timed item. `date` is the day the edge sits on and `minutes` where it was dropped (0..1440).
 * The item never gets shorter than MIN_DURATION. Returns { preview, change } like planMove, or null.
 */
export function planResize(item, edge, { date, minutes }, { tz }) {
  if (!item.resizable) return null
  const m = clamp(snapMinutes(minutes), 0, 1440)

  if (item.kind === 'task') {
    const start = edge === 'start' ? clamp(m, 0, item.endMin - MIN_DURATION) : item.startMin
    const end = edge === 'end' ? clamp(m, item.startMin + MIN_DURATION, 1439) : item.endMin
    return { preview: timedPreview(item.date, start, end, tz), change: { table: 'tasks', id: item.id, patch: { start_time: minutesToTime(start), end_time: minutesToTime(end) } } }
  }
  if (item.kind === 'event') {
    const at = (day, min) => (min >= 1440 ? zonedToMs(addDays(day, 1), '00:00', tz) : zonedToMs(day, minutesToTime(min), tz))
    let startMs = item.startMs
    let endMs = item.endMs
    if (edge === 'start') startMs = Math.min(at(date, m), endMs - MIN_DURATION * 60000)
    else endMs = Math.max(at(date, m), startMs + MIN_DURATION * 60000)
    const s = localDayMinutes(startMs, tz)
    const last = localDayMinutes(endMs - 1, tz)
    const end = localDayMinutes(endMs, tz)
    const preview = { date: s.date, endDate: last.date, startMin: s.minutes, endMin: end.date !== last.date ? 1440 : end.minutes, startMs, endMs }
    return { preview, change: { table: 'calendar_events', event: item.row, occurrenceDate: item.occurrenceDate, values: { all_day: false, starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString() } } }
  }
  return null
}

function timedPreview(date, startMin, endMin, tz) {
  return { allDay: false, untimed: false, date, endDate: date, startMin, endMin, startMs: zonedToMs(date, minutesToTime(startMin), tz), endMs: endMin >= 1440 ? zonedToMs(addDays(date, 1), '00:00', tz) : zonedToMs(date, minutesToTime(endMin), tz) }
}
function lanePreview(item, date, tz) {
  return { untimed: item.kind === 'task', allDay: item.kind !== 'task', date, endDate: date, startMin: 0, endMin: 1440, startMs: zonedToMs(date, '00:00', tz), endMs: zonedToMs(addDays(date, 1), '00:00', tz) }
}
/** The item as it will look once a planned change lands. */
export const applyPreview = (item, preview) => (preview ? { ...item, ...preview, pending: true } : item)

/** Items the user can drop an unscheduled task onto: turns a task with no date into a planned one. */
export function planSchedule(task, target, { tz, defaultDuration = DEFAULT_DURATION }) {
  const item = taskItem({ ...task, due_date: target.date }, { tz, today: target.date, nowMs: 0 })
  return planMove({ ...item, movable: true }, target, { tz, defaultDuration })
}

// -------------------------------------------------------------------- agenda
/**
 * The Agenda: what is next, grouped for reading.
 * @returns { overdue, today, upcoming: [{ date, items }], pending, recurring: [{ item, rule }], completed }
 * `items` should cover at least today..today+days and a little history; overdue tasks come from overdueItems().
 */
export function agendaSections(items, { today, days = 30, overdue = [], tasks = [], history = 14 }) {
  const until = addDays(today, days)
  const live = items.filter((i) => !i.overdue || i.date >= today)
  const todays = itemsOnDate(live, today).filter((i) => !i.done)
  const upcoming = new Map()
  for (const i of live) {
    if (i.done || i.date <= today || i.date > until) continue
    if (!upcoming.has(i.date)) upcoming.set(i.date, [])
    upcoming.get(i.date).push(i)
  }
  const seen = new Set()
  const recurring = []
  for (const i of live) {
    if (!i.recurring || i.done || i.date <= today || i.date > until) continue
    const id = `${i.sourceType}:${i.id}`
    if (seen.has(id)) continue
    seen.add(id)
    recurring.push(i)
  }
  const since = addDays(today, -history)
  return {
    overdue,
    today: todays,
    upcoming: [...upcoming.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, items: list })),
    pending: unscheduledTasks(tasks),
    recurring,
    completed: items.filter((i) => i.done && i.date >= since && i.date <= today).sort((a, b) => b.date.localeCompare(a.date) || b.startMin - a.startMin),
  }
}

// -------------------------------------------------------------------- alerts
/** An all-day or untimed item is alerted relative to this local time, since it has no start of its own. */
export const ALL_DAY_ALERT_TIME = '09:00'
export const ALERT_CHOICES = [
  { value: 0, label: 'At the time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
  { value: 10080, label: '1 week before' },
]
export const alertLabel = (m) => ALERT_CHOICES.find((c) => c.value === m)?.label ?? (m % 1440 === 0 ? `${m / 1440} days before` : m % 60 === 0 ? `${m / 60} hours before` : `${m} minutes before`)

/**
 * The alerts that exist for a list of items, one per (item, offset). Items that are done, or that have no alerts, produce none.
 * `key` is stable for the same occurrence and offset, and is what keeps one alert from being raised twice across devices.
 */
export function alertSchedule(items, { tz }) {
  const out = []
  for (const i of items) {
    if (i.done || !i.alertMinutes?.length || (i.kind !== 'event' && i.kind !== 'task')) continue
    const ref = isLaneItem(i) ? zonedToMs(i.date, ALL_DAY_ALERT_TIME, tz) : i.startMs
    for (const m of new Set(i.alertMinutes))
      out.push({ key: `cal:${i.kind}:${i.id}:${i.kind === 'event' ? i.occurrenceDate : i.date}:${m}`, item: i, offset: m, fireAtMs: ref - m * 60000, startMs: ref })
  }
  return out.sort((a, b) => a.fireAtMs - b.fireAtMs)
}

/** Alerts that should be raised now: their time has come and passed no longer than `catchUpMs` ago (so a long-asleep tab doesn't replay history). */
export const dueAlerts = (schedule, nowMs, catchUpMs = 15 * 60000) => schedule.filter((a) => a.fireAtMs <= nowMs && a.fireAtMs > nowMs - catchUpMs && a.startMs + 60 * 60000 > nowMs)

/** "Standup starts in 10 minutes" / "starts now" / "was due". */
export function alertText(alert, nowMs) {
  const mins = Math.round((alert.startMs - nowMs) / 60000)
  const what = alert.item.kind === 'task' ? 'is due' : 'starts'
  if (mins <= 0) return `${alert.item.title} ${what} now`
  if (mins < 60) return `${alert.item.title} ${what} in ${mins} minute${mins === 1 ? '' : 's'}`
  const h = Math.round(mins / 60)
  return `${alert.item.title} ${what} in ${mins < 1440 ? `${h} hour${h === 1 ? '' : 's'}` : `${Math.round(mins / 1440)} day${Math.round(mins / 1440) === 1 ? '' : 's'}`}`
}
