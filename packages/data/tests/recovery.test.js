import { beforeEach, describe, expect, it } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import { planRecovery } from '@lifetrack/core/recovery'
import { createApi } from '../src/api'
import { createMemorySupabase } from '../src/testing/memorySupabase'
import { createSupabaseAdapter } from '../src/supabaseAdapter'
import { withSchemaValidation } from '../src/validatingAdapter'
import { setUserId } from '../src/session'
import { insertSchemas, updateSchemas } from '@lifetrack/schemas'

const A = '11111111-1111-4111-8111-111111111111'
const TZ = 'Asia/Kolkata'
const TODAY = '2026-11-10'
const NOW = zonedToMs(TODAY, '10:00', TZ)
const o = { tz: TZ, today: TODAY, nowMs: NOW }
const at = (d, t) => new Date(zonedToMs(d, t, TZ)).toISOString()

function makeStore(adapter) {
  const cache = new Map()
  const rows = (t) => cache.get(t) ?? []
  const merge = (t, incoming) => { const cur = [...rows(t)]; for (const r of incoming) { const i = cur.findIndex((x) => x.id === r.id); if (i >= 0) cur[i] = r; else cur.push(r) } cache.set(t, cur) }
  const drop = (t, ids) => cache.set(t, rows(t).filter((r) => !ids.includes(r.id)))
  const one = (input, out) => (Array.isArray(input) ? out : out[0])
  const hooks = { failTaskUpdate: false }
  return {
    hooks,
    peek: rows,
    load: async (t) => { if (!cache.has(t)) cache.set(t, await adapter.list(t)) },
    refetch: async (t) => { cache.set(t, await adapter.list(t)) },
    insert: async (t, input) => { const out = await adapter.insert(t, Array.isArray(input) ? input : [input]); merge(t, out); return one(input, out) },
    update: async (t, id, patch) => { if (t === 'tasks' && hooks.failTaskUpdate) throw new Error('boom'); const r = await adapter.update(t, id, patch); merge(t, [r]); return r },
    upsert: async (t, input, opts) => { const out = await adapter.upsert(t, Array.isArray(input) ? input : [input], opts); merge(t, out); return one(input, out) },
    rpc: (fn, args) => adapter.rpc(fn, args),
    patch: (t, incoming) => merge(t, incoming),
    patchGroup: (t, dropFn, incoming) => cache.set(t, [...rows(t).filter((r) => !dropFn(r)), ...incoming]),
    remove: async (t, id) => { await adapter.remove(t, id); drop(t, [id]) },
    removeMany: async (t, ids) => { await adapter.removeMany(t, ids); drop(t, ids) },
  }
}

let client, store, api, adapter
beforeEach(() => {
  client = createMemorySupabase()
  setUserId(A)
  adapter = withSchemaValidation(createSupabaseAdapter(client), { insertSchemas, updateSchemas })
  store = makeStore(adapter)
  api = createApi(store)
})
const dump = (t) => client.dump(t)
const slipped = (x = {}) => store.insert('tasks', { title: 'Write report', priority: 'high', due_date: '2026-11-08', ...x })
const change = (t, to, extra = {}) => ({ taskId: t.id, from: { date: t.due_date, start: t.start_time?.slice(0, 5) ?? null, end: t.end_time?.slice(0, 5) ?? null }, to, ...extra })
const loadAll = () => Promise.all(['tasks', 'task_reschedules', 'calendar_events', 'calendar_event_exceptions', 'interview_events', 'habits', 'habit_logs'].map((t) => store.refetch(t)))
const suggest = async () => {
  await loadAll()
  return planRecovery({ tasks: store.peek('tasks'), events: store.peek('calendar_events'), exceptions: store.peek('calendar_event_exceptions'), reschedules: store.peek('task_reschedules') }, o)
}

describe('applyReschedules', () => {
  it('moves the task and records exactly one history row', async () => {
    const t = await slipped()
    const to = { date: TODAY, start: '11:00', end: '12:00' }
    const r = await api.applyReschedules([change(t, to, { reason: 'High priority · 2 days overdue' })], o)
    expect(r.skipped).toEqual([])
    expect(r.applied).toHaveLength(1)
    expect(dump('tasks')[0]).toMatchObject({ due_date: TODAY, start_time: '11:00', end_time: '12:00' })
    const [h] = dump('task_reschedules')
    expect(h).toMatchObject({ task_id: t.id, action: 'rescheduled', title: 'Write report', from_date: '2026-11-08', from_start: null, to_date: TODAY, to_start: '11:00', reason: 'High priority · 2 days overdue' })
    expect(h.batch_id).toBe(r.batchId)
    expect(h.dedupe_key).toBe(`rs:${t.id}:2026-11-08:-:${TODAY}:11:00`)
  })

  it('applies one suggestion once, even if the button is pressed twice', async () => {
    const t = await slipped()
    const c = change(t, { date: TODAY, start: '11:00', end: '12:00' })
    const [first, second] = await Promise.all([api.applyReschedules([c], o), api.applyReschedules([c], o)])
    expect(first.applied.length + second.applied.length).toBe(1)
    expect(dump('task_reschedules')).toHaveLength(1)
    const again = await api.applyReschedules([c], o)
    expect(again.applied).toHaveLength(0)
    expect(again.skipped[0].code).toBe('changed') // already moved, so no longer where the suggestion found it
  })

  it('stops a second device that holds the same stale suggestion (the key is the lock)', async () => {
    const t = await slipped()
    const c = change(t, { date: TODAY, start: '11:00', end: '12:00' })
    await store.insert('task_reschedules', { task_id: t.id, action: 'rescheduled', from_date: c.from.date, to_date: TODAY, to_start: '11:00', to_end: '12:00', dedupe_key: `rs:${t.id}:2026-11-08:-:${TODAY}:11:00` })
    const r = await api.applyReschedules([c], o)
    expect(r.skipped).toEqual([{ taskId: t.id, code: 'duplicate', message: 'That move was already applied.' }])
    expect(dump('tasks')[0].due_date).toBe('2026-11-08') // untouched
  })

  it('refuses a stale suggestion when the task changed in the meantime', async () => {
    const t = await slipped()
    await adapter.update('tasks', t.id, { due_date: '2026-11-09' }) // another device
    const r = await api.applyReschedules([change(t, { date: TODAY, start: '11:00', end: '12:00' })], o)
    expect(r.skipped[0].code).toBe('changed')
    expect(dump('tasks')[0].due_date).toBe('2026-11-09')
    const done = await slipped({ title: 'Done elsewhere' })
    await adapter.update('tasks', done.id, { status: 'done' })
    expect((await api.applyReschedules([change(done, { date: TODAY, start: '11:00', end: '12:00' })], o)).skipped[0].code).toBe('closed')
    await adapter.remove('tasks', done.id)
    expect((await api.applyReschedules([change(done, { date: TODAY, start: '11:00', end: '12:00' })], o)).skipped[0].code).toBe('missing')
  })

  it('validates conflicts on fresh data, leaving nothing behind', async () => {
    const t = await slipped()
    await adapter.insert('calendar_events', [{ title: 'Review', starts_at: at(TODAY, '11:30'), ends_at: at(TODAY, '12:30'), timezone: TZ }]) // added on another device
    const r = await api.applyReschedules([change(t, { date: TODAY, start: '11:00', end: '12:00' })], o)
    expect(r.applied).toHaveLength(0)
    expect(r.skipped[0]).toMatchObject({ code: 'overlap' })
    expect(r.skipped[0].message).toMatch(/Review/)
    expect(dump('task_reschedules')).toHaveLength(0)
    expect(dump('tasks')[0].start_time).toBeFalsy()
    const past = await api.applyReschedules([change(t, { date: TODAY, start: '08:00', end: '09:00' })], o)
    expect(past.skipped[0].code).toBe('past')
  })

  it('does not let two changes in one batch overlap each other', async () => {
    const a = await slipped({ title: 'A' })
    const b = await slipped({ title: 'B' })
    const r = await api.applyReschedules([change(a, { date: TODAY, start: '11:00', end: '12:00' }), change(b, { date: TODAY, start: '11:30', end: '12:30' })], o)
    expect(r.applied).toHaveLength(1)
    expect(r.skipped[0]).toMatchObject({ taskId: b.id, code: 'overlap' })
    expect(new Set(dump('task_reschedules').map((h) => h.batch_id)).size).toBe(1)
  })

  it('removes its claim when saving the task fails, so a retry works', async () => {
    const t = await slipped()
    const c = change(t, { date: TODAY, start: '11:00', end: '12:00' })
    store.hooks.failTaskUpdate = true
    const r = await api.applyReschedules([c], o)
    expect(r.skipped[0].code).toBe('failed')
    expect(dump('task_reschedules')).toHaveLength(0)
    store.hooks.failTaskUpdate = false
    expect((await api.applyReschedules([c], o)).applied).toHaveLength(1)
  })

  it('applies what the engine suggests, as a whole plan', async () => {
    await slipped({ title: 'A', priority: 'urgent' })
    await slipped({ title: 'B', priority: 'low', due_date: '2026-11-05' })
    const { suggestions } = await suggest()
    const r = await api.applyReschedules(suggestions.map((s) => ({ taskId: s.taskId, from: s.from, to: s.to, kind: s.kind, reason: s.reasons.join(' · ') })), o)
    expect(r.skipped).toEqual([])
    expect(r.applied).toHaveLength(2)
    expect((await suggest()).suggestions).toHaveLength(0) // nothing left to recover
  })

  it('does nothing for an empty list', async () => {
    expect(await api.applyReschedules([], o)).toEqual({ applied: [], skipped: [], batchId: null })
  })
})

describe('undoReschedules', () => {
  it('puts the task back and lets the same move be accepted again', async () => {
    const t = await slipped({ start_time: '09:00', end_time: '10:00' })
    const c = change(t, { date: '2026-11-11', start: '14:00', end: '15:00' })
    const { applied } = await api.applyReschedules([c], o)
    const r = await api.undoReschedules(applied.map((h) => h.id))
    expect(r.undone).toHaveLength(1)
    expect(dump('tasks')[0]).toMatchObject({ due_date: '2026-11-08', start_time: '09:00', end_time: '10:00' })
    expect(dump('task_reschedules')[0].undone_at).toBeTruthy()
    expect((await api.applyReschedules([c], o)).applied).toHaveLength(1) // the key was freed
    expect(dump('task_reschedules')).toHaveLength(2)
  })
  it('restores an untimed task to untimed', async () => {
    const t = await slipped()
    const { applied } = await api.applyReschedules([change(t, { date: TODAY, start: '11:00', end: '12:00' })], o)
    await api.undoReschedules([applied[0].id])
    expect(dump('tasks')[0].start_time).toBeNull()
  })
  it('leaves a task alone that was edited again, and ignores a move already undone', async () => {
    const t = await slipped()
    const { applied } = await api.applyReschedules([change(t, { date: TODAY, start: '11:00', end: '12:00' })], o)
    await adapter.update('tasks', t.id, { due_date: '2026-11-12' })
    const r = await api.undoReschedules([applied[0].id])
    expect(r.skipped[0].code).toBe('changed')
    await adapter.update('tasks', t.id, { due_date: TODAY })
    expect((await api.undoReschedules([applied[0].id])).undone).toHaveLength(1)
    expect((await api.undoReschedules([applied[0].id])).skipped[0].code).toBe('not_applicable')
  })
})

describe('dismissRecovery', () => {
  it('records a quiet period once per task and day, and the plan honours it', async () => {
    const t = await slipped()
    const item = { taskId: t.id, title: t.title, from: { date: t.due_date, start: null, end: null } }
    expect(await api.dismissRecovery([item], '2026-11-13')).toBe(1)
    expect(await api.dismissRecovery([item], '2026-11-13')).toBe(0)
    expect(dump('task_reschedules')[0]).toMatchObject({ action: 'dismissed', hide_until: '2026-11-13', to_date: null })
    expect((await suggest()).suggestions).toHaveLength(0)
  })
})

describe('history lifecycle', () => {
  it('deleting a task removes its history', async () => {
    const t = await slipped()
    await api.applyReschedules([change(t, { date: TODAY, start: '11:00', end: '12:00' })], o)
    await adapter.remove('tasks', t.id)
    expect(dump('task_reschedules')).toHaveLength(0)
  })
  it('keeps every reschedule of a task, newest last, for the history list', async () => {
    const t = await slipped()
    const first = await api.applyReschedules([change(t, { date: TODAY, start: '11:00', end: '12:00' })], o)
    const moved = dump('tasks')[0]
    await api.applyReschedules([change(moved, { date: '2026-11-11', start: '09:00', end: '10:00' })], o)
    const rows = dump('task_reschedules')
    expect(rows.map((r) => r.to_date)).toEqual([TODAY, '2026-11-11'])
    expect(first.applied[0].id).toBe(rows[0].id)
    expect((await suggest()).suggestions).toHaveLength(0)
  })
})
