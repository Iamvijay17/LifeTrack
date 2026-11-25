import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// 0028_performance_flags.sql: indexes, performance monitoring authorisation, feature flags, emergency controls, history/rollback, experiments.
let ctx: Awaited<ReturnType<typeof createDb>>
let ADMIN: string
let U1: string
let U2: string
beforeAll(async () => {
  ctx = await createDb()
  ADMIN = await ctx.newUser('admin@example.com')
  U1 = await ctx.newUser('u1@example.com')
  U2 = await ctx.newUser('u2@example.com')
  await ctx.db.query(`insert into platform_admins (user_id) values ($1)`, [ADMIN])
})
afterAll(async () => { await ctx.db.close() })
const asAdmin = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(ADMIN, fn)
const asU1 = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U1, fn)
const asU2 = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U2, fn)
const one = async (q: Q, sql: string, params: unknown[] = []) => (await q(sql, params)).rows[0]

describe('indexes', () => {
  it('creates the new indexes once, without duplicating an existing definition', async () => {
    const { rows } = await ctx.q(`select indexname, indexdef from pg_indexes where schemaname = 'public'`)
    const defs = rows.map((r) => r.indexdef.replace(/INDEX \S+ ON/, 'INDEX ON'))
    expect(new Set(defs).size).toBe(defs.length) // no two indexes have the same definition
    for (const n of ['tasks_user_created_idx', 'tasks_user_status_created_idx', 'notifications_unread_idx', 'job_applications_user_status_updated_idx']) expect(rows.map((r) => r.indexname)).toContain(n)
  })
  it('keeps every earlier index', async () => {
    const names = (await ctx.q(`select indexname from pg_indexes where schemaname = 'public'`)).rows.map((r) => r.indexname)
    for (const n of ['tasks_user_due_idx', 'tasks_user_status_idx', 'jobs_user_status_idx', 'txn_user_date_idx', 'notifications_user_idx']) expect(names).toContain(n)
  })
})

describe('database performance (administrators only)', () => {
  it('refuses people who are not administrators, and the signed-out', async () => {
    expect(await ctx.fails(asU1((q) => q(`select admin_db_overview(24)`)))).toMatch(/Administrator access required/)
    expect(await ctx.fails(asU1((q) => q(`select admin_db_query_report(24)`)))).toMatch(/Administrator access required/)
    expect(await ctx.fails(ctx.asAnon((q) => q(`select admin_db_overview(24)`)))).toBeTruthy()
  })
  it('returns real catalog numbers and one trend point per ten minutes', async () => {
    const o = (await asAdmin((q) => one(q, `select admin_db_overview(24) o`))).o
    expect(o.connections.total).toBeGreaterThanOrEqual(0)
    expect(o.database.size_bytes).toBeGreaterThan(0)
    expect(Array.isArray(o.tables)).toBe(true)
    expect(o.tables.find((t: any) => t.table === 'tasks')).toBeTruthy()
    expect(o.indexes.some((i: any) => i.index === 'tasks_user_created_idx')).toBe(true)
    expect(typeof o.aggregation.count_audit_ms).toBe('number')
    await asAdmin((q) => q(`select admin_db_overview(24)`))
    const n = (await ctx.q(`select count(*)::int n from db_perf_snapshots`)).rows[0].n
    expect(n).toBe(1)
  })
  it('collects browser query statistics, validated and rate-limited, without a user id', async () => {
    const n = await asU1(async (q) => (await one(q, `select report_query_stats($1::jsonb) n`, [JSON.stringify([
      { table: 'tasks', op: 'select', calls: 4, total_ms: 400, max_ms: 200, rows: 80, slow: 1 },
      { table: 'Bad Table;', op: 'select', calls: 1 },
      { table: 'tasks', op: 'drop', calls: 1 },
    ])])).n)
    expect(n).toBe(1)
    const cols = (await ctx.q(`select column_name from information_schema.columns where table_name = 'query_stats'`)).rows.map((r) => r.column_name)
    expect(cols).not.toContain('user_id')
    const rep = (await asAdmin((q) => one(q, `select admin_db_query_report(24) r`))).r
    const row = rep.rows.find((r: any) => r.location === 'tasks.select')
    expect(row).toMatchObject({ calls: 4, avg_ms: 100, rows_avg: 20, slow: 1 })
    expect(await ctx.fails(asU1((q) => q(`select * from query_stats`)))).toMatch(/permission denied/)
  })
})

describe('feature flags', () => {
  const env = (flag: string, e = 'production') => asAdmin((q) => one(q, `select admin_flags() a`)).then((r) => r.a.flags.find((f: any) => f.key === flag).envs[e])
  const evalAs = async (who: <T>(fn: (q: Q) => Promise<T>) => Promise<T>, e = 'production') => (await who((q) => one(q, `select evaluate_flags($1) r`, [e]))).r

  it('ships the module flags on and the core flags protected', async () => {
    const r = await evalAs(asU1)
    expect(r.flags['module.insights']).toBe(true)
    expect(r.flags['core.auth']).toBe(true)
    expect(r.killed).toBe(false)
  })
  it('only administrators can read or change the configuration', async () => {
    expect(await ctx.fails(asU1((q) => q(`select admin_flags()`)))).toMatch(/Administrator access required/)
    expect(await ctx.fails(asU1((q) => q(`select admin_flag_create('x.y', 'X')`)))).toMatch(/Administrator access required/)
    expect(await ctx.fails(asU1((q) => q(`select admin_flag_env_set('module.insights', 'production', '{"enabled": false}')`)))).toMatch(/Administrator access required/)
    expect(await ctx.fails(asU1((q) => q(`select admin_controls_set('{"global_disable": true}', 'because')`)))).toMatch(/Administrator access required/)
    expect(await ctx.fails(asU1((q) => q(`select * from feature_flags`)))).toMatch(/permission denied/)
    expect(await evalAs(asU1)).toBeTruthy()
  })
  it('creates a flag (off everywhere), validates input, refuses duplicates and reserved keys', async () => {
    await asAdmin((q) => q(`select admin_flag_create('exp.new_card', 'New card', 'A new card', 'experiment', null)`))
    expect((await env('exp.new_card')).enabled).toBe(false)
    expect((await evalAs(asU1)).flags['exp.new_card']).toBe(false)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_create('exp.new_card', 'again')`)))).toMatch(/already exists/)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_create('Bad Key', 'x')`)))).toMatch(/lowercase/)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_create('core.mine', 'x')`)))).toMatch(/reserved/)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_create('ok.key', '')`)))).toMatch(/name/)
  })
  it('enable / disable, per environment', async () => {
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'staging', '{"enabled": true}', 'try it')`))
    expect((await evalAs(asU1, 'staging')).flags['exp.new_card']).toBe(true)
    expect((await evalAs(asU1, 'production')).flags['exp.new_card']).toBe(false)
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'staging', '{"enabled": false}')`))
    expect((await evalAs(asU1, 'staging')).flags['exp.new_card']).toBe(false)
  })
  it('rollout is deterministic, monotonic and matches the JavaScript engine', async () => {
    const { bucketOf } = await import('../../../packages/core/src/flags.js')
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', '{"enabled": true, "rollout_percent": 0}')`))
    const sqlBucket = (await ctx.q(`select _flag_bucket('exp.new_card', $1) b`, [U1])).rows[0].b
    expect(sqlBucket).toBe(bucketOf('exp.new_card', U1))
    // everyone at 100%, nobody at 0%
    expect((await evalAs(asU1)).flags['exp.new_card']).toBe(false)
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', '{"rollout_percent": 100}')`))
    expect((await evalAs(asU1)).flags['exp.new_card']).toBe(true)
    // a threshold just above / below this person's bucket
    const pctAbove = (sqlBucket + 1) / 100
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', $1::jsonb)`, [JSON.stringify({ rollout_percent: Math.min(100, pctAbove + 0.01) })]))
    const first = (await evalAs(asU1)).flags['exp.new_card']
    const again = (await evalAs(asU1)).flags['exp.new_card']
    expect(first).toBe(true)
    expect(again).toBe(first)
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', $1::jsonb)`, [JSON.stringify({ rollout_percent: Math.max(0, sqlBucket / 100 - 0.01) })]))
    expect((await evalAs(asU1)).flags['exp.new_card']).toBe(false)
  })
  it('allow list beats rollout; block list beats allow list; roles restrict the audience', async () => {
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', $1::jsonb)`, [JSON.stringify({ enabled: true, rollout_percent: 0, allow_users: [U1], block_users: [], roles: [] })]))
    expect((await evalAs(asU1)).flags['exp.new_card']).toBe(true)
    expect((await evalAs(asU2)).flags['exp.new_card']).toBe(false)
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', $1::jsonb)`, [JSON.stringify({ block_users: [U1] })]))
    expect((await evalAs(asU1)).flags['exp.new_card']).toBe(false)
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', $1::jsonb)`, [JSON.stringify({ block_users: [], allow_users: [], rollout_percent: 100, roles: ['admin'] })]))
    expect((await evalAs(asAdmin)).flags['exp.new_card']).toBe(true)
    expect((await evalAs(asU1)).flags['exp.new_card']).toBe(false)
  })
  it('validates the patch', async () => {
    for (const bad of [{ rollout_percent: 101 }, { allow_users: ['nope'] }, { roles: ['root'] }, { allow_users: 'x' }]) {
      expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', $1::jsonb)`, [JSON.stringify(bad)])))).toBeTruthy()
    }
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'moon', '{}')`)))).toMatch(/environment/)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_env_set('nope.nope', 'production', '{}')`)))).toMatch(/no flag/)
  })
  it('protected flags can not be changed, archived or killed', async () => {
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_env_set('core.auth', 'production', '{"enabled": false}')`)))).toMatch(/protected/)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_archive('core.security', true)`)))).toMatch(/protected/)
    await asAdmin((q) => q(`select admin_controls_set('{"global_disable": true, "experiments_disabled": true}', 'incident drill')`))
    const r = await evalAs(asU1)
    expect(r.flags['core.auth']).toBe(true)
    expect(r.flags['core.security']).toBe(true)
    expect(r.flags['core.data_integrity']).toBe(true)
    expect(r.flags['core.recovery']).toBe(true)
    expect(r.flags['module.insights']).toBe(false) // the kill switch is real
    expect(r.killed).toBe(true)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_controls_set('{"disabled_modules": ["security"]}', 'nope')`)))).toMatch(/never be switched off/)
    await asAdmin((q) => q(`select admin_controls_set('{"global_disable": false, "experiments_disabled": false}', 'drill over')`))
    expect((await evalAs(asU1)).flags['module.insights']).toBe(true)
  })
  it('module kill switch turns off only that module; a reason is required', async () => {
    expect(await ctx.fails(asAdmin((q) => q(`select admin_controls_set('{"disabled_modules": ["insights"]}', '')`)))).toMatch(/Say why/)
    await asAdmin((q) => q(`select admin_controls_set('{"disabled_modules": ["insights"]}', 'insights is slow')`))
    const r = await evalAs(asU1)
    expect(r.flags['module.insights']).toBe(false)
    expect(r.flags['module.challenges']).toBe(true)
    await asAdmin((q) => q(`select admin_controls_set('{"disabled_modules": []}', 'fixed')`))
  })
  it('records history with before/after and can roll a change back (and the rollback is itself recorded)', async () => {
    await asAdmin((q) => q(`select admin_flag_env_set('module.automation', 'production', '{"enabled": false}', 'bad deploy')`))
    expect((await evalAs(asU1)).flags['module.automation']).toBe(false)
    const h = (await asAdmin((q) => one(q, `select admin_flag_history('module.automation', 10, 0) h`))).h
    const entry = h.items.find((i: any) => i.action === 'env_set')
    expect(entry.before.enabled).toBe(true)
    expect(entry.after.enabled).toBe(false)
    expect(entry.reason).toBe('bad deploy')
    expect(entry.actor).toBe('admin@example.com')
    await asAdmin((q) => q(`select admin_flag_rollback($1, '')`, [entry.id]))
    expect((await evalAs(asU1)).flags['module.automation']).toBe(true)
    const h2 = (await asAdmin((q) => one(q, `select admin_flag_history('module.automation', 10, 0) h`))).h
    expect(h2.items[0].action).toBe('rollback')
    expect(await ctx.fails(asU1((q) => q(`select admin_flag_history()`)))).toMatch(/Administrator/)
  })
  it('writes a redacted line to the audit history and never the user ids of a list', async () => {
    await asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', $1::jsonb, 'allow one')`, [JSON.stringify({ allow_users: [U2] })]))
    const rows = (await ctx.q(`select * from audit_events where user_id = $1 and entity = 'feature_flag' order by seq desc limit 1`, [ADMIN])).rows
    expect(rows[0].action).toBe('config')
    expect(JSON.stringify(rows[0].new_values)).not.toContain(U2)
    expect(rows[0].new_values.allow_count).toBe(1)
  })
  it('archived flags evaluate to their default and can not be edited; flags are never deleted', async () => {
    await asAdmin((q) => q(`select admin_flag_archive('exp.new_card', true, 'done')`))
    expect(await ctx.fails(asAdmin((q) => q(`select admin_flag_env_set('exp.new_card', 'production', '{"enabled": true}')`)))).toMatch(/archived/)
    expect((await evalAs(asU1)).flags['exp.new_card']).toBe(false)
    await asAdmin((q) => q(`select admin_flag_archive('exp.new_card', false)`))
    expect((await ctx.q(`select count(*)::int n from feature_flags where key = 'exp.new_card'`)).rows[0].n).toBe(1)
  })
  it('flag_enabled() answers for the signed-in person, from the database environment', async () => {
    expect((await asU1((q) => one(q, `select flag_enabled('module.insights') v`))).v).toBe(true)
    expect((await asU1((q) => one(q, `select flag_enabled('no.such.flag') v`))).v).toBe(false)
    expect((await ctx.asAnon((q) => one(q, `select 1 x`)).catch(() => null))).toBeTruthy()
  })
})

describe('experiments', () => {
  const evalFlag = async (who: any) => (await who((q: Q) => one(q, `select evaluate_flags('production') r`))).r.flags['exp.checkout']
  let uids: string[] = []
  beforeAll(async () => {
    await asAdmin((q) => q(`select admin_flag_create('exp.checkout', 'Checkout', '', 'experiment')`))
    uids = []
    for (let i = 0; i < 40; i++) uids.push(await ctx.newUser(`p${i}@example.com`))
  })
  const variants = JSON.stringify([{ key: 'control', weight: 50 }, { key: 'treatment', weight: 50 }])

  it('validates variants and flag kind', async () => {
    const save = (v: string, flag = 'exp.checkout', traffic = 100) => asAdmin((q) => q(`select admin_experiment_save('checkout_test', $1, 'Checkout', 'h', $2, $3::jsonb)`, [flag, traffic, v]))
    expect(await ctx.fails(save('[{"key":"control","weight":100}]'))).toMatch(/2 to 5/)
    expect(await ctx.fails(save('[{"key":"a","weight":50},{"key":"b","weight":50}]'))).toMatch(/control/)
    expect(await ctx.fails(save('[{"key":"control","weight":60},{"key":"b","weight":50}]'))).toMatch(/add up to 100/)
    expect(await ctx.fails(save(variants, 'module.insights'))).toMatch(/kind experiment/)
    expect(await ctx.fails(save(variants, 'core.auth'))).toMatch(/kind experiment|protected/)
    expect(await ctx.fails(save(variants, 'exp.checkout', 101))).toMatch(/Traffic/)
    expect(await ctx.fails(asU1((q) => q(`select admin_experiment_save('x', 'exp.checkout', 'x', '', 100, $1::jsonb)`, [variants])))).toMatch(/Administrator/)
  })
  it('is off by default: a draft or an experiment whose flag is off enrolls no one and records nothing', async () => {
    await asAdmin((q) => q(`select admin_experiment_save('checkout_test', 'exp.checkout', 'Checkout', 'h', 100, $1::jsonb, 'purchased')`, [variants]))
    expect((await asU1((q) => one(q, `select experiment_assign('checkout_test') r`))).r).toEqual({ variant: 'control', enrolled: false })
    await asAdmin((q) => q(`select admin_experiment_set_status('checkout_test', 'running')`))
    expect((await asU1((q) => one(q, `select experiment_assign('checkout_test') r`))).r.enrolled).toBe(false) // flag still off
    expect((await ctx.q(`select count(*)::int n from experiment_events`)).rows[0].n).toBe(0)
  })
  it('only valid status moves are allowed, and only a draft can be edited', async () => {
    expect(await ctx.fails(asAdmin((q) => q(`select admin_experiment_set_status('checkout_test', 'draft')`)))).toMatch(/can not go/)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_experiment_save('checkout_test', 'exp.checkout', 'Renamed', '', 100, $1::jsonb)`, [variants])))).toMatch(/Only a draft/)
  })
  it('assigns consistently, matches the JavaScript engine, records one exposure and one conversion', async () => {
    const { assignVariant } = await import('../../../packages/core/src/flags.js')
    await asAdmin((q) => q(`select admin_flag_env_set('exp.checkout', 'production', '{"enabled": true}')`))
    const exp = { key: 'checkout_test', traffic_percent: 100, variants: JSON.parse(variants) }
    const seen: Record<string, number> = { control: 0, treatment: 0 }
    for (const u of uids) {
      const a = (await ctx.asUser(u, (q) => one(q, `select experiment_assign('checkout_test') r`))).r
      const b = (await ctx.asUser(u, (q) => one(q, `select experiment_assign('checkout_test') r`))).r
      expect(a).toEqual(b) // consistent
      expect(a.variant).toBe(assignVariant(exp, u)) // parity with the engine
      seen[a.variant]++
    }
    expect(seen.control).toBeGreaterThan(5)
    expect(seen.treatment).toBeGreaterThan(5)
    expect((await ctx.q(`select count(*)::int n from experiment_events where event = 'exposure'`)).rows[0].n).toBe(40) // once each
    // conversions: explicit, once per event name, only for enrolled people
    const u = uids[0]
    expect((await ctx.asUser(u, (q) => one(q, `select experiment_convert('checkout_test', 'purchased') r`))).r).toBe(true)
    expect((await ctx.asUser(u, (q) => one(q, `select experiment_convert('checkout_test', 'purchased') r`))).r).toBe(false)
    expect((await asU1((q) => one(q, `select experiment_convert('checkout_test', 'purchased') r`))).r).toBe(false) // never enrolled
    expect((await ctx.asUser(u, (q) => one(q, `select experiment_convert('checkout_test', 'Bad Name') r`))).r).toBe(false)
  })
  it('results are counts per variant and never expose user ids', async () => {
    const r = (await asAdmin((q) => one(q, `select admin_experiment_results('checkout_test') r`))).r
    expect(r.rows.reduce((a: number, x: any) => a + x.participants, 0)).toBe(40)
    expect(r.rows.reduce((a: number, x: any) => a + x.conversions, 0)).toBe(1)
    expect(JSON.stringify(r)).not.toContain(uids[0])
    expect(await ctx.fails(asU1((q) => q(`select admin_experiment_results('checkout_test')`)))).toMatch(/Administrator/)
    expect(await ctx.fails(asU1((q) => q(`select * from experiment_events`)))).toMatch(/permission denied/)
  })
  it('traffic allocation limits enrollment; the experiment kill switch stops it; completing stops it', async () => {
    await asAdmin((q) => q(`select admin_experiment_set_status('checkout_test', 'paused')`))
    const stranger = await ctx.newUser('late@example.com')
    expect((await ctx.asUser(stranger, (q) => one(q, `select experiment_assign('checkout_test') r`))).r.enrolled).toBe(false) // paused
    await asAdmin((q) => q(`select admin_experiment_set_status('checkout_test', 'running')`))
    await asAdmin((q) => q(`select admin_controls_set('{"experiments_disabled": true}', 'stop all experiments')`))
    expect((await ctx.asUser(stranger, (q) => one(q, `select experiment_assign('checkout_test') r`))).r.enrolled).toBe(false)
    expect((await ctx.asUser(uids[1], (q) => one(q, `select experiment_assign('checkout_test') r`))).r).toEqual({ variant: 'control', enrolled: false })
    await asAdmin((q) => q(`select admin_controls_set('{"experiments_disabled": false}', 'resume')`))
    expect((await ctx.asUser(stranger, (q) => one(q, `select experiment_assign('checkout_test') r`))).r.enrolled).toBe(true)
    await asAdmin((q) => q(`select admin_experiment_set_status('checkout_test', 'completed', 'done')`))
    expect((await ctx.asUser(uids[2], (q) => one(q, `select experiment_assign('checkout_test') r`))).r.enrolled).toBe(false)
    expect(await ctx.fails(asAdmin((q) => q(`select admin_experiment_set_status('checkout_test', 'running')`)))).toMatch(/can not go/)
    // a completed experiment's flag can be archived
    await asAdmin((q) => q(`select admin_flag_archive('exp.checkout', true)`))
  })
  it('a smaller traffic share enrolls fewer people', async () => {
    await asAdmin((q) => q(`select admin_flag_create('exp.small', 'Small', '', 'experiment')`))
    await asAdmin((q) => q(`select admin_flag_env_set('exp.small', 'production', '{"enabled": true}')`))
    await asAdmin((q) => q(`select admin_experiment_save('small_test', 'exp.small', 'Small', '', 25, $1::jsonb)`, [variants]))
    await asAdmin((q) => q(`select admin_experiment_set_status('small_test', 'running')`))
    let enrolled = 0
    for (const u of uids) enrolled += (await ctx.asUser(u, (q) => one(q, `select experiment_assign('small_test') r`))).r.enrolled ? 1 : 0
    expect(enrolled).toBeGreaterThan(0)
    expect(enrolled).toBeLessThan(25)
  })
  it('removes a person\'s experiment records with their account', async () => {
    const before = (await ctx.q(`select count(*)::int n from experiment_events where user_id = $1`, [uids[0]])).rows[0].n
    expect(before).toBeGreaterThan(0)
    await ctx.q(`delete from auth.users where id = $1`, [uids[0]])
    expect((await ctx.q(`select count(*)::int n from experiment_events where user_id = $1`, [uids[0]])).rows[0].n).toBe(0)
  })
})
