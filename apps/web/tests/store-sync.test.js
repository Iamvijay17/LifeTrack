import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({ list: vi.fn(), emit: null, status: null }))
vi.mock('@/services/db', () => ({
  db: {
    list: mocks.list,
    subscribe: (onChange, onStatus) => {
      mocks.emit = onChange
      mocks.status = onStatus
      return () => {}
    },
  },
}))

const store = await import('@/hooks/store')

const calls = () => mocks.list.mock.calls.length
const setVisible = (v) => Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })

beforeEach(async () => {
  vi.useFakeTimers()
  setVisible('visible')
  store.stopSync()
  store.resetStore()
  mocks.list.mockReset().mockResolvedValue([])
  await store.load('tasks')
  await store.load('notes')
  mocks.list.mockClear()
})
afterEach(() => {
  store.stopSync()
  vi.useRealTimers()
})

describe('refetchLoaded', () => {
  it('re-pulls every loaded table by default', async () => {
    await store.refetchLoaded()
    expect(calls()).toBe(2)
  })
  it('never loads a table nobody asked for', async () => {
    vi.advanceTimersByTime(60_000)
    await store.refetchLoaded({ maxAgeMs: 1 })
    expect(mocks.list.mock.calls.map((c) => c[0]).sort()).toEqual(['notes', 'tasks'])
  })
})

describe('startSync', () => {
  it('a burst of focus/visibility events syncs once; a later one syncs again', async () => {
    store.startSync()
    for (const e of ['focus', 'visibilitychange', 'focus']) window.dispatchEvent(new Event(e))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(2)
    await vi.advanceTimersByTimeAsync(6_000)
    mocks.list.mockClear()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(2)
  })
  it('coming back online always catches up', async () => {
    store.startSync()
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(2)
  })
  it('polls every 90 s while Realtime is down, and not at all while it is connected', async () => {
    store.startSync()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(calls()).toBe(2)
    mocks.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(0)
    mocks.list.mockClear()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(calls()).toBe(0)
    mocks.status('CLOSED')
    await vi.advanceTimersByTimeAsync(90_000)
    expect(calls()).toBe(2)
  })
  it('every (re)connection of Realtime catches up on loaded tables', async () => {
    store.startSync()
    mocks.status('SUBSCRIBED') // first connection: covers the gap before the subscription existed
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(2)
    mocks.list.mockClear()
    mocks.status('CLOSED')
    mocks.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(2)
  })
  it('a table whose first load failed is retried on RE-connection, not on the first connection', async () => {
    mocks.list.mockImplementation((t) => (t === 'broken' ? Promise.reject(new Error('boom')) : Promise.resolve([])))
    await store.load('broken')
    mocks.list.mockClear()
    store.startSync()
    mocks.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.list.mock.calls.map((c) => c[0]).sort()).toEqual(['notes', 'tasks'])
    mocks.list.mockClear()
    mocks.status('CLOSED')
    mocks.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.list.mock.calls.map((c) => c[0]).sort()).toEqual(['broken', 'notes', 'tasks'])
  })
  it('stops listening after stopSync', async () => {
    store.startSync()
    store.stopSync()
    await vi.advanceTimersByTimeAsync(200_000)
    for (const e of ['online', 'focus', 'visibilitychange']) window.dispatchEvent(new Event(e))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(0)
  })
  it('a Realtime change refetches only that table', async () => {
    store.startSync()
    mocks.emit('tasks')
    await vi.advanceTimersByTimeAsync(300)
    expect(mocks.list.mock.calls.map((c) => c[0])).toEqual(['tasks'])
  })
})
