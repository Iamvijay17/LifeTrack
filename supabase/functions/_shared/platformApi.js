// The public API and webhook contract, in one place: the scopes, the resources the gateway serves, the webhook events, the signing and the address checks.
// Pure JavaScript with no Deno or Node APIs (only Web Crypto and URL, which both runtimes and browsers have), so the same file serves:
//   * the `api` and `webhook-dispatch` Edge Functions,
//   * the in-app developer documentation and the OpenAPI document (generated from RESOURCES, so the docs can only describe endpoints that exist),
//   * the tests (packages/core/tests/platform-api.test.js).
// The web app and packages/core reach it through packages/core/src/platformApi.js.

export const API_VERSION = '1'
export const API_SCOPES = [
  { key: 'tasks:read', label: 'Read tasks' },
  { key: 'tasks:write', label: 'Create and update tasks' },
  { key: 'goals:read', label: 'Read goals' },
  { key: 'habits:read', label: 'Read habits' },
  { key: 'finance:read', label: 'Read transactions' },
  { key: 'finance:write', label: 'Add transactions' },
  { key: 'fitness:read', label: 'Read workouts' },
  { key: 'learning:read', label: 'Read study sessions' },
  { key: 'health:read', label: 'Read sleep and health logs' },
  { key: 'calendar:read', label: 'Read calendar events' },
  { key: 'calendar:write', label: 'Create calendar events' },
]
export const WEBHOOK_EVENTS = [
  { key: 'task.created', label: 'Task created' },
  { key: 'task.updated', label: 'Task updated' },
  { key: 'task.completed', label: 'Task completed' },
  { key: 'goal.created', label: 'Goal created' },
  { key: 'goal.completed', label: 'Goal completed' },
  { key: 'habit.completed', label: 'Habit completed' },
  { key: 'expense.created', label: 'Expense added' },
  { key: 'workout.logged', label: 'Workout logged' },
  { key: 'study.session.completed', label: 'Study session completed' },
  { key: 'calendar.event.created', label: 'Calendar event created' },
  { key: 'data.restored', label: 'Data restored from history' },
]

const TS = { type: 'string', format: 'date-time' }
const DATE = { type: 'string', format: 'date' }
/** Every resource the gateway serves. `read` lists the returned columns (never `user_id`); `write` the fields a client may send. */
export const RESOURCES = {
  tasks: {
    table: 'tasks', summary: 'Tasks', read: 'tasks:read', writeScope: 'tasks:write', methods: ['list', 'get', 'create', 'update'],
    columns: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, notes: { type: 'string' }, category: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'skipped', 'cancelled'] }, due_date: { ...DATE, nullable: true }, completed_at: { ...TS, nullable: true }, created_at: TS, updated_at: TS },
    filters: ['status', 'priority', 'category', 'due_date'],
    write: { title: { type: 'string', min: 1, max: 200, required: true }, notes: { type: 'string', max: 4000 }, category: { type: 'string', max: 40 },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'skipped', 'cancelled'] }, due_date: { type: 'date', nullable: true } },
    extraOnUpdate: (patch) => (patch.status === 'done' ? { completed_at: new Date().toISOString() } : patch.status ? { completed_at: null } : {}),
  },
  goals: {
    table: 'goals', summary: 'Goals', read: 'goals:read', methods: ['list', 'get'],
    columns: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, category: { type: 'string' }, target_minutes: { type: 'integer' }, due_date: { ...DATE, nullable: true },
      status: { type: 'string', enum: ['active', 'completed', 'archived'] }, created_at: TS, updated_at: TS },
    filters: ['status', 'category'],
  },
  habits: {
    table: 'habits', summary: 'Habits', read: 'habits:read', methods: ['list', 'get'],
    columns: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, description: { type: 'string' }, frequency: { type: 'string', enum: ['daily', 'weekly', 'custom'] },
      weekly_target: { type: 'integer' }, start_date: DATE, archived_at: { ...TS, nullable: true }, created_at: TS, updated_at: TS },
    filters: ['frequency'],
  },
  transactions: {
    table: 'transactions', summary: 'Transactions (income, expenses, savings)', read: 'finance:read', writeScope: 'finance:write', methods: ['list', 'get', 'create'],
    columns: { id: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['income', 'expense', 'savings'] }, amount_paise: { type: 'integer', description: 'Minor currency units (paise)' },
      category: { type: 'string' }, txn_date: DATE, note: { type: 'string' }, created_at: TS, updated_at: TS },
    filters: ['type', 'category', 'txn_date'],
    write: { type: { type: 'string', enum: ['income', 'expense', 'savings'], required: true }, amount_paise: { type: 'integer', min: 1, max: 100000000000, required: true },
      category: { type: 'string', max: 60 }, txn_date: { type: 'date', required: true }, note: { type: 'string', max: 500 } },
  },
  workouts: {
    table: 'workouts', summary: 'Workouts', read: 'fitness:read', methods: ['list', 'get'],
    columns: { id: { type: 'string', format: 'uuid' }, workout_date: DATE, name: { type: 'string' }, kind: { type: 'string' }, status: { type: 'string', enum: ['completed', 'skipped', 'rest'] },
      duration_minutes: { type: 'integer', nullable: true }, cardio_minutes: { type: 'integer', nullable: true }, created_at: TS, updated_at: TS },
    filters: ['status', 'kind', 'workout_date'],
  },
  'study-sessions': {
    table: 'study_sessions', summary: 'Study sessions', read: 'learning:read', methods: ['list', 'get'],
    columns: { id: { type: 'string', format: 'uuid' }, session_date: DATE, started_at: TS, ended_at: { ...TS, nullable: true }, duration_seconds: { type: 'integer', nullable: true },
      status: { type: 'string', enum: ['running', 'completed', 'discarded'] }, source: { type: 'string' }, problems_solved: { type: 'integer' }, created_at: TS, updated_at: TS },
    filters: ['status', 'session_date'],
  },
  'health-logs': {
    table: 'health_logs', summary: 'Sleep and health logs', read: 'health:read', methods: ['list', 'get'],
    columns: { id: { type: 'string', format: 'uuid' }, log_date: DATE, sleep_minutes: { type: 'integer', nullable: true }, water_ml: { type: 'integer' }, steps: { type: 'integer' },
      energy_level: { type: 'integer', nullable: true }, weight_kg: { type: 'number', nullable: true }, created_at: TS, updated_at: TS },
    filters: ['log_date'],
  },
  'calendar-events': {
    table: 'calendar_events', summary: 'Calendar events', read: 'calendar:read', writeScope: 'calendar:write', methods: ['list', 'get', 'create'],
    columns: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, category: { type: 'string' },
      priority: { type: 'string' }, all_day: { type: 'boolean' }, starts_at: TS, ends_at: TS, timezone: { type: 'string' }, created_at: TS, updated_at: TS },
    filters: ['category'],
    write: { title: { type: 'string', min: 1, max: 200, required: true }, description: { type: 'string', max: 4000 }, location: { type: 'string', max: 200 },
      category: { type: 'string', max: 20 }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, all_day: { type: 'boolean' },
      starts_at: { type: 'timestamp', required: true }, ends_at: { type: 'timestamp', required: true } },
    rules: (v) => (v.starts_at && v.ends_at && Date.parse(v.ends_at) <= Date.parse(v.starts_at) ? { ends_at: 'must be after starts_at' } : null),
  },
}

export const PAGE = { defaultLimit: 25, maxLimit: 100 }
export const MAX_BODY_BYTES = 64 * 1024
export const KEY_PATTERN = /^lt_live_[A-Za-z0-9_-]{43}$/

// ------------------------------------------------------------------------------------------------------------------ hashing and signing
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const enc = new TextEncoder()
/** The SHA-256 of an API key, as it is stored (the key itself is never stored). */
export const hashKey = async (key) => hex(await crypto.subtle.digest('SHA-256', enc.encode(key)))
/** Constant-time comparison of two equal-purpose strings. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
/** `v1=` + HMAC-SHA256(secret, `${timestamp}.${body}`). The timestamp is part of what is signed, so a captured request cannot be replayed with a new time. */
export async function signWebhook(secret, timestamp, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return `v1=${hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`)))}`
}
/** What a RECEIVER runs (and the docs show): checks the signature and rejects a timestamp older than `toleranceSeconds` (default 5 minutes). */
export async function verifyWebhook({ secret, signature, timestamp, body, now = Date.now(), toleranceSeconds = 300 }) {
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSeconds) return { ok: false, reason: 'stale_timestamp' }
  const expected = await signWebhook(secret, timestamp, body)
  return safeEqual(expected, String(signature ?? '')) ? { ok: true } : { ok: false, reason: 'bad_signature' }
}

// ------------------------------------------------------------------------------------------------------------------ webhook delivery rules
/** Seconds to wait before attempt `n + 1` after `n` failed ones: 30 s, 1 min, 2 min, 4 min … capped at 6 hours. `random` (0..1) adds ±20% so retries spread out. */
export function backoffSeconds(attemptsDone, random = 0.5) {
  const base = Math.min(30 * 2 ** Math.max(attemptsDone - 1, 0), 6 * 3600)
  return Math.round(base * (0.8 + 0.4 * random))
}
const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
/** False for every address that is not a normal public one (loopback, private, link-local incl. cloud metadata, carrier NAT, documentation, multicast, reserved). */
export function isPublicIp(ip) {
  const s = String(ip).trim().toLowerCase().replace(/^\[|\]$/g, '')
  const m = V4.exec(s)
  if (m) {
    const [a, b, c] = m.slice(1).map(Number)
    if (m.slice(1).some((x) => Number(x) > 255)) return false
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    if (a === 198 && b === 51 && c === 100) return false
    if (a === 203 && b === 0 && c === 113) return false
    return true
  }
  if (!s.includes(':')) return false
  const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (mapped) return isPublicIp(mapped[1])
  if (s === '::' || s === '::1') return false
  const first = parseInt(s.split(':')[0] || '0', 16)
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return false // unique-local, link-local, multicast
  if (s.startsWith('2001:db8') || s.startsWith('2001:0db8')) return false
  return true
}
const BLOCKED_NAME = /(^|\.)(localhost|local|internal|lan|home|corp|intranet|localdomain)$/
/**
 * First check of a webhook address, before any network call: https only (http only when `allowHttp`, for local development), no credentials, no
 * IP-literal or internal host name. The delivery code then resolves the name and checks every address with isPublicIp.
 */
export function checkWebhookUrl(raw, { allowHttp = false } = {}) {
  let u
  try { u = new URL(String(raw)) } catch { return { ok: false, reason: 'Enter a full web address.' } }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) return { ok: false, reason: 'Use an https:// address.' }
  if (u.username || u.password) return { ok: false, reason: 'The address must not contain a user name or password.' }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || BLOCKED_NAME.test(host)) return { ok: false, reason: 'That address is internal; use a public server.' }
  if (V4.test(host) || host.includes(':')) {
    if (!isPublicIp(host)) return { ok: false, reason: 'That address is internal; use a public server.' }
    return { ok: false, reason: 'Use a host name, not an IP address.' }
  }
  if (!host.includes('.')) return { ok: false, reason: 'Use a full host name.' }
  return { ok: true, host, url: u.toString() }
}

// ------------------------------------------------------------------------------------------------------------------ API: validation, paging
export const encodeCursor = (row) => btoa(JSON.stringify({ c: row.created_at, i: row.id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function decodeCursor(text) {
  try {
    const j = JSON.parse(atob(String(text).replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof j.c === 'string' && !Number.isNaN(Date.parse(j.c)) && /^[0-9a-f-]{36}$/.test(j.i)) return { createdAt: j.c, id: j.i }
  } catch { /* fall through */ }
  return null
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)
/** Checks a request body against a resource's `write` fields. Unknown fields are an error (no silent drops); on update every field is optional. */
export function validateWrite(resource, body, { partial = false } = {}) {
  const spec = resource.write ?? {}
  const errors = {}
  const out = {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { body: 'Send a JSON object.' } }
  for (const k of Object.keys(body)) if (!(k in spec)) errors[k] = 'unknown field'
  for (const [k, f] of Object.entries(spec)) {
    const v = body[k]
    if (v === undefined) {
      if (f.required && !partial) errors[k] = 'required'
      continue
    }
    if (v === null) {
      if (f.nullable) out[k] = null
      else errors[k] = 'cannot be null'
      continue
    }
    if (f.type === 'string') {
      if (typeof v !== 'string') errors[k] = 'must be a string'
      else if (f.enum && !f.enum.includes(v)) errors[k] = `must be one of: ${f.enum.join(', ')}`
      else if (v.length > (f.max ?? 1000)) errors[k] = `must be at most ${f.max ?? 1000} characters`
      else if (v.trim().length < (f.min ?? 0)) errors[k] = 'must not be empty'
      else out[k] = v
    } else if (f.type === 'integer') {
      if (!Number.isInteger(v)) errors[k] = 'must be a whole number'
      else if (v < (f.min ?? -Infinity) || v > (f.max ?? Infinity)) errors[k] = `must be between ${f.min} and ${f.max}`
      else out[k] = v
    } else if (f.type === 'boolean') {
      if (typeof v !== 'boolean') errors[k] = 'must be true or false'
      else out[k] = v
    } else if (f.type === 'date') {
      if (!isDate(v)) errors[k] = 'must be a date like 2026-11-24'
      else out[k] = v
    } else if (f.type === 'timestamp') {
      if (typeof v !== 'string' || Number.isNaN(Date.parse(v)) || !/^\d{4}-\d{2}-\d{2}T/.test(v)) errors[k] = 'must be an ISO 8601 timestamp'
      else out[k] = new Date(v).toISOString()
    }
  }
  if (partial && !Object.keys(out).length && !Object.keys(errors).length) errors.body = 'Send at least one field to change.'
  if (!Object.keys(errors).length && resource.rules) Object.assign(errors, resource.rules(out) ?? {})
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values: out }
}

// ------------------------------------------------------------------------------------------------------------------ OpenAPI (generated)
const schemaOf = (cols) => ({ type: 'object', properties: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, { ...v }])) })
const writeSchema = (w) => ({ type: 'object', additionalProperties: false, required: Object.entries(w).filter(([, f]) => f.required).map(([k]) => k),
  properties: Object.fromEntries(Object.entries(w).map(([k, f]) => [k, { type: f.type === 'date' ? 'string' : f.type === 'timestamp' ? 'string' : f.type, ...(f.type === 'date' ? { format: 'date' } : {}), ...(f.type === 'timestamp' ? { format: 'date-time' } : {}),
    ...(f.enum ? { enum: f.enum } : {}), ...(f.max && f.type === 'string' ? { maxLength: f.max } : {}), ...(f.nullable ? { nullable: true } : {}) }])) })
const ERR = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
/** The OpenAPI 3.0 document for exactly the endpoints in RESOURCES plus the health and `me` routes. */
export function buildOpenApi(baseUrl = 'https://<project-ref>.supabase.co/functions/v1/api') {
  const paths = {
    '/health': { get: { summary: 'Service status', security: [], responses: { 200: { description: 'OK' } } } },
    '/health/live': { get: { summary: 'Liveness probe', security: [], responses: { 200: { description: 'The service is running' } } } },
    '/health/ready': { get: { summary: 'Readiness probe (checks the database)', security: [], responses: { 200: { description: 'Ready' }, 503: { description: 'Not ready' } } } },
    '/v1/me': { get: { summary: 'The key you are using: its name, permissions, expiry and limit', responses: { 200: { description: 'OK' }, 401: ERR } } },
  }
  const params = (r) => [
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: PAGE.maxLimit, default: PAGE.defaultLimit } },
    { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'The `next_cursor` of the previous page' },
    { name: 'updated_since', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Only records changed at or after this time' },
    ...r.filters.map((f) => ({ name: f, in: 'query', schema: { type: 'string' }, description: `Exact match on ${f}` })),
  ]
  for (const [name, r] of Object.entries(RESOURCES)) {
    const schema = `#/components/schemas/${name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`
    const sec = (scope) => [{ ApiKey: [scope] }]
    const idParam = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }]
    if (r.methods.includes('list') || r.methods.includes('create')) paths[`/v1/${name}`] = {}
    if (r.methods.includes('list')) paths[`/v1/${name}`].get = { summary: `List ${r.summary.toLowerCase()}`, security: sec(r.read), parameters: params(r),
      responses: { 200: { description: 'A page', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: schema } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } }, 401: ERR, 403: ERR, 429: ERR } }
    if (r.methods.includes('create')) paths[`/v1/${name}`].post = { summary: `Create (${r.summary.toLowerCase()})`, security: sec(r.writeScope),
      requestBody: { required: true, content: { 'application/json': { schema: writeSchema(r.write) } } },
      responses: { 201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: schema } } } } } }, 401: ERR, 403: ERR, 422: ERR, 429: ERR } }
    if (r.methods.includes('get') || r.methods.includes('update')) paths[`/v1/${name}/{id}`] = {}
    if (r.methods.includes('get')) paths[`/v1/${name}/{id}`].get = { summary: `Get one (${r.summary.toLowerCase()})`, security: sec(r.read), parameters: idParam,
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: schema } } } } } }, 404: ERR, 401: ERR, 403: ERR, 429: ERR } }
    if (r.methods.includes('update')) paths[`/v1/${name}/{id}`].patch = { summary: `Update (${r.summary.toLowerCase()})`, security: sec(r.writeScope), parameters: idParam,
      requestBody: { required: true, content: { 'application/json': { schema: { ...writeSchema(r.write), required: [] } } } },
      responses: { 200: { description: 'Updated' }, 404: ERR, 401: ERR, 403: ERR, 422: ERR, 429: ERR } }
  }
  const schemas = {
    Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, request_id: { type: 'string' }, fields: { type: 'object' } } } } },
    Pagination: { type: 'object', properties: { limit: { type: 'integer' }, has_more: { type: 'boolean' }, next_cursor: { type: 'string', nullable: true } } },
  }
  for (const [name, r] of Object.entries(RESOURCES)) schemas[name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())] = schemaOf(r.columns)
  return {
    openapi: '3.0.3',
    info: { title: 'LifeTrack API', version: API_VERSION, description: 'Read and write your own LifeTrack data with a scoped API key. Server-side use only: never put a key in a web page or mobile app.' },
    servers: [{ url: baseUrl }],
    security: [{ ApiKey: [] }],
    components: { securitySchemes: { ApiKey: { type: 'http', scheme: 'bearer', description: 'Authorization: Bearer lt_live_…' } }, schemas },
    paths,
  }
}
export const ERROR_CODES = [
  { status: 400, code: 'bad_request', meaning: 'The request could not be understood (bad JSON, bad cursor, unknown parameter).' },
  { status: 401, code: 'missing_key', meaning: 'No API key was sent.' },
  { status: 401, code: 'invalid_key', meaning: 'The key does not exist.' },
  { status: 401, code: 'revoked_key', meaning: 'The key was revoked.' },
  { status: 401, code: 'expired_key', meaning: 'The key has expired.' },
  { status: 403, code: 'insufficient_scope', meaning: 'The key does not have the permission this endpoint needs.' },
  { status: 404, code: 'not_found', meaning: 'No such endpoint or record.' },
  { status: 405, code: 'method_not_allowed', meaning: 'That method is not available on this endpoint.' },
  { status: 413, code: 'payload_too_large', meaning: 'The body is larger than 64 KB.' },
  { status: 415, code: 'unsupported_media_type', meaning: 'Send Content-Type: application/json.' },
  { status: 422, code: 'validation_failed', meaning: 'A field is missing or invalid; `error.fields` says which.' },
  { status: 429, code: 'rate_limited', meaning: 'Too many requests; wait for Retry-After seconds.' },
  { status: 500, code: 'server_error', meaning: 'Something went wrong on our side. Quote the request id.' },
]
