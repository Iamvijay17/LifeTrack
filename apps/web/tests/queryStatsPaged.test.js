import { describe, expect, it, vi } from 'vitest'
import { classifyRequest, createQueryRecorder, rowsFromRange, timedFetch } from '@/lib/queryStats'

describe('query statistics recorder', () => {
  it('classifies requests by table and operation only', () => {
    expect(classifyRequest('https://x.supabase.co/rest/v1/tasks?select=*&user_id=eq.abc&title=ilike.%25secret%25', 'GET')).toEqual({
      table: 'tasks',
      op: 'select',
    })
    expect(classifyRequest('https://x/rest/v1/rpc/evaluate_flags', 'POST')).toEqual({ table: 'evaluate_flags', op: 'rpc' })
    expect(classifyRequest('https://x/rest/v1/tasks?id=eq.1', 'PATCH')).toEqual({ table: 'tasks', op: 'update' })
    expect(classifyRequest('https://x/auth/v1/token', 'POST')).toBe(null)
    expect(rowsFromRange('0-24/130')).toBe(25)
    expect(rowsFromRange('*/0')).toBe(0)
  })
  it('sums per location and keeps no URL, filter, id or content', async () => {
    const r = createQueryRecorder({ sample: 1 })
    const sent = []
    r.start(async (rows) => sent.push(...rows))
    const inner = vi.fn(async () => ({ ok: true, headers: { get: () => '0-9/50' } }))
    const f = timedFetch(
      inner,
      r,
      (() => {
        let t = 0
        return () => (t += 120)
      })(),
    )
    await f('https://x/rest/v1/tasks?select=*&user_id=eq.11111111-1111-1111-1111-111111111111&title=ilike.%25password%25')
    await f('https://x/rest/v1/tasks?select=*', { method: 'GET' })
    await r.flush()
    expect(sent).toEqual([{ table: 'tasks', op: 'select', calls: 2, errors: 0, slow: 0, total_ms: 240, max_ms: 120, rows: 20 }])
    const text = JSON.stringify(sent)
    expect(text).not.toMatch(/password|1111|user_id|ilike/)
    r.stop()
  })
  it('counts failures and slow calls, ignores its own reporting call, passes errors through, and never throws on a failed flush', async () => {
    const r = createQueryRecorder({ sample: 1 })
    r.start(async () => {
      throw new Error('offline')
    })
    let t = 0
    const f = timedFetch(
      async (u) => {
        if (String(u).includes('boom')) throw new Error('net')
        return { ok: false, headers: { get: () => null } }
      },
      r,
      () => (t += 700),
    )
    await f('https://x/rest/v1/goals?select=*')
    await expect(f('https://x/rest/v1/boom')).rejects.toThrow('net')
    await f('https://x/rest/v1/rpc/report_query_stats', { method: 'POST' })
    const [a, b] = r.pending()
    expect(a).toMatchObject({ table: 'goals', errors: 1, slow: 1 })
    expect(b).toMatchObject({ table: 'boom', errors: 1 })
    expect(r.pending()).toHaveLength(2) // the reporting call itself is not measured
    expect(await r.flush()).toBe(0) // failure swallowed
  })
  it('records nothing for sessions outside the sample', async () => {
    const r = createQueryRecorder({ sample: 0.25, random: () => 0.9 })
    r.start(async () => {})
    expect(r.enabled).toBe(false)
    const inner = vi.fn(async () => ({ ok: true, headers: { get: () => null } }))
    await timedFetch(inner, r)('https://x/rest/v1/tasks')
    expect(r.pending()).toEqual([])
    expect(inner).toHaveBeenCalledTimes(1)
  })
})
