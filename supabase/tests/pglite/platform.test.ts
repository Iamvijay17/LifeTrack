import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// 0027_platform.sql against the real migrated schema: audit history (append-only, chained, restorable), system health authorisation, API keys, webhooks.
let ctx: Awaited<ReturnType<typeof createDb>>
let A: string
let B: string
beforeAll(async () => {
  ctx = await createDb()
  A = await ctx.newUser('a@example.com')
  B = await ctx.newUser('b@example.com')
})
afterAll(async () => { await ctx.db.close() })
const asA = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(A, fn)
const asB = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(B, fn)
const events = (q: Q, where = 'true') => q(`select * from audit_events where ${where} order by seq`).then((r) => r.rows)

describe('audit history', () => {
  it('records create, update and delete with the changed fields and old/new values', async () => {
    const t = await asA(async (q) => (await q(`insert into tasks (title, priority) values ('Write report', 'low') returning id`)).rows[0].id)
    await asA((q) => q(`update tasks set title = 'Write the report', priority = 'high' where id = '${t}'`))
    await asA((q) => q(`delete from tasks where id = '${t}'`))
    const ev = await asA((q) => events(q, `entity = 'tasks' and record_id = '${t}'`))
    expect(ev.map((e) => e.action)).toEqual(['create', 'update', 'delete'])
    expect(ev[0].new_values.title).toBe('Write report')
    expect(ev[1].changed_fields).toEqual(['priority', 'title'])
    expect(ev[1].old_values).toEqual({ priority: 'low', title: 'Write report' })
    expect(ev[1].new_values).toEqual({ priority: 'high', title: 'Write the report' })
    expect(ev[2].old_values.title).toBe('Write the report')
    expect(ev[2].summary).toBe('Write the report')
  })
  it('does not record a write that changed nothing but updated_at', async () => {
    const t = await asA(async (q) => (await q(`insert into tasks (title) values ('Quiet') returning id`)).rows[0].id)
    const before = (await asA((q) => events(q, `record_id = '${t}'`))).length
    await asA((q) => q(`update tasks set title = 'Quiet' where id = '${t}'`))
    expect((await asA((q) => events(q, `record_id = '${t}'`))).length).toBe(before)
  })
  it('keeps people apart and cannot be written, edited or erased by a client', async () => {
    expect((await asB((q) => events(q, `entity <> 'user_settings'`))).length).toBe(0)
    expect(await ctx.fails(asA((q) => q(`insert into audit_events (user_id, action, entity, hash) values ('${A}', 'create', 'x', 'h')`)))).toMatch(/permission denied/)
    expect(await ctx.fails(asA((q) => q(`update audit_events set summary = 'edited'`)))).toMatch(/permission denied/)
    expect(await ctx.fails(asA((q) => q(`delete from audit_events`)))).toMatch(/permission denied/)
    // even the table owner / service role hit the guard
    expect(await ctx.fails(ctx.db.query(`update audit_events set summary = 'edited'`))).toMatch(/append-only/)
    expect(await ctx.fails(ctx.db.query(`delete from audit_events`))).toMatch(/append-only/)
    expect(await ctx.fails(ctx.db.query(`truncate audit_events`))).toMatch(/append-only/)
  })
  it('cannot be forged through the internal writer', async () => {
    expect(await ctx.fails(asA((q) => q(`select _audit_insert('${B}', 'create', 'insert', 'tasks', null, 'fake', '{}', null, null, false)`)))).toMatch(/permission denied/)
  })
  it('chains events and detects tampering', async () => {
    expect((await asA((q) => q(`select audit_verify_chain() r`))).rows[0].r.ok).toBe(true)
    await ctx.db.exec(`set lifetrack.audit_maintenance = 'on'; update audit_events set summary = 'sneaky', old_values = '{"title":"forged"}' where entity = 'tasks' and action = 'delete'; set lifetrack.audit_maintenance = 'off';`)
    const r = (await asA((q) => q(`select audit_verify_chain() r`))).rows[0].r
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('hash')
  })
  it('never copies credentials into the log and redacts hash/token style keys', async () => {
    const r = (await ctx.db.query(`select _redact('{"title":"x","password":"p","refresh_token":"t","api_key":"k","pin_hash":"h","external_hash":"keep","note":"n"}'::jsonb) r`)).rows[0] as any
    expect(Object.keys(r.r).sort()).toEqual(['external_hash', 'note', 'title'])
  })
  it('records reported events (sign-in, export) with a small whitelist', async () => {
    await asA((q) => q(`select log_audit_event('login', 'auth', 'Signed in', '{"method":"password","password":"nope"}')`))
    const e = (await asA((q) => events(q, `action = 'login'`)))[0]
    expect(e.new_values).toEqual({ method: 'password' })
    expect(await ctx.fails(asA((q) => q(`select log_audit_event('delete', 'tasks')`)))).toMatch(/Unknown audit action/)
    expect(await ctx.fails(asA((q) => q(`select log_audit_event('login', 'Bad Entity!')`)))).toMatch(/Invalid audit entity/)
  })
  it('captures request id, source and a coarse IP from the request headers', async () => {
    await ctx.db.exec(`select set_config('request.headers', '{"x-request-id":"req-123","x-lifetrack-source":"mobile","x-forwarded-for":"203.0.113.77","user-agent":"UA/1"}', false)`)
    const id = await asA(async (q) => (await q(`insert into tasks (title) values ('Headers') returning id`)).rows[0].id)
    await ctx.db.exec(`select set_config('request.headers', '', false)`)
    const e = (await asA((q) => events(q, `record_id = '${id}'`)))[0]
    expect(e.request_id).toBe('req-123')
    expect(e.source).toBe('mobile')
    expect(e.ip_prefix).toBe('203.0.113.0/24')
    expect(e.user_agent).toBe('UA/1')
  })
  it('closes the history of a locked module together with the module', async () => {
    await asA((q) => q(`insert into transactions (type, amount_paise, category, txn_date) values ('expense', 5000, 'Food', '2026-11-01')`))
    expect((await asA((q) => events(q, `entity = 'transactions'`))).length).toBe(1)
    const s = await ctx.newSession(A)
    await ctx.db.query(`insert into user_security (user_id, app_lock_enabled, pin_hash, pin_length) values ('${A}', true, 'x', 4) on conflict (user_id) do update set app_lock_enabled = true`)
    expect((await ctx.asUser(A, (q) => events(q, `entity = 'transactions'`), s)).length).toBe(0) // locked session
    await ctx.db.query(`update user_security set app_lock_enabled = false where user_id = '${A}'`)
  })
})

describe('restore', () => {
  let task: string
  beforeAll(async () => {
    task = await asA(async (q) => (await q(`insert into tasks (title, priority) values ('Original', 'low') returning id`)).rows[0].id)
  })
  it('previews a revert, applies it, and records a restore event', async () => {
    await asA((q) => q(`update tasks set title = 'Edited by mistake' where id = '${task}'`))
    const ev = (await asA((q) => events(q, `record_id = '${task}' and action = 'update'`))).pop()
    const preview = (await asA((q) => q(`select audit_restore('${ev.id}') r`))).rows[0].r
    expect(preview).toMatchObject({ restorable: true, mode: 'revert', applied: false })
    expect(preview.changes).toEqual([{ field: 'title', current: 'Edited by mistake', restore_to: 'Original' }])
    expect((await asA((q) => q(`select title from tasks where id = '${task}'`))).rows[0].title).toBe('Edited by mistake') // preview wrote nothing
    const done = (await asA((q) => q(`select audit_restore('${ev.id}', true) r`))).rows[0].r
    expect(done.applied).toBe(true)
    expect((await asA((q) => q(`select title from tasks where id = '${task}'`))).rows[0].title).toBe('Original')
    const last = (await asA((q) => events(q, `record_id = '${task}'`))).pop()
    expect(last.action).toBe('restore')
    expect(last.restored_from).toBe(ev.id)
  })
  it('refuses to overwrite newer data (conflict detection)', async () => {
    await asA((q) => q(`update tasks set title = 'Second' where id = '${task}'`))
    const first = (await asA((q) => events(q, `record_id = '${task}' and action = 'update'`))).pop()
    await asA((q) => q(`update tasks set title = 'Third' where id = '${task}'`))
    const r = (await asA((q) => q(`select audit_restore('${first.id}', true) r`))).rows[0].r
    expect(r).toMatchObject({ restorable: false, reason: 'conflict' })
    expect(r.conflicts[0]).toMatchObject({ field: 'title', expected: 'Second', current: 'Third' })
    expect((await asA((q) => q(`select title from tasks where id = '${task}'`))).rows[0].title).toBe('Third')
  })
  it('re-creates a deleted record, once', async () => {
    const id = await asA(async (q) => (await q(`insert into tasks (title, notes) values ('Gone', 'important') returning id`)).rows[0].id)
    await asA((q) => q(`delete from tasks where id = '${id}'`))
    const del = (await asA((q) => events(q, `record_id = '${id}' and action = 'delete'`)))[0]
    const r = (await asA((q) => q(`select audit_restore('${del.id}', true) r`))).rows[0].r
    expect(r).toMatchObject({ applied: true, mode: 'recreate' })
    expect((await asA((q) => q(`select title, notes from tasks where id = '${id}'`))).rows[0]).toEqual({ title: 'Gone', notes: 'important' })
    expect((await asA((q) => q(`select audit_restore('${del.id}', true) r`))).rows[0].r).toMatchObject({ restorable: false, reason: 'exists' })
  })
  it('explains a missing dependency instead of failing', async () => {
    const topic = await asA(async (q) => (await q(`insert into learning_topics (group_name, name) values ('DSA', 'Graphs') returning id`)).rows[0].id)
    const g = await asA(async (q) => (await q(`insert into goals (title, topic_id) values ('Goal', '${topic}') returning id`)).rows[0].id)
    await asA((q) => q(`delete from goals where id = '${g}'`))
    await asA((q) => q(`delete from learning_topics where id = '${topic}'`))
    const del = (await asA((q) => events(q, `record_id = '${g}' and action = 'delete'`)))[0]
    expect((await asA((q) => q(`select audit_restore('${del.id}', true) r`))).rows[0].r).toMatchObject({ restorable: false, reason: 'dependency' })
  })
  it('does not restore other people\'s events, creations or settings', async () => {
    const ev = (await asA((q) => events(q, `action = 'create' and entity = 'tasks'`)))[0]
    expect((await asA((q) => q(`select audit_restore('${ev.id}', true) r`))).rows[0].r.reason).toBe('created')
    expect((await asB((q) => q(`select audit_restore('${ev.id}') r`))).rows[0].r.reason).toBe('not_found')
  })
  it('queues the data.restored webhook for subscribers', async () => {
    const ep = (await asA((q) => q(`select create_webhook_endpoint('https://hooks.example.com/in', 'x', '{data.restored}') r`))).rows[0].r
    const id = await asA(async (q) => (await q(`insert into tasks (title) values ('Hook') returning id`)).rows[0].id)
    await asA((q) => q(`update tasks set title = 'Hook2' where id = '${id}'`))
    const upd = (await asA((q) => events(q, `record_id = '${id}' and action = 'update'`)))[0]
    await asA((q) => q(`select audit_restore('${upd.id}', true)`))
    const d = (await asA((q) => q(`select event_type from webhook_deliveries where endpoint_id = '${ep.id}'`))).rows
    expect(d.map((x: any) => x.event_type)).toEqual(['data.restored'])
  })
  it('a direct call to _emit_restored without a real restore queues nothing (0032)', async () => {
    const ep = (await asA((q) => q(`select create_webhook_endpoint('https://hooks.example.com/in', 'x', '{data.restored}') r`))).rows[0].r
    const id = await asA(async (q) => (await q(`insert into tasks (title) values ('Fake') returning id`)).rows[0].id)
    await asA((q) => q(`update tasks set title = 'Fake2' where id = '${id}'`))
    const upd = (await asA((q) => events(q, `record_id = '${id}' and action = 'update'`)))[0]
    await asA((q) => q(`select _emit_restored('${upd.id}', 'revert')`)) // nothing was restored
    await asA((q) => q(`select _emit_restored('${upd.id}', 'anything')`))
    expect((await asA((q) => q(`select 1 from webhook_deliveries where endpoint_id = '${ep.id}'`))).rows).toHaveLength(0)
  })
})

describe('system health authorisation', () => {
  it('only listed administrators can call the admin functions', async () => {
    for (const fn of ['admin_system_overview()', 'admin_system_metrics(24)', 'admin_system_errors(10, 0, null)']) {
      expect(await ctx.fails(asA((q) => q(`select ${fn}`)))).toMatch(/Administrator access required/)
    }
    expect((await asA((q) => q(`select is_platform_admin() r`))).rows[0].r).toBe(false)
    expect(await ctx.fails(asA((q) => q(`select * from platform_admins`)))).toMatch(/permission denied/)
    expect(await ctx.fails(asA((q) => q(`select * from app_errors`)))).toMatch(/permission denied/)
    await ctx.db.query(`insert into platform_admins (user_id) values ('${B}')`)
    const o = (await asB((q) => q(`select admin_system_overview() r`))).rows[0].r
    expect(o.database.ok).toBe(true)
    expect(o.api.requests).toBe(0)
    expect(Object.keys(o)).toEqual(expect.arrayContaining(['api', 'errors', 'jobs', 'webhooks', 'incidents', 'last_backup_at']))
    expect(JSON.stringify(o)).not.toMatch(/secret|password|postgres:\/\//i)
  })
  it('deduplicates client errors, rate-limits them and stores no personal data', async () => {
    for (let i = 0; i < 3; i++) await asA((q) => q(`select report_client_error('frontend', 'Boom', E'Error: Boom\n  at f (app.js:1)', '/tasks?token=abc#x', 'v1')`))
    const e = (await asB((q) => q(`select admin_system_errors(10, 0, null) r`))).rows[0].r
    expect(e.total).toBe(1)
    expect(e.items[0]).toMatchObject({ message: 'Boom', occurrences: 3, route: '/tasks', category: 'frontend' })
    expect(Object.keys(e.items[0])).not.toContain('user_id')
    let allowed = 0
    for (let i = 0; i < 30; i++) if ((await asA((q) => q(`select report_client_error('sync', 'Sync ${i}') r`))).rows[0].r) allowed++
    expect(allowed).toBeLessThan(30)
  })
  it('summarises the API gateway metrics and job runs', async () => {
    await ctx.asService((q) => q(`select api_record(null, null, null, 'GET', '/v1/tasks', 401, 12, 'invalid_key')`))
    await ctx.asService((q) => q(`select api_record(null, null, null, 'GET', '/v1/tasks', 500, 1500, 'server_error')`))
    await ctx.asService((q) => q(`select record_job_run('webhook-dispatch', 'ok', 40)`))
    await ctx.asService((q) => q(`select record_job_run('webhook-dispatch', 'error', 40, '', 'boom')`))
    const o = (await asB((q) => q(`select admin_system_overview() r`))).rows[0].r
    expect(o.api).toMatchObject({ requests: 2, errors_4xx: 1, errors_5xx: 1, auth_failures: 1, slow: 1 })
    expect(o.jobs[0]).toMatchObject({ job: 'webhook-dispatch', failures_24h: 1, last_status: 'error' })
    expect(o.incidents.some((i: any) => i.kind === 'job')).toBe(true)
    const m = (await asB((q) => q(`select admin_system_metrics(6) r`))).rows[0].r
    expect(m.series).toHaveLength(6)
    expect(m.series.at(-1).requests).toBe(2)
    expect(await ctx.fails(asA((q) => q(`select record_job_run('x', 'ok', 1)`)))).toMatch(/permission denied/)
  })
})

describe('API keys', () => {
  let key: string
  let keyId: string
  it('creates a key once, stores only its hash, and never lets a client read the hash', async () => {
    const r = (await asA((q) => q(`select create_api_key('CI', 'build bot', '{tasks:read,tasks:write}', 30, 30) r`))).rows[0].r
    key = r.key
    keyId = r.id
    expect(key).toMatch(/^lt_live_[A-Za-z0-9_-]{43}$/)
    const stored = (await ctx.db.query(`select key_hash, key_prefix, scopes, expires_at is not null as exp from api_keys where id = '${keyId}'`)).rows[0] as any
    expect(stored.key_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.key_hash).not.toContain(key)
    expect(key.startsWith(stored.key_prefix)).toBe(true)
    expect(stored.exp).toBe(true)
    expect(await ctx.fails(asA((q) => q(`select key_hash from api_keys`)))).toMatch(/permission denied/)
    expect((await asA((q) => q(`select name, scopes from api_keys`))).rows).toHaveLength(1)
    expect((await asB((q) => q(`select name from api_keys`))).rows).toHaveLength(0)
    expect((await ctx.db.query(`select count(*)::int n from audit_events where entity = 'api_key'`)).rows[0]).toEqual({ n: 1 })
  })
  it('validates input', async () => {
    expect(await ctx.fails(asA((q) => q(`select create_api_key('', '', '{tasks:read}')`)))).toMatch(/name/)
    expect(await ctx.fails(asA((q) => q(`select create_api_key('x', '', '{root:all}')`)))).toMatch(/valid permission/)
    expect(await ctx.fails(asA((q) => q(`select create_api_key('x', '', '{}')`)))).toMatch(/valid permission/)
    expect(await ctx.fails(asA((q) => q(`select create_api_key('x', '', '{tasks:read}', 0)`)))).toMatch(/Expiry/)
    expect(await ctx.fails(asA((q) => q(`select create_api_key('x', '', '{tasks:read}', 1, 9999)`)))).toMatch(/rate limit/)
  })
  it('authenticates by hash and refuses revoked and expired keys', async () => {
    const hash = (await ctx.db.query(`select encode(extensions.digest('${key}', 'sha256'), 'hex') h`)).rows[0] as any
    const ok = (await ctx.asService((q) => q(`select api_authenticate('${hash.h}') r`))).rows[0].r
    expect(ok).toMatchObject({ ok: true, user_id: A, scopes: ['tasks:read', 'tasks:write'], rate_limit_per_min: 30 })
    expect((await ctx.asService((q) => q(`select api_authenticate('${'0'.repeat(64)}') r`))).rows[0].r).toMatchObject({ ok: false, reason: 'invalid' })
    await ctx.db.query(`update api_keys set expires_at = now() - interval '1 minute' where id = '${keyId}'`)
    expect((await ctx.asService((q) => q(`select api_authenticate('${hash.h}') r`))).rows[0].r.reason).toBe('expired')
    await ctx.db.query(`update api_keys set expires_at = null where id = '${keyId}'`)
    await asA((q) => q(`select revoke_api_key('${keyId}')`))
    expect((await ctx.asService((q) => q(`select api_authenticate('${hash.h}') r`))).rows[0].r.reason).toBe('revoked')
    expect(await ctx.fails(asA((q) => q(`select revoke_api_key('${keyId}')`)))).toMatch(/already revoked/)
    expect(await ctx.fails(asA((q) => q(`select api_authenticate('${hash.h}')`)))).toMatch(/permission denied/)
  })
  it('counts requests per minute window and blocks over the limit', async () => {
    const id = (await asA((q) => q(`select create_api_key('rl', '', '{tasks:read}', null, 3) r`))).rows[0].r.id
    const hits = []
    for (let i = 0; i < 5; i++) hits.push((await ctx.asService((q) => q(`select api_rate_hit('${id}', 3) r`))).rows[0].r.allowed)
    expect(hits).toEqual([true, true, true, false, false])
  })
  it('logs requests for the owner and summarises usage', async () => {
    const id = (await asA((q) => q(`select create_api_key('usage', '', '{tasks:read}') r`))).rows[0].r.id
    await ctx.asService((q) => q(`select api_record('${id}', '${A}', 'r1', 'GET', '/v1/tasks', 200, 20, null)`))
    await ctx.asService((q) => q(`select api_record('${id}', '${A}', 'r2', 'GET', '/v1/tasks', 429, 3, 'rate_limited')`))
    const u = (await asA((q) => q(`select api_usage_summary(7) r`))).rows[0].r
    expect(u.totals).toMatchObject({ requests: 2, ok: 1, client_errors: 1, rate_limited: 1 })
    expect(u.daily).toHaveLength(7)
    expect(u.top[0]).toMatchObject({ path: '/v1/tasks', requests: 2, errors: 1 })
    expect((await asB((q) => q(`select api_usage_summary(7) r`))).rows[0].r.totals.requests).toBe(0)
    expect((await ctx.db.query(`select request_count::int n, last_used_at is not null u from api_keys where id = '${id}'`)).rows[0]).toEqual({ n: 2, u: true })
  })
})

describe('webhooks', () => {
  let ep: string
  let secret: string
  it('registers an endpoint, shows the secret once and keeps it away from clients', async () => {
    const r = (await asA((q) => q(`select create_webhook_endpoint('https://example.com/hook', 'prod', '{task.created,task.completed,expense.created}', 4000, 3) r`))).rows[0].r
    ep = r.id
    secret = r.secret
    expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/)
    expect(await ctx.fails(asA((q) => q(`select * from webhook_secrets`)))).toMatch(/permission denied/)
    expect(await ctx.fails(asA((q) => q(`insert into webhook_endpoints (url, events) values ('https://x.example.com', '{task.created}')`)))).toMatch(/permission denied/)
    expect(Object.keys((await asA((q) => q(`select * from webhook_endpoints where id = '${ep}'`))).rows[0])).not.toContain('secret')
    expect((await asB((q) => q(`select * from webhook_endpoints`))).rows).toHaveLength(0)
  })
  it('rejects unsafe addresses and unknown events', async () => {
    for (const url of ['http://example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://user:pw@example.com/x', 'https://intranet.internal/x', 'https://single/x', 'ftp://example.com'])
      expect(await ctx.fails(asA((q) => q(`select create_webhook_endpoint('${url}', '', '{task.created}')`))), url).toMatch(/address|internal|host|https/i)
    expect(await ctx.fails(asA((q) => q(`select create_webhook_endpoint('https://example.com/x', '', '{task.exploded}')`)))).toMatch(/valid event/)
  })
  it('queues one delivery per subscribed event, idempotently', async () => {
    const t = await asA(async (q) => (await q(`insert into tasks (title) values ('Hooked') returning id`)).rows[0].id)
    await asA((q) => q(`update tasks set title = 'Hooked 2' where id = '${t}'`)) // task.updated: not subscribed
    await asA((q) => q(`update tasks set status = 'done' where id = '${t}'`))
    await asA((q) => q(`insert into transactions (type, amount_paise, txn_date) values ('income', 100, '2026-11-02'), ('expense', 250, '2026-11-02')`))
    const d = (await asA((q) => q(`select event_type, payload from webhook_deliveries where endpoint_id = '${ep}' order by created_at, event_type`))).rows as any[]
    expect(d.map((x) => x.event_type).sort()).toEqual(['expense.created', 'task.completed', 'task.created'])
    expect(d.find((x) => x.event_type === 'task.created').payload.data.task.title).toBe('Hooked')
    // the same event key can not be queued twice
    const n = (await ctx.db.query(`select _emit_webhook('${A}', 'task.created', 'task.created:${t}', '{}') n`)).rows[0] as any
    expect(n.n).toBe(0)
    // a disabled endpoint receives nothing
    await asA((q) => q(`select update_webhook_endpoint('${ep}', 'https://example.com/hook', 'prod', '{task.created}', false, 4000, 3)`))
    await asA((q) => q(`insert into tasks (title) values ('Not sent')`))
    expect((await asA((q) => q(`select count(*)::int n from webhook_deliveries where endpoint_id = '${ep}'`))).rows[0].n).toBe(3)
    await asA((q) => q(`select update_webhook_endpoint('${ep}', 'https://example.com/hook', 'prod', '{task.created,task.completed,expense.created}', true, 4000, 3)`))
  })
  it('never lets a broken webhook trigger fail the user\'s own write', async () => {
    await ctx.db.query(`alter table webhook_deliveries add constraint boom check (event_key <> 'x') not valid`)
    await ctx.db.query(`alter table webhook_deliveries drop constraint boom`)
    await ctx.db.query(`alter table webhook_deliveries rename to webhook_deliveries_x`)
    await expect(asA((q) => q(`insert into tasks (title) values ('Still saved')`))).resolves.toBeTruthy()
    await ctx.db.query(`alter table webhook_deliveries_x rename to webhook_deliveries`)
  })
  it('claims deliveries with a lease so two runs cannot take the same one', async () => {
    const first = (await ctx.asService((q) => q(`select claim_webhook_deliveries(10) r`))).rows[0].r as any[]
    expect(first.length).toBeGreaterThanOrEqual(3)
    expect(first.find((x: any) => x.endpoint_id === ep)).toMatchObject({ url: 'https://example.com/hook', secret, timeout_ms: 4000, max_attempts: 3 })
    expect((await ctx.asService((q) => q(`select claim_webhook_deliveries(10) r`))).rows[0].r).toEqual([])
    expect(await ctx.fails(asA((q) => q(`select claim_webhook_deliveries(1)`)))).toMatch(/permission denied/)
  })
  it('tracks attempts, retries with a schedule, then dead-letters, and ignores duplicate completions', async () => {
    const id = (await ctx.db.query(`select id from webhook_deliveries where event_type = 'task.created' and endpoint_id = '${ep}' limit 1`)).rows[0] as any
    const done = (ok: boolean, dead = false) => ctx.asService((q) => q(`select complete_webhook_delivery('${id.id}', ${ok}, ${ok ? 200 : 500}, '${ok ? '' : 'HTTP 500'}', 30, now() + interval '1 minute', ${dead}) r`)).then((r) => r.rows[0].r)
    expect(await done(false)).toBe(true)
    let row = (await ctx.db.query(`select status, attempts, last_status, last_error from webhook_deliveries where id = '${id.id}'`)).rows[0] as any
    expect(row).toMatchObject({ status: 'retrying', attempts: 1, last_status: 500, last_error: 'HTTP 500' })
    expect(await done(false)).toBe(false) // not leased any more: a duplicate report changes nothing
    expect((await ctx.db.query(`select count(*)::int n from webhook_attempts where delivery_id = '${id.id}'`)).rows[0]).toEqual({ n: 1 })
    // a retry makes it due again
    await ctx.db.query(`update webhook_deliveries set next_attempt_at = now() where id = '${id.id}'`)
    await ctx.asService((q) => q(`select claim_webhook_deliveries(10)`))
    expect(await done(false, true)).toBe(true)
    row = (await ctx.db.query(`select status, attempts from webhook_deliveries where id = '${id.id}'`)).rows[0] as any
    expect(row).toMatchObject({ status: 'dead', attempts: 2 })
    // the owner can retry a dead delivery; a delivered one cannot be retried
    await asA((q) => q(`select retry_webhook_delivery('${id.id}')`))
    expect((await ctx.db.query(`select status from webhook_deliveries where id = '${id.id}'`)).rows[0]).toEqual({ status: 'pending' })
    await ctx.asService((q) => q(`select claim_webhook_deliveries(10)`))
    expect(await done(true)).toBe(true)
    expect((await ctx.db.query(`select status, delivered_at is not null d from webhook_deliveries where id = '${id.id}'`)).rows[0]).toEqual({ status: 'delivered', d: true })
    expect(await ctx.fails(asA((q) => q(`select retry_webhook_delivery('${id.id}')`)))).toMatch(/Only a failed delivery/)
  })
  it('turns an endpoint off after 25 failures in a row, and tests/rotates/deletes', async () => {
    const r = (await asA((q) => q(`select create_webhook_endpoint('https://flaky.example.com/h', '', '{task.created}') r`))).rows[0].r
    await ctx.db.query(`update webhook_endpoints set consecutive_failures = 24 where id = '${r.id}'`)
    const t = (await asA((q) => q(`select queue_webhook_test('${r.id}') r`))).rows[0].r
    await ctx.asService((q) => q(`select claim_webhook_deliveries(100)`))
    await ctx.asService((q) => q(`select complete_webhook_delivery('${t}', false, 500, 'x', 1, null, false)`))
    expect((await ctx.db.query(`select enabled, disabled_reason from webhook_endpoints where id = '${r.id}'`)).rows[0]).toMatchObject({ enabled: false })
    const s2 = (await asA((q) => q(`select rotate_webhook_secret('${r.id}') r`))).rows[0].r
    expect(s2).not.toBe(r.secret)
    await asA((q) => q(`select delete_webhook_endpoint('${r.id}')`))
    expect((await ctx.db.query(`select count(*)::int n from webhook_deliveries where endpoint_id = '${r.id}'`)).rows[0]).toEqual({ n: 0 })
    expect(await ctx.fails(asB((q) => q(`select delete_webhook_endpoint('${ep}')`)))).toMatch(/not found/)
  })
})

describe('retention and account deletion', () => {
  it('purges old operational data and (optionally) audit history, but keeps recent rows', async () => {
    await ctx.db.query(`insert into app_errors (fingerprint, category, message, last_seen) values ('old', 'frontend', 'old', now() - interval '90 days')`)
    await ctx.db.query(`insert into job_runs (job, status, started_at) values ('x', 'ok', now() - interval '90 days')`)
    await ctx.db.exec(`set lifetrack.audit_maintenance = 'on'; update audit_events set occurred_at = now() - interval '800 days' where action = 'login'; set lifetrack.audit_maintenance = 'off';`)
    const r = (await ctx.asService((q) => q(`select purge_platform_data() r`))).rows[0].r
    expect(r.app_errors).toBeGreaterThanOrEqual(1)
    expect(r.job_runs).toBeGreaterThanOrEqual(1)
    expect(r.audit_events).toBe(1)
    expect((await ctx.db.query(`select count(*)::int n from audit_events where action = 'login'`)).rows[0]).toEqual({ n: 0 })
    expect(await ctx.fails(asA((q) => q(`select purge_platform_data()`)))).toMatch(/permission denied/)
  })
  it('lets a person erase their own history, leaving a tombstone', async () => {
    const n = (await asA((q) => q(`select erase_my_audit_history() n`))).rows[0].n
    expect(n).toBeGreaterThan(0)
    const left = await asA((q) => events(q))
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ action: 'security', entity: 'audit', prev_hash: null })
    expect(left[0].summary).toMatch(/erased/)
    expect((await asA((q) => q(`select audit_verify_chain() r`))).rows[0].r.ok).toBe(true)
  })
  it('deleting the account removes everything, including the audit history', async () => {
    await ctx.db.query(`delete from auth.users where id = '${A}'`)
    for (const t of ['audit_events', 'api_keys', 'webhook_endpoints', 'webhook_deliveries', 'tasks'])
      expect((await ctx.db.query(`select count(*)::int n from ${t} where user_id = '${A}'`)).rows[0]).toEqual({ n: 0 })
  })
})
