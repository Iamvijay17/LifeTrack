import { describe, expect, it, vi } from 'vitest'
import { deliverOne, runDispatch } from '../../../supabase/functions/webhook-dispatch/logic.js'
import { verifyWebhook } from '../src/platformApi.js'

const delivery = (over = {}) => ({ id: 'd-1111', event_type: 'task.created', payload: { type: 'task.created', created_at: '2026-11-24T00:00:00Z', data: { task: { id: 't1', title: 'Hi' } } }, attempts: 0, created_at: '', url: 'https://hooks.example.com/in', timeout_ms: 2000, max_attempts: 3, secret: 'whsec_x', endpoint_id: 'e1', ...over })
const mkStore = (batch = []) => {
  const done = []
  return { done, claim: vi.fn(async () => batch), complete: vi.fn(async (r) => { done.push(r) }), lastJobRun: vi.fn(async () => new Date().toISOString()), recordJob: vi.fn(async () => {}), purge: vi.fn(async () => ({ a: 1, b: 2 })) }
}
const okFetch = (status = 200) => vi.fn(async () => ({ status, body: { cancel: async () => {} } }))
const publicDns = async () => ['93.184.216.34']
const base = (store, fetch = okFetch(), extra = {}) => ({ store, fetch, resolve: publicDns, now: () => 1_700_000_000_000, random: () => 0.5, ...extra })

describe('one delivery', () => {
  it('sends a signed POST that a receiver can verify, with the delivery id and a fresh timestamp', async () => {
    const store = mkStore()
    const fetch = okFetch()
    const r = await deliverOne(delivery(), base(store, fetch))
    expect(r.ok).toBe(true)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://hooks.example.com/in')
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' })
    expect(init.headers).toMatchObject({ 'X-LifeTrack-Delivery': 'd-1111', 'X-LifeTrack-Event': 'task.created', 'X-LifeTrack-Timestamp': '1700000000' })
    expect(JSON.parse(init.body)).toMatchObject({ id: 'd-1111', type: 'task.created', data: { task: { title: 'Hi' } } })
    expect(await verifyWebhook({ secret: 'whsec_x', signature: init.headers['X-LifeTrack-Signature'], timestamp: init.headers['X-LifeTrack-Timestamp'], body: init.body, now: 1_700_000_001_000 })).toEqual({ ok: true })
    expect(store.done[0]).toMatchObject({ id: 'd-1111', ok: true, status: 200, dead: false, next: null })
  })
  it('schedules a retry with backoff after a failure, and dead-letters after the last attempt', async () => {
    const store = mkStore()
    await deliverOne(delivery(), base(store, okFetch(500)))
    expect(store.done[0]).toMatchObject({ ok: false, status: 500, error: 'HTTP 500', dead: false })
    expect(Date.parse(store.done[0].next) - 1_700_000_000_000).toBe(30_000) // first retry after 30 s (jitter 0.5 = no change)
    await deliverOne(delivery({ attempts: 1 }), base(store, okFetch(500)))
    expect(Date.parse(store.done[1].next) - 1_700_000_000_000).toBe(60_000)
    await deliverOne(delivery({ attempts: 2 }), base(store, okFetch(503))) // third of max 3
    expect(store.done[2]).toMatchObject({ ok: false, dead: true, next: null })
  })
  it('treats timeouts, network errors, DNS failures and redirects as failures (redirects are never followed)', async () => {
    const store = mkStore()
    const abort = vi.fn(async (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))))
    await deliverOne(delivery({ timeout_ms: 20 }), { ...base(store, abort), now: Date.now })
    expect(store.done[0].error).toBe('timeout')
    await deliverOne(delivery(), base(store, vi.fn(async () => { throw new Error('ECONNRESET') })))
    expect(store.done[1].error).toBe('network_error')
    await deliverOne(delivery(), { ...base(store), resolve: async () => { throw new Error('ENOTFOUND') } })
    expect(store.done[2].error).toBe('dns_failed')
    const redirect = okFetch(302)
    await deliverOne(delivery(), base(store, redirect))
    expect(store.done[3]).toMatchObject({ ok: false, error: 'redirect_not_followed' })
    expect(redirect).toHaveBeenCalledTimes(1)
  })
  it('stops for good on 410 Gone', async () => {
    const store = mkStore()
    await deliverOne(delivery(), base(store, okFetch(410)))
    expect(store.done[0]).toMatchObject({ dead: true, next: null })
  })
  it('blocks internal targets before connecting: bad URLs, and names that resolve to private addresses (DNS rebinding)', async () => {
    const store = mkStore()
    const fetch = okFetch()
    await deliverOne(delivery({ url: 'https://127.0.0.1/x' }), base(store, fetch))
    await deliverOne(delivery({ url: 'http://example.com/x' }), base(store, fetch))
    await deliverOne(delivery(), { ...base(store, fetch), resolve: async () => ['93.184.216.34', '169.254.169.254'] })
    await deliverOne(delivery(), { ...base(store, fetch), resolve: async () => ['10.0.0.8'] })
    await deliverOne(delivery(), { ...base(store, fetch), resolve: async () => ['::1'] })
    expect(fetch).not.toHaveBeenCalled()
    expect(store.done.map((d) => d.error)).toEqual(Array(5).fill('blocked_address'))
    expect(store.done.every((d) => d.dead)).toBe(true)
  })
  it('does not send plain http unless development mode allows it', async () => {
    const fetch = okFetch()
    const s1 = mkStore()
    await deliverOne(delivery({ url: 'http://dev.example.com/h' }), base(s1, fetch))
    expect(fetch).not.toHaveBeenCalled()
    const s2 = mkStore()
    await deliverOne(delivery({ url: 'http://dev.example.com/h' }), { ...base(s2, fetch), allowHttp: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('a run', () => {
  it('delivers a batch, counts outcomes, records the job and purges at most once a day', async () => {
    const store = mkStore([delivery({ id: 'a' }), delivery({ id: 'b' }), delivery({ id: 'c' })])
    let n = 0
    const fetch = vi.fn(async () => ({ status: ++n === 2 ? 500 : 200, body: null }))
    store.lastJobRun = vi.fn(async () => null)
    const r = await runDispatch({}, { ...base(store, fetch), env: {} })
    expect(r).toMatchObject({ claimed: 3, delivered: 2, failed: 1, dead: 0 })
    expect(store.purge).toHaveBeenCalledTimes(1)
    expect(store.purge.mock.calls[0][0]).toMatchObject({ p_audit_days: 730, p_request_days: 30 })
    expect(store.recordJob).toHaveBeenCalledWith('webhook-dispatch', 'ok', expect.any(Number), expect.stringContaining('delivered 2'), '')
    store.lastJobRun = vi.fn(async () => new Date(1_700_000_000_000 - 3600_000).toISOString())
    await runDispatch({}, { ...base(store), env: {} })
    expect(store.purge).toHaveBeenCalledTimes(1)
  })
  it('a per-user flush neither purges nor records a job, and passes the user to the claim', async () => {
    const store = mkStore([delivery()])
    await runDispatch({ userId: 'u1' }, { ...base(store), env: {} })
    expect(store.claim).toHaveBeenCalledWith(25, 'u1')
    expect(store.purge).not.toHaveBeenCalled()
    expect(store.recordJob).not.toHaveBeenCalled()
  })
  it('reports a failed run to System Health and rethrows', async () => {
    const store = mkStore()
    store.claim = vi.fn(async () => { throw new Error('db down') })
    await expect(runDispatch({}, { ...base(store), env: {} })).rejects.toThrow('db down')
    expect(store.recordJob).toHaveBeenCalledWith('webhook-dispatch', 'error', expect.any(Number), '', 'db down')
  })
  it('honours retention settings and 0 = keep audit history forever', async () => {
    const store = mkStore()
    store.lastJobRun = async () => null
    await runDispatch({}, { ...base(store), env: { RETAIN_AUDIT_DAYS: '0', RETAIN_API_LOG_DAYS: '7' } })
    expect(store.purge.mock.calls[0][0]).toMatchObject({ p_audit_days: 0, p_request_days: 7 })
  })
})
