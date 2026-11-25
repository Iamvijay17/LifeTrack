import { describe, expect, it } from 'vitest'
import { FRESHNESS, createCache } from '../src/cache.js'

const clock = () => {
  let t = 1_000
  return { now: () => t, tick: (ms) => (t += ms) }
}

describe('cache', () => {
  it('serves hits until the TTL, then reloads', async () => {
    const c = clock()
    const cache = createCache({ ttlMs: 1000, now: c.now })
    let n = 0
    const load = async () => ++n
    const k = cache.key('tasks', 'u1', 'page1')
    expect(await cache.get(k, load)).toBe(1)
    expect(await cache.get(k, load)).toBe(1)
    c.tick(1001)
    expect(await cache.get(k, load)).toBe(2)
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 2, loads: 2 })
    expect(cache.stats().hitRate).toBeCloseTo(1 / 3)
  })
  it('isolates people: the same query for two users never shares an entry', async () => {
    const cache = createCache()
    expect(await cache.get(cache.key('tasks', 'alice', 'q'), async () => 'alice-data')).toBe('alice-data')
    expect(await cache.get(cache.key('tasks', 'bob', 'q'), async () => 'bob-data')).toBe('bob-data')
    expect(cache.peek(cache.key('tasks', 'alice', 'q'))).toBe('alice-data')
    cache.clear('alice')
    expect(cache.peek(cache.key('tasks', 'alice', 'q'))).toBeUndefined()
    expect(cache.peek(cache.key('tasks', 'bob', 'q'))).toBe('bob-data')
  })
  it('one load serves a stampede of identical requests', async () => {
    const cache = createCache()
    let loads = 0
    const load = () => new Promise((r) => setTimeout(() => r(++loads), 10))
    const k = cache.key('x', 'u', 'y')
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.get(k, load)))
    expect(loads).toBe(1)
    expect(new Set(results).size).toBe(1)
    expect(cache.stats().coalesced).toBe(49)
  })
  it('invalidation: bumping a namespace drops its entries, leaves others, and a load that started before is not stored', async () => {
    const cache = createCache()
    await cache.get(cache.key('tasks', 'u', 'a'), async () => 'A')
    await cache.get(cache.key('goals', 'u', 'a'), async () => 'G')
    cache.bump('tasks')
    expect(cache.peek(cache.key('tasks', 'u', 'a'))).toBeUndefined()
    expect(cache.peek(cache.key('goals', 'u', 'a'))).toBe('G')
    // a slow load that was in flight during the mutation holds pre-mutation data: it is returned to its caller but not cached
    let release
    const slow = cache.get(cache.key('tasks', 'u', 'b'), () => new Promise((r) => (release = () => r('old'))))
    cache.bump('tasks')
    release()
    expect(await slow).toBe('old')
    expect(cache.peek(cache.key('tasks', 'u', 'b'))).toBeUndefined()
    cache.set(cache.key('tasks', 'u', 'c'), 1, { tags: ['t'] })
    cache.invalidateTag('t')
    expect(cache.peek(cache.key('tasks', 'u', 'c'))).toBeUndefined()
  })
  it('failure fallback: stale data only when the policy allows it', async () => {
    const c = clock()
    const boom = async () => { throw new Error('db down') }
    const lenient = createCache({ ttlMs: 10, now: c.now })
    const k = lenient.key('flags', 'u')
    await lenient.get(k, async () => 'ok')
    c.tick(50)
    expect(await lenient.get(k, boom, FRESHNESS.presentation)).toBe('ok') // flags: an old value beats an error
    expect(lenient.stats().stale).toBe(1)
    const strict = createCache({ ttlMs: 10, now: c.now })
    const k2 = strict.key('transactions', 'u')
    await strict.get(k2, async () => 'balance 100')
    c.tick(50)
    await expect(strict.get(k2, boom, FRESHNESS.sensitive)).rejects.toThrow('db down') // money: never served late
    await expect(strict.get(strict.key('x', 'u'), boom)).rejects.toThrow() // nothing cached, nothing to fall back to
    expect(strict.stats().errors).toBe(2)
  })
  it('an entry that was invalidated is not served as stale after a failure', async () => {
    const c = clock()
    const cache = createCache({ ttlMs: 10, now: c.now, staleOnError: true })
    const k = cache.key('flags', 'u')
    await cache.get(k, async () => 'old')
    cache.bump('flags')
    await expect(cache.get(k, async () => { throw new Error('x') })).rejects.toThrow()
  })
  it('bounds its size by dropping the oldest entries', async () => {
    const cache = createCache({ maxEntries: 3 })
    for (let i = 0; i < 5; i++) cache.set(cache.key('n', 'u', i), i)
    expect(cache.stats().size).toBe(3)
    expect(cache.stats().evictions).toBe(2)
    expect(cache.peek(cache.key('n', 'u', 0))).toBeUndefined()
    expect(cache.peek(cache.key('n', 'u', 4))).toBe(4)
  })
  it('states a policy for each kind of data; money and security never serve stale', () => {
    expect(FRESHNESS.sensitive.staleOnError).toBe(false)
    expect(FRESHNESS.records.staleOnError).toBe(false)
    expect(FRESHNESS.sensitive.ttlMs).toBeLessThanOrEqual(FRESHNESS.records.ttlMs)
  })
})
