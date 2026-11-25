import { describe, expect, it } from 'vitest'
import { API_SCOPES, RESOURCES, WEBHOOK_EVENTS, backoffSeconds, buildOpenApi, checkWebhookUrl, decodeCursor, encodeCursor, hashKey, isPublicIp, signWebhook, validateWrite, verifyWebhook } from '../src/platformApi.js'
import { readFileSync } from 'node:fs'

describe('webhook signing', () => {
  const secret = 'whsec_test'
  const body = '{"id":"d1","type":"task.created"}'
  it('is HMAC-SHA256 over "<timestamp>.<body>" and verifies', async () => {
    const sig = await signWebhook(secret, '1700000000', body)
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/)
    expect(sig).toBe(await signWebhook(secret, '1700000000', body))
    expect(await verifyWebhook({ secret, signature: sig, timestamp: '1700000000', body, now: 1700000100_000 })).toEqual({ ok: true })
  })
  it('matches an independently computed HMAC', async () => {
    const { createHmac } = await import('node:crypto')
    const expected = 'v1=' + createHmac('sha256', secret).update(`1700000000.${body}`).digest('hex')
    expect(await signWebhook(secret, '1700000000', body)).toBe(expected)
  })
  it('rejects a changed body, a wrong secret, and a replay outside the window', async () => {
    const sig = await signWebhook(secret, '1700000000', body)
    expect((await verifyWebhook({ secret, signature: sig, timestamp: '1700000000', body: body + ' ', now: 1700000000_000 })).reason).toBe('bad_signature')
    expect((await verifyWebhook({ secret: 'other', signature: sig, timestamp: '1700000000', body, now: 1700000000_000 })).reason).toBe('bad_signature')
    expect((await verifyWebhook({ secret, signature: sig, timestamp: '1700000000', body, now: 1700000000_000 + 301_000 })).reason).toBe('stale_timestamp')
    // re-timestamping a captured body does not help: the signature covers the timestamp
    expect((await verifyWebhook({ secret, signature: sig, timestamp: '1700000500', body, now: 1700000500_000 })).reason).toBe('bad_signature')
  })
})

describe('retry schedule', () => {
  it('doubles from 30 seconds up to 6 hours, with ±20% jitter', () => {
    expect([1, 2, 3, 4].map((n) => backoffSeconds(n))).toEqual([30, 60, 120, 240])
    expect(backoffSeconds(20)).toBe(21600)
    expect(backoffSeconds(1, 0)).toBe(24)
    expect(backoffSeconds(1, 1)).toBe(36)
  })
})

describe('SSRF protection', () => {
  it.each(['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.5', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.1.1.1', '2001:db8::1', '255.255.255.255', '300.1.1.1'])('%s is not public', (ip) => {
    expect(isPublicIp(ip)).toBe(false)
  })
  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '203.0.114.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('%s is public', (ip) => {
    expect(isPublicIp(ip)).toBe(true)
  })
  it('accepts only public https addresses without credentials', () => {
    expect(checkWebhookUrl('https://hooks.example.com/in?x=1').ok).toBe(true)
    for (const u of ['http://example.com', 'https://localhost/x', 'https://a.local/x', 'https://svc.internal/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://169.254.169.254/latest', 'https://u:p@example.com', 'https://single/x', 'not a url', 'ftp://example.com', 'https://8.8.8.8/x', 'javascript:alert(1)'])
      expect(checkWebhookUrl(u).ok, u).toBe(false)
    expect(checkWebhookUrl('http://dev.example.com', { allowHttp: true }).ok).toBe(true)
  })
})

describe('key hashing and cursors', () => {
  it('hashes to a stable SHA-256 hex and never contains the key', async () => {
    const h = await hashKey('lt_live_abc')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).toBe(await hashKey('lt_live_abc'))
    expect(h).not.toBe(await hashKey('lt_live_abd'))
  })
  it('round-trips cursors and rejects forged ones', () => {
    const row = { created_at: '2026-11-24T10:00:00.123+00:00', id: '3f2de126-0ce4-4c08-926d-1ada427b105f' }
    expect(decodeCursor(encodeCursor(row))).toEqual({ createdAt: row.created_at, id: row.id })
    for (const bad of ['', 'abc', btoa('{"c":"x","i":"y"}'), btoa('{"c":"2026-01-01","i":"1); drop table tasks"}')]) expect(decodeCursor(bad)).toBeNull()
  })
})

describe('request validation', () => {
  const tasks = RESOURCES.tasks
  it('accepts a valid create and strips nothing silently', () => {
    expect(validateWrite(tasks, { title: 'Pay rent', priority: 'high', due_date: '2026-12-01' })).toEqual({ ok: true, values: { title: 'Pay rent', priority: 'high', due_date: '2026-12-01' } })
  })
  it('lists every problem by field', () => {
    const r = validateWrite(tasks, { title: '  ', priority: 'urgentest', due_date: '2026-02-30', user_id: 'x', status: 5 })
    expect(r.ok).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['due_date', 'priority', 'status', 'title', 'user_id'])
    expect(validateWrite(tasks, {}).errors.title).toBe('required')
    expect(validateWrite(tasks, [1]).errors.body).toBeTruthy()
  })
  it('requires at least one field on update, and none on create is an error', () => {
    expect(validateWrite(tasks, {}, { partial: true }).errors.body).toMatch(/at least one/)
    expect(validateWrite(tasks, { status: 'done' }, { partial: true }).ok).toBe(true)
  })
  it('checks money and event ranges', () => {
    expect(validateWrite(RESOURCES.transactions, { type: 'expense', amount_paise: 12.5, txn_date: '2026-11-01' }).errors.amount_paise).toBeTruthy()
    expect(validateWrite(RESOURCES.transactions, { type: 'expense', amount_paise: 0, txn_date: '2026-11-01' }).ok).toBe(false)
    expect(validateWrite(RESOURCES.transactions, { type: 'expense', amount_paise: 1250, txn_date: '2026-11-01' }).ok).toBe(true)
    const ev = (s, e) => validateWrite(RESOURCES['calendar-events'], { title: 'x', starts_at: s, ends_at: e })
    expect(ev('2026-11-01T10:00:00Z', '2026-11-01T09:00:00Z').errors.ends_at).toMatch(/after/)
    expect(ev('2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z').ok).toBe(true)
    expect(ev('tomorrow', '2026-11-01T11:00:00Z').ok).toBe(false)
  })
})

describe('the OpenAPI document and the documented contract', () => {
  const doc = buildOpenApi()
  it('describes exactly the resources the gateway serves, with no DELETE anywhere', () => {
    const resourcePaths = Object.keys(doc.paths).filter((p) => p.startsWith('/v1/') && p !== '/v1/me')
    for (const name of Object.keys(RESOURCES)) expect(doc.paths[`/v1/${name}`] ?? doc.paths[`/v1/${name}/{id}`]).toBeTruthy()
    expect(resourcePaths.every((p) => RESOURCES[p.split('/')[2]])).toBe(true)
    expect(JSON.stringify(doc)).not.toMatch(/"delete"/)
    expect(doc.paths['/v1/tasks'].post).toBeTruthy()
    expect(doc.paths['/v1/goals'].post).toBeUndefined() // read-only resources have no write endpoints
    expect(doc.paths['/v1/tasks/{id}'].patch).toBeTruthy()
  })
  it('only uses scopes that exist, and every scope is used', () => {
    const known = new Set(API_SCOPES.map((s) => s.key))
    const used = new Set(Object.values(RESOURCES).flatMap((r) => [r.read, r.writeScope].filter(Boolean)))
    expect([...used].every((s) => known.has(s))).toBe(true)
    expect([...known].every((s) => used.has(s))).toBe(true)
  })
  it('never exposes user_id', () => {
    for (const r of Object.values(RESOURCES)) expect(Object.keys(r.columns)).not.toContain('user_id')
  })
  it('keeps scopes and events in step with the database lists in migration 0027', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/0027_platform.sql', import.meta.url), 'utf8')
    const list = (fn) => [...new RegExp(`function public\\.${fn}\\(\\)[\\s\\S]*?array\\[([\\s\\S]*?)\\]`).exec(sql)[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(list('_api_scopes').sort()).toEqual(API_SCOPES.map((s) => s.key).sort())
    expect(list('_webhook_events').sort()).toEqual(WEBHOOK_EVENTS.map((s) => s.key).sort())
  })
})
