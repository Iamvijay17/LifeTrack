import { describe, expect, it } from 'vitest'
import { handleApiRequest } from '../../../supabase/functions/api/logic.js'
import { encodeCursor, hashKey } from '../src/platformApi.js'

const KEY = 'lt_live_' + 'A'.repeat(43)
const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

async function fakeStore({ scopes = ['tasks:read', 'tasks:write'], status = 'ok', limit = 100, rows = [] } = {}) {
  const hash = await hashKey(KEY)
  const log = []
  const hits = { n: 0 }
  const data = rows.slice()
  return {
    log, data, hits,
    authenticate: async (h) => (h !== hash ? { ok: false, reason: 'invalid' } : status !== 'ok' ? { ok: false, reason: status } : { ok: true, key_id: 'k1', user_id: USER, name: 'CI', key_prefix: 'lt_live_AAAAAAA', scopes, rate_limit_per_min: limit, expires_at: null }),
    rateHit: async () => { hits.n++; return { allowed: hits.n <= limit, hits: hits.n, limit, reset_at: new Date(Date.now() + 30_000).toISOString() } },
    record: async (r) => { log.push(r) },
    ready: async () => true,
    list: async (table, userId, o) => data.filter((r) => r.user_id === userId && (!o.cursor || r.created_at < o.cursor.createdAt)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, o.limit).map(({ user_id, ...r }) => r),
    get: async (table, userId, id) => { const r = data.find((x) => x.id === id && x.user_id === userId); if (!r) return null; const { user_id, ...rest } = r; return rest },
    insert: async (table, userId, values) => { const r = { id: '33333333-3333-3333-3333-333333333333', user_id: userId, created_at: new Date().toISOString(), ...values }; data.push(r); const { user_id, ...rest } = r; return rest },
    update: async (table, userId, id, values) => { const r = data.find((x) => x.id === id && x.user_id === userId); if (!r) return null; Object.assign(r, values); const { user_id, ...rest } = r; return rest },
  }
}
const call = (store, method, path, { headers = {}, body = null, query = '', env } = {}) =>
  handleApiRequest({ method, path, query: new URLSearchParams(query), headers: (n) => ({ authorization: `Bearer ${KEY}`, ...headers })[n.toLowerCase()] ?? null, bodyText: body == null ? null : typeof body === 'string' ? body : JSON.stringify(body) }, { store, env })
const JSONH = { 'content-type': 'application/json' }
const task = (i, user = USER) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, user_id: user, title: `T${i}`, created_at: `2026-11-${String(10 + i).padStart(2, '0')}T00:00:00.000Z` })

describe('authentication', () => {
  it('refuses a missing, malformed, unknown, revoked and expired key', async () => {
    const s = await fakeStore()
    expect((await call(s, 'GET', '/v1/tasks', { headers: { authorization: '' } })).body.error.code).toBe('missing_key')
    expect((await call(s, 'GET', '/v1/tasks', { headers: { authorization: 'Bearer nope' } })).body.error.code).toBe('invalid_key')
    expect((await call(s, 'GET', '/v1/tasks', { headers: { authorization: 'Bearer lt_live_' + 'B'.repeat(43) } })).body.error.code).toBe('invalid_key')
    expect((await call(await fakeStore({ status: 'revoked' }), 'GET', '/v1/tasks')).body.error.code).toBe('revoked_key')
    expect((await call(await fakeStore({ status: 'expired' }), 'GET', '/v1/tasks')).body.error.code).toBe('expired_key')
    const r = await call(s, 'GET', '/v1/tasks', { headers: { authorization: '' } })
    expect(r.status).toBe(401)
    expect(r.headers['WWW-Authenticate']).toBe('Bearer')
  })
  it('accepts X-API-Key as an alternative header', async () => {
    const s = await fakeStore({ rows: [task(1)] })
    expect((await call(s, 'GET', '/v1/tasks', { headers: { authorization: '', 'x-api-key': KEY } })).status).toBe(200)
  })
  it('never writes the key (or its hash) to the request log', async () => {
    const s = await fakeStore()
    await call(s, 'GET', '/v1/tasks')
    expect(JSON.stringify(s.log)).not.toContain(KEY)
    expect(JSON.stringify(s.log)).not.toContain(await hashKey(KEY))
    expect(s.log[0]).toMatchObject({ keyId: 'k1', userId: USER, method: 'GET', status: 200 })
  })
  it('records rejected requests without a key id (so a flood of bad keys cannot fill the log)', async () => {
    const s = await fakeStore()
    await call(s, 'GET', '/v1/tasks', { headers: { authorization: 'Bearer nope' } })
    expect(s.log[0]).toMatchObject({ keyId: null, status: 401, error: 'invalid_key' })
  })
})

describe('scopes', () => {
  it('checks the permission on every request', async () => {
    const s = await fakeStore({ scopes: ['tasks:read'] })
    expect((await call(s, 'GET', '/v1/tasks')).status).toBe(200)
    const w = await call(s, 'POST', '/v1/tasks', { headers: JSONH, body: { title: 'x' } })
    expect(w.status).toBe(403)
    expect(w.body.error).toMatchObject({ code: 'insufficient_scope', required_scope: 'tasks:write' })
    expect((await call(s, 'GET', '/v1/transactions')).body.error.required_scope).toBe('finance:read')
  })
})

describe('rate limiting', () => {
  it('allows up to the limit, then answers 429 with Retry-After', async () => {
    const s = await fakeStore({ limit: 3, rows: [task(1)] })
    const out = []
    for (let i = 0; i < 5; i++) out.push(await call(s, 'GET', '/v1/tasks'))
    expect(out.map((r) => r.status)).toEqual([200, 200, 200, 429, 429])
    expect(out[0].headers['X-RateLimit-Remaining']).toBe('2')
    expect(out[2].headers['X-RateLimit-Remaining']).toBe('0')
    expect(Number(out[3].headers['Retry-After'])).toBeGreaterThan(0)
    expect(out[3].body.error.code).toBe('rate_limited')
  })
})

describe('reading', () => {
  it('returns only the owner\'s rows, without user_id, newest first, paged by cursor', async () => {
    const s = await fakeStore({ rows: [task(1), task(2), task(3), task(4, OTHER)] })
    const p1 = await call(s, 'GET', '/v1/tasks', { query: 'limit=2' })
    expect(p1.body.data.map((t) => t.title)).toEqual(['T3', 'T2'])
    expect(p1.body.data[0]).not.toHaveProperty('user_id')
    expect(p1.body.pagination).toMatchObject({ limit: 2, has_more: true })
    const p2 = await call(s, 'GET', '/v1/tasks', { query: `limit=2&cursor=${p1.body.pagination.next_cursor}` })
    expect(p2.body.data.map((t) => t.title)).toEqual(['T1'])
    expect(p2.body.pagination).toEqual({ limit: 2, has_more: false, next_cursor: null })
  })
  it('does not reveal another person\'s record by id', async () => {
    const s = await fakeStore({ rows: [task(4, OTHER)] })
    expect((await call(s, 'GET', `/v1/tasks/${task(4).id}`)).status).toBe(404)
  })
  it('rejects bad parameters', async () => {
    const s = await fakeStore()
    for (const q of ['limit=0', 'limit=101', 'limit=abc', 'cursor=junk', 'bogus=1', 'updated_since=yesterday'])
      expect((await call(s, 'GET', '/v1/tasks', { query: q })).body.error.code, q).toBe('bad_request')
    expect((await call(s, 'GET', '/v1/tasks', { query: `cursor=${encodeCursor({ created_at: '2026-01-01T00:00:00Z', id: task(1).id })}` })).status).toBe(200)
  })
})

describe('writing', () => {
  it('creates and updates with validation, and stamps completion', async () => {
    const s = await fakeStore()
    const c = await call(s, 'POST', '/v1/tasks', { headers: JSONH, body: { title: 'From the API', priority: 'high' } })
    expect(c.status).toBe(201)
    expect(s.data[0]).toMatchObject({ user_id: USER, title: 'From the API' })
    const u = await call(s, 'PATCH', `/v1/tasks/${c.body.data.id}`, { headers: JSONH, body: { status: 'done' } })
    expect(u.status).toBe(200)
    expect(s.data[0].completed_at).toBeTruthy()
    expect((await call(s, 'PATCH', `/v1/tasks/${task(9).id}`, { headers: JSONH, body: { status: 'done' } })).status).toBe(404)
  })
  it('cannot set user_id or unknown fields, and reports field errors', async () => {
    const s = await fakeStore()
    const r = await call(s, 'POST', '/v1/tasks', { headers: JSONH, body: { title: '', user_id: OTHER } })
    expect(r.status).toBe(422)
    expect(r.body.error.fields).toMatchObject({ title: expect.any(String), user_id: 'unknown field' })
    expect(s.data).toHaveLength(0)
  })
  it('checks content type, size and JSON', async () => {
    const s = await fakeStore()
    expect((await call(s, 'POST', '/v1/tasks', { body: { title: 'x' } })).body.error.code).toBe('unsupported_media_type')
    expect((await call(s, 'POST', '/v1/tasks', { headers: JSONH, body: '{bad' })).body.error.code).toBe('bad_request')
    expect((await call(s, 'POST', '/v1/tasks', { headers: JSONH, body: JSON.stringify({ title: 'x', notes: 'n'.repeat(70_000) }) })).status).toBe(413)
  })
  it('has no DELETE and no write on read-only resources', async () => {
    const s = await fakeStore({ scopes: ['tasks:read', 'tasks:write', 'goals:read'] })
    expect((await call(s, 'DELETE', `/v1/tasks/${task(1).id}`)).body.error.code).toBe('method_not_allowed')
    expect((await call(s, 'POST', '/v1/goals', { headers: JSONH, body: { title: 'x' } })).status).toBe(405)
  })
  it('turns a database refusal into a safe 422 and anything else into a 500 without internals', async () => {
    const s = await fakeStore()
    s.insert = async () => { throw Object.assign(new Error('violates check constraint "tasks_title_check" for relation secret_table'), { code: '23514' }) }
    const r = await call(s, 'POST', '/v1/tasks', { headers: JSONH, body: { title: 'x' } })
    expect(r.status).toBe(422)
    expect(JSON.stringify(r.body)).not.toMatch(/constraint|secret_table/)
    s.insert = async () => { throw new Error('connection to postgres://user:pw@host failed') }
    const e = await call(s, 'POST', '/v1/tasks', { headers: JSONH, body: { title: 'x' } })
    expect(e.status).toBe(500)
    expect(JSON.stringify(e.body)).not.toMatch(/postgres|pw@/)
    expect(e.body.error.request_id).toBeTruthy()
  })
})

describe('health, request ids and documentation', () => {
  it('serves health, liveness, readiness and the OpenAPI document without a key', async () => {
    const s = await fakeStore()
    const noKey = { headers: { authorization: '' } }
    expect((await call(s, 'GET', '/health', noKey)).body.status).toBe('ok')
    expect((await call(s, 'GET', '/health/live', noKey)).status).toBe(200)
    expect((await call(s, 'GET', '/health/ready', noKey)).status).toBe(200)
    s.ready = async () => { throw new Error('db down') }
    const bad = await call(s, 'GET', '/health/ready', noKey)
    expect(bad.status).toBe(503)
    expect(JSON.stringify(bad.body)).not.toMatch(/db down/)
    expect((await call(s, 'GET', '/v1/openapi.json', noKey)).body.openapi).toBe('3.0.3')
  })
  it('echoes a valid request id, generates one otherwise, and sends it on errors', async () => {
    const s = await fakeStore()
    expect((await call(s, 'GET', '/health', { headers: { 'x-request-id': 'abc-12345678' } })).headers['X-Request-Id']).toBe('abc-12345678')
    const r = await call(s, 'GET', '/health', { headers: { 'x-request-id': 'bad id with spaces' } })
    expect(r.headers['X-Request-Id']).not.toBe('bad id with spaces')
    const e = await call(s, 'GET', '/v1/nothing')
    expect(e.status).toBe(404)
    expect(e.body.error.request_id).toBe(e.headers['X-Request-Id'])
  })
  it('answers /v1/me with the key\'s own details', async () => {
    const s = await fakeStore()
    const r = await call(s, 'GET', '/v1/me')
    expect(r.body.data).toMatchObject({ name: 'CI', scopes: ['tasks:read', 'tasks:write'], rate_limit_per_min: 100 })
    expect(JSON.stringify(r.body)).not.toContain(KEY)
  })
  it('a failing request log cannot change the answer', async () => {
    const s = await fakeStore({ rows: [task(1)] })
    s.record = async () => { throw new Error('log down') }
    expect((await call(s, 'GET', '/v1/tasks')).status).toBe(200)
  })
})
