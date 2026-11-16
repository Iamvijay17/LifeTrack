import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import { chain, validateWorkflow } from '@lifetrack/core/automation'
import { AppError } from '../src/errors'
import { createApi } from '../src/api'
import { backoffMs, isTemporary } from '../src/automation'
import { createMemorySupabase } from '../src/testing/memorySupabase'
import { createSupabaseAdapter } from '../src/supabaseAdapter'
import { withSchemaValidation } from '../src/validatingAdapter'
import { setUserId } from '../src/session'
import { insertSchemas, updateSchemas } from '@lifetrack/schemas'

// The automation executor against the in-memory database: claim-first runs, lifecycle, retries, limits and isolation. Nothing real is touched.
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const TZ = 'Asia/Kolkata'
const TODAY = '2026-11-16' // a Monday
const NOW = zonedToMs(TODAY, '21:05', TZ)
const o = { tz: TZ, today: TODAY, nowMs: NOW }

function makeStore(adapter) {
  const cache = new Map()
  const rows = (t) => cache.get(t) ?? []
  const merge = (t, incoming) => { const cur = [...rows(t)]; for (const r of incoming) { const i = cur.findIndex((x) => x.id === r.id); if (i >= 0) cur[i] = r; else cur.push(r) } cache.set(t, cur) }
  const hooks = { fail: null }
  const guard = (t, op, patch) => { if (hooks.fail?.(t, op, patch)) { const e = hooks.fail.error ?? new Error('boom'); throw e } }
  return {
    hooks,
    peek: rows,
    load: async (t) => { if (!cache.has(t)) cache.set(t, await adapter.list(t)) },
    refetch: async (t) => { cache.set(t, await adapter.list(t)) },
    insert: async (t, input) => { guard(t, 'insert', input); const out = await adapter.insert(t, Array.isArray(input) ? input : [input]); merge(t, out); return Array.isArray(input) ? out : out[0] },
    update: async (t, id, patch) => { guard(t, 'update', patch); const r = await adapter.update(t, id, patch); merge(t, [r]); return r },
    upsert: async (t, input, opts) => { const out = await adapter.upsert(t, Array.isArray(input) ? input : [input], opts); merge(t, out); return Array.isArray(input) ? out : out[0] },
    rpc: (fn, args) => adapter.rpc(fn, args),
    patch: (t, incoming) => merge(t, incoming),
    patchGroup: (t, dropFn, incoming) => cache.set(t, [...rows(t).filter((r) => !dropFn(r)), ...incoming]),
    remove: async (t, id) => { await adapter.remove(t, id); cache.set(t, rows(t).filter((r) => r.id !== id)) },
    removeMany: async (t, ids) => { await adapter.removeMany(t, ids); cache.set(t, rows(t).filter((r) => !ids.includes(r.id))) },
  }
}

let client, store, api
const connect = (uid) => {
  setUserId(uid)
  const adapter = withSchemaValidation(createSupabaseAdapter(client), { insertSchemas, updateSchemas })
  const s = makeStore(adapter)
  return { s, a: createApi(s) }
}
afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  client = createMemorySupabase()
  ;({ s: store, a: api } = connect(A))
})
const dump = (t) => client.dump(t)
const activated = new Date(NOW - 3600_000).toISOString()
const notify = { kind: 'notify', config: { title: 'Done: {{task.title}}', body: '', priority: 'normal' } }

/** Creates a switched-on workflow (activated an hour ago) and returns it. */
async function workflow(spec, values = {}) {
  const { workflow: w } = await api.saveWorkflow(null, { name: 'Test flow', description: '', graph: chain(spec), ...values })
  return api.setWorkflowEnabled(w, true).then(async (on) => store.update('automation_workflows', on.id, { activated_at: activated }))
}
const completeTask = (title = 'Pay rent') => store.insert('tasks', { title, status: 'done', completed_at: new Date(NOW - 1000).toISOString(), due_date: TODAY, priority: 'high' })
const tick = (extra = {}) => api.runAutomations({ ...o, ...extra })

describe('saving and switching workflows', () => {
  it('copies the trigger kind and refuses to switch on an incomplete workflow', async () => {
    const { workflow: w, switchedOff } = await api.saveWorkflow(null, { name: 'Half done', graph: { nodes: [], edges: [] } })
    expect(w.trigger_kind).toBe('')
    expect(switchedOff).toBe(false)
    await expect(api.setWorkflowEnabled(w, true)).rejects.toThrow(/not ready/)
    expect(dump('automation_workflows')[0].enabled).toBe(false)
  })
  it('switching on starts the clock, switching off clears it, and an invalid edit switches a running workflow off', async () => {
    const { workflow: w } = await api.saveWorkflow(null, { name: 'W', graph: chain({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] }) })
    expect(w).toMatchObject({ trigger_kind: 'task_completed', enabled: false, activated_at: null })
    const on = await api.setWorkflowEnabled(w, true)
    expect(on.enabled).toBe(true)
    expect(Date.parse(on.activated_at)).toBeGreaterThan(0)
    expect((await api.setWorkflowEnabled(on, true)).activated_at).toBe(on.activated_at) // already on: the clock is not reset
    const bad = await api.saveWorkflow(on, { graph: { nodes: [], edges: [] } })
    expect(bad).toMatchObject({ switchedOff: true, workflow: { enabled: false, activated_at: null } })
    const off = await api.setWorkflowEnabled(on, false)
    expect(off).toMatchObject({ enabled: false, activated_at: null })
  })
  it('rejects a workflow the database could not hold', async () => {
    await expect(api.saveWorkflow(null, { name: '', graph: { nodes: [], edges: [] } })).rejects.toBeTruthy()
    expect(dump('automation_workflows')).toHaveLength(0)
  })
})

describe('a run, start to finish', () => {
  it('claims, runs and records: pending → running → completed, with the steps and what they created', async () => {
    await workflow({ trigger: { kind: 'task_completed', config: {} }, actions: [notify, { kind: 'create_task', config: { title: 'Follow up: {{task.title}}', due: 'tomorrow' } }] })
    await completeTask()
    const r = await tick()
    expect(r.ran).toBe(1)
    const [e] = dump('automation_executions')
    expect(e).toMatchObject({ status: 'completed', attempt: 1, workflow_name: 'Test flow', trigger_kind: 'task_completed', error: '', reason: '' })
    expect(e.trigger_info).toMatchObject({ label: 'Pay rent', subject: 'task' })
    expect(e.started_at).toBeTruthy()
    expect(e.finished_at).toBeTruthy()
    expect(e.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok'])
    const created = dump('tasks').find((t) => t.title === 'Follow up: Pay rent')
    expect(created).toMatchObject({ due_date: '2026-11-17', status: 'pending' })
    expect(e.steps[2].ref).toBe(created.id)
    expect(dump('notifications').map((n) => n.title)).toEqual(['Done: Pay rent'])
    expect(dump('notifications')[0]).toMatchObject({ kind: 'system', link: '/automation/history' })
  })

  it('never runs the same occurrence twice, however often or from wherever it is checked', async () => {
    await workflow({ trigger: { kind: 'task_completed', config: {} }, actions: [notify, { kind: 'create_task', config: { title: 'once' } }] })
    await completeTask()
    await Promise.all([tick(), tick()]) // two checks at the same moment
    await tick()
    // a second device with an empty cache sees the same task and the same workflow
    const other = connect(A)
    await other.a.runAutomations(o)
    expect(dump('automation_executions').filter((e) => e.status === 'completed')).toHaveLength(1)
    expect(dump('tasks').filter((t) => t.title === 'once')).toHaveLength(1)
    expect(dump('notifications')).toHaveLength(1)
  })

  it('records a skipped run when the conditions are not met, and does nothing else', async () => {
    await workflow({ trigger: { kind: 'task_completed', config: {} }, conditions: [{ mode: 'all', rules: [{ field: 'task.priority', op: 'eq', value: 'low' }] }], actions: [notify] })
    await completeTask()
    await tick()
    const [e] = dump('automation_executions')
    expect(e).toMatchObject({ status: 'skipped', reason: 'The conditions were not met.' })
    expect(e.steps[1].checks[0]).toMatchObject({ label: 'Task priority', actual: 'High', pass: false })
    expect(dump('notifications')).toHaveLength(0)
  })

  it('fires a schedule once per slot and carries on the next day', async () => {
    await workflow({ trigger: { kind: 'schedule_daily', config: { time: '21:00' } }, actions: [{ kind: 'notify', config: { title: 'Evening' } }] })
    await tick()
    await tick()
    expect(dump('automation_executions')).toHaveLength(1)
    expect(dump('automation_executions')[0].dedupe_key).toBe('slot:2026-11-16@21:00')
    const next = zonedToMs('2026-11-17', '21:02', TZ)
    await tick({ today: '2026-11-17', nowMs: next })
    expect(dump('automation_executions').map((e) => e.dedupe_key).sort()).toEqual(['slot:2026-11-16@21:00', 'slot:2026-11-17@21:00'])
    expect(dump('notifications')).toHaveLength(2)
  })

  it('does nothing for a workflow that is off, never activated, or invalid', async () => {
    const spec = { trigger: { kind: 'task_completed', config: {} }, actions: [notify] }
    const w = await workflow(spec)
    await completeTask()
    await api.setWorkflowEnabled(w, false)
    await tick()
    expect(dump('automation_executions')).toHaveLength(0)
    // switched on again later: the old completion is before the new activation, so it does not fire
    await store.update('automation_workflows', w.id, { enabled: true, activated_at: new Date(NOW + 1000).toISOString() })
    await tick()
    expect(dump('automation_executions')).toHaveLength(0)
    // an enabled workflow whose graph got damaged is skipped, not half-run
    await store.update('automation_workflows', w.id, { activated_at: activated, graph: { nodes: [], edges: [] } })
    await tick()
    expect(dump('automation_executions')).toHaveLength(0)
  })

  it('"pause all" stops new runs and resuming picks them up', async () => {
    await workflow({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] })
    await completeTask()
    await api.setAutomationsPaused(true)
    expect(await tick()).toEqual({ ran: 0, paused: true })
    expect(dump('automation_executions')).toHaveLength(0)
    expect(dump('user_settings')[0].automation_prefs.paused).toBe(true)
    await api.setAutomationsPaused(false)
    expect((await tick()).ran).toBe(1)
    expect(dump('user_settings')[0].automation_prefs.paused).toBe(false)
  })
})

describe('updating existing data', () => {
  it('changes only what it was told to, through the normal task path', async () => {
    await workflow({ trigger: { kind: 'task_created', config: {} }, actions: [{ kind: 'update_task', config: { priority: 'urgent', status: 'in_progress', note: 'flagged' } }] })
    const t = await store.insert('tasks', { title: 'New thing', priority: 'low', notes: 'orig' })
    await store.update('automation_workflows', dump('automation_workflows')[0].id, { activated_at: new Date(Date.parse(t.created_at) - 1000).toISOString() })
    await tick()
    expect(dump('tasks')[0]).toMatchObject({ priority: 'urgent', status: 'in_progress', notes: 'orig\nflagged', title: 'New thing' })
    expect(dump('tasks')[0].started_at).toBeTruthy()
  })
  it('completing a task through an automation spawns the next occurrence like the checkbox does', async () => {
    await workflow({ trigger: { kind: 'task_created', config: {} }, actions: [{ kind: 'update_task', config: { status: 'done' } }] })
    const t = await store.insert('tasks', { title: 'Daily', recurrence: 'daily', due_date: TODAY })
    await store.update('automation_workflows', dump('automation_workflows')[0].id, { activated_at: new Date(Date.parse(t.created_at) - 1000).toISOString() })
    await tick()
    expect(dump('tasks').map((x) => x.status).sort()).toEqual(['done', 'pending'])
  })
  it('only moves goal progress that is typed in by hand', async () => {
    const manual = await store.insert('goals', { title: 'Read', manual_progress: 40 })
    const checklist = await store.insert('goals', { title: 'Build', manual_progress: 0 })
    await store.insert('milestones', { goal_id: checklist.id, title: 'm1' })
    await workflow({ trigger: { kind: 'schedule_daily', config: { time: '21:00' } }, actions: [{ kind: 'update_goal_progress', config: { goal_id: manual.id, mode: 'add', value: 10 } }, { kind: 'update_goal_progress', config: { goal_id: checklist.id, mode: 'add', value: 10 } }] })
    await tick()
    expect(dump('goals').find((g) => g.id === manual.id).manual_progress).toBe(50)
    expect(dump('goals').find((g) => g.id === checklist.id).manual_progress).toBe(0)
    const e = dump('automation_executions')[0]
    expect(e.steps[2]).toMatchObject({ status: 'skipped' })
    expect(e.steps[2].detail).toMatch(/calculated and was left alone/)
  })
  it('adds a checklist item (a milestone) once, even from a new run', async () => {
    const g = await store.insert('goals', { title: 'Ship v2' })
    await workflow({ trigger: { kind: 'schedule_daily', config: { time: '21:00' } }, actions: [{ kind: 'add_checklist_item', config: { goal_id: g.id, title: 'Write the changelog' } }] })
    await tick()
    await tick({ today: '2026-11-17', nowMs: zonedToMs('2026-11-17', '21:01', TZ) })
    expect(dump('milestones').map((m) => m.title)).toEqual(['Write the changelog'])
    expect(dump('automation_executions').map((e) => e.status).sort()).toEqual(['completed', 'skipped'])
  })
})

describe('failures and retries', () => {
  const setup = async () => {
    await workflow({ trigger: { kind: 'task_completed', config: {} }, actions: [{ kind: 'notify', config: { title: 'first' } }, { kind: 'create_task', config: { title: 'second' } }] })
    await completeTask()
  }
  it('a temporary failure is recorded, keeps the finished step, and is retried from the step that failed', async () => {
    await setup()
    const net = new AppError('offline', { isNetwork: true })
    store.hooks.fail = (t, op) => t === 'tasks' && op === 'insert'
    store.hooks.fail.error = net
    await tick()
    let [e] = dump('automation_executions')
    expect(e).toMatchObject({ status: 'failed', retryable: true, attempt: 1 })
    expect(e.error).toMatch(/Create task "second".*: offline/)
    expect(e.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'failed'])
    expect(dump('notifications')).toHaveLength(1)
    // not yet: the pause has not passed
    await tick({ nowMs: NOW + 30_000 })
    expect(dump('automation_executions')[0].attempt).toBe(1)
    // the network is back and the pause has passed: the runner picks it up by itself
    store.hooks.fail = null
    const r = await tick({ nowMs: NOW + 70_000 })
    expect(r.retried).toBe(1)
    ;[e] = dump('automation_executions')
    expect(e).toMatchObject({ status: 'completed', attempt: 2, error: '' })
    expect(dump('notifications')).toHaveLength(1) // the first step was NOT repeated
    expect(dump('tasks').filter((t) => t.title === 'second')).toHaveLength(1)
  })
  it('stops retrying after the maximum number of attempts', async () => {
    await setup()
    store.hooks.fail = (t, op) => t === 'tasks' && op === 'insert'
    store.hooks.fail.error = new AppError('offline', { isNetwork: true })
    await tick()
    for (let i = 1; i <= 4; i++) await tick({ nowMs: NOW + i * 10 * 60_000 })
    const [e] = dump('automation_executions')
    expect(e).toMatchObject({ status: 'failed', attempt: 3, retryable: false })
  })
  it('a permanent failure is not retried by itself, but can be by hand', async () => {
    await setup()
    store.hooks.fail = (t, op) => t === 'tasks' && op === 'insert'
    store.hooks.fail.error = Object.assign(new Error('denied'), { code: '42501' })
    await tick()
    expect(dump('automation_executions')[0]).toMatchObject({ status: 'failed', retryable: false })
    await tick({ nowMs: NOW + 3600_000 })
    expect(dump('automation_executions')[0].attempt).toBe(1)
    store.hooks.fail = null
    const done = await api.retryExecution(dump('automation_executions')[0].id, { today: TODAY })
    expect(done.status).toBe('completed')
    expect(dump('automation_executions')[0].attempt).toBe(2)
    expect(dump('notifications')).toHaveLength(1)
    await expect(api.retryExecution(dump('automation_executions')[0].id, { today: TODAY })).rejects.toThrow(/Only a failed run/)
    await expect(api.retryExecution('nope', { today: TODAY })).rejects.toThrow(/no longer exists/)
  })
  it('a task that vanished fails that step with a clear reason', async () => {
    await workflow({ trigger: { kind: 'task_created', config: {} }, actions: [{ kind: 'update_task', config: { priority: 'high' } }] })
    const t = await store.insert('tasks', { title: 'Gone soon', priority: 'low' })
    await store.update('automation_workflows', dump('automation_workflows')[0].id, { activated_at: new Date(Date.parse(t.created_at) - 1000).toISOString() })
    // the plan is made from the cache, then the row disappears (deleted on another device) before the step is applied
    store.hooks.fail = (table, op, patch) => { if (table === 'automation_executions' && patch?.status === 'running') store.peek('tasks').splice(0); return false }
    await tick()
    expect(dump('automation_executions')[0]).toMatchObject({ status: 'failed', retryable: false })
    expect(dump('automation_executions')[0].error).toMatch(/The task no longer exists/)
  })
  it('a run left "running" by a closed tab is failed by the next check, and resumed if it can be', async () => {
    await setup()
    const w = dump('automation_workflows')[0]
    const stuck = await store.insert('automation_executions', {
      workflow_id: w.id, workflow_name: w.name, trigger_kind: 'task_completed', status: 'running', dedupe_key: 'task_completed:old', attempt: 1,
      steps: [{ node_id: 'x', type: 'action', kind: 'notify', status: 'planned', detail: 'Show notification', effect: { op: 'notify', key: 'auto:old', title: 'Late', body: '', priority: 'normal' } }],
    })
    await store.update('automation_executions', stuck.id, { started_at: new Date(NOW - 300_000).toISOString() })
    store.peek('automation_executions').find((e) => e.id === stuck.id).created_at = new Date(NOW - 300_000).toISOString()
    await tick({ nowMs: NOW })
    expect(dump('automation_executions').find((e) => e.id === stuck.id)).toMatchObject({ status: 'failed', retryable: true, error: 'The app was closed before this run finished.' })
    await tick({ nowMs: NOW + 120_000 })
    expect(dump('automation_executions').find((e) => e.id === stuck.id)).toMatchObject({ status: 'completed', attempt: 2 })
    expect(dump('notifications').map((n) => n.title)).toContain('Late')
  })
  it('classifies failures', () => {
    expect(isTemporary(new AppError('x', { isNetwork: true }))).toBe(true)
    expect(isTemporary({ code: '40001' })).toBe(true)
    expect(isTemporary({ status: 503 })).toBe(true)
    expect(isTemporary({ code: '23505' })).toBe(false)
    expect(isTemporary(new AppError('gone', { code: 'gone' }))).toBe(false)
    expect([1, 2, 3].map(backoffMs)).toEqual([60_000, 120_000, 240_000])
  })
})

describe('edge cases of a run', () => {
  const spec = { trigger: { kind: 'task_completed', config: {} }, actions: [notify] }
  it('stops a run that takes too long, and keeps the steps it had not reached', async () => {
    await workflow(spec)
    await completeTask()
    let calls = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (calls++ === 0 ? 1000 : 1000 + 60_000))
    await tick()
    vi.restoreAllMocks()
    const [e] = dump('automation_executions')
    expect(e).toMatchObject({ status: 'failed', retryable: true, error: 'The run took too long and was stopped.' })
    expect(e.steps.find((s) => s.type === 'action')).toMatchObject({ status: 'failed', error: 'Timed out before this step ran.' })
    expect(dump('notifications')).toHaveLength(0)
    store.hooks.fail = null
    expect((await api.retryExecution(e.id, { today: TODAY })).status).toBe('completed')
    expect(dump('notifications')).toHaveLength(1)
  })
  it('a failure before any step was planned leaves a clear failure, and the retry explains itself', async () => {
    await workflow(spec)
    await completeTask()
    store.hooks.fail = (t, op, patch) => t === 'automation_executions' && patch?.status === 'running'
    store.hooks.fail.error = new AppError('offline', { isNetwork: true })
    await tick()
    store.hooks.fail = null
    const [e] = dump('automation_executions')
    expect(e).toMatchObject({ status: 'failed', retryable: true, error: 'offline' })
    await expect(api.retryExecution(e.id, { today: TODAY })).rejects.toThrow(/failed before it did anything/)
    // the runner's own retry gives up quietly on it (nothing to resume), and stops trying
    await tick({ nowMs: NOW + 120_000 })
    expect(dump('automation_executions')[0].retryable).toBe(false)
  })
  it('refuses to retry a run that has been retried ten times', async () => {
    const w = await workflow(spec)
    const e = await store.insert('automation_executions', { workflow_id: w.id, workflow_name: 'x', status: 'failed', attempt: 10, dedupe_key: 'ten', steps: [{ type: 'action', status: 'failed', effect: { op: 'none' } }] })
    await expect(api.retryExecution(e.id, { today: TODAY })).rejects.toThrow(/too many times/)
  })
  it('lets an unexpected database error surface instead of hiding it', async () => {
    await workflow(spec)
    await completeTask()
    store.hooks.fail = (t, op) => t === 'automation_executions' && op === 'insert'
    store.hooks.fail.error = Object.assign(new Error('broken'), { code: 'XX000' })
    await expect(tick()).rejects.toThrow('broken')
  })
  it('starts at most 25 runs per check, across workflows, and finishes the rest on the next', async () => {
    const a = await workflow(spec, { name: 'A' })
    const b = await workflow(spec, { name: 'B' })
    for (const w of [a, b]) await store.update('automation_workflows', w.id, { activated_at: activated })
    for (let i = 0; i < 20; i++) await completeTask(`T${i}`)
    await tick()
    expect(dump('automation_executions')).toHaveLength(25)
    await tick()
    expect(dump('automation_executions')).toHaveLength(40)
  })
})

describe('limits and loops', () => {
  it('stops at the daily limit, leaves one trace row, and never floods', async () => {
    // (the in-memory database stamps rows from 2026-01-01, so this test runs on that day)
    const day = { tz: TZ, today: '2026-01-01', nowMs: Date.UTC(2026, 0, 1, 1, 0) }
    const w = await workflow({ trigger: { kind: 'task_completed', config: {} }, actions: [{ kind: 'complete', config: {} }] }, { max_runs_per_day: 3 })
    await store.update('automation_workflows', w.id, { activated_at: '2026-01-01T00:00:00Z' })
    for (let i = 0; i < 6; i++) await store.insert('tasks', { title: `T${i}`, status: 'done', completed_at: '2026-01-01T00:30:00Z' })
    await tick(day)
    await tick(day)
    const rows = dump('automation_executions')
    expect(rows.filter((e) => e.status === 'completed')).toHaveLength(3)
    const limited = rows.filter((e) => e.status === 'skipped')
    expect(limited).toHaveLength(1)
    expect(limited[0].reason).toBe('Daily limit of 3 runs reached for this workflow.')
  })
  it('a task an automation made never starts a "task created" automation (no loops)', async () => {
    await workflow({ trigger: { kind: 'task_created', config: {} }, actions: [{ kind: 'create_task', config: { title: 'Echo' } }] })
    const t = await store.insert('tasks', { title: 'Seed' })
    await store.update('automation_workflows', dump('automation_workflows')[0].id, { activated_at: new Date(Date.parse(t.created_at) - 1000).toISOString() })
    for (let i = 0; i < 4; i++) await tick({ nowMs: NOW + i * 1000 })
    expect(dump('tasks').map((x) => x.title).sort()).toEqual(['Echo', 'Seed'])
    expect(dump('automation_executions').filter((e) => e.status === 'completed')).toHaveLength(1)
  })
  it('a workflow whose data cannot be loaded is skipped, not treated as "nothing happened"', async () => {
    await workflow({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] })
    await completeTask()
    const load = store.load
    store.isReady = (t) => t !== 'tasks'
    await tick()
    expect(dump('automation_executions')).toHaveLength(0)
    store.isReady = () => true
    store.load = load
    await tick()
    expect(dump('automation_executions')).toHaveLength(1)
  })
})

describe('isolation between people', () => {
  it('never reads or runs another person\'s workflows', async () => {
    await workflow({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] })
    await completeTask()
    const b = connect(B)
    await b.s.insert('tasks', { title: 'B task', status: 'done', completed_at: new Date(NOW - 500).toISOString() })
    const r = await b.a.runAutomations(o)
    expect(r).toEqual({ ran: 0 })
    expect(b.s.peek('automation_workflows')).toEqual([])
    expect(b.s.peek('automation_executions')).toEqual([])
    // and A's own run is not affected by B's rows
    setUserId(A)
    await tick()
    expect(dump('automation_executions')).toHaveLength(1)
    expect(dump('automation_executions')[0].trigger_info.label).toBe('Pay rent')
  })
})

describe('deleting a workflow', () => {
  it('keeps its history, which still says what it was called', async () => {
    const w = await workflow({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] })
    await completeTask()
    await tick()
    await store.remove('automation_workflows', w.id)
    expect(dump('automation_workflows')).toHaveLength(0)
    expect(dump('automation_executions')[0]).toMatchObject({ workflow_id: null, workflow_name: 'Test flow', status: 'completed' })
  })
  it('the sample workflow in the tests is valid', () => {
    expect(validateWorkflow({ name: 'x', graph: chain({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] }) }).ok).toBe(true)
  })
})
