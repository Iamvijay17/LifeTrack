import { describe, expect, it } from 'vitest'
import {
  ACTIONS, TEMPLATES, TRIGGERS, actionSummary, autoLayout, blankWorkflow, chain, conditionSummary, configProblems, edgeKey, fromTemplate, modifiesData,
  addEdge, addNode, connectProblem, leaves, removeEdge, removeNode, updateConfig, updateNode,
  newNode, nodeSummary, nodeTitle, runOrder, tablesFor, triggerSummary, validateWorkflow, fieldsForSubject, subjectOf, LIMITS,
} from '../src/automation'
import {
  createdIds, dueSlot, sampleChoices, effectCounts, evaluateCondition, factsFor, findOccurrences, planRun, render, runAllowance, sampleOccurrence, slotTime, variablesFor,
} from '../src/automationEngine'

const TZ = 'Asia/Kolkata'
const at = (day, time, tz = TZ) => {
  // the instant a wall-clock time falls on in tz (+05:30 for Kolkata)
  const off = tz === 'Asia/Kolkata' ? '+05:30' : tz === 'America/New_York' ? '-05:00' : 'Z'
  return Date.parse(`${day}T${time}:00${off}`)
}
const wf = (spec, extra = {}) => ({ id: 'w1', name: 'Test', enabled: true, activated_at: '2026-11-01T00:00:00Z', graph: chain(spec), ...extra })
const ctx = (over = {}) => ({ today: '2026-11-16', tz: TZ, nowMs: at('2026-11-16', '21:05'), weekStartsOn: 1, automationIds: new Set(), ...over })
const notify = { kind: 'notify', config: { title: 'Hi {{task.title}}', body: '', priority: 'normal' } }

describe('catalogue and templates', () => {
  it('every template is valid out of the box and starts switched off', () => {
    for (const t of TEMPLATES) {
      const w = fromTemplate(t.key)
      expect(w.enabled).toBe(false)
      expect(validateWorkflow(w), t.key).toMatchObject({ ok: true, errors: [] })
    }
    expect(fromTemplate('nope')).toBeNull()
  })
  it('every trigger and action has a label, and summaries never throw', () => {
    for (const t of TRIGGERS) { expect(t.label).toBeTruthy(); expect(triggerSummary(t.kind, {})).toBeTruthy() }
    for (const a of ACTIONS) { expect(a.label).toBeTruthy(); expect(actionSummary(a.kind, {})).toBeTruthy() }
    expect(triggerSummary('schedule_weekdays', { days: [3, 1], time: '09:00' })).toBe('Every Mon, Wed at 09:00')
    expect(triggerSummary('goal_progress', { percent: 50 })).toBe('A goal reaches 50%')
    expect(triggerSummary('nope')).toBe('nope')
    expect(actionSummary('update_goal_progress', { mode: 'set', value: 80 })).toBe('Set 80% progress')
  })
  it('summarises conditions in plain words', () => {
    expect(conditionSummary({ mode: 'all', rules: [] })).toBe('No rules yet')
    expect(conditionSummary({ mode: 'any', rules: [{ field: 'task.priority', op: 'eq', value: 'high' }, { field: 'task.overdue', op: 'eq', value: 'true' }] })).toBe(
      'Task priority is High OR Task is overdue is Yes',
    )
  })
  it('exposes node titles/summaries and the fields each subject offers', () => {
    const g = fromTemplate('missed-habit').graph
    expect(nodeTitle(g.nodes[0])).toBe('A habit is missed')
    expect(nodeSummary(g.nodes[1])).toBe('Create task: Get back on track: {{habit.name}}')
    expect(fieldsForSubject('task').some((f) => f.key === 'task.status')).toBe(true)
    expect(fieldsForSubject('task').some((f) => f.key === 'goal.progress')).toBe(false)
    expect(subjectOf(g)).toBe('habit')
  })
  it('lists the tables a workflow needs', () => {
    expect(tablesFor(fromTemplate('missed-habit')).sort()).toEqual(['habit_logs', 'habit_pauses', 'habits', 'tasks'])
    expect(tablesFor({ graph: { nodes: [] } })).toEqual([])
  })
})

describe('validation', () => {
  const base = () => wf({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] })
  it('accepts a good workflow', () => expect(validateWorkflow(base()).ok).toBe(true))
  it('needs a name, a trigger and an action', () => {
    expect(validateWorkflow({ ...base(), name: ' ' }).errors[0].message).toMatch(/name/)
    expect(validateWorkflow({ name: 'x', graph: { nodes: [], edges: [] } }).errors.map((e) => e.message)).toContain('Add a trigger: it says when the workflow starts.')
    const onlyTrigger = { name: 'x', graph: { nodes: [newNode('trigger', 'schedule_daily')], edges: [] } }
    expect(validateWorkflow(onlyTrigger).errors.map((e) => e.message)).toEqual(expect.arrayContaining(['Connect the trigger to a step.', 'Add at least one action.']))
    expect(validateWorkflow(undefined).ok).toBe(false)
  })
  it('flags a second trigger, edges into the trigger, dangling and self edges, and loops', () => {
    const w = base()
    const [t, a] = w.graph.nodes
    const second = newNode('trigger', 'schedule_daily')
    expect(validateWorkflow({ ...w, graph: { ...w.graph, nodes: [...w.graph.nodes, second] } }).errors.map((e) => e.message)).toContain('A workflow has exactly one trigger.')
    expect(validateWorkflow({ ...w, graph: { ...w.graph, edges: [...w.graph.edges, { id: 'x', from: a.id, to: t.id }] } }).errors.map((e) => e.message)).toEqual(
      expect.arrayContaining(['Nothing can lead into the trigger.', 'The steps form a loop. A workflow must flow one way.']),
    )
    expect(validateWorkflow({ ...w, graph: { ...w.graph, edges: [...w.graph.edges, { id: 'y', from: a.id, to: a.id }] } }).errors.map((e) => e.message)).toContain('A step cannot connect to itself.')
    expect(validateWorkflow({ ...w, graph: { ...w.graph, edges: [...w.graph.edges, { id: 'z', from: a.id, to: 'ghost' }] } }).errors.map((e) => e.message)).toContain(
      'A connection points at a step that does not exist.',
    )
  })
  it('checks node configuration', () => {
    const w = wf({ trigger: { kind: 'schedule_weekdays', config: { days: [], time: '25:00' } }, actions: [{ kind: 'create_task', config: { title: '' } }] })
    const messages = validateWorkflow(w).errors.map((e) => e.message)
    expect(messages).toEqual(expect.arrayContaining(['Days is required.', 'Time is not a valid time.', 'Title is required.']))
    const n = (kind, config) => configProblems(TRIGGERS.find((t) => t.kind === kind), config)
    expect(n('schedule_monthly', { day: 40, time: '09:00' })[0]).toMatch(/between 1 and 31/)
    expect(n('schedule_monthly', { day: 'x', time: '09:00' })[0]).toMatch(/number/)
    expect(n('schedule_once', { date: 'tomorrow', time: '09:00' })[0]).toMatch(/date/)
    expect(n('schedule_weekly', { day: 9, time: '09:00' })[0]).toMatch(/not valid/)
    expect(n('schedule_weekdays', { days: [9], time: '09:00' })[0]).toMatch(/not valid/)
    expect(configProblems(ACTIONS.find((a) => a.kind === 'notify'), { title: 'x'.repeat(300) })[0]).toMatch(/too long/)
    expect(configProblems(ACTIONS.find((a) => a.kind === 'notify'), { title: 'x', priority: 'weird' })[0]).toMatch(/unknown value/)
    // a field that only shows for another choice is not demanded
    expect(configProblems(ACTIONS.find((a) => a.kind === 'create_task'), { title: 'x', due: 'today' })).toEqual([])
    expect(configProblems(ACTIONS.find((a) => a.kind === 'create_task'), { title: 'x', due: 'in_days' })).toEqual([])
    expect(configProblems(ACTIONS.find((a) => a.kind === 'create_task'), { title: 'x', due: 'in_days', days: 0 })[0]).toMatch(/between/)
  })
  it('checks that conditions and actions fit the trigger', () => {
    const w = wf({ trigger: { kind: 'schedule_daily', config: { time: '09:00' } }, conditions: [{ mode: 'all', rules: [{ field: 'task.priority', op: 'eq', value: 'high' }] }], actions: [{ kind: 'update_task', config: { priority: 'high' } }] })
    const messages = validateWorkflow(w).errors.map((e) => e.message)
    expect(messages).toContain('"Task priority" needs a task trigger.')
    expect(messages.some((m) => m.includes('needs a task trigger, because'))).toBe(true)
    const rule = (r) => validateWorkflow(wf({ trigger: { kind: 'task_created', config: {} }, conditions: [{ mode: 'all', rules: [r] }], actions: [notify] })).errors.map((e) => e.message)
    expect(rule({ field: '', op: 'eq', value: '' })).toContain('Pick what to check.')
    expect(rule({ field: 'task.title', op: 'gt', value: 'x' })[0]).toMatch(/cannot be compared/)
    expect(rule({ field: 'task.title', op: 'eq', value: '' })[0]).toMatch(/Enter a value/)
    expect(rule({ field: 'task.due_in_days', op: 'eq', value: 'abc' })[0]).toMatch(/needs a number/)
    expect(rule({ field: 'task.priority', op: 'eq', value: 'huge' })[0]).toMatch(/unknown value/)
    expect(rule({ field: 'day.hour', op: 'gte', value: 9 })).toEqual([])
    expect(validateWorkflow(wf({ trigger: { kind: 'task_created', config: {} }, conditions: [{ mode: 'all', rules: [] }], actions: [notify] })).errors.map((e) => e.message)).toContain('Add at least one rule to this condition.')
  })
  it('requires a goal for goal actions and something to change for update_task', () => {
    const m = (trigger, action) => validateWorkflow(wf({ trigger, actions: [action] })).errors.map((e) => e.message)
    expect(m({ kind: 'schedule_daily', config: { time: '09:00' } }, { kind: 'update_goal_progress', config: { mode: 'add', value: 5 } })).toContain('Choose which goal to update.')
    expect(m({ kind: 'schedule_daily', config: { time: '09:00' } }, { kind: 'add_checklist_item', config: { title: 'x' } })).toContain('Choose which goal gets the item.')
    expect(m({ kind: 'goal_created', config: {} }, { kind: 'add_checklist_item', config: { title: 'x' } })).toEqual([])
    expect(m({ kind: 'task_created', config: {} }, { kind: 'update_task', config: { priority: '', status: '' } })).toContain('Choose what to change on the task.')
  })
  it('warns about unreachable steps and task-creating loops, and limits size', () => {
    const w = base()
    const orphan = newNode('action', 'notify')
    orphan.config = { title: 'x' }
    const v = validateWorkflow({ ...w, graph: { ...w.graph, nodes: [...w.graph.nodes, orphan] } })
    expect(v.warnings.map((x) => x.message)).toContain('This step is not connected to the trigger, so it will never run.')
    expect(validateWorkflow(wf({ trigger: { kind: 'task_created', config: {} }, actions: [{ kind: 'create_task', config: { title: 'again' } }] })).warnings[0].message).toMatch(/never start automations/)
    const many = { ...w, graph: { nodes: Array.from({ length: LIMITS.maxNodes + 1 }, () => newNode('action', 'complete')), edges: [] } }
    expect(validateWorkflow(many).errors.map((e) => e.message)).toEqual(expect.arrayContaining([`A workflow can have at most ${LIMITS.maxNodes} steps.`]))
    const tooManyActions = wf({ trigger: { kind: 'task_created', config: {} }, actions: Array.from({ length: LIMITS.maxActions + 1 }, () => ({ kind: 'complete', config: {} })) })
    expect(validateWorkflow(tooManyActions).errors.map((e) => e.message)).toContain(`A workflow can have at most ${LIMITS.maxActions} actions.`)
  })
  it('knows which workflows change existing data', () => {
    expect(modifiesData(fromTemplate('missed-habit').graph)).toBe(false)
    expect(modifiesData(wf({ trigger: { kind: 'task_created', config: {} }, actions: [{ kind: 'update_task', config: { priority: 'high' } }] }).graph)).toBe(true)
  })
})

describe('graph layout', () => {
  it('lays nodes out left to right by depth and parks unconnected ones', () => {
    const w = chain({ trigger: { kind: 'task_created', config: {} }, conditions: [{ mode: 'all', rules: [] }], actions: [notify] })
    const xs = w.nodes.map((n) => n.x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(new Set(xs).size).toBe(3)
    const stray = newNode('action', 'complete')
    const laid = autoLayout({ ...w, nodes: [...w.nodes, stray] })
    expect(laid.nodes.at(-1).x).toBeGreaterThan(laid.nodes[2].x)
    expect(autoLayout({ nodes: [], edges: [] }).nodes).toEqual([])
    expect(runOrder({ nodes: [], edges: [] })).toEqual([])
  })
  it('puts two branches in one column', () => {
    const t = newNode('trigger', 'task_created')
    const a = newNode('action', 'notify')
    const b = newNode('action', 'complete')
    const g = autoLayout({ nodes: [t, a, b], edges: [{ id: edgeKey(t.id, a.id), from: t.id, to: a.id }, { id: edgeKey(t.id, b.id), from: t.id, to: b.id }] })
    expect(g.nodes[1].x).toBe(g.nodes[2].x)
    expect(g.nodes[1].y).not.toBe(g.nodes[2].y)
  })
  it('makes a blank workflow with just a trigger', () => {
    const b = blankWorkflow()
    expect(b.graph.nodes).toHaveLength(1)
    expect(b.enabled).toBe(false)
  })
})

describe('schedules and time zones', () => {
  it('matches slots per schedule kind', () => {
    expect(slotTime('schedule_once', { date: '2026-11-16', time: '09:00' }, '2026-11-16')).toBe('09:00')
    expect(slotTime('schedule_once', { date: '2026-11-16', time: '09:00' }, '2026-11-17')).toBeNull()
    expect(slotTime('schedule_weekdays', { days: [1], time: '09:00' }, '2026-11-16')).toBe('09:00') // a Monday
    expect(slotTime('schedule_weekdays', { days: [1], time: '09:00' }, '2026-11-17')).toBeNull()
    expect(slotTime('schedule_weekly', { day: 0, time: '18:00' }, '2026-11-15')).toBe('18:00')
    expect(slotTime('weekly_review', { day: 0, time: '18:00' }, '2026-11-16')).toBeNull()
    expect(slotTime('schedule_monthly', { day: 31, time: '09:00' }, '2026-11-30')).toBe('09:00') // short month uses its last day
    expect(slotTime('schedule_monthly', { day: 31, time: '09:00' }, '2026-11-29')).toBeNull()
    expect(slotTime('schedule_interval', { every: 3, start: '2026-11-10', time: '09:00' }, '2026-11-16')).toBe('09:00')
    expect(slotTime('schedule_interval', { every: 3, start: '2026-11-10', time: '09:00' }, '2026-11-17')).toBeNull()
    expect(slotTime('schedule_interval', { every: 3, start: '2026-11-20', time: '09:00' }, '2026-11-17')).toBeNull()
    expect(slotTime('daily_review', { time: '21:00' }, '2026-11-16')).toBe('21:00')
    expect(slotTime('task_created', {}, '2026-11-16')).toBeNull()
  })
  it('fires a slot that just came due, once, and not before the workflow was switched on', () => {
    const base = { tz: TZ, activatedMs: Date.parse('2026-11-01T00:00:00Z') }
    expect(dueSlot('schedule_daily', { time: '21:00' }, { ...base, nowMs: at('2026-11-16', '20:59') })).toBeNull() // yesterday's slot is almost a day old: not fired late
    expect(dueSlot('schedule_daily', { time: '21:00' }, { ...base, nowMs: at('2026-11-16', '21:00') })).toMatchObject({ date: '2026-11-16', time: '21:00' })
    // switched on after today's slot: nothing to catch up
    expect(dueSlot('schedule_daily', { time: '21:00' }, { tz: TZ, nowMs: at('2026-11-16', '22:00'), activatedMs: at('2026-11-16', '21:30') })).toBeNull()
    // the app was closed all day: a slot older than the catch-up window is not fired late
    expect(dueSlot('schedule_daily', { time: '07:00' }, { ...base, nowMs: at('2026-11-16', '21:00') })).toBeNull()
  })
  it('reads "today" in the person\'s zone', () => {
    const w = wf({ trigger: { kind: 'schedule_daily', config: { time: '21:00' } }, actions: [notify] })
    // 2026-11-16 21:05 in Kolkata is 15:35 UTC the same day; in New York it is still 10:35 that morning
    const k = findOccurrences(w, {}, ctx())
    expect(k.map((o) => o.key)).toEqual(['slot:2026-11-16@21:00'])
    const ny = findOccurrences(w, {}, ctx({ tz: 'America/New_York', today: '2026-11-16', nowMs: at('2026-11-16', '21:05', 'America/New_York') }))
    expect(ny.map((o) => o.key)).toEqual(['slot:2026-11-16@21:00'])
    // the same instant is not yet 9 PM in New York
    expect(findOccurrences(w, {}, ctx({ tz: 'America/New_York', today: '2026-11-16', nowMs: at('2026-11-16', '21:05') }))).toEqual([])
  })
  it('never fires a workflow that has not been switched on', () => {
    const w = wf({ trigger: { kind: 'schedule_daily', config: { time: '21:00' } }, actions: [notify] }, { activated_at: null })
    expect(findOccurrences(w, {}, ctx())).toEqual([])
    expect(findOccurrences({ ...w, activated_at: '2026-11-01T00:00:00Z', graph: { nodes: [], edges: [] } }, {}, ctx())).toEqual([])
  })
})

describe('triggers', () => {
  const NOW = at('2026-11-16', '21:05')
  const on = (kind, config = {}, extra = {}) => wf({ trigger: { kind, config }, actions: [notify] }, { activated_at: new Date(NOW - 3600_000).toISOString(), ...extra })
  const task = (o = {}) => ({ id: 't1', title: 'Pay rent', status: 'pending', priority: 'high', category: 'Finance', due_date: '2026-11-17', notes: '', created_at: new Date(NOW - 60_000).toISOString(), completed_at: null, ...o })
  const keys = (w, src, c = ctx()) => findOccurrences(w, src, c).map((o) => o.key)

  it('task created: only tasks made after activation, never ones an automation made', () => {
    const old = task({ id: 'old', created_at: new Date(NOW - 86_400_000).toISOString() })
    expect(keys(on('task_created'), { tasks: [task(), old] })).toEqual(['task_created:t1'])
    expect(keys(on('task_created'), { tasks: [task()] }, ctx({ automationIds: new Set(['t1']) }))).toEqual([])
  })
  it('task completed: keyed by the completion moment, so completing again is a new event', () => {
    const done = task({ status: 'done', completed_at: new Date(NOW - 1000).toISOString() })
    expect(keys(on('task_completed'), { tasks: [done, task({ id: 'x' })] })).toEqual([`task_completed:t1:${done.completed_at}`])
    expect(keys(on('task_completed'), { tasks: [{ ...done, completed_at: new Date(NOW - 7200_000).toISOString() }] })).toEqual([]) // before activation
  })
  it('task overdue: became overdue after activation, not before', () => {
    expect(keys(on('task_overdue'), { tasks: [task({ due_date: '2026-11-15' })] })).toEqual(['task_overdue:t1:2026-11-15'])
    expect(keys(on('task_overdue'), { tasks: [task({ due_date: '2026-11-01' })] })).toEqual([]) // was overdue long before
    expect(keys(on('task_overdue'), { tasks: [task({ due_date: '2026-11-17' }), task({ id: 'd', due_date: '2026-11-15', status: 'done' })] })).toEqual([])
  })
  it('task due soon: within the window, not yet past, once', () => {
    const w = on('task_due_soon', { days_before: 1 })
    expect(keys(w, { tasks: [task({ due_date: '2026-11-17' })] })).toEqual(['task_due:t1:2026-11-17:1'])
    expect(keys(w, { tasks: [task({ due_date: '2026-11-19' }), task({ id: 'p', due_date: '2026-11-15' }), task({ id: 'n', due_date: null })] })).toEqual([])
    // the window opened before the workflow was switched on
    expect(keys(wf({ trigger: { kind: 'task_due_soon', config: { days_before: 5 } }, actions: [notify] }, { activated_at: new Date(NOW).toISOString() }), { tasks: [task({ due_date: '2026-11-17' })] })).toEqual([])
  })
  const habit = (o = {}) => ({ id: 'h1', name: 'Workout', frequency: 'daily', start_date: '2026-10-01', days_of_week: [], rest_days: [], weekly_target: 3, archived_at: null, ...o })
  it('habit completed: logs written after activation, optionally for one habit', () => {
    const log = { id: 'l', habit_id: 'h1', log_date: '2026-11-16', status: 'done', created_at: new Date(NOW - 1000).toISOString() }
    expect(keys(on('habit_completed'), { habits: [habit()], habitLogs: [log] })).toEqual(['habit_done:h1:2026-11-16'])
    expect(keys(on('habit_completed', { habit_id: 'other' }), { habits: [habit()], habitLogs: [log] })).toEqual([])
    expect(keys(on('habit_completed'), { habits: [habit({ archived_at: 'x' })], habitLogs: [log] })).toEqual([])
    expect(keys(on('habit_completed'), { habits: [habit()], habitLogs: [{ ...log, status: 'skipped' }] })).toEqual([])
  })
  it('habit missed: a scheduled day with no log, not rest days, not weekly habits, not before activation', () => {
    const w = on('habit_missed', {}, { activated_at: '2026-11-10T00:00:00Z' })
    expect(keys(w, { habits: [habit()], habitLogs: [] }).sort()).toEqual(['habit_missed:h1:2026-11-14', 'habit_missed:h1:2026-11-15'])
    const logged = [{ habit_id: 'h1', log_date: '2026-11-15', status: 'done' }]
    expect(keys(w, { habits: [habit()], habitLogs: logged })).toEqual(['habit_missed:h1:2026-11-14'])
    expect(keys(w, { habits: [habit({ frequency: 'weekly' })], habitLogs: [] })).toEqual([])
    expect(keys(w, { habits: [habit({ rest_days: [0, 6] })], habitLogs: [] })).toEqual([]) // 14th and 15th are a weekend
    expect(keys(w, { habits: [habit()], habitPauses: [{ habit_id: 'h1', start_date: '2026-11-01', end_date: null }], habitLogs: [] })).toEqual([])
    expect(keys(on('habit_missed'), { habits: [habit()], habitLogs: [] })).toEqual([]) // both days predate the activation day
  })
  it('habit streak: once per streak, and again for a new one', () => {
    const logs = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'].map((d) => ({ habit_id: 'h1', log_date: d, status: 'done' }))
    const w = on('habit_streak', { length: 7 })
    expect(keys(w, { habits: [habit()], habitLogs: logs })).toEqual(['habit_streak:h1:7:2026-11-10'])
    expect(keys(w, { habits: [habit()], habitLogs: logs.slice(1) })).toEqual([]) // only 6
    // tomorrow the streak is 8 days long but still the same streak: same key
    expect(keys(w, { habits: [habit()], habitLogs: [...logs, { habit_id: 'h1', log_date: '2026-11-17', status: 'done' }] }, ctx({ today: '2026-11-17' }))).toEqual(['habit_streak:h1:7:2026-11-10'])
    const weekly = habit({ frequency: 'weekly', weekly_target: 1 })
    const wl = ['2026-11-09', '2026-11-02'].map((d) => ({ habit_id: 'h1', log_date: d, status: 'done' }))
    expect(keys(on('habit_streak', { length: 2 }), { habits: [weekly], habitLogs: wl })).toEqual(['habit_streak:h1:2:2026-11-02'])
  })
  it('weekly habit target met', () => {
    const logs = ['2026-11-16', '2026-11-17'].map((d) => ({ habit_id: 'h1', log_date: d, status: 'done' }))
    const h = habit({ frequency: 'weekly', weekly_target: 2 })
    expect(keys(on('habit_week_target'), { habits: [h], habitLogs: logs }, ctx({ today: '2026-11-18' }))).toEqual(['habit_week:h1:2026-11-16'])
    expect(keys(on('habit_week_target'), { habits: [{ ...h, weekly_target: 3 }], habitLogs: logs }, ctx({ today: '2026-11-18' }))).toEqual([])
    expect(keys(on('habit_week_target'), { habits: [habit()], habitLogs: logs })).toEqual([])
  })
  const goal = (o = {}) => ({ id: 'g1', title: 'Learn SQL', status: 'active', category: 'Learning', manual_progress: 60, target_minutes: 0, due_date: '2026-11-20', created_at: new Date(NOW - 60_000).toISOString(), completed_at: null, ...o })
  it('goal triggers: created, progress, completed, deadline', () => {
    expect(keys(on('goal_created'), { goals: [goal()] })).toEqual(['goal_created:g1'])
    expect(keys(on('goal_created'), { goals: [goal()] }, ctx({ automationIds: new Set(['g1']) }))).toEqual([])
    expect(keys(on('goal_progress', { percent: 50 }), { goals: [goal()] })).toEqual(['goal_pct:g1:50'])
    expect(keys(on('goal_progress', { percent: 70 }), { goals: [goal()] })).toEqual([])
    expect(keys(on('goal_progress', { percent: 50, goal_id: 'zz' }), { goals: [goal()] })).toEqual([])
    expect(keys(on('goal_progress', { percent: 50 }), { goals: [goal({ status: 'completed' })] })).toEqual([])
    const done = goal({ status: 'completed', completed_at: new Date(NOW - 1000).toISOString() })
    expect(keys(on('goal_completed'), { goals: [done] })).toEqual([`goal_done:g1:${done.completed_at}`])
    expect(keys(on('goal_deadline', { days_before: 7 }), { goals: [goal()] })).toEqual(['goal_deadline:g1:2026-11-20:7'])
    expect(keys(on('goal_deadline', { days_before: 2 }), { goals: [goal()] })).toEqual([])
    expect(keys(on('goal_deadline', { days_before: 7 }), { goals: [goal({ due_date: null }), goal({ id: 'p', due_date: '2026-11-01' })] })).toEqual([])
  })
  it('reminder reached: a reminder that fired today after activation', () => {
    const r = { id: 'r1', title: 'Water plants', last_fired_on: '2026-11-16', updated_at: new Date(NOW - 5000).toISOString() }
    expect(keys(on('reminder_due'), { reminders: [r] })).toEqual(['reminder:r1:2026-11-16'])
    expect(keys(on('reminder_due', { reminder_id: 'x' }), { reminders: [r] })).toEqual([])
    expect(keys(on('reminder_due'), { reminders: [{ ...r, last_fired_on: '2026-11-15' }] })).toEqual([])
  })
  it('calendar event approaching: inside the lead time, once per occurrence, not all-day ones', () => {
    const start = NOW + 20 * 60_000
    const event = { id: 'e1', title: 'Standup', starts_at: new Date(start).toISOString(), ends_at: new Date(start + 1800_000).toISOString(), all_day: false, timezone: TZ, rrule: null, alert_minutes: [] }
    const w = on('calendar_event_soon', { minutes_before: 30 })
    expect(keys(w, { events: [event], exceptions: [] })).toEqual([`event:e1@2026-11-16:${start}:30`])
    expect(keys(on('calendar_event_soon', { minutes_before: 10 }), { events: [event] })).toEqual([])
    expect(keys(w, { events: [{ ...event, all_day: true }] })).toEqual([])
    expect(keys(w, { events: [{ ...event, starts_at: new Date(NOW - 60_000).toISOString(), ends_at: new Date(NOW + 60_000).toISOString() }] })).toEqual([]) // already started
  })
  it('lists loop protection ids from earlier runs', () => {
    expect([...createdIds([{ steps: [{ ref: 'a', status: 'ok' }, { ref: 'b', status: 'failed' }, { status: 'ok' }] }, { steps: null }, {}])]).toEqual(['a'])
    expect(createdIds(undefined).size).toBe(0)
  })
})

describe('conditions', () => {
  const t = { type: 'task', row: { id: 't', title: 'Pay rent', status: 'pending', priority: 'high', category: 'Finance', due_date: '2026-11-10', notes: '' } }
  const run = (config, subject = t, c = ctx()) => evaluateCondition(config, factsFor(subject, {}, c)).pass
  it('compares text, numbers, priority order and booleans', () => {
    expect(run({ mode: 'all', rules: [{ field: 'task.status', op: 'eq', value: 'pending' }, { field: 'task.priority', op: 'gte', value: 'medium' }] })).toBe(true)
    expect(run({ mode: 'all', rules: [{ field: 'task.priority', op: 'lt', value: 'high' }] })).toBe(false)
    expect(run({ mode: 'all', rules: [{ field: 'task.priority', op: 'gt', value: 'low' }, { field: 'task.priority', op: 'lte', value: 'urgent' }] })).toBe(true)
    expect(run({ mode: 'all', rules: [{ field: 'task.overdue', op: 'eq', value: 'true' }] })).toBe(true)
    expect(run({ mode: 'all', rules: [{ field: 'task.due_in_days', op: 'lt', value: 0 }] })).toBe(true)
    expect(run({ mode: 'all', rules: [{ field: 'task.title', op: 'contains', value: 'RENT' }] })).toBe(true)
    expect(run({ mode: 'all', rules: [{ field: 'task.category', op: 'neq', value: 'Gym' }] })).toBe(true)
    expect(run({ mode: 'all', rules: [{ field: 'task.title', op: '??', value: 'x' }] })).toBe(false)
  })
  it('AND needs every rule, OR needs one, and an empty condition never passes', () => {
    const rules = [{ field: 'task.status', op: 'eq', value: 'done' }, { field: 'task.priority', op: 'eq', value: 'high' }]
    expect(run({ mode: 'all', rules })).toBe(false)
    expect(run({ mode: 'any', rules })).toBe(true)
    expect(run({ mode: 'all', rules: [] })).toBe(false)
  })
  it('a missing value never matches, and the day facts follow the person\'s zone', () => {
    expect(run({ mode: 'all', rules: [{ field: 'task.due_in_days', op: 'eq', value: 0 }] }, { type: 'task', row: { ...t.row, due_date: null } })).toBe(false)
    expect(run({ mode: 'all', rules: [{ field: 'day.is_weekday', op: 'eq', value: 'true' }] })).toBe(true) // a Monday
    expect(run({ mode: 'all', rules: [{ field: 'day.is_weekday', op: 'eq', value: 'true' }] }, t, ctx({ today: '2026-11-15' }))).toBe(false) // a Sunday
    expect(run({ mode: 'all', rules: [{ field: 'day.weekday', op: 'eq', value: '1' }, { field: 'day.hour', op: 'eq', value: 21 }] })).toBe(true)
    expect(run({ mode: 'all', rules: [{ field: 'day.hour', op: 'eq', value: 10 }] }, t, ctx({ tz: 'America/New_York', nowMs: at('2026-11-16', '21:05') }))).toBe(true)
  })
  it('habit and goal facts', () => {
    const h = { type: 'habit', row: { id: 'h', name: 'Workout', frequency: 'daily', start_date: '2026-11-10', rest_days: [], days_of_week: [] }, status: 'missed' }
    expect(run({ mode: 'all', rules: [{ field: 'habit.status', op: 'eq', value: 'missed' }, { field: 'habit.name', op: 'contains', value: 'work' }, { field: 'habit.streak', op: 'eq', value: 0 }] }, h)).toBe(true)
    const g = { type: 'goal', row: { id: 'g', title: 'SQL', status: 'active', category: 'Learning' }, progress: 62 }
    expect(run({ mode: 'all', rules: [{ field: 'goal.progress', op: 'gt', value: 50 }, { field: 'goal.status', op: 'eq', value: 'active' }, { field: 'goal.category', op: 'eq', value: 'Learning' }] }, g)).toBe(true)
    const result = evaluateCondition({ mode: 'all', rules: [{ field: 'goal.progress', op: 'gt', value: 80 }] }, factsFor(g, {}, ctx()))
    expect(result.checks).toEqual([{ label: 'Goal progress (%)', actual: 62, pass: false }])
  })
})

describe('plans', () => {
  const task = { id: 't1', title: 'Pay rent', status: 'pending', priority: 'medium', category: 'Finance', due_date: '2026-11-16', notes: 'a', created_at: '2026-11-16T00:00:00Z', completed_at: null }
  const occ = (subject) => ({ key: 'k1', subject, label: 'x', at: 0 })
  const plan = (spec, subject, src = {}, c = ctx(), extra = {}) => planRun(wf(spec, extra), occ(subject), src, c)
  const taskOcc = { type: 'task', row: task }

  it('plans a notification with variables filled in and a stable key', () => {
    const p = plan({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] }, taskOcc)
    expect(p.status).toBe('planned')
    const step = p.steps.find((s) => s.type === 'action')
    expect(step.effect).toMatchObject({ op: 'notify', title: 'Hi Pay rent' })
    expect(step.effect.key).toMatch(/^auto:w1:k1:/)
    expect(render('{{ nope.deep }} and {{date}}', { date: 'D' })).toBe(' and D')
  })
  it('a condition that is not met skips everything behind it', () => {
    const p = plan({ trigger: { kind: 'task_completed', config: {} }, conditions: [{ mode: 'all', rules: [{ field: 'task.priority', op: 'eq', value: 'urgent' }] }], actions: [notify] }, taskOcc)
    expect(p).toMatchObject({ status: 'skipped', reason: 'The conditions were not met.' })
    expect(p.steps.map((s) => s.status)).toEqual(['ok', 'skipped', 'skipped'])
    expect(p.steps[1].checks[0].pass).toBe(false)
    expect(p.steps[2].detail).toBe('Not reached.')
  })
  it('a branch can stop while another carries on', () => {
    const t = newNode('trigger', 'task_completed')
    const c = newNode('condition', 'condition')
    c.config = { mode: 'all', rules: [{ field: 'task.priority', op: 'eq', value: 'urgent' }] }
    const a1 = newNode('action', 'notify')
    a1.config = { title: 'urgent only' }
    const a2 = newNode('action', 'notify')
    a2.config = { title: 'always' }
    const g = { nodes: [t, c, a1, a2], edges: [[t, c], [c, a1], [t, a2]].map(([f, to]) => ({ id: edgeKey(f.id, to.id), from: f.id, to: to.id })) }
    const p = planRun({ id: 'w', name: 'b', graph: g }, occ(taskOcc.type ? taskOcc : null), {}, ctx())
    expect(p.status).toBe('planned')
    expect(p.steps.filter((s) => s.effect).map((s) => s.effect.title)).toEqual(['always'])
  })
  it('creates tasks with a due date rule, and skips an empty title', () => {
    const mk = (config) => plan({ trigger: { kind: 'schedule_daily', config: { time: '09:00' } }, actions: [{ kind: 'create_task', config }] }, { type: 'schedule' })
    expect(mk({ title: 'A', due: 'tomorrow' }).steps[1].effect.row).toMatchObject({ title: 'A', due_date: '2026-11-17', status: 'pending', category: 'Personal', priority: 'medium' })
    expect(mk({ title: 'A', due: 'in_days', days: 3 }).steps[1].effect.row.due_date).toBe('2026-11-19')
    expect(mk({ title: 'A', due: 'next_monday' }).steps[1].effect.row.due_date).toBe('2026-11-23') // today is a Monday: the NEXT one
    expect(mk({ title: 'A', due: 'none' }).steps[1].effect.row.due_date).toBeNull()
    expect(mk({ title: 'A' }).steps[1].effect.row.due_date).toBe('2026-11-16')
    expect(mk({ title: '{{task.title}}' })).toMatchObject({ status: 'skipped' })
  })
  it('updates the triggering task and does nothing when it is already so', () => {
    const upd = (config, row = task) => plan({ trigger: { kind: 'task_created', config: {} }, actions: [{ kind: 'update_task', config }] }, { type: 'task', row })
    const p = upd({ priority: 'high', move_days: 2, note: 'bumped', status: 'in_progress' })
    expect(p.steps[1].effect).toEqual({ op: 'update_task', id: 't1', patch: { priority: 'high', due_date: '2026-11-18', notes: 'a\nbumped' }, status: 'in_progress' })
    expect(upd({ priority: 'medium' })).toMatchObject({ status: 'skipped', reason: '"Pay rent" is already up to date.' })
    expect(upd({ move_days: 1 }, { ...task, due_date: null }).steps[1].effect.patch.due_date).toBe('2026-11-17')
    expect(plan({ trigger: { kind: 'goal_created', config: {} }, actions: [{ kind: 'update_task', config: { priority: 'high' } }] }, { type: 'goal', row: { id: 'g', title: 'g' }, progress: 0 })).toMatchObject({ status: 'skipped' })
  })
  it('creates reminders', () => {
    const p = plan({ trigger: { kind: 'schedule_daily', config: { time: '09:00' } }, actions: [{ kind: 'create_reminder', config: { title: 'Call mum', due: 'tomorrow', time: '18:00' } }] }, { type: 'schedule' })
    expect(p.steps[1].effect.row).toMatchObject({ title: 'Call mum', remind_date: '2026-11-17', remind_time: '18:00', repeat: 'none', active: true, kind: 'custom' })
    expect(plan({ trigger: { kind: 'schedule_daily', config: { time: '09:00' } }, actions: [{ kind: 'create_reminder', config: { title: '{{task.title}}', time: '18:00' } }] }, { type: 'schedule' }).status).toBe('skipped')
  })
  it('updates only manual goal progress, within 0 to 100', () => {
    const goal = { id: 'g1', title: 'Learn SQL', status: 'active', manual_progress: 40, target_minutes: 0 }
    const sub = { type: 'goal', row: goal, progress: 40 }
    const run = (config, g = goal, src = {}) => plan({ trigger: { kind: 'goal_created', config: {} }, actions: [{ kind: 'update_goal_progress', config }] }, { ...sub, row: g }, { goals: [g], ...src })
    expect(run({ mode: 'add', value: 10 }).steps[1].effect).toEqual({ op: 'update', table: 'goals', id: 'g1', patch: { manual_progress: 50 } })
    expect(run({ mode: 'set', value: 80 }).steps[1].effect.patch.manual_progress).toBe(80)
    expect(run({ mode: 'add', value: 90 }).steps[1].effect.patch.manual_progress).toBe(100)
    expect(run({ mode: 'set', value: 40 })).toMatchObject({ status: 'skipped' })
    const withMilestones = run({ mode: 'add', value: 10 }, goal, { milestones: [{ goal_id: 'g1', done: false }] })
    expect(withMilestones.reason).toMatch(/calculated and was left alone/)
    expect(run({ mode: 'add', value: 10 }, { ...goal, status: 'archived' }).reason).toMatch(/not active/)
    expect(run({ mode: 'add', value: 10 }, { ...goal, target_minutes: 60 }).reason).toMatch(/study time/)
    // a goal chosen by id that is gone
    expect(plan({ trigger: { kind: 'task_completed', config: {} }, actions: [{ kind: 'update_goal_progress', config: { goal_id: 'gone', mode: 'add', value: 5 } }] }, taskOcc, { goals: [] }).reason).toBe('The goal no longer exists.')
    expect(plan({ trigger: { kind: 'task_completed', config: {} }, actions: [{ kind: 'update_goal_progress', config: { goal_id: 'g1', mode: 'add', value: 5 } }] }, taskOcc, { goals: [goal] }).steps[1].effect.id).toBe('g1')
  })
  it('creates review tasks with the day\'s numbers', () => {
    const src = { tasks: [task, { ...task, id: 'd', status: 'done', completed_at: '2026-11-16T05:00:00Z' }, { ...task, id: 'd2', status: 'done', completed_at: '2026-11-01T05:00:00Z' }] }
    const day = plan({ trigger: { kind: 'daily_review', config: { time: '21:00' } }, actions: [{ kind: 'create_review_task', config: { period: 'daily' } }] }, { type: 'schedule' }, src)
    expect(day.steps[1].effect.row).toMatchObject({ title: 'Daily review: 2026-11-16', category: 'Routine', due_date: '2026-11-16' })
    expect(day.steps[1].effect.row.notes).toMatch(/1 task done, 1 still open/)
    const week = plan({ trigger: { kind: 'weekly_review', config: { day: 0, time: '18:00' } }, actions: [{ kind: 'create_review_task', config: { period: 'weekly', priority: 'high' } }] }, { type: 'schedule' }, src)
    expect(week.steps[1].effect.row).toMatchObject({ title: 'Weekly review: week of 2026-11-16', priority: 'high' })
    expect(week.steps[1].effect.row.notes).toMatch(/1 task done/)
  })
  it('adds a checklist item once', () => {
    const g = { id: 'g1', title: 'Learn SQL', status: 'active' }
    const run = (src, config = { title: 'Review {{goal.title}}' }) => plan({ trigger: { kind: 'goal_created', config: {} }, actions: [{ kind: 'add_checklist_item', config }] }, { type: 'goal', row: g, progress: 0 }, src)
    expect(run({ goals: [g], milestones: [{ goal_id: 'g1', title: 'x', position: 3 }] }).steps[1].effect.row).toEqual({ goal_id: 'g1', title: 'Review Learn SQL', position: 4, done: false })
    expect(run({ goals: [g], milestones: [{ goal_id: 'g1', title: 'review learn sql', position: 1 }] }).reason).toMatch(/already has/)
    expect(run({}, { title: '{{task.title}}' }).reason).toMatch(/came out empty/)
    expect(plan({ trigger: { kind: 'task_completed', config: {} }, actions: [{ kind: 'add_checklist_item', config: { goal_id: 'nope', title: 'x' } }] }, taskOcc).reason).toBe('The goal no longer exists.')
  })
  it('"mark completed" ends the branch successfully', () => {
    const p = plan({ trigger: { kind: 'task_completed', config: {} }, actions: [{ kind: 'complete', config: {} }] }, taskOcc)
    expect(p.status).toBe('planned')
    expect(effectCounts(p.steps)).toEqual({})
  })
  it('an unknown action is skipped, not run', () => {
    const w = wf({ trigger: { kind: 'task_completed', config: {} }, actions: [{ kind: 'notify', config: {} }] })
    w.graph.nodes[1].kind = 'teleport'
    expect(planRun(w, occ(taskOcc), {}, ctx())).toMatchObject({ status: 'skipped', reason: 'This action is not supported.' })
  })
  it('counts what a plan would write', () => {
    const p = plan({ trigger: { kind: 'task_completed', config: {} }, actions: [notify, { kind: 'create_task', config: { title: 'a' } }, { kind: 'create_task', config: { title: 'b' } }] }, taskOcc)
    expect(effectCounts(p.steps)).toEqual({ notifications: 1, tasks: 2 })
    expect(variablesFor({ type: 'event', title: 'Standup', startMs: 0 }, {}, ctx()).event.title).toBe('Standup')
    expect(variablesFor({ type: 'reminder', row: { title: 'r' } }, {}, ctx()).reminder.title).toBe('r')
  })
})

describe('limits and sample runs', () => {
  const NOW = at('2026-11-16', '21:05')
  const ex = (o) => ({ workflow_id: 'w1', status: 'completed', created_at: new Date(NOW - 60_000).toISOString(), ...o })
  it('stops a workflow at its daily limit, but not for runs that were only skipped', () => {
    const w = { id: 'w1', max_runs_per_day: 3 }
    expect(runAllowance(w, [ex(), ex(), ex({ status: 'skipped' })], { tz: TZ, nowMs: NOW }).ok).toBe(true)
    expect(runAllowance(w, [ex(), ex(), ex()], { tz: TZ, nowMs: NOW })).toMatchObject({ ok: false, reason: 'Daily limit of 3 runs reached for this workflow.' })
    // yesterday's runs do not count
    expect(runAllowance(w, [ex({ created_at: new Date(NOW - 86_400_000 * 2).toISOString() }), ex(), ex()], { tz: TZ, nowMs: NOW }).ok).toBe(true)
    expect(runAllowance({ id: 'w1' }, [], { tz: TZ, nowMs: NOW }).ok).toBe(true)
    expect(runAllowance({ id: 'w1', max_runs_per_day: 9999 }, Array.from({ length: LIMITS.maxRunsPerDay }, () => ex()), { tz: TZ, nowMs: NOW }).ok).toBe(false)
  })
  it('stops everything at the hourly limit and on a flood of rows', () => {
    const many = Array.from({ length: LIMITS.runsPerHourAll }, (_, i) => ex({ workflow_id: `o${i}` }))
    expect(runAllowance({ id: 'new' }, many, { tz: TZ, nowMs: NOW }).reason).toMatch(/Hourly limit/)
    const flood = Array.from({ length: LIMITS.maxRunsPerDay * 2 }, () => ex({ status: 'skipped' }))
    expect(runAllowance({ id: 'w1' }, flood, { tz: TZ, nowMs: NOW }).reason).toBe('Too many runs today.')
  })
  it('samples from real data, and invents a sample when there is none', () => {
    const c = ctx()
    const w = (kind, config = {}) => wf({ trigger: { kind, config }, actions: [notify] })
    expect(sampleOccurrence(w('schedule_daily', { time: '07:00' }), {}, c).subject).toMatchObject({ type: 'schedule', time: '07:00' })
    expect(sampleOccurrence(w('task_created'), { tasks: [{ id: 't', title: 'Real', status: 'pending' }] }, c)).toMatchObject({ label: 'Real' })
    expect(sampleOccurrence(w('task_completed'), {}, c)).toMatchObject({ synthetic: true, subject: { row: { status: 'done' } } })
    expect(sampleOccurrence(w('habit_missed'), {}, c)).toMatchObject({ synthetic: true, subject: { status: 'missed' } })
    expect(sampleOccurrence(w('habit_completed'), { habits: [{ id: 'h', name: 'Read', frequency: 'daily', start_date: '2026-01-01' }] }, c)).toMatchObject({ label: 'Read' })
    expect(sampleOccurrence(w('goal_progress', { percent: 60 }), {}, c)).toMatchObject({ synthetic: true, subject: { progress: 60 } })
    expect(sampleOccurrence(w('goal_created'), { goals: [{ id: 'g', title: 'G', status: 'active', manual_progress: 10 }] }, c).subject.progress).toBe(10)
    expect(sampleOccurrence(w('reminder_due'), {}, c)).toMatchObject({ synthetic: true })
    expect(sampleOccurrence(w('reminder_due'), { reminders: [{ id: 'r', title: 'R' }] }, c).label).toBe('R')
    expect(sampleOccurrence(w('calendar_event_soon', { minutes_before: 30 }), {}, c)).toMatchObject({ synthetic: true, subject: { type: 'event' } })
    expect(sampleOccurrence({ graph: { nodes: [], edges: [] } }, {}, c)).toBeNull()
    // the person can pick which real row to try it on
    const tasks = [{ id: 'a', title: 'A', status: 'pending' }, { id: 'b', title: 'B', status: 'pending' }]
    expect(sampleOccurrence(w('task_created'), { tasks }, c, 'b').label).toBe('B')
    expect(sampleChoices(w('task_created'), { tasks })).toEqual([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
    expect(sampleChoices(w('habit_missed'), { habits: [{ id: 'h', name: 'Read', frequency: 'daily', start_date: '2026-01-01' }] })).toEqual([{ id: 'h', label: 'Read' }])
    expect(sampleChoices(w('goal_created'), { goals: [{ id: 'g', title: 'G', status: 'active' }, { id: 'x', title: 'X', status: 'archived' }] })).toEqual([{ id: 'g', label: 'G' }])
    expect(sampleChoices(w('reminder_due'), { reminders: [{ id: 'r', title: 'R' }] })).toEqual([{ id: 'r', label: 'R' }])
    expect(sampleChoices(w('schedule_daily', { time: '09:00' }), {})).toEqual([])
  })
})

describe('graph edits (undo/redo friendly: always a new graph)', () => {
  const base = () => chain({ trigger: { kind: 'task_created', config: {} }, conditions: [{ mode: 'all', rules: [] }], actions: [notify] })
  it('refuses bad connections and loops, and connects good ones', () => {
    const g = base()
    const [t, c, a] = g.nodes
    expect(connectProblem(g, t.id, 'ghost')).toMatch(/does not exist/)
    expect(connectProblem(g, c.id, c.id)).toMatch(/itself/)
    expect(connectProblem(g, a.id, t.id)).toMatch(/trigger/)
    expect(connectProblem(g, t.id, c.id)).toMatch(/already connected/)
    expect(connectProblem(g, a.id, c.id)).toMatch(/loop/)
    expect(connectProblem(g, t.id, a.id)).toBeNull()
    const joined = addEdge(g, t.id, a.id)
    expect(joined.edges).toHaveLength(g.edges.length + 1)
    expect(g.edges).toHaveLength(2) // the original is untouched
    expect(addEdge(g, a.id, c.id)).toBe(g)
  })
  it('removes a step and joins the chain back up', () => {
    const g = base()
    const [t, c, a] = g.nodes
    const without = removeNode(g, c.id)
    expect(without.nodes.map((n) => n.id)).toEqual([t.id, a.id])
    expect(without.edges.map((e) => [e.from, e.to])).toEqual([[t.id, a.id]])
    expect(removeEdge(g, g.edges[0].id).edges).toHaveLength(1)
    expect(removeNode(g, a.id).edges).toHaveLength(1)
  })
  it('edits nodes and swaps the trigger in place', () => {
    const g = base()
    const [t, , a] = g.nodes
    expect(updateConfig(g, a.id, { title: 'x' }).nodes[2].config).toEqual({ title: 'x' })
    expect(updateNode(g, a.id, { x: 5, y: 6 }).nodes[2]).toMatchObject({ x: 5, y: 6 })
    const swapped = addNode(g, newNode('trigger', 'schedule_daily'))
    expect(swapped.nodes).toHaveLength(3)
    expect(swapped.nodes[0]).toMatchObject({ id: t.id, kind: 'schedule_daily', x: t.x, y: t.y })
    expect(addNode({ nodes: [], edges: [] }, newNode('trigger', 'schedule_daily')).nodes).toHaveLength(1)
    expect(addNode(g, newNode('action', 'complete')).nodes).toHaveLength(4)
    expect(leaves(addNode(g, newNode('action', 'complete'))).map((n) => n.kind)).toEqual(['notify', 'complete'])
  })
})
