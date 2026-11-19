import { beforeEach, describe, expect, it } from 'vitest'
import { adapterContract, CONTRACT_USERS } from '../src/testing/adapterContract'
import { createMemorySupabase } from '../src/testing/memorySupabase'
import { createSupabaseAdapter } from '../src/supabaseAdapter'
import { setUserId } from '../src/session'

const { A, B } = CONTRACT_USERS
// The production adapter, driven through the fake Supabase client.
adapterContract({ describe, it, expect, beforeEach }, 'supabaseAdapter (over in-memory Supabase fake)', async () => {
  const client = createMemorySupabase()
  return { adapter: createSupabaseAdapter(client), as: setUserId, reset: async () => { for (const k of Object.keys(client.tables)) delete client.tables[k] } }
})

describe('supabaseAdapter specifics', () => {
  let client, adapter
  beforeEach(() => { client = createMemorySupabase(); adapter = createSupabaseAdapter(client); setUserId(A) })

  it('realtime events are filtered by ownership: B never hears about A\'s changes', async () => {
    const seenByB = [], seenByA = []
    setUserId(B); const offB = adapter.subscribe((t) => seenByB.push(t), () => {})
    setUserId(A); const offA = adapter.subscribe((t) => seenByA.push(t), () => {})
    await new Promise((r) => setTimeout(r, 5))
    await adapter.insert('tasks', [{ title: 'private', due_date: '2026-11-02' }])
    await new Promise((r) => setTimeout(r, 5))
    expect(seenByA).toContain('tasks')
    expect(seenByB).toEqual([])
    offA(); offB()
  })
  it('an unauthenticated client (anon) can read and write nothing', async () => {
    await adapter.insert('tasks', [{ title: 'x', due_date: '2026-11-02' }])
    setUserId(null)
    await expect(adapter.list('tasks')).rejects.toMatchObject({ message: expect.stringMatching(/permission|sign in/i) })
    await expect(adapter.insert('tasks', [{ title: 'y' }])).rejects.toBeTruthy()
  })
  it('pages with order + range in 1000-row steps and stops on a short page', async () => {
    await adapter.insert('tasks', Array.from({ length: 2000 }, (_, i) => ({ title: `t${i}`, due_date: '2026-11-02' })))
    const calls = []
    const spy = { ...client, from: (t) => { const q = client.from(t); const orig = q.range.bind(q); q.range = (a, b) => { calls.push([a, b]); return orig(a, b) }; return q } }
    const rows = await createSupabaseAdapter(spy).list('tasks')
    expect(rows).toHaveLength(2000)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]) // the final empty page ends the loop
  })
  it('removeMany deletes a long id list in slices of 100 (the ids travel in the URL)', async () => {
    const rows = await adapter.insert('tasks', Array.from({ length: 250 }, (_, i) => ({ title: `t${i}`, due_date: '2026-11-02' })))
    const sizes = []
    const spy = { ...client, from: (t) => { const q = client.from(t); const orig = q.in.bind(q); q.in = (c, v) => { sizes.push(v.length); return orig(c, v) }; return q } }
    await createSupabaseAdapter(spy).removeMany('tasks', rows.map((r) => r.id))
    expect(sizes).toEqual([100, 100, 50])
    expect(await adapter.list('tasks')).toEqual([])
    sizes.length = 0
    await createSupabaseAdapter(spy).removeMany('tasks', [])
    expect(sizes).toEqual([]) // nothing to delete: no request at all
  })
  it('a delete that RLS quietly refuses (row visible, 0 rows deleted) is an error, not a success', async () => {
    const [row] = await adapter.insert('tasks', [{ title: 'locked', due_date: '2026-11-02' }])
    const refusing = { ...client, from: (t) => { const q = client.from(t); q.delete = () => { q.filters.push(() => false); return q }; return q } } // deletes nothing and reports 0 rows, like a restrictive policy
    const locked = createSupabaseAdapter(refusing)
    await expect(locked.remove('tasks', row.id)).rejects.toMatchObject({ code: '42501', message: expect.stringMatching(/locked/) })
    await expect(locked.removeMany('tasks', [row.id])).rejects.toMatchObject({ code: '42501' })
    expect(await adapter.list('tasks')).toHaveLength(1)
    await adapter.remove('tasks', 'already-gone') // a row that is simply not there any more is fine
  })
  it('a row seen on two pages (offset paging during an insert) is returned once', async () => {
    await adapter.insert('tasks', Array.from({ length: 1000 }, (_, i) => ({ title: `t${i}`, due_date: '2026-11-02' })))
    let first = true
    const spy = { ...client, from: (t) => { const q = client.from(t); const orig = q.range.bind(q); q.range = (a, b) => (first ? ((first = false), orig(a, b)) : orig(a - 1, b)); return q } }
    const rows = await createSupabaseAdapter(spy).list('tasks')
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
    expect(rows).toHaveLength(1000)
  })
  it('application_history is paged by changed_at (it has no created_at)', async () => {
    const order = []
    const spy = { ...client, from: (t) => { const q = client.from(t); const o = q.order.bind(q); q.order = (c, x) => { order.push(c); return o(c, x) }; return q } }
    await createSupabaseAdapter(spy).list('application_history')
    expect(order).toEqual(['changed_at', 'id'])
  })
  it('a rejected write surfaces a friendly AppError (code kept, no internals leaked)', async () => {
    await adapter.insert('habit_logs', [{ habit_id: 'h', log_date: '2026-11-02' }])
    const e = await adapter.insert('habit_logs', [{ habit_id: 'h', log_date: '2026-11-02' }]).catch((x) => x)
    expect(e.name).toBe('AppError')
    expect(e.code).toBe('23505')
    expect(e.message).toBe('That record already exists.')
  })
})
