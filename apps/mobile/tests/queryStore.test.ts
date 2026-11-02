import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createApi } from '@lifetrack/data'
import { createQueryStore, tableKey, type DbAdapter } from '../src/data/queryStore'

const setup = () => {
  const qc = new QueryClient()
  let n = 0
  const tables: Record<string, any[]> = { tasks: [{ id: 'a', title: 'one' }], study_sessions: [] }
  const db: DbAdapter = {
    list: vi.fn(async (t) => [...(tables[t] ?? [])]),
    insert: vi.fn(async (t, rows) => rows.map((r: any) => { const row = { id: 'n' + ++n, ...r }; (tables[t] ??= []).push(row); return row as any })),
    update: vi.fn(async (t, id, patch) => { const r = tables[t].find((x) => x.id === id); Object.assign(r, patch); return { ...r } }),
    upsert: vi.fn(async (t, rows) => rows.map((r: any, i: number) => ({ id: 'u' + i, ...r }))),
    remove: vi.fn(async (t, id) => { tables[t] = tables[t].filter((x) => x.id !== id) }),
    removeMany: vi.fn(async (t, ids) => { tables[t] = tables[t].filter((x) => !ids.includes(x.id)) }),
  }
  return { qc, db, store: createQueryStore(db, qc), tables }
}

describe('query store (createApi contract)', () => {
  it('loads once, then serves the cache', async () => {
    const { db, store } = setup()
    await store.load('tasks'); await store.load('tasks')
    expect(db.list).toHaveBeenCalledTimes(1)
    expect(store.peek('tasks')).toHaveLength(1)
  })
  it('patches the cache from confirmed write responses only', async () => {
    const { store, qc, db } = setup()
    await store.load('tasks')
    const created = await store.insert('tasks', { title: 'two' })
    expect((created as any).id).toBe('n1')
    await store.update('tasks', 'a', { title: 'ONE' })
    expect(store.peek('tasks').map((r) => r.title)).toEqual(['ONE', 'two'])
    ;(db.insert as any).mockRejectedValueOnce(new Error('offline'))
    await expect(store.insert('tasks', { title: 'x' })).rejects.toThrow('offline')
    expect(qc.getQueryData<any[]>(tableKey('tasks'))).toHaveLength(2)
    await store.remove('tasks', 'a')
    expect(store.peek('tasks').map((r) => r.id)).toEqual(['n1'])
  })
  it('returns arrays for array input and single rows otherwise', async () => {
    const { store } = setup()
    expect(Array.isArray(await store.insert('tasks', [{ title: 'a' }, { title: 'b' }]))).toBe(true)
  })
  it('invalidates trigger-written tables', async () => {
    const { store, qc } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await store.insert('job_applications', { company: 'X' })
    expect(spy).toHaveBeenCalledWith({ queryKey: tableKey('application_history') })
  })
  it('drives the shared createApi (one running study timer rule + task creation)', async () => {
    const { store, db } = setup()
    const api = createApi(store as any)
    await api.createTask({ title: 'daily', recurrence: 'daily', due_date: '2024-05-01' })
    expect((db.insert as any).mock.calls[0][1][0].series_id).toBeTruthy()
    await api.startStudy({}, '2024-05-01')
    await expect(api.startStudy({}, '2024-05-01')).rejects.toThrow(/already running/i)
  })
})
