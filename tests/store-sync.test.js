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
  it('skips tables fetched within maxAgeMs and re-pulls stale ones', async () => {
    await store.refetchLoaded({ maxAgeMs: 15_000 })
    expect(calls()).toBe(0)
    vi.advanceTimersByTime(20_000)
    await store.refetchLoaded({ maxAgeMs: 15_000 })
    expect(calls()).toBe(2)
  })
  it('never loads a table nobody asked for', async () => {
    vi.advanceTimersByTime(60_000)
    await store.refetchLoaded({ maxAgeMs: 1 })
    expect(mocks.list.mock.calls.map((c) => c[0]).sort()).toEqual(['notes', 'tasks'])
  })
})

describe('startSync', () => {
  it('a focus right after a load does not download again; one after a pause does', async () => {
    store.startSync()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(0)
    await vi.advanceTimersByTimeAsync(20_000)
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
  it('polls every 90 s while Realtime is down, but only every 10 min once it is connected', async () => {
    store.startSync()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(calls()).toBe(2)
    mocks.list.mockClear()
    mocks.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(0)
    mocks.list.mockClear()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(calls()).toBe(0)
    await vi.advanceTimersByTimeAsync(560_000)
    expect(calls()).toBeGreaterThan(0)
  })
  it('a Realtime RE-connection re-pulls everything even if it was just loaded', async () => {
    store.startSync()
    mocks.status('SUBSCRIBED') // first connection: tables are fresh, nothing to catch up
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(0)
    mocks.status('CLOSED')
    mocks.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(2)
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
