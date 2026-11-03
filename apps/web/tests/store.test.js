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
