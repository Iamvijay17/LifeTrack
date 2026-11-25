// The decisions of the `api` Edge Function (the public LifeTrack REST API). Everything outside the decision (the database, the clock, ids) is injected,
// so it is tested in Node with a fake store (packages/core/tests/api-gateway.test.js).
//
// Guarantees:
//   * Every data route needs a valid, unexpired, unrevoked key; the key's SCOPE is checked on every request (a read key cannot write).
//   * Every query is for the key's owner: the user id comes from the key, never from the request.
//   * Keys are looked up by SHA-256 hash; the key itself is never logged or stored, and error bodies never echo input.
//   * Per-key rate limit (a fixed one-minute window in the database, atomic), with the usual X-RateLimit-* and Retry-After headers.
//   * Bodies are size-limited and validated field by field; unknown fields are rejected. There is no DELETE: the API cannot destroy data.
import { API_VERSION, KEY_PATTERN, MAX_BODY_BYTES, PAGE, RESOURCES, buildOpenApi, decodeCursor, encodeCursor, hashKey, validateWrite } from '../_shared/platformApi.js'

const json = (status, body, headers = {}) => ({ status, body, headers })
const REQUEST_ID = /^[A-Za-z0-9_.-]{8,64}$/

/** @param req { method, path, query: URLSearchParams, headers: (name)=>string|null, bodyText: string|null }  @param deps { store, now?, uuid?, env? } */
export async function handleApiRequest(req, deps) {
  const { store } = deps
  const clock = deps.now ?? Date.now
  const t0 = clock()
  const requestId = REQUEST_ID.test(req.headers('x-request-id') ?? '') ? req.headers('x-request-id') : (deps.uuid ?? (() => crypto.randomUUID()))()
  const slowMs = Number(deps.env?.API_SLOW_MS) || 1000
  let key = null
  let errorCode = null

  const fail = (status, code, message, extra = {}, headers = {}) => {
    errorCode = code
    return json(status, { error: { code, message, request_id: requestId, ...extra } }, headers)
  }
  const finish = async (res) => {
    const ms = Math.max(0, Math.round(clock() - t0))
    // Logging must never change the answer: a failure here is swallowed (the request already has its result).
    try {
      await store.record({ keyId: key?.key_id ?? null, userId: key?.user_id ?? null, requestId, method: req.method, path: req.path.slice(0, 200), status: res.status, ms, error: errorCode, slowMs })
    } catch {
      /* ignore */
    }
    return { ...res, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-Id': requestId, 'X-Content-Type-Options': 'nosniff', ...res.headers } }
  }

  try {
    // ---- public routes
    const route = req.path.replace(/\/+$/, '') || '/'
    if (route === '/health' && req.method === 'GET') return await finish(json(200, { status: 'ok', version: API_VERSION, time: new Date(clock()).toISOString() }))
    if (route === '/health/live' && req.method === 'GET') return await finish(json(200, { status: 'ok' }))
    if (route === '/health/ready' && req.method === 'GET') {
      let ok = false
      try {
        ok = await store.ready()
      } catch {
        ok = false
      }
      return await finish(ok ? json(200, { status: 'ready' }) : json(503, { status: 'unavailable' }))
    }
    if (route === '/v1/openapi.json' && req.method === 'GET') return await finish(json(200, buildOpenApi(deps.env?.API_BASE_URL || undefined)))

    // ---- everything else needs a key
    const m = /^\/v1\/([a-z-]+)(?:\/([0-9a-f-]{36}))?$/.exec(route)
    if (route !== '/v1/me' && !m) return await finish(fail(404, 'not_found', 'No such endpoint.'))
    const auth = req.headers('authorization') ?? ''
    const presented = (/^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? req.headers('x-api-key') ?? '').trim()
    const www = { 'WWW-Authenticate': 'Bearer' }
    if (!presented) return await finish(fail(401, 'missing_key', 'Send your API key as: Authorization: Bearer lt_live_…', {}, www))
    if (!KEY_PATTERN.test(presented)) return await finish(fail(401, 'invalid_key', 'That API key is not valid.', {}, www))
    const found = await store.authenticate(await hashKey(presented))
    if (!found?.ok) {
      const code = found?.reason === 'revoked' ? 'revoked_key' : found?.reason === 'expired' ? 'expired_key' : 'invalid_key'
      const text = { revoked_key: 'That API key was revoked.', expired_key: 'That API key has expired.', invalid_key: 'That API key is not valid.' }[code]
      return await finish(fail(401, code, text, {}, www))
    }
    key = found

    const rate = await store.rateHit(key.key_id, key.rate_limit_per_min)
    const resetIn = Math.max(1, Math.ceil((Date.parse(rate.reset_at) - clock()) / 1000))
    const limitHeaders = {
      'X-RateLimit-Limit': String(rate.limit),
      'X-RateLimit-Remaining': String(Math.max(0, rate.limit - rate.hits)),
      'X-RateLimit-Reset': String(Math.ceil(Date.parse(rate.reset_at) / 1000)),
    }
    if (!rate.allowed)
      return await finish(fail(429, 'rate_limited', `Rate limit of ${rate.limit} requests a minute reached. Retry in ${resetIn} seconds.`, {}, { ...limitHeaders, 'Retry-After': String(resetIn) }))
    const ok = (status, body) => finish(json(status, body, limitHeaders))
    const bad = (status, code, message, extra = {}) => finish(fail(status, code, message, extra, limitHeaders))

    if (route === '/v1/me') {
      if (req.method !== 'GET') return await bad(405, 'method_not_allowed', 'Use GET.')
      return await ok(200, { data: { name: key.name, key_prefix: key.key_prefix, scopes: key.scopes, rate_limit_per_min: key.rate_limit_per_min, expires_at: key.expires_at } })
    }

    const resource = RESOURCES[m[1]]
    if (!resource) return await bad(404, 'not_found', 'No such endpoint.')
    const id = m[2] ?? null
    const action = req.method === 'GET' ? (id ? 'get' : 'list') : req.method === 'POST' && !id ? 'create' : req.method === 'PATCH' && id ? 'update' : null
    if (!action || !resource.methods.includes(action)) return await bad(405, 'method_not_allowed', 'That method is not available here.')
    const scope = action === 'get' || action === 'list' ? resource.read : resource.writeScope
    if (!key.scopes.includes(scope)) return await bad(403, 'insufficient_scope', `This key needs the "${scope}" permission.`, { required_scope: scope })
    const columns = Object.keys(resource.columns)

    if (action === 'list') {
      const q = req.query
      const allowed = new Set(['limit', 'cursor', 'updated_since', ...resource.filters])
      for (const k of q.keys()) if (!allowed.has(k)) return await bad(400, 'bad_request', `Unknown parameter "${k}".`)
      const limitRaw = q.get('limit')
      const limit = limitRaw == null ? PAGE.defaultLimit : Number(limitRaw)
      if (!Number.isInteger(limit) || limit < 1 || limit > PAGE.maxLimit) return await bad(400, 'bad_request', `limit must be a whole number from 1 to ${PAGE.maxLimit}.`)
      const cursor = q.get('cursor') == null ? null : decodeCursor(q.get('cursor'))
      if (q.get('cursor') != null && !cursor) return await bad(400, 'bad_request', 'That cursor is not valid.')
      const since = q.get('updated_since')
      if (since != null && Number.isNaN(Date.parse(since))) return await bad(400, 'bad_request', 'updated_since must be an ISO 8601 timestamp.')
      const filters = Object.fromEntries(resource.filters.filter((f) => q.get(f) != null).map((f) => [f, q.get(f)]))
      const rows = await store.list(resource.table, key.user_id, { columns, filters, limit: limit + 1, cursor, updatedSince: since ? new Date(since).toISOString() : null })
      const more = rows.length > limit
      const page = rows.slice(0, limit)
      return await ok(200, { data: page, pagination: { limit, has_more: more, next_cursor: more ? encodeCursor(page[page.length - 1]) : null } })
    }
    if (action === 'get') {
      const row = await store.get(resource.table, key.user_id, id, columns)
      return row ? await ok(200, { data: row }) : await bad(404, 'not_found', 'No such record.')
    }

    // ---- writes
    if (!/application\/json/i.test(req.headers('content-type') ?? '')) return await bad(415, 'unsupported_media_type', 'Send Content-Type: application/json.')
    if (req.bodyText == null || new TextEncoder().encode(req.bodyText).length > MAX_BODY_BYTES) return await bad(413, 'payload_too_large', 'The body must be at most 64 KB.')
    let body
    try {
      body = JSON.parse(req.bodyText)
    } catch {
      return await bad(400, 'bad_request', 'The body is not valid JSON.')
    }
    const v = validateWrite(resource, body, { partial: action === 'update' })
    if (!v.ok) return await bad(422, 'validation_failed', 'Some fields are missing or invalid.', { fields: v.errors })
    try {
      if (action === 'create') return await ok(201, { data: await store.insert(resource.table, key.user_id, v.values, columns) })
      const row = await store.update(resource.table, key.user_id, id, { ...v.values, ...(resource.extraOnUpdate?.(v.values) ?? {}) }, columns)
      return row ? await ok(200, { data: row }) : await bad(404, 'not_found', 'No such record.')
    } catch (e) {
      if (['23514', '23502', '23503', '22P02', '22007', '22008', '23505'].includes(e?.code)) return await bad(422, 'validation_failed', 'The database refused those values.')
      throw e
    }
  } catch (e) {
    console.error('api:', requestId, e?.code ?? '', (e?.message ?? '').slice(0, 200)) // never the request body, headers or key
    return await finish(fail(500, 'server_error', 'Something went wrong. Quote the request id if you contact support.'))
  }
}
