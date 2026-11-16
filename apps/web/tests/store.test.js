import { beforeEach, describe, expect, it, vi } from 'vitest'

// A controllable fake database so the store's concurrency behaviour can be tested deterministically.
const fake = vi.hoisted(() => ({
  list: null,
  insert: null,
  rpc: null,
  subscribe: () => () => {},
  update: null,
  upsert: null,
  remove: null,
  removeMany: null,
}))
vi.mock('@/services/db', () => ({ db: fake, isDevMode: false }))

const store = await import('@/hooks/store')

const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
const rows = (...ids) => ids.map((id) => ({ id, updated_at: '2026-01-01T00:00:00Z' }))

beforeEach(() => {
  store.resetStore()
  vi.useRealTimers()
})

describe('store: stale fetches', () => {
  it('discards a fetch that started before a local write and fetches again', async () => {
    const first = deferred()
    const calls = []
    fake.list = vi.fn((t) => {
      calls.push(t)
      return calls.length === 1 ? first.promise : Promise.resolve([{ id: 'a', v: 2 }])
    })
    fake.insert = vi.fn(async (t, r) => r.map((x) => ({ ...x, id: 'a', v: 2 })))

    const loading = store.load('tasks') // fetch #1 starts (slow, will return the OLD snapshot)
    await store.insert('tasks', { title: 'x' }) // write lands while it is in flight
    first.resolve([]) // old snapshot without the new row arrives late
    await loading

    expect(calls.length).toBe(2) // stale result was thrown away and re-fetched
    expect(store.peek('tasks')).toEqual([{ id: 'a', v: 2 }])
  })

  it('a forced refetch during an in-flight fetch runs again instead of joining the (possibly stale) one', async () => {
    const first = deferred()
    let n = 0
    fake.list = vi.fn(() => (++n === 1 ? first.promise : Promise.resolve(rows('new'))))
    const p = store.load('notes')
    store.refetch('notes') // remote change arrives mid-flight
    first.resolve(rows('old'))
    await p
    expect(fake.list).toHaveBeenCalledTimes(2)
    expect(store.peek('notes').map((r) => r.id)).toEqual(['new'])
  })

  it('keeps showing existing data when a background refresh fails', async () => {
    fake.list = vi.fn().mockResolvedValueOnce(rows('a')).mockRejectedValueOnce(new Error('boom'))
    await store.load('goals')
    await store.refetch('goals')
    expect(store.peek('goals').map((r) => r.id)).toEqual(['a'])
  })

  it('a failed FIRST load surfaces an error state', async () => {
    fake.list = vi.fn().mockRejectedValue(new Error('down'))
    await store.load('habits')
    const { renderHook } = await import('@testing-library/react')
    const { result } = renderHook(() => store.useTable('habits'))
    expect(result.current.error).toMatch(/down/)
  })
})

describe('store: realtime changes are applied without refetching', () => {
  beforeEach(async () => {
    fake.list = vi.fn().mockResolvedValue(rows('a', 'b'))
    await store.load('tasks')
    fake.list.mockClear()
  })

  it('INSERT adds a row', () => {
    store.applyChange('tasks', { eventType: 'INSERT', new: { id: 'c', updated_at: '2026-01-02T00:00:00Z' } })
    expect(store.peek('tasks').map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(fake.list).not.toHaveBeenCalled()
  })
  it('DELETE removes a row', () => {
    store.applyChange('tasks', { eventType: 'DELETE', old: { id: 'a' } })
    expect(store.peek('tasks').map((r) => r.id)).toEqual(['b'])
  })
  it('ignores an echo of data we already hold (no state change)', () => {
    const before = store.peek('tasks')
    store.applyChange('tasks', { eventType: 'UPDATE', new: { id: 'a', updated_at: '2026-01-01T00:00:00Z' } })
    expect(store.peek('tasks')).toBe(before)
  })
  it('ignores an update older than the cached row', async () => {
    store.applyChange('tasks', { eventType: 'UPDATE', new: { id: 'a', updated_at: '2026-01-05T00:00:00Z', title: 'new' } })
    store.applyChange('tasks', { eventType: 'UPDATE', new: { id: 'a', updated_at: '2026-01-03T00:00:00Z', title: 'older' } })
    expect(store.peek('tasks').find((r) => r.id === 'a').title).toBe('new')
  })
})

describe('store: realtime merge', () => {
  it('keeps columns missing from the payload', async () => {
    fake.list = vi.fn().mockResolvedValue([{ id: 'n', body: 'long text', updated_at: '2026-01-01T00:00:00Z' }])
    await store.load('notes')
    store.applyChange('notes', { eventType: 'UPDATE', new: { id: 'n', title: 'T', updated_at: '2026-01-02T00:00:00Z' } })
    expect(store.peek('notes')[0]).toMatchObject({ body: 'long text', title: 'T' })
  })
  it('an UPDATE for a row we never saw triggers a refetch', async () => {
    vi.useFakeTimers()
    fake.list = vi.fn().mockResolvedValue(rows('a'))
    await store.load('notes')
    fake.list.mockClear()
    store.applyChange('notes', { eventType: 'UPDATE', new: { id: 'zz', updated_at: '2026-01-02T00:00:00Z' } })
    await vi.advanceTimersByTimeAsync(300)
    expect(fake.list).toHaveBeenCalledTimes(1)
  })
  it('events without a payload (DEV adapter) fall back to a refetch', async () => {
    vi.useFakeTimers()
    fake.list = vi.fn().mockResolvedValue(rows('a'))
    await store.load('notes')
    fake.list.mockClear()
    store.applyChange('notes', undefined)
    await vi.advanceTimersByTimeAsync(300)
    expect(fake.list).toHaveBeenCalledTimes(1)
  })
  it('ignores changes for tables that are not loaded', () => {
    fake.list = vi.fn()
    store.applyChange('budgets', { eventType: 'INSERT', new: { id: 'x' } })
    expect(fake.list).not.toHaveBeenCalled()
  })
})

describe('store: optimistic writes', () => {
  const seed = async (table, list) => {
    fake.list = vi.fn().mockResolvedValue(list)
    await store.load(table)
  }

  it('update shows at once, then keeps the confirmed row', async () => {
    await seed('tasks', [{ id: 't1', status: 'pending', title: 'A' }])
    const d = deferred()
    fake.update = vi.fn(() => d.promise)
    const p = store.update('tasks', 't1', { status: 'done' })
    expect(store.peek('tasks')[0].status).toBe('done') // before the server answers
    d.resolve({ id: 't1', status: 'done', title: 'A', updated_at: 'x' })
    await p
    expect(store.peek('tasks')[0]).toMatchObject({ status: 'done', updated_at: 'x' })
  })

  it('update rolls back only its own fields when the request fails', async () => {
    await seed('tasks', [{ id: 't1', status: 'pending', title: 'A' }])
    const a = deferred()
    fake.update = vi.fn(() => a.promise)
    const p = store.update('tasks', 't1', { status: 'done' })
    store.patch('tasks', [{ ...store.peek('tasks')[0], title: 'B' }]) // something else edited the title meanwhile
    a.reject(new Error('offline'))
    await expect(p).rejects.toBeTruthy()
    expect(store.peek('tasks')[0]).toMatchObject({ status: 'pending', title: 'B' })
  })

  it('insert appears immediately with defaults, is swapped for the real row, and vanishes if it fails', async () => {
    await seed('notes', [])
    const d = deferred()
    fake.insert = vi.fn(() => d.promise)
    const p = store.insert('notes', { title: 'Hi' })
    expect(store.peek('notes')).toHaveLength(1)
    expect(store.peek('notes')[0]).toMatchObject({ title: 'Hi' })
    const id = store.peek('notes')[0].id
    expect(fake.insert.mock.calls[0][1][0].id).toBe(id) // the stand-in already has the id the row will keep
    d.resolve([{ id, title: 'Hi' }])
    await p
    expect(store.peek('notes')).toEqual([{ id, title: 'Hi' }])

    fake.insert = vi.fn().mockRejectedValue(new Error('nope'))
    await expect(store.insert('notes', { title: 'Bad' })).rejects.toBeTruthy()
    expect(store.peek('notes').map((r) => r.id)).toEqual([id])
  })

  it('a Realtime echo of an insert never leaves a duplicate, and the id never changes', async () => {
    await seed('notes', [])
    const d = deferred()
    fake.insert = vi.fn(() => d.promise)
    const p = store.insert('notes', { title: 'Hi' })
    const id = store.peek('notes')[0].id
    store.applyChange('notes', { eventType: 'INSERT', new: { id, title: 'Hi' } }) // echo arrives before the response
    d.resolve([{ id, title: 'Hi' }])
    await p
    expect(store.peek('notes').map((r) => r.id)).toEqual([id])
  })

  it('notifications are never guessed: another device may win the race to raise the same one', async () => {
    await seed('notifications', [])
    const d = deferred()
    fake.insert = vi.fn(() => d.promise)
    const p = store.insert('notifications', { title: 'Due today' })
    expect(store.peek('notifications')).toHaveLength(0)
    d.resolve([{ id: 'n1', title: 'Due today' }])
    await p
    expect(store.peek('notifications').map((r) => r.id)).toEqual(['n1'])
  })

  it('remove hides the row at once and restores it on failure', async () => {
    await seed('goals', [{ id: 'g1' }, { id: 'g2' }])
    const d = deferred()
    fake.remove = vi.fn(() => d.promise)
    const p = store.remove('goals', 'g1')
    expect(store.peek('goals').map((r) => r.id)).toEqual(['g2'])
    d.reject(new Error('denied'))
    await expect(p).rejects.toBeTruthy()
    expect(
      store
        .peek('goals')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['g1', 'g2'])
  })

  it('upsert on an existing conflict key changes that row instead of adding one', async () => {
    await seed('habit_logs', [{ id: 'l1', habit_id: 'h', log_date: '2026-01-01', status: 'done' }])
    const d = deferred()
    fake.upsert = vi.fn(() => d.promise)
    const p = store.upsert('habit_logs', { habit_id: 'h', log_date: '2026-01-01', status: 'skipped' }, { onConflict: 'habit_id,log_date' })
    expect(store.peek('habit_logs')).toHaveLength(1)
    expect(store.peek('habit_logs')[0].status).toBe('skipped')
    d.reject(new Error('x'))
    await expect(p).rejects.toBeTruthy()
    expect(store.peek('habit_logs')).toEqual([{ id: 'l1', habit_id: 'h', log_date: '2026-01-01', status: 'done' }])
  })

  it('a background refetch does not undo a write that is still in flight', async () => {
    await seed('tasks', [{ id: 't1', status: 'pending' }])
    const d = deferred()
    fake.update = vi.fn(() => d.promise)
    fake.list = vi.fn().mockResolvedValue([{ id: 't1', status: 'pending' }]) // the server has not seen the write yet
    const p = store.update('tasks', 't1', { status: 'done' })
    await store.refetch('tasks')
    expect(store.peek('tasks')[0].status).toBe('done')
    fake.list = vi.fn().mockResolvedValue([{ id: 't1', status: 'done' }])
    d.resolve({ id: 't1', status: 'done' })
    await p
    expect(store.peek('tasks')[0].status).toBe('done')
  })
})
