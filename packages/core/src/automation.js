// Personal Automation Studio: the catalogue of triggers, conditions and actions, the workflow graph (shape, validation, layout, summaries) and the
// ready-made templates. Pure data and functions: nothing here reads the database or the clock, so the web app, the tests and (later) a server job
// all agree on what a workflow means. The engine that runs one lives in automationEngine.js.
//
// A workflow is a small directed graph: ONE trigger node, any number of condition nodes, and action nodes.
//   node  = { id, type: 'trigger' | 'condition' | 'action', kind, config, x, y }
//   edge  = { id, from, to }
// A run walks the graph from the trigger. A condition that is not met stops that branch. Every action that is advertised here is implemented by
// the engine; anything that is not is simply not in the catalogue.

export const LIMITS = {
  maxNodes: 30,
  maxActions: 12,
  runsPerDay: 50, // per workflow, default; the workflow can lower it
  maxRunsPerDay: 200,
  runsPerHourAll: 120, // across all workflows
  maxPerTick: 25, // occurrences started by one check
  maxAttempts: 3,
  timeoutMs: 30_000, // a run still "running" after this is failed
  catchupMs: 12 * 3600_000, // a schedule slot missed by more than this (app was closed) is not fired late
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const TASK_CATEGORIES = ['Learning', 'Job Search', 'Gym', 'Health', 'Personal', 'Finance', 'Routine', 'Custom']
const opt = (list) => list.map((v) => ({ value: v, label: typeof v === 'string' ? v[0].toUpperCase() + v.slice(1) : v }))

// ---------------------------------------------------------------------------------------------------- triggers
// `subject` is what the trigger hands to conditions and actions ("the task", "the habit"…). `tables` are what the engine must have loaded.
// field.type: time | date | weekday | weekdays | number | text | select | habit | goal | reminder | textarea
const TIME = { key: 'time', label: 'Time', type: 'time', required: true }
const DAY_OF_WEEK = { key: 'day', label: 'Day of the week', type: 'weekday', required: true }
const HABIT_ANY = { key: 'habit_id', label: 'Habit', type: 'habit', hint: 'Any habit, or one in particular.' }

export const TRIGGERS = [
  // time
  { kind: 'schedule_once', group: 'Time', label: 'At a date and time', subject: 'schedule', fields: [{ key: 'date', label: 'Date', type: 'date', required: true }, TIME], defaults: { time: '09:00' } },
  { kind: 'schedule_daily', group: 'Time', label: 'Every day', subject: 'schedule', fields: [TIME], defaults: { time: '21:00' } },
  { kind: 'schedule_weekdays', group: 'Time', label: 'On certain weekdays', subject: 'schedule', fields: [{ key: 'days', label: 'Days', type: 'weekdays', required: true }, TIME], defaults: { days: [1, 2, 3, 4, 5], time: '09:00' } },
  { kind: 'schedule_weekly', group: 'Time', label: 'Every week', subject: 'schedule', fields: [DAY_OF_WEEK, TIME], defaults: { day: 0, time: '18:00' } },
  { kind: 'schedule_monthly', group: 'Time', label: 'Every month', subject: 'schedule', fields: [{ key: 'day', label: 'Day of the month', type: 'number', min: 1, max: 31, required: true, hint: 'A short month uses its last day.' }, TIME], defaults: { day: 1, time: '09:00' } },
  { kind: 'schedule_interval', group: 'Time', label: 'Every few days', subject: 'schedule', fields: [{ key: 'every', label: 'Every … days', type: 'number', min: 2, max: 365, required: true }, { key: 'start', label: 'Starting on', type: 'date', required: true }, TIME], defaults: { every: 3, time: '09:00' } },
  { kind: 'daily_review', group: 'Time', label: 'Daily review time', subject: 'schedule', fields: [TIME], defaults: { time: '21:00' } },
  { kind: 'weekly_review', group: 'Time', label: 'Weekly review time', subject: 'schedule', fields: [DAY_OF_WEEK, TIME], defaults: { day: 0, time: '18:00' } },
  // tasks
  { kind: 'task_created', group: 'Tasks', label: 'A task is created', subject: 'task', tables: ['tasks'], fields: [] },
  { kind: 'task_completed', group: 'Tasks', label: 'A task is completed', subject: 'task', tables: ['tasks'], fields: [] },
  { kind: 'task_overdue', group: 'Tasks', label: 'A task becomes overdue', subject: 'task', tables: ['tasks'], fields: [] },
  { kind: 'task_due_soon', group: 'Tasks', label: 'A task is due soon', subject: 'task', tables: ['tasks'], fields: [{ key: 'days_before', label: 'Days before it is due', type: 'number', min: 0, max: 30, required: true }], defaults: { days_before: 1 } },
  // habits
  { kind: 'habit_completed', group: 'Habits', label: 'A habit is completed', subject: 'habit', tables: ['habits', 'habit_logs'], fields: [HABIT_ANY] },
  { kind: 'habit_missed', group: 'Habits', label: 'A habit is missed', subject: 'habit', tables: ['habits', 'habit_logs', 'habit_pauses'], fields: [HABIT_ANY], hint: 'Checked the day after: today is never "missed" while there is still time.' },
  { kind: 'habit_streak', group: 'Habits', label: 'A habit streak is reached', subject: 'habit', tables: ['habits', 'habit_logs', 'habit_pauses'], fields: [HABIT_ANY, { key: 'length', label: 'Streak length', type: 'number', min: 2, max: 3650, required: true }], defaults: { length: 7 } },
  { kind: 'habit_week_target', group: 'Habits', label: 'A weekly habit target is met', subject: 'habit', tables: ['habits', 'habit_logs'], fields: [HABIT_ANY] },
  // goals
  { kind: 'goal_created', group: 'Goals', label: 'A goal is created', subject: 'goal', tables: ['goals', 'milestones', 'study_sessions'], fields: [] },
  { kind: 'goal_progress', group: 'Goals', label: 'A goal reaches a percentage', subject: 'goal', tables: ['goals', 'milestones', 'study_sessions'], fields: [{ key: 'percent', label: 'Progress reaches', type: 'number', min: 1, max: 100, required: true, hint: 'Percent' }, { key: 'goal_id', label: 'Goal', type: 'goal', hint: 'Any active goal, or one in particular.' }], defaults: { percent: 50 } },
  { kind: 'goal_completed', group: 'Goals', label: 'A goal is completed', subject: 'goal', tables: ['goals', 'milestones', 'study_sessions'], fields: [] },
  { kind: 'goal_deadline', group: 'Goals', label: 'A goal deadline is approaching', subject: 'goal', tables: ['goals', 'milestones', 'study_sessions'], fields: [{ key: 'days_before', label: 'Days before the deadline', type: 'number', min: 0, max: 90, required: true }], defaults: { days_before: 7 } },
  // other
  { kind: 'reminder_due', group: 'Other', label: 'A reminder time is reached', subject: 'reminder', tables: ['reminders'], fields: [{ key: 'reminder_id', label: 'Reminder', type: 'reminder', hint: 'Any reminder, or one in particular.' }] },
  { kind: 'calendar_event_soon', group: 'Other', label: 'A calendar event is approaching', subject: 'event', tables: ['calendar_events', 'calendar_event_exceptions'], fields: [{ key: 'minutes_before', label: 'Minutes before it starts', type: 'number', min: 5, max: 10080, required: true }], defaults: { minutes_before: 30 } },
]
export const triggerDef = (kind) => TRIGGERS.find((t) => t.kind === kind)
export const TRIGGER_GROUPS = ['Time', 'Tasks', 'Habits', 'Goals', 'Other']
export const isScheduleTrigger = (kind) => triggerDef(kind)?.subject === 'schedule'

// -------------------------------------------------------------------------------------------------- conditions
export const OPS = {
  eq: 'is', neq: 'is not', gt: 'is more than', gte: 'is at least', lt: 'is less than', lte: 'is at most', contains: 'contains',
}
const ENUM_OPS = ['eq', 'neq']
const NUM_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']
const BOOL = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
/** subject: which trigger subject provides the field ('any' = always available). */
export const CONDITION_FIELDS = [
  { key: 'task.status', subject: 'task', label: 'Task status', type: 'select', ops: ENUM_OPS, options: opt(['pending', 'in_progress', 'done']) },
  { key: 'task.priority', subject: 'task', label: 'Task priority', type: 'select', ops: NUM_OPS, options: opt(PRIORITIES) },
  { key: 'task.overdue', subject: 'task', label: 'Task is overdue', type: 'select', ops: ['eq'], options: BOOL },
  { key: 'task.category', subject: 'task', label: 'Task category', type: 'select', ops: ENUM_OPS, options: opt(TASK_CATEGORIES) },
  { key: 'task.title', subject: 'task', label: 'Task title', type: 'text', ops: ['contains', 'eq', 'neq'] },
  { key: 'task.due_in_days', subject: 'task', label: 'Days until the task is due', type: 'number', ops: NUM_OPS },
  { key: 'habit.status', subject: 'habit', label: 'Habit completion', type: 'select', ops: ENUM_OPS, options: [{ value: 'done', label: 'Done' }, { value: 'missed', label: 'Missed' }] },
  { key: 'habit.streak', subject: 'habit', label: 'Habit streak', type: 'number', ops: NUM_OPS },
  { key: 'habit.name', subject: 'habit', label: 'Habit name', type: 'text', ops: ['contains', 'eq', 'neq'] },
  { key: 'goal.progress', subject: 'goal', label: 'Goal progress (%)', type: 'number', ops: NUM_OPS },
  { key: 'goal.status', subject: 'goal', label: 'Goal status', type: 'select', ops: ENUM_OPS, options: opt(['active', 'completed', 'archived']) },
  { key: 'goal.category', subject: 'goal', label: 'Goal category', type: 'select', ops: ENUM_OPS, options: opt(['Learning', 'Career', 'Fitness', 'Health', 'Finance', 'Personal']) },
  { key: 'goal.title', subject: 'goal', label: 'Goal title', type: 'text', ops: ['contains', 'eq', 'neq'] },
  { key: 'day.is_weekday', subject: 'any', label: 'Today is a weekday (Mon to Fri)', type: 'select', ops: ['eq'], options: BOOL },
  { key: 'day.weekday', subject: 'any', label: 'Day of the week', type: 'select', ops: ENUM_OPS, options: WEEKDAYS.map((w, i) => ({ value: String(i), label: w })) },
  { key: 'day.hour', subject: 'any', label: 'Hour of the day (0 to 23)', type: 'number', ops: NUM_OPS },
]
export const conditionField = (key) => CONDITION_FIELDS.find((f) => f.key === key)
export const fieldsForSubject = (subject) => CONDITION_FIELDS.filter((f) => f.subject === 'any' || f.subject === subject)

// ------------------------------------------------------------------------------------------------------ actions
// `needs`: the trigger subject an action must have (it acts on "the" task/goal that started the run). `modifies`: it changes something that
// already exists, so enabling a workflow with it asks for confirmation. Nothing here can delete anything.
const DUE = [
  { value: 'none', label: 'No date' }, { value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'in_days', label: 'In a number of days' }, { value: 'next_monday', label: 'Next Monday' },
]
export const ACTIONS = [
  { kind: 'notify', label: 'Show an in-app notification', icon: 'bell', fields: [{ key: 'title', label: 'Title', type: 'text', required: true, max: 200 }, { key: 'body', label: 'Message', type: 'textarea', max: 500 }, { key: 'priority', label: 'Priority', type: 'select', options: opt(['low', 'normal', 'high']) }], defaults: { priority: 'normal' } },
  { kind: 'create_task', label: 'Create a task', icon: 'task', fields: [{ key: 'title', label: 'Title', type: 'text', required: true, max: 200 }, { key: 'notes', label: 'Notes', type: 'textarea', max: 2000 }, { key: 'category', label: 'Category', type: 'select', options: opt(TASK_CATEGORIES) }, { key: 'priority', label: 'Priority', type: 'select', options: opt(PRIORITIES) }, { key: 'due', label: 'Due', type: 'select', options: DUE }, { key: 'days', label: 'Days from now', type: 'number', min: 1, max: 365, showWhen: { due: 'in_days' } }], defaults: { category: 'Personal', priority: 'medium', due: 'today' } },
  { kind: 'update_task', label: 'Update the task', icon: 'edit', needs: 'task', modifies: true, fields: [{ key: 'priority', label: 'Set priority', type: 'select', options: [{ value: '', label: 'Leave as is' }, ...opt(PRIORITIES)] }, { key: 'status', label: 'Set status', type: 'select', options: [{ value: '', label: 'Leave as is' }, { value: 'pending', label: 'Pending' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Done' }] }, { key: 'move_days', label: 'Move the due date by (days)', type: 'number', min: -30, max: 365, hint: 'Empty leaves the date alone.' }, { key: 'note', label: 'Add a line to its notes', type: 'text', max: 300 }], defaults: { priority: '', status: '' } },
  { kind: 'create_reminder', label: 'Create a reminder', icon: 'reminder', fields: [{ key: 'title', label: 'Title', type: 'text', required: true, max: 160 }, { key: 'body', label: 'Message', type: 'textarea', max: 500 }, { key: 'due', label: 'Remind me', type: 'select', options: DUE.filter((d) => d.value !== 'none') }, { key: 'days', label: 'Days from now', type: 'number', min: 1, max: 365, showWhen: { due: 'in_days' } }, { key: 'time', label: 'At', type: 'time', required: true }], defaults: { due: 'today', time: '18:00' } },
  { kind: 'update_goal_progress', label: 'Update goal progress', icon: 'goal', modifies: true, fields: [{ key: 'goal_id', label: 'Goal', type: 'goal', hint: 'Leave empty to use the goal that started the run.' }, { key: 'mode', label: 'Change', type: 'select', options: [{ value: 'add', label: 'Add to the percentage' }, { value: 'set', label: 'Set the percentage' }] }, { key: 'value', label: 'Percent', type: 'number', min: 0, max: 100, required: true }], defaults: { mode: 'add', value: 10 }, hint: 'Only goals tracked by a percentage can be changed: goals measured by milestones or study time are calculated and are left alone.' },
  { kind: 'create_review_task', label: 'Create a review task', icon: 'review', fields: [{ key: 'period', label: 'Review', type: 'select', options: [{ value: 'daily', label: 'Daily review' }, { value: 'weekly', label: 'Weekly review' }] }, { key: 'priority', label: 'Priority', type: 'select', options: opt(PRIORITIES) }], defaults: { period: 'daily', priority: 'medium' } },
  { kind: 'add_checklist_item', label: 'Add a checklist item to a goal', icon: 'check', fields: [{ key: 'goal_id', label: 'Goal', type: 'goal', hint: 'Leave empty to use the goal that started the run. A goal\'s checklist is its milestones.' }, { key: 'title', label: 'Item', type: 'text', required: true, max: 160 }] },
  { kind: 'complete', label: 'Mark the run as completed', icon: 'done', fields: [], hint: 'Ends this branch successfully.' },
]
export const actionDef = (kind) => ACTIONS.find((a) => a.kind === kind)

/** Everything an action may use from the trigger, for the "insert variable" hint in the editor. */
export const VARIABLES = {
  task: ['task.title', 'task.priority', 'task.category', 'task.due_date'],
  habit: ['habit.name', 'habit.streak'],
  goal: ['goal.title', 'goal.progress'],
  reminder: ['reminder.title'],
  event: ['event.title', 'event.time'],
  schedule: [],
  all: ['date', 'weekday'],
}

// ------------------------------------------------------------------------------------------------------- config
const hasValue = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)

/** Problems with one node's configuration, as plain sentences. */
export function configProblems(def, config = {}) {
  const out = []
  for (const f of def?.fields ?? []) {
    if (f.showWhen && !Object.entries(f.showWhen).every(([k, v]) => config[k] === v)) continue
    const v = config[f.key]
    if (!hasValue(v)) { if (f.required) out.push(`${f.label} is required.`); continue }
    if (f.type === 'number') {
      const n = Number(v)
      if (!Number.isFinite(n)) out.push(`${f.label} must be a number.`)
      else if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) out.push(`${f.label} must be between ${f.min ?? '…'} and ${f.max ?? '…'}.`)
    } else if (f.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) out.push(`${f.label} is not a valid time.`)
    else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) out.push(`${f.label} is not a valid date.`)
    else if (f.type === 'weekday' && !(Number.isInteger(Number(v)) && v >= 0 && v <= 6)) out.push(`${f.label} is not valid.`)
    else if (f.type === 'weekdays' && !(Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) out.push(`${f.label} is not valid.`)
    else if (f.type === 'select' && f.options && !f.options.some((o) => String(o.value) === String(v))) out.push(`${f.label} has an unknown value.`)
    else if ((f.type === 'text' || f.type === 'textarea') && f.max && String(v).length > f.max) out.push(`${f.label} is too long (at most ${f.max} characters).`)
  }
  return out
}

export const defaultConfig = (def) => ({ ...(def?.defaults ?? {}) })

export function ruleProblems(rule, subject) {
  const f = conditionField(rule?.field)
  if (!f) return ['Pick what to check.']
  if (f.subject !== 'any' && f.subject !== subject) return [`"${f.label}" needs a ${f.subject} trigger.`]
  if (!f.ops.includes(rule.op)) return [`"${f.label}" cannot be compared that way.`]
  if (!hasValue(rule.value)) return [`Enter a value for "${f.label}".`]
  if (f.type === 'number' && !Number.isFinite(Number(rule.value))) return [`"${f.label}" needs a number.`]
  if (f.type === 'select' && !f.options.some((o) => String(o.value) === String(rule.value))) return [`"${f.label}" has an unknown value.`]
  return []
}

// ---------------------------------------------------------------------------------------------- graph helpers
let counter = 0
export const nodeId = (prefix = 'n') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
export const edgeKey = (from, to) => `${from}>${to}`

export function newNode(type, kind, x = 0, y = 0) {
  const def = type === 'trigger' ? triggerDef(kind) : type === 'action' ? actionDef(kind) : null
  const config = type === 'condition' ? { mode: 'all', rules: [{ field: '', op: 'eq', value: '' }] } : defaultConfig(def)
  return { id: nodeId(type[0]), type, kind: type === 'condition' ? 'condition' : kind, config, x, y }
}

export const triggerNode = (g) => g.nodes.find((n) => n.type === 'trigger') ?? null
export const subjectOf = (g) => triggerDef(triggerNode(g)?.kind)?.subject ?? null
export const outgoing = (g, id) => g.edges.filter((e) => e.from === id)
export const incoming = (g, id) => g.edges.filter((e) => e.to === id)

/** Node ids reachable from the trigger, in the order a run visits them (breadth first, each once). */
export function runOrder(g) {
  const t = triggerNode(g)
  if (!t) return []
  const seen = new Set([t.id])
  const order = [t.id]
  for (let i = 0; i < order.length; i++) {
    for (const e of outgoing(g, order[i])) if (!seen.has(e.to) && g.nodes.some((n) => n.id === e.to)) { seen.add(e.to); order.push(e.to) }
  }
  return order
}

function hasCycle(g) {
  const state = new Map()
  const visit = (id) => {
    if (state.get(id) === 1) return true
    if (state.get(id) === 2) return false
    state.set(id, 1)
    for (const e of outgoing(g, id)) if (visit(e.to)) return true
    state.set(id, 2)
    return false
  }
  return g.nodes.some((n) => visit(n.id))
}

/**
 * Whether a workflow can be switched on. `errors` block activation; `warnings` are shown but allowed.
 * Each problem names its node (when it has one) so the editor can point at it.
 * @returns {{ errors: {nodeId?: string, message: string}[], warnings: {nodeId?: string, message: string}[], ok: boolean }}
 */
export function validateWorkflow(workflow) {
  const g = workflow?.graph ?? { nodes: [], edges: [] }
  const errors = []
  const warnings = []
  const err = (message, id) => errors.push({ message, ...(id ? { nodeId: id } : {}) })
  const warn = (message, id) => warnings.push({ message, ...(id ? { nodeId: id } : {}) })
  if (!String(workflow?.name ?? '').trim()) err('Give the workflow a name.')
  if (g.nodes.length > LIMITS.maxNodes) err(`A workflow can have at most ${LIMITS.maxNodes} steps.`)
  const triggers = g.nodes.filter((n) => n.type === 'trigger')
  if (triggers.length === 0) err('Add a trigger: it says when the workflow starts.')
  if (triggers.length > 1) for (const t of triggers.slice(1)) err('A workflow has exactly one trigger.', t.id)
  const ids = new Set(g.nodes.map((n) => n.id))
  for (const e of g.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) err('A connection points at a step that does not exist.')
    if (e.from === e.to) err('A step cannot connect to itself.', e.from)
  }
  for (const e of g.edges) if (g.nodes.find((n) => n.id === e.to)?.type === 'trigger') err('Nothing can lead into the trigger.', e.to)
  if (hasCycle(g)) err('The steps form a loop. A workflow must flow one way.')

  const trig = triggers[0]
  const tdef = trig && triggerDef(trig.kind)
  if (trig && !tdef) err('This trigger is not supported.', trig.id)
  if (trig && tdef) for (const m of configProblems(tdef, trig.config)) err(m, trig.id)
  const subject = tdef?.subject ?? null

  let actions = 0
  for (const n of g.nodes) {
    if (n.type === 'condition') {
      const rules = n.config?.rules ?? []
      if (!rules.length) err('Add at least one rule to this condition.', n.id)
      for (const r of rules) for (const m of ruleProblems(r, subject)) err(m, n.id)
    }
    if (n.type === 'action') {
      actions++
      const def = actionDef(n.kind)
      if (!def) { err('This action is not supported.', n.id); continue }
      for (const m of configProblems(def, n.config)) err(m, n.id)
      if (def.needs && def.needs !== subject) err(`"${def.label}" needs a ${def.needs} trigger, because it acts on the ${def.needs} that started the run.`, n.id)
      if (n.kind === 'update_goal_progress' && subject !== 'goal' && !hasValue(n.config?.goal_id)) err('Choose which goal to update.', n.id)
      if (n.kind === 'add_checklist_item' && subject !== 'goal' && !hasValue(n.config?.goal_id)) err('Choose which goal gets the item.', n.id)
      if (n.kind === 'update_task' && !hasValue(n.config?.priority) && !hasValue(n.config?.status) && !hasValue(n.config?.move_days) && !hasValue(n.config?.note)) err('Choose what to change on the task.', n.id)
    }
    if (n.type !== 'action' && !outgoing(g, n.id).length) err(n.type === 'trigger' ? 'Connect the trigger to a step.' : 'Connect this condition to an action.', n.id)
  }
  if (trig && actions === 0) err('Add at least one action.')
  if (actions > LIMITS.maxActions) err(`A workflow can have at most ${LIMITS.maxActions} actions.`)
  if (trig) {
    const reach = new Set(runOrder(g))
    for (const n of g.nodes) if (!reach.has(n.id)) warn('This step is not connected to the trigger, so it will never run.', n.id)
  }
  if (subject === 'task' && g.nodes.some((n) => n.kind === 'create_task') && ['task_created', 'task_overdue', 'task_due_soon'].includes(trig?.kind)) {
    warn('This creates tasks from a task trigger. Tasks made by automations never start automations, and the daily run limit applies.')
  }
  return { errors, warnings, ok: errors.length === 0 }
}

/** Short, human description of a trigger. */
export function triggerSummary(kind, c = {}) {
  const t = c.time ? ` at ${c.time}` : ''
  switch (kind) {
    case 'schedule_once': return `On ${c.date ?? '…'}${t}`
    case 'schedule_daily': return `Every day${t}`
    case 'schedule_weekdays': return `Every ${(c.days ?? []).slice().sort().map((d) => WEEKDAYS_SHORT[d]).join(', ') || '…'}${t}`
    case 'schedule_weekly': return `Every ${WEEKDAYS[c.day] ?? '…'}${t}`
    case 'schedule_monthly': return `Monthly on day ${c.day ?? '…'}${t}`
    case 'schedule_interval': return `Every ${c.every ?? '…'} days${t}`
    case 'daily_review': return `Daily review${t}`
    case 'weekly_review': return `Weekly review, ${WEEKDAYS[c.day] ?? '…'}${t}`
    case 'task_due_soon': return `A task is due in ${c.days_before ?? '…'} day(s) or less`
    case 'habit_streak': return `A habit reaches a ${c.length ?? '…'}-day streak`
    case 'goal_progress': return `A goal reaches ${c.percent ?? '…'}%`
    case 'goal_deadline': return `A goal deadline is ${c.days_before ?? '…'} day(s) away`
    case 'calendar_event_soon': return `${c.minutes_before ?? '…'} min before a calendar event`
    default: return triggerDef(kind)?.label ?? kind
  }
}

/** Short description of a condition node: "Priority is high AND Task is overdue is Yes". */
export function conditionSummary(config = {}) {
  const rules = (config.rules ?? []).filter((r) => r.field)
  if (!rules.length) return 'No rules yet'
  const word = config.mode === 'any' ? ' OR ' : ' AND '
  return rules
    .map((r) => {
      const f = conditionField(r.field)
      const shown = f?.options?.find((o) => String(o.value) === String(r.value))?.label ?? r.value
      return `${f?.label ?? r.field} ${OPS[r.op] ?? r.op} ${shown}`
    })
    .join(word)
}

export function actionSummary(kind, c = {}) {
  switch (kind) {
    case 'notify': return `Notify: ${c.title || '…'}`
    case 'create_task': return `Create task: ${c.title || '…'}`
    case 'update_task': return 'Update the task'
    case 'create_reminder': return `Create reminder: ${c.title || '…'}`
    case 'update_goal_progress': return `${c.mode === 'set' ? 'Set' : 'Add'} ${c.value ?? '…'}% ${c.mode === 'set' ? 'progress' : 'to the goal'}`
    case 'create_review_task': return `Create the ${c.period === 'weekly' ? 'weekly' : 'daily'} review task`
    case 'add_checklist_item': return `Add checklist item: ${c.title || '…'}`
    case 'complete': return 'Mark the run as completed'
    default: return actionDef(kind)?.label ?? kind
  }
}

export function nodeSummary(n) {
  return n.type === 'trigger' ? triggerSummary(n.kind, n.config) : n.type === 'condition' ? conditionSummary(n.config) : actionSummary(n.kind, n.config)
}
export function nodeTitle(n) {
  return n.type === 'trigger' ? (triggerDef(n.kind)?.label ?? 'Trigger') : n.type === 'condition' ? 'Condition' : (actionDef(n.kind)?.label ?? 'Action')
}

/** Does this workflow change something that already exists? Enabling it then asks for confirmation. */
export const modifiesData = (g) => g.nodes.some((n) => n.type === 'action' && actionDef(n.kind)?.modifies)

// -------------------------------------------------------------------------------------------------- layout
export const NODE_W = 244
export const NODE_H = 92
const GAP_X = 96
const GAP_Y = 36

/** Left-to-right layers: a node sits one column right of its deepest parent. Unconnected nodes are parked in a column of their own. */
export function autoLayout(g) {
  const t = triggerNode(g)
  const depth = new Map()
  if (t) {
    depth.set(t.id, 0)
    for (const id of runOrder(g)) for (const e of outgoing(g, id)) depth.set(e.to, Math.max(depth.get(e.to) ?? 0, (depth.get(id) ?? 0) + 1))
  }
  const maxDepth = Math.max(0, ...depth.values())
  const columns = new Map()
  for (const n of g.nodes) {
    const d = depth.has(n.id) ? depth.get(n.id) : maxDepth + 1
    if (!columns.has(d)) columns.set(d, [])
    columns.get(d).push(n)
  }
  const place = new Map()
  for (const [d, list] of columns) {
    list.forEach((n, i) => place.set(n.id, { x: 40 + d * (NODE_W + GAP_X), y: 40 + i * (NODE_H + GAP_Y) }))
  }
  return { ...g, nodes: g.nodes.map((n) => ({ ...n, ...place.get(n.id) })) }
}

// Every edit returns a NEW graph (the editor keeps them for undo/redo); none of them mutates its input.
/** Why `from` cannot connect to `to`, or null when it can. */
export function connectProblem(g, from, to) {
  const a = g.nodes.find((n) => n.id === from)
  const b = g.nodes.find((n) => n.id === to)
  if (!a || !b) return 'That step does not exist.'
  if (from === to) return 'A step cannot connect to itself.'
  if (b.type === 'trigger') return 'Nothing can lead into the trigger.'
  if (g.edges.some((e) => e.from === from && e.to === to)) return 'Those steps are already connected.'
  // would the new edge close a loop? yes when `from` is reachable from `to`
  const seen = new Set([to])
  for (const id of seen) for (const e of g.edges) if (e.from === id && !seen.has(e.to)) seen.add(e.to)
  if (seen.has(from)) return 'That would make a loop.'
  return null
}
export function addEdge(g, from, to) {
  return connectProblem(g, from, to) ? g : { ...g, edges: [...g.edges, { id: edgeKey(from, to), from, to }] }
}
export const removeEdge = (g, id) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) })
/** Removes a step and its connections. Steps that were in a chain through it are joined up, so deleting the middle of a chain does not cut it in two. */
export function removeNode(g, id) {
  const ins = g.edges.filter((e) => e.to === id).map((e) => e.from)
  const outs = g.edges.filter((e) => e.from === id).map((e) => e.to)
  let next = { ...g, nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id) }
  for (const a of ins) for (const b of outs) next = addEdge(next, a, b)
  return next
}
export const updateNode = (g, id, patch) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
export const updateConfig = (g, id, config) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, config } : n)) })
/** Adds a step. A trigger replaces the existing one (a workflow has exactly one) and keeps its connections. */
export function addNode(g, node) {
  if (node.type !== 'trigger') return { ...g, nodes: [...g.nodes, node] }
  const old = triggerNode(g)
  if (!old) return { ...g, nodes: [node, ...g.nodes] }
  return { nodes: g.nodes.map((n) => (n.id === old.id ? { ...node, id: old.id, x: old.x, y: old.y } : n)), edges: g.edges }
}
/** Steps that nothing leads to and that are not the trigger: where a new step can be attached. */
export const leaves = (g) => g.nodes.filter((n) => n.type !== 'trigger' && !outgoing(g, n.id).length)

/** Builds a straight-line workflow: trigger, then conditions, then actions, each connected to the next. */
export function chain({ trigger, conditions = [], actions }) {
  const nodes = []
  const push = (type, kind, config) => { const n = newNode(type, kind); n.config = { ...n.config, ...config }; nodes.push(n); return n }
  push('trigger', trigger.kind, trigger.config)
  for (const c of conditions) push('condition', 'condition', c)
  for (const a of actions) push('action', a.kind, a.config)
  const edges = nodes.slice(1).map((n, i) => ({ id: edgeKey(nodes[i].id, n.id), from: nodes[i].id, to: n.id }))
  return autoLayout({ nodes, edges })
}

export function blankWorkflow() {
  return { name: 'New automation', description: '', enabled: false, graph: autoLayout({ nodes: [newNode('trigger', 'schedule_daily')], edges: [] }) }
}

// ---------------------------------------------------------------------------------------------- templates
const T = (key, group, name, description, spec) => ({ key, group, name, description, spec })
export const TEMPLATES = [
  T('daily-incomplete', 'Daily Productivity', 'Evening check: unfinished tasks', 'Every evening, reminds you when tasks due today are still open.', {
    trigger: { kind: 'schedule_daily', config: { time: '21:00' } },
    actions: [{ kind: 'notify', config: { title: 'Wrap up your day', body: 'Some of today\'s tasks are still open. Finish them or move them to tomorrow.', priority: 'normal' } }],
  }),
  T('morning-plan', 'Daily Productivity', 'Morning planning reminder', 'Weekday mornings: a nudge to plan the day.', {
    trigger: { kind: 'schedule_weekdays', config: { days: [1, 2, 3, 4, 5], time: '08:30' } },
    actions: [{ kind: 'notify', config: { title: 'Plan your day', body: 'Pick your top three tasks for today.', priority: 'normal' } }],
  }),
  T('evening-review', 'Daily Productivity', 'Evening daily review', 'Creates a daily review task every evening.', {
    trigger: { kind: 'daily_review', config: { time: '21:00' } },
    actions: [{ kind: 'create_review_task', config: { period: 'daily', priority: 'medium' } }],
  }),
  T('weekly-planning', 'Daily Productivity', 'Weekly planning task', 'Every Sunday, creates a task to review the week and plan the next.', {
    trigger: { kind: 'weekly_review', config: { day: 0, time: '18:00' } },
    actions: [{ kind: 'create_review_task', config: { period: 'weekly', priority: 'high' } }],
  }),
  T('overdue-recovery', 'Daily Productivity', 'Overdue task: nudge', 'When a task becomes overdue, tells you about it.', {
    trigger: { kind: 'task_overdue', config: {} },
    actions: [{ kind: 'notify', config: { title: 'Overdue: {{task.title}}', body: 'It was due {{task.due_date}}. Do it, or move it.', priority: 'high' } }],
  }),
  T('missed-habit', 'Habit Management', 'Missed habit: recovery task', 'When a habit is missed, creates a small recovery task for today.', {
    trigger: { kind: 'habit_missed', config: {} },
    actions: [{ kind: 'create_task', config: { title: 'Get back on track: {{habit.name}}', notes: 'You missed it yesterday. Do it today to keep the habit alive.', category: 'Routine', priority: 'medium', due: 'today' } }],
  }),
  T('habit-week-review', 'Habit Management', 'Weekly habit progress review', 'Sunday evening: a task to look over the week\'s habits.', {
    trigger: { kind: 'schedule_weekly', config: { day: 0, time: '19:00' } },
    actions: [{ kind: 'create_task', config: { title: 'Review this week\'s habits', notes: 'Which ones went well? Which one needs a smaller step?', category: 'Routine', priority: 'medium', due: 'today' } }],
  }),
  T('streak-milestone', 'Habit Management', 'Streak milestone notification', 'Celebrates a 7-day streak.', {
    trigger: { kind: 'habit_streak', config: { length: 7 } },
    actions: [{ kind: 'notify', config: { title: '{{habit.streak}}-day streak: {{habit.name}}', body: 'Keep it going.', priority: 'normal' } }],
  }),
  T('goal-halfway', 'Career & Learning', 'Goal halfway notification', 'A message when a goal reaches 50%.', {
    trigger: { kind: 'goal_progress', config: { percent: 50 } },
    actions: [{ kind: 'notify', config: { title: 'Halfway there: {{goal.title}}', body: 'You are at {{goal.progress}}%.', priority: 'normal' } }],
  }),
  T('learning-daily', 'Career & Learning', 'Daily learning reminder', 'Every day, a reminder to study.', {
    trigger: { kind: 'schedule_daily', config: { time: '19:30' } },
    actions: [{ kind: 'notify', config: { title: 'Time to learn', body: 'Even 25 focused minutes count.', priority: 'normal' } }],
  }),
  T('learning-weekly', 'Career & Learning', 'Weekly learning review', 'Every Saturday, a task to review what you learned.', {
    trigger: { kind: 'schedule_weekly', config: { day: 6, time: '10:00' } },
    actions: [{ kind: 'create_task', config: { title: 'Weekly learning review', notes: 'What did I learn? What is still unclear?', category: 'Learning', priority: 'medium', due: 'today' } }],
  }),
  T('goal-done', 'Career & Learning', 'Goal completed: celebrate', 'A notification when a goal is completed.', {
    trigger: { kind: 'goal_completed', config: {} },
    actions: [{ kind: 'notify', config: { title: 'Goal completed: {{goal.title}}', body: 'Well done. What is next?', priority: 'normal' } }],
  }),
  T('workout-reminder', 'Fitness', 'Workout reminder', 'On workout days, a reminder to train.', {
    trigger: { kind: 'schedule_weekdays', config: { days: [1, 3, 5], time: '18:00' } },
    actions: [{ kind: 'notify', config: { title: 'Workout time', body: 'Your plan is waiting.', priority: 'normal' } }],
  }),
  T('fitness-weekly', 'Fitness', 'Weekly fitness review', 'Sunday: a task to review the week\'s training.', {
    trigger: { kind: 'schedule_weekly', config: { day: 0, time: '17:00' } },
    actions: [{ kind: 'create_task', config: { title: 'Weekly fitness review', notes: 'Workouts done, weight, sleep, what to adjust.', category: 'Gym', priority: 'medium', due: 'today' } }],
  }),
  T('missed-workout', 'Fitness', 'Missed workout: recovery task', 'When a habit named "workout" is missed, plans a make-up session.', {
    trigger: { kind: 'habit_missed', config: {} },
    conditions: [{ mode: 'all', rules: [{ field: 'habit.name', op: 'contains', value: 'workout' }] }],
    actions: [{ kind: 'create_task', config: { title: 'Make-up workout', notes: 'You missed yesterday\'s session.', category: 'Gym', priority: 'medium', due: 'today' } }],
  }),
]
export const TEMPLATE_GROUPS = ['Daily Productivity', 'Habit Management', 'Career & Learning', 'Fitness']
export const templateByKey = (key) => TEMPLATES.find((t) => t.key === key)

/** A fresh, editable, switched-off workflow from a template. */
export function fromTemplate(key) {
  const t = templateByKey(key)
  if (!t) return null
  return { name: t.name, description: t.description, enabled: false, template_key: t.key, graph: chain(t.spec) }
}

/** Tables a workflow needs loaded to be evaluated and run. */
export function tablesFor(workflow) {
  const out = new Set()
  for (const n of workflow?.graph?.nodes ?? []) {
    if (n.type === 'trigger') for (const t of triggerDef(n.kind)?.tables ?? []) out.add(t)
    if (n.type === 'action') {
      if (n.kind === 'create_task' || n.kind === 'update_task' || n.kind === 'create_review_task') out.add('tasks')
      if (n.kind === 'update_goal_progress' || n.kind === 'add_checklist_item') { out.add('goals'); out.add('milestones') }
    }
  }
  return [...out]
}
