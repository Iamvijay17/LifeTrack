// Personal Automation Studio, the engine: what happened (occurrences), whether the conditions hold, and what the actions would do (a plan of
// effects). Pure: it reads rows and a context and returns data, it never writes. The same plan is what "Test workflow" shows, and what the
// executor in @lifetrack/data applies, so a test can never promise something a real run would not do.
//
// Why "occurrences with keys" instead of watching for changes: the app only runs while it is open, and many devices may be open. Every
// occurrence has a stable key ("this task, completed at this moment", "this slot of this schedule"); the executor claims the key in the
// database first (unique), so one thing starts one run, however many devices or restarts see it.
import { addDays, dateStrInTz, diffDays, localDayMinutes, monthEnd, startOfWeek, weekday, zonedToMs } from '@lifetrack/utils'
import { goalPercent } from './goals'
import { expandEvent } from './calendarRecurrence'
import { isScheduled, streaks } from './streaks'
import { isOpen } from './tasks'
import { LIMITS, WEEKDAYS, conditionField, isScheduleTrigger, runOrder, triggerDef, triggerNode } from './automation'

const PRIORITY_RANK = { low: 0, medium: 1, high: 2, urgent: 3 }
const ms = (iso) => (iso ? Date.parse(iso) : NaN)
const wso = (ctx) => ctx.weekStartsOn ?? 1
const habitWithPauses = (h, src) => ({ ...h, pauses: (src.habitPauses ?? []).filter((p) => p.habit_id === h.id) })
const activeHabits = (src, id) => (src.habits ?? []).filter((h) => !h.archived_at && (!id || h.id === id)).map((h) => habitWithPauses(h, src))

// -------------------------------------------------------------------------------------------- schedule slots
const daysInMonth = (date) => Number(monthEnd(date).slice(8))

/** The time of day a schedule fires on `date`, or null when it does not fire that day. */
export function slotTime(kind, c, date) {
  switch (kind) {
    case 'schedule_once': return c.date === date ? c.time : null
    case 'schedule_daily':
    case 'daily_review': return c.time
    case 'schedule_weekdays': return (c.days ?? []).includes(weekday(date)) ? c.time : null
    case 'schedule_weekly':
    case 'weekly_review': return Number(c.day) === weekday(date) ? c.time : null
    case 'schedule_monthly': return Math.min(Number(c.day), daysInMonth(date)) === Number(date.slice(8)) ? c.time : null
    case 'schedule_interval': {
      const n = diffDays(date, c.start)
      return n >= 0 && n % Number(c.every) === 0 ? c.time : null
    }
    default: return null
  }
}

/** The most recent slot that has come due and is still worth firing: after the workflow was switched on, and not older than the catch-up window. */
export function dueSlot(kind, c, { tz, nowMs, activatedMs }) {
  const today = dateStrInTz(nowMs, tz)
  let best = null
  for (const date of [addDays(today, -1), today]) {
    const time = slotTime(kind, c, date)
    if (!time) continue
    const at = zonedToMs(date, time, tz)
    if (at <= nowMs && at >= activatedMs && nowMs - at <= LIMITS.catchupMs && (!best || at > best.at)) best = { date, time, at }
  }
  return best
}

// -------------------------------------------------------------------------------------------- occurrences
const occ = (key, subject, label, at) => ({ key, subject, label, at })

/** Streak length and the day the current run began (so a streak is announced once, not every day). */
function streakInfo(habit, logs, today, weekStartsOn) {
  const { current, unit } = streaks(habit, logs, today, weekStartsOn)
  if (!current) return { current: 0, start: null }
  if (unit === 'wk') {
    const week = startOfWeek(today, weekStartsOn)
    const thisWeekDone = logs.filter((l) => l.status === 'done' && l.log_date >= week && l.log_date <= addDays(week, 6)).length >= habit.weekly_target
    return { current, start: addDays(week, -7 * (thisWeekDone ? current - 1 : current)) } // the running week only counts once its target is met
  }
  const done = new Set(logs.filter((l) => l.status === 'done').map((l) => l.log_date))
  let start = today
  let seen = 0
  for (let d = today; seen < current; d = addDays(d, -1)) {
    if (done.has(d)) { seen++; start = d }
    if (d < habit.start_date && seen < current) break
  }
  return { current, start }
}

/**
 * Everything that has happened (or come due) for this workflow's trigger, each with a key. Already-run keys are filtered out by the caller.
 * Event triggers (a task was created/completed/became overdue, a habit was logged or missed…) only look at things that happened AFTER the
 * workflow was switched on; state triggers (a goal reached 50%, a streak of 7, a deadline close) fire once for every subject that is in that
 * state, including one that already was when the workflow was switched on.
 * @param {*} workflow   { id, graph, activated_at }
 * @param {*} src        rows: tasks, habits, habitLogs, habitPauses, goals, milestones, sessions, reminders, events, exceptions
 * @param {*} ctx        { today, tz, nowMs, weekStartsOn, automationIds: Set<string> }  (ids of rows automations created)
 */
export function findOccurrences(workflow, src, ctx) {
  const t = triggerNode(workflow.graph)
  const def = t && triggerDef(t.kind)
  const activatedMs = ms(workflow.activated_at)
  if (!def || !Number.isFinite(activatedMs)) return []
  const c = t.config ?? {}
  const { today, tz, nowMs } = ctx
  const made = ctx.automationIds ?? new Set()
  const startDay = dateStrInTz(activatedMs, tz)
  const out = []

  if (isScheduleTrigger(t.kind)) {
    const slot = dueSlot(t.kind, c, { tz, nowMs, activatedMs })
    if (slot) out.push(occ(`slot:${slot.date}@${slot.time}`, { type: 'schedule', date: slot.date, time: slot.time }, `${slot.date} ${slot.time}`, slot.at))
    return out
  }

  switch (t.kind) {
    case 'task_created':
      for (const k of src.tasks ?? []) if (!made.has(k.id) && ms(k.created_at) >= activatedMs) out.push(occ(`task_created:${k.id}`, { type: 'task', row: k }, k.title, ms(k.created_at)))
      break
    case 'task_completed':
      for (const k of src.tasks ?? []) if (k.status === 'done' && ms(k.completed_at) >= activatedMs) out.push(occ(`task_completed:${k.id}:${k.completed_at}`, { type: 'task', row: k }, k.title, ms(k.completed_at)))
      break
    case 'task_overdue':
      for (const k of src.tasks ?? []) if (!made.has(k.id) && isOpen(k) && k.due_date && k.due_date < today && addDays(k.due_date, 1) >= startDay) out.push(occ(`task_overdue:${k.id}:${k.due_date}`, { type: 'task', row: k }, k.title, nowMs))
      break
    case 'task_due_soon': {
      const n = Number(c.days_before)
      for (const k of src.tasks ?? []) {
        if (made.has(k.id) || !isOpen(k) || !k.due_date) continue
        const left = diffDays(k.due_date, today)
        if (left >= 0 && left <= n && addDays(k.due_date, -n) >= startDay) out.push(occ(`task_due:${k.id}:${k.due_date}:${n}`, { type: 'task', row: k }, k.title, nowMs))
      }
      break
    }
    case 'habit_completed': {
      const habits = new Map(activeHabits(src, c.habit_id).map((h) => [h.id, h]))
      for (const l of src.habitLogs ?? []) {
        const h = habits.get(l.habit_id)
        if (h && l.status === 'done' && ms(l.created_at) >= activatedMs) out.push(occ(`habit_done:${h.id}:${l.log_date}`, { type: 'habit', row: h, date: l.log_date, status: 'done' }, h.name, ms(l.created_at)))
      }
      break
    }
    case 'habit_missed':
      for (const h of activeHabits(src, c.habit_id)) {
        if (h.frequency === 'weekly') continue // a weekly habit has no "day it was missed"
        const logged = new Set((src.habitLogs ?? []).filter((l) => l.habit_id === h.id).map((l) => l.log_date))
        for (const date of [addDays(today, -2), addDays(today, -1)]) {
          if (date >= startDay && isScheduled(h, date) && !logged.has(date)) out.push(occ(`habit_missed:${h.id}:${date}`, { type: 'habit', row: h, date, status: 'missed' }, h.name, nowMs))
        }
      }
      break
    case 'habit_streak':
      for (const h of activeHabits(src, c.habit_id)) {
        const logs = (src.habitLogs ?? []).filter((l) => l.habit_id === h.id)
        const info = streakInfo(h, logs, today, wso(ctx))
        if (info.current >= Number(c.length)) out.push(occ(`habit_streak:${h.id}:${c.length}:${info.start}`, { type: 'habit', row: h, status: 'done', streak: info.current }, h.name, nowMs))
      }
      break
    case 'habit_week_target': {
      const from = startOfWeek(today, wso(ctx))
      for (const h of activeHabits(src, c.habit_id)) {
        if (h.frequency !== 'weekly') continue
        const n = (src.habitLogs ?? []).filter((l) => l.habit_id === h.id && l.status === 'done' && l.log_date >= from && l.log_date <= addDays(from, 6)).length
        if (n >= h.weekly_target) out.push(occ(`habit_week:${h.id}:${from}`, { type: 'habit', row: h, status: 'done', streak: n }, h.name, nowMs))
      }
      break
    }
    case 'goal_created':
      for (const g of src.goals ?? []) if (!made.has(g.id) && ms(g.created_at) >= activatedMs) out.push(occ(`goal_created:${g.id}`, goalSubject(g, src), g.title, ms(g.created_at)))
      break
    case 'goal_progress':
      for (const g of src.goals ?? []) {
        if (g.status !== 'active' || (c.goal_id && g.id !== c.goal_id)) continue
        const s = goalSubject(g, src)
        if (s.progress >= Number(c.percent)) out.push(occ(`goal_pct:${g.id}:${c.percent}`, s, g.title, nowMs))
      }
      break
    case 'goal_completed':
      for (const g of src.goals ?? []) if (g.status === 'completed' && ms(g.completed_at) >= activatedMs) out.push(occ(`goal_done:${g.id}:${g.completed_at}`, goalSubject(g, src), g.title, ms(g.completed_at)))
      break
    case 'goal_deadline': {
      const n = Number(c.days_before)
      for (const g of src.goals ?? []) {
        if (g.status !== 'active' || !g.due_date) continue
        const left = diffDays(g.due_date, today)
        if (left >= 0 && left <= n) out.push(occ(`goal_deadline:${g.id}:${g.due_date}:${n}`, goalSubject(g, src), g.title, nowMs))
      }
      break
    }
    case 'reminder_due':
      for (const r of src.reminders ?? []) {
        if ((c.reminder_id && r.id !== c.reminder_id) || r.last_fired_on !== today || !(ms(r.updated_at) >= activatedMs)) continue
        out.push(occ(`reminder:${r.id}:${today}`, { type: 'reminder', row: r }, r.title, ms(r.updated_at)))
      }
      break
    case 'calendar_event_soon': {
      const lead = Number(c.minutes_before) * 60_000
      const events = (src.events ?? []).flatMap((e) => expandEvent(e, src.exceptions ?? [], addDays(today, -1), addDays(today, 8)))
      for (const o of events) {
        if (o.allDay) continue
        const until = o.startMs - nowMs
        if (until > 0 && until <= lead && o.startMs - lead >= activatedMs) out.push(occ(`event:${o.key}:${o.startMs}:${c.minutes_before}`, { type: 'event', row: o.event, title: o.title, startMs: o.startMs }, o.title, nowMs))
      }
      break
    }
    default:
  }
  return out
}

function goalSubject(g, src) {
  const p = goalPercent(g, src.milestones ?? [], src.sessions ?? [])
  return { type: 'goal', row: g, progress: p.percent, source: p.source }
}

/** Ids of rows automations have created (tasks, milestones…): they never start another automation of the "created / overdue / due soon" kind. */
export function createdIds(executions) {
  const ids = new Set()
  for (const e of executions ?? []) for (const s of e.steps ?? []) if (s.ref && s.status === 'ok') ids.add(s.ref)
  return ids
}

// --------------------------------------------------------------------------------------------- limits
/** Whether another run may start now. `executions` are this user's execution rows. */
export function runAllowance(workflow, executions, { tz, nowMs }) {
  const today = dateStrInTz(nowMs, tz)
  const mine = executions.filter((e) => e.workflow_id === workflow.id && dateStrInTz(e.created_at, tz) === today)
  const real = mine.filter((e) => e.status !== 'skipped').length
  const cap = Math.min(workflow.max_runs_per_day ?? LIMITS.runsPerDay, LIMITS.maxRunsPerDay)
  if (real >= cap) return { ok: false, reason: `Daily limit of ${cap} runs reached for this workflow.` }
  if (mine.length >= LIMITS.maxRunsPerDay * 2) return { ok: false, reason: 'Too many runs today.' }
  const hour = executions.filter((e) => e.status !== 'skipped' && nowMs - ms(e.created_at) < 3600_000).length
  if (hour >= LIMITS.runsPerHourAll) return { ok: false, reason: `Hourly limit of ${LIMITS.runsPerHourAll} runs across all workflows reached.` }
  return { ok: true }
}

// --------------------------------------------------------------------------------------------- conditions
/** The values conditions compare against, for one occurrence. */
export function factsFor(subject, src, ctx) {
  const { today, tz, nowMs } = ctx
  const f = { 'day.is_weekday': String(![0, 6].includes(weekday(today))), 'day.weekday': String(weekday(today)), 'day.hour': Math.floor(localDayMinutes(nowMs, tz).minutes / 60) }
  const r = subject?.row
  if (subject?.type === 'task' && r) {
    f['task.status'] = r.status
    f['task.priority'] = r.priority
    f['task.overdue'] = String(isOpen(r) && !!r.due_date && r.due_date < today)
    f['task.category'] = r.category
    f['task.title'] = r.title
    f['task.due_in_days'] = r.due_date ? diffDays(r.due_date, today) : null
  }
  if (subject?.type === 'habit' && r) {
    const logs = (src.habitLogs ?? []).filter((l) => l.habit_id === r.id)
    f['habit.status'] = subject.status
    f['habit.streak'] = subject.streak ?? streaks(r, logs, today, wso(ctx)).current
    f['habit.name'] = r.name
  }
  if (subject?.type === 'goal' && r) {
    f['goal.progress'] = subject.progress
    f['goal.status'] = r.status
    f['goal.category'] = r.category
    f['goal.title'] = r.title
  }
  return f
}

function compare(field, op, actual, expected) {
  if (actual == null) return false
  if (field === 'task.priority' && ['gt', 'gte', 'lt', 'lte'].includes(op)) { actual = PRIORITY_RANK[actual]; expected = PRIORITY_RANK[expected] }
  const f = conditionField(field)
  const numeric = f?.type === 'number' || (field === 'task.priority' && ['gt', 'gte', 'lt', 'lte'].includes(op))
  const a = numeric ? Number(actual) : String(actual).toLowerCase()
  const b = numeric ? Number(expected) : String(expected).toLowerCase()
  switch (op) {
    case 'eq': return a === b
    case 'neq': return a !== b
    case 'gt': return a > b
    case 'gte': return a >= b
    case 'lt': return a < b
    case 'lte': return a <= b
    case 'contains': return String(a).includes(String(b))
    default: return false
  }
}

/** { pass, checks: [{ label, actual, pass }] } for a condition node's config ({ mode: 'all' | 'any', rules }). */
export function evaluateCondition(config, facts) {
  const checks = (config.rules ?? []).map((r) => {
    const f = conditionField(r.field)
    const actual = facts[r.field]
    const pass = compare(r.field, r.op, actual, r.value)
    const shown = f?.options?.find((o) => String(o.value) === String(actual))?.label ?? actual
    return { label: f?.label ?? r.field, actual: shown ?? 'n/a', pass }
  })
  const pass = checks.length > 0 && (config.mode === 'any' ? checks.some((c) => c.pass) : checks.every((c) => c.pass))
  return { pass, checks }
}

// --------------------------------------------------------------------------------------------- templating
export function variablesFor(subject, src, ctx) {
  const r = subject?.row
  const v = { date: ctx.today, weekday: WEEKDAYS[weekday(ctx.today)] }
  if (subject?.type === 'task' && r) v.task = { title: r.title, priority: r.priority, category: r.category, due_date: r.due_date ?? 'no date' }
  if (subject?.type === 'habit' && r) v.habit = { name: r.name, streak: subject.streak ?? factsFor(subject, src, ctx)['habit.streak'] }
  if (subject?.type === 'goal' && r) v.goal = { title: r.title, progress: subject.progress }
  if (subject?.type === 'reminder' && r) v.reminder = { title: r.title }
  if (subject?.type === 'event') v.event = { title: subject.title, time: new Date(subject.startMs).toISOString() }
  return v
}
export const render = (text, vars) =>
  String(text ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = path.split('.').reduce((o, k) => (o == null ? o : o[k]), vars)
    return value == null ? '' : String(value)
  })

// --------------------------------------------------------------------------------------------- the plan
const cut = (s, n) => String(s ?? '').slice(0, n)
function dueDate(kind, days, today) {
  if (kind === 'none') return null
  if (kind === 'today') return today
  if (kind === 'tomorrow') return addDays(today, 1)
  if (kind === 'in_days') return addDays(today, Math.max(1, Number(days) || 1))
  if (kind === 'next_monday') return addDays(today, ((8 - weekday(today)) % 7) || 7)
  return today
}
const wishedGoal = (c, subject, src) => (c.goal_id ? (src.goals ?? []).find((g) => g.id === c.goal_id) : subject?.type === 'goal' ? subject.row : null)

/** What one action node would do: { status: 'planned' | 'skipped', detail, effect? }. */
function planAction(node, subject, src, ctx, runKey) {
  const c = node.config ?? {}
  const vars = variablesFor(subject, src, ctx)
  const text = (s, n) => cut(render(s, vars), n).trim()
  const { today } = ctx
  switch (node.kind) {
    case 'notify': {
      const title = text(c.title, 200) || 'Automation'
      return { status: 'planned', detail: `Show notification "${title}"`, effect: { op: 'notify', key: `auto:${runKey}:${node.id}`, title, body: text(c.body, 500), priority: c.priority || 'normal' } }
    }
    case 'create_task': {
      const title = text(c.title, 200)
      if (!title) return { status: 'skipped', detail: 'The task title came out empty.' }
      const due = dueDate(c.due ?? 'today', c.days, today)
      return { status: 'planned', detail: `Create task "${title}"${due ? ` due ${due}` : ''}`, effect: { op: 'insert', table: 'tasks', row: { title, notes: text(c.notes, 2000), category: c.category || 'Personal', priority: c.priority || 'medium', due_date: due, status: 'pending' } } }
    }
    case 'update_task': {
      const t = subject?.row
      if (subject?.type !== 'task' || !t) return { status: 'skipped', detail: 'There is no task to update.' }
      const patch = {}
      if (c.priority && c.priority !== t.priority) patch.priority = c.priority
      if (c.move_days !== undefined && c.move_days !== '' && Number(c.move_days) !== 0) patch.due_date = addDays(t.due_date ?? today, Number(c.move_days))
      if (c.note) patch.notes = cut(`${t.notes ? `${t.notes}\n` : ''}${text(c.note, 300)}`, 4000)
      const status = c.status && c.status !== t.status ? c.status : null
      if (!Object.keys(patch).length && !status) return { status: 'skipped', detail: `"${t.title}" is already up to date.` }
      const parts = [...Object.entries(patch).filter(([k]) => k !== 'notes').map(([k, v]) => `${k.replace('_', ' ')} → ${v}`), ...(patch.notes ? ['add a note'] : []), ...(status ? [`status → ${status}`] : [])]
      return { status: 'planned', detail: `Update "${t.title}": ${parts.join(', ')}`, effect: { op: 'update_task', id: t.id, patch, ...(status ? { status } : {}) } }
    }
    case 'create_reminder': {
      const title = text(c.title, 160)
      if (!title) return { status: 'skipped', detail: 'The reminder title came out empty.' }
      const date = dueDate(c.due ?? 'today', c.days, today)
      return { status: 'planned', detail: `Create reminder "${title}" on ${date} at ${c.time}`, effect: { op: 'insert', table: 'reminders', row: { title, body: text(c.body, 500), kind: 'custom', remind_date: date, remind_time: c.time, repeat: 'none', active: true } } }
    }
    case 'update_goal_progress': {
      const g = wishedGoal(c, subject, src)
      if (!g) return { status: 'skipped', detail: 'The goal no longer exists.' }
      const p = goalPercent(g, src.milestones ?? [], src.sessions ?? [])
      if (g.status !== 'active') return { status: 'skipped', detail: `"${g.title}" is not active.` }
      if (p.source !== 'manual') return { status: 'skipped', detail: `"${g.title}" is measured by ${p.source === 'milestones' ? 'its milestones' : 'study time'}, so its progress is calculated and was left alone.` }
      const value = Math.max(0, Math.min(100, Math.round(c.mode === 'set' ? Number(c.value) : p.percent + Number(c.value))))
      if (value === p.percent) return { status: 'skipped', detail: `"${g.title}" is already at ${value}%.` }
      return { status: 'planned', detail: `Set "${g.title}" progress ${p.percent}% → ${value}%`, effect: { op: 'update', table: 'goals', id: g.id, patch: { manual_progress: value } } }
    }
    case 'create_review_task': {
      const weekly = c.period === 'weekly'
      const from = startOfWeek(today, wso(ctx))
      const tasks = src.tasks ?? []
      const open = tasks.filter((t) => isOpen(t) && (weekly ? true : t.due_date === today)).length
      const done = tasks.filter((t) => t.status === 'done' && t.completed_at && (weekly ? dateStrInTz(t.completed_at, ctx.tz) >= from : dateStrInTz(t.completed_at, ctx.tz) === today)).length
      const title = weekly ? `Weekly review: week of ${from}` : `Daily review: ${today}`
      const notes = `${weekly ? 'This week' : 'Today'}: ${done} task${done === 1 ? '' : 's'} done, ${open} still open.\n\nWhat went well?\nWhat got in the way?\n${weekly ? 'What are the three priorities for next week?' : 'What matters most tomorrow?'}`
      return { status: 'planned', detail: `Create task "${title}"`, effect: { op: 'insert', table: 'tasks', row: { title, notes, category: 'Routine', priority: c.priority || 'medium', due_date: today, status: 'pending' } } }
    }
    case 'add_checklist_item': {
      const g = wishedGoal(c, subject, src)
      const title = text(c.title, 160)
      if (!g) return { status: 'skipped', detail: 'The goal no longer exists.' }
      if (!title) return { status: 'skipped', detail: 'The item came out empty.' }
      const mine = (src.milestones ?? []).filter((m) => m.goal_id === g.id)
      if (mine.some((m) => m.title.trim().toLowerCase() === title.toLowerCase())) return { status: 'skipped', detail: `"${g.title}" already has "${title}".` }
      return { status: 'planned', detail: `Add "${title}" to the checklist of "${g.title}"`, effect: { op: 'insert', table: 'milestones', row: { goal_id: g.id, title, position: mine.reduce((n, m) => Math.max(n, m.position ?? 0), 0) + 1, done: false } } }
    }
    case 'complete':
      return { status: 'planned', detail: 'Mark the run as completed', effect: { op: 'none' } }
    default:
      return { status: 'skipped', detail: 'This action is not supported.' }
  }
}

/**
 * Plans one run: walks the graph from the trigger, evaluates conditions, and lists what every action would do. Nothing is written.
 * @returns {{ status: 'planned' | 'skipped', reason: string, steps: object[] }}
 *   steps: { node_id, type, kind, status: 'planned' | 'skipped' | 'ok', detail, effect?, checks? }. A step is 'skipped' when it did not run (a
 *   condition was not met upstream, or the action had nothing to do); the run is 'skipped' when no action did anything.
 */
export function planRun(workflow, occurrence, src, ctx) {
  const g = workflow.graph
  const runKey = `${workflow.id}:${occurrence.key}`
  const facts = factsFor(occurrence.subject, src, ctx)
  const pass = new Map() // node id -> did flow continue past it
  const steps = []
  for (const id of runOrder(g)) {
    const n = g.nodes.find((x) => x.id === id)
    if (n.type === 'trigger') { pass.set(id, true); steps.push({ node_id: id, type: 'trigger', kind: n.kind, status: 'ok', detail: `${triggerDef(n.kind)?.label}: ${occurrence.label}` }); continue }
    const parents = g.edges.filter((e) => e.to === id).map((e) => e.from)
    if (!parents.some((p) => pass.get(p))) { pass.set(id, false); steps.push({ node_id: id, type: n.type, kind: n.kind, status: 'skipped', detail: 'Not reached.' }); continue }
    if (n.type === 'condition') {
      const r = evaluateCondition(n.config ?? {}, facts)
      pass.set(id, r.pass)
      steps.push({ node_id: id, type: 'condition', kind: 'condition', status: r.pass ? 'ok' : 'skipped', detail: r.pass ? 'Condition met.' : 'Condition not met.', checks: r.checks })
      continue
    }
    const r = planAction(n, occurrence.subject, { ...src }, ctx, runKey)
    pass.set(id, true)
    steps.push({ node_id: id, type: 'action', kind: n.kind, status: r.status, detail: r.detail, ...(r.effect ? { effect: r.effect } : {}) })
  }
  const actions = steps.filter((s) => s.type === 'action')
  const planned = actions.some((s) => s.status === 'planned')
  if (planned) return { status: 'planned', reason: '', steps }
  const blocked = steps.find((s) => s.type === 'condition' && s.status === 'skipped')
  const why = blocked ? 'The conditions were not met.' : (actions.find((s) => s.status === 'skipped')?.detail ?? 'Nothing to do.')
  return { status: 'skipped', reason: why, steps }
}

/** The real rows a test can be run on for this trigger: [{ id, label }] (empty for schedules, which need no subject). */
export function sampleChoices(workflow, src) {
  const t = triggerNode(workflow.graph)
  switch (triggerDef(t?.kind)?.subject) {
    case 'task': return (src.tasks ?? []).slice(0, 40).map((k) => ({ id: k.id, label: k.title }))
    case 'habit': return activeHabits(src).map((h) => ({ id: h.id, label: h.name }))
    case 'goal': return (src.goals ?? []).filter((g) => g.status === 'active').map((g) => ({ id: g.id, label: g.title }))
    case 'reminder': return (src.reminders ?? []).map((r) => ({ id: r.id, label: r.title }))
    default: return []
  }
}

/**
 * An occurrence to try a workflow on without waiting for the real thing: the row the person picked (or the first one) from their own data,
 * otherwise an invented sample. `synthetic` tells the screen so it can say so.
 */
export function sampleOccurrence(workflow, src, ctx, pickId) {
  const t = triggerNode(workflow.graph)
  const def = t && triggerDef(t.kind)
  if (!def) return null
  const now = ctx.nowMs
  const pick = (rows) => (rows ?? []).find((r) => r.id === pickId)
  switch (def.subject) {
    case 'schedule': return { key: 'test', subject: { type: 'schedule', date: ctx.today, time: t.config?.time ?? '09:00' }, label: `${ctx.today} ${t.config?.time ?? ''}`.trim(), at: now }
    case 'task': {
      const row = pick(src.tasks) ?? (src.tasks ?? []).find((k) => isOpen(k)) ?? { id: 'sample', title: 'Sample task', status: t.kind === 'task_completed' ? 'done' : 'pending', priority: 'high', category: 'Personal', due_date: ctx.today, notes: '' }
      return { key: 'test', subject: { type: 'task', row }, label: row.title, at: now, synthetic: row.id === 'sample' }
    }
    case 'habit': {
      const h = activeHabits(src).find((x) => x.id === pickId) ?? activeHabits(src)[0] ?? { id: 'sample', name: 'Sample habit', frequency: 'daily', start_date: ctx.today, days_of_week: [], rest_days: [], pauses: [] }
      return { key: 'test', subject: { type: 'habit', row: h, status: t.kind === 'habit_missed' ? 'missed' : 'done', date: ctx.today }, label: h.name, at: now, synthetic: h.id === 'sample' }
    }
    case 'goal': {
      const g = pick(src.goals) ?? (src.goals ?? []).find((x) => x.status === 'active')
      if (g) return { key: 'test', subject: goalSubject(g, src), label: g.title, at: now }
      return { key: 'test', subject: { type: 'goal', row: { id: 'sample', title: 'Sample goal', status: 'active', category: 'Personal', manual_progress: 50 }, progress: Number(t.config?.percent ?? 50), source: 'manual' }, label: 'Sample: goal', at: now, synthetic: true }
    }
    case 'reminder': {
      const r = pick(src.reminders) ?? (src.reminders ?? [])[0] ?? { id: 'sample', title: 'Sample reminder' }
      return { key: 'test', subject: { type: 'reminder', row: r }, label: r.title, at: now, synthetic: r.id === 'sample' }
    }
    case 'event': return { key: 'test', subject: { type: 'event', row: { id: 'sample' }, title: 'Sample event', startMs: now + 30 * 60_000 }, label: 'Sample: event', at: now, synthetic: true }
    default: return null
  }
}

/** Which table writes a plan makes, as a short list for the confirmation ("2 tasks, 1 notification"). */
export function effectCounts(steps) {
  const n = {}
  for (const s of steps) {
    const e = s.effect
    if (!e || e.op === 'none') continue
    const k = e.op === 'notify' ? 'notifications' : (e.table ?? 'tasks')
    n[k] = (n[k] ?? 0) + 1
  }
  return n
}
