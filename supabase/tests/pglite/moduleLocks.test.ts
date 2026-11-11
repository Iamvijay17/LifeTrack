import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module shared with the apps
import { LOCKABLE_MODULES, MODULE_KEYS } from '../../../packages/core/src/moduleLocks.js'
import { createDb } from './helpers'

// Module locks (0015): the database closes the tables of the modules a person chose, for a session that has not unlocked.

let ctx: Awaited<ReturnType<typeof createDb>>
let n = 0
beforeAll(async () => { ctx = await createDb() })
afterAll(async () => { await ctx.db.close() })

const PIN = '2486'
const denied = /row-level security/i

async function setup() {
  n++
  const user = await ctx.newUser(`mod${n}@example.com`)
  const phone = await ctx.newSession(user) // the session that sets things up
  const laptop = await ctx.newSession(user) // another device
  const as = <T>(session: string | undefined, sql: string, params: unknown[] = []) => ctx.asUser(user, (q) => q(sql, params), session)
  const call = async (session: string | undefined, sql: string, params: unknown[] = []) => (await as(session, `select ${sql} as r`, params)).rows[0].r
  const admin = (sql: string, params: unknown[] = []) => ctx.q(sql, params)
  /** PIN on, then only `modules` locked. The phone ends up unlocked, the laptop locked. */
  const lockModules = async (modules: string[]) => {
    await call(phone, 'set_pin($1)', [PIN])
    return call(phone, 'set_lock_modules($1, $2)', ['modules', modules])
  }
  const seed = async () => {
    await admin(`insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',100,'2026-11-02')`, [user])
    await admin(`insert into health_logs(user_id, log_date, sleep_minutes) values ($1,'2026-11-02',420)`, [user])
    await admin(`insert into workouts(user_id, workout_date, name) values ($1,'2026-11-02','Push')`, [user])
    await admin(`insert into tasks(user_id, title) values ($1,'Plain task')`, [user])
  }
  const count = async (session: string, table: string) => (await as(session, `select 1 from ${table}`)).rows.length
  return { user, phone, laptop, as, call, admin, lockModules, seed, count }
}

describe('the module list', () => {
  it('is the same in the database and in the app', async () => {
    const policies = (await ctx.q(
      `select tablename, policyname, qual from pg_policies where schemaname = 'public' and policyname in ('app_lock_gate', 'module_lock_gate')`,
    )).rows as { tablename: string; policyname: string; qual: string }[]
    for (const m of LOCKABLE_MODULES) {
      for (const table of m.tables) {
        const p = policies.find((x) => x.tablename === table)
        expect(p, `${table} (${m.key}) has no lock policy`).toBeTruthy()
        expect(p!.policyname, table).toBe(m.legacy ? 'app_lock_gate' : 'module_lock_gate')
        expect(p!.qual, table).toContain(`'${m.key}'`)
      }
    }
    // and nothing is gated that the app does not know about
    const known = new Set(LOCKABLE_MODULES.flatMap((m: { tables: string[] }) => m.tables))
    expect(policies.filter((p) => !known.has(p.tablename)).map((p) => p.tablename)).toEqual([])
  })
  it('accepts exactly the modules the app lists', async () => {
    const { phone, call } = await setup()
    await call(phone, 'set_pin($1)', [PIN])
    for (const k of MODULE_KEYS) expect(await call(phone, `set_lock_modules('modules', array[$1])`, [k])).toMatchObject({ lock_scope: 'modules', locked_modules: [k] })
  })
})

describe('with the whole-app lock (the default)', () => {
  it('changes nothing: scope is "app", and only Finance, Journal and Notes are closed to a locked session', async () => {
    const { phone, laptop, call, seed, count } = await setup()
    await seed()
    await call(phone, 'set_pin($1)', [PIN])
    expect(await call(laptop, 'security_state()')).toMatchObject({ lock_scope: 'app', locked_modules: [], locked: true, session_unlocked: false })
    expect(await count(laptop, 'transactions')).toBe(0)
    expect(await count(laptop, 'health_logs')).toBe(1) // as before: not gated under the whole-app lock
    expect(await count(laptop, 'workouts')).toBe(1)
  })
})

describe('with module locks', () => {
  it('the app stays open: no lock screen, only the chosen modules close', async () => {
    const { phone, laptop, call, lockModules, seed, count } = await setup()
    await seed()
    const s = await lockModules(['finance', 'health'])
    expect(s).toMatchObject({ app_lock_enabled: true, lock_scope: 'modules', locked_modules: ['finance', 'health'], locked: false, session_unlocked: true })
    // the setting session is unlocked; another device is not
    expect(await count(phone, 'transactions')).toBe(1)
    const l = await call(laptop, 'security_state()')
    expect(l).toMatchObject({ locked: false, session_unlocked: false, locked_modules: ['finance', 'health'] })
    expect(await count(laptop, 'transactions')).toBe(0)
    expect(await count(laptop, 'health_logs')).toBe(0)
    expect(await count(laptop, 'workouts')).toBe(1) // fitness is not locked
    expect(await count(laptop, 'tasks')).toBe(1)
  })
  it('refuses writes to a locked module and allows the rest', async () => {
    const { user, laptop, as, lockModules } = await setup()
    await lockModules(['finance'])
    expect(await ctx.fails(as(laptop, `insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',1,'2026-11-02')`, [user]))).toMatch(denied)
    await as(laptop, `insert into workouts(user_id, workout_date, name) values ($1,'2026-11-02','Legs')`, [user])
    expect((await as(laptop, `select name from workouts`)).rows).toEqual([{ name: 'Legs' }])
  })
  it('closes every table of a module, not just the first', async () => {
    const { user, phone, laptop, as, admin, lockModules } = await setup()
    const app = (await admin(`insert into job_applications(user_id, company, job_title) values ($1,'Acme','Dev') returning id`, [user])).rows[0].id
    await admin(`insert into application_history(user_id, application_id, to_status) values ($1,$2,'applied')`, [user, app])
    await admin(`insert into interview_events(user_id, application_id, scheduled_at) values ($1,$2, now())`, [user, app])
    await admin(`insert into food_logs(user_id, log_date, meal_type, name) values ($1,'2026-11-02','lunch','Idli')`, [user])
    await admin(`insert into water_logs(user_id, log_date, amount_ml) values ($1,'2026-11-02',250)`, [user])
    await admin(`insert into nutrition_settings(user_id) values ($1)`, [user])
    await lockModules(['nutrition', 'jobs'])
    const tables = ['job_applications', 'application_history', 'interview_events', 'food_logs', 'water_logs', 'nutrition_settings']
    for (const t of tables) {
      expect((await as(phone, `select 1 from ${t}`)).rows, `${t} open to the unlocked session`).not.toHaveLength(0)
      expect((await as(laptop, `select 1 from ${t}`)).rows, `${t} closed to the locked one`).toHaveLength(0)
    }
    expect(await ctx.fails(as(laptop, `insert into water_logs(user_id, log_date, amount_ml) values ($1,'2026-11-02',250)`, [user]))).toMatch(denied)
    expect(await ctx.fails(as(laptop, `update job_applications set company = 'Hacked'`))).toBeNull() // updates a row it cannot see: touches nothing
    expect((await admin(`select company from job_applications`)).rows).toEqual([{ company: 'Acme' }])
  })
  it('one PIN opens every locked module, and locking closes them again', async () => {
    const { phone, laptop, call, lockModules, seed, count } = await setup()
    await seed()
    await lockModules(['finance', 'health'])
    expect(await call(laptop, 'verify_pin($1)', [PIN])).toEqual({ ok: true })
    expect(await call(laptop, 'security_state()')).toMatchObject({ locked: false, session_unlocked: true })
    expect(await count(laptop, 'transactions')).toBe(1)
    expect(await count(laptop, 'health_logs')).toBe(1)
    await call(laptop, 'lock_app()')
    expect(await count(laptop, 'transactions')).toBe(0)
    expect(await count(laptop, 'health_logs')).toBe(0)
    expect(await count(phone, 'transactions')).toBe(1) // another device is unaffected
  })
  it('a wrong PIN opens nothing, and counts toward the lockout like before', async () => {
    const { laptop, call, lockModules, seed, count } = await setup()
    await seed()
    await lockModules(['finance'])
    expect(await call(laptop, `verify_pin('1357')`)).toMatchObject({ ok: false, reason: 'wrong_pin', failed_attempts: 1, tries_left: 4 })
    expect(await count(laptop, 'transactions')).toBe(0)
  })
  it('closes by itself when the user goes quiet', async () => {
    const { phone, call, admin, lockModules, seed, count } = await setup()
    await seed()
    await lockModules(['finance'])
    await call(phone, 'set_auto_lock(60)')
    expect(await count(phone, 'transactions')).toBe(1)
    await admin(`update app_unlocks set last_active_at = now() - interval '100 seconds'`)
    expect(await count(phone, 'transactions')).toBe(0)
    expect(await call(phone, 'security_state()')).toMatchObject({ locked: false, session_unlocked: false })
  })
  it('a password sign-in does not open them (it only opens the whole-app lock)', async () => {
    const { user, laptop, call, lockModules, seed, count, admin } = await setup()
    await seed()
    await lockModules(['finance'])
    const fresh = await ctx.newSession(user, 0) // a brand-new session, as a sign-in makes
    const s = await ctx.asUser(user, (q) => q(`select unlock_after_login() as r`), fresh)
    expect(s.rows[0].r).toMatchObject({ session_unlocked: false })
    expect(await count(fresh, 'transactions')).toBe(0)
    expect((await admin(`select 1 from app_unlocks where session_id = $1`, [fresh])).rows).toHaveLength(0)
    void laptop; void call
  })
  it('a token with no session claim is closed out of a locked module', async () => {
    const { as, lockModules, seed } = await setup()
    await seed()
    await lockModules(['finance'])
    expect((await as(undefined, `select 1 from transactions`)).rows).toHaveLength(0)
  })
  it("another user's choices do not touch mine", async () => {
    const a = await setup(), b = await setup()
    await a.seed(); await b.seed()
    await a.lockModules(['finance'])
    expect(await b.count(b.laptop, 'transactions')).toBe(1) // b has no lock at all
    expect(await a.count(a.laptop, 'transactions')).toBe(0)
  })
  it('anonymous clients still read nothing', async () => {
    const { lockModules, seed } = await setup()
    await seed()
    await lockModules(['finance'])
    expect((await ctx.asAnon((q) => q(`select 1 from transactions`)).catch(() => ({ rows: [] }))).rows).toHaveLength(0)
  })
})

describe('choosing what to lock', () => {
  it('needs the app lock first', async () => {
    const { phone, call } = await setup()
    expect(await ctx.fails(call(phone, `set_lock_modules('modules', array['finance'])`))).toMatch(/Turn on the app lock first/)
  })
  it('needs an UNLOCKED session: a locked device cannot unlock itself by editing the list', async () => {
    const { laptop, call, lockModules } = await setup()
    await lockModules(['finance'])
    expect(await ctx.fails(call(laptop, `set_lock_modules('modules', array['notes'])`))).toMatch(/locked|PIN/i)
    // the whole-app lock is the same: switching to "modules" must not be a way past a locked screen
    await call(laptop, 'verify_pin($1)', [PIN])
    await call(laptop, 'lock_app()')
    expect(await ctx.fails(call(laptop, `set_lock_modules('app')`))).toMatch(/locked|PIN/i)
  })
  it.each([
    ["'sideways'", `array['finance']`, /whole app or some modules/],
    ["'modules'", `array['finance','banking']`, /cannot be locked/],
    ["'modules'", `array[]::text[]`, /at least one/],
    ["'modules'", 'null', /at least one/],
  ])('refuses scope %s with %s', async (scope, list, message) => {
    const { phone, call } = await setup()
    await call(phone, 'set_pin($1)', [PIN])
    expect(await ctx.fails(call(phone, `set_lock_modules(${scope}, ${list})`))).toMatch(message)
    expect(await call(phone, 'security_state()')).toMatchObject({ lock_scope: 'app' })
  })
  it('sorts and de-duplicates, and remembers the list when going back to the whole app', async () => {
    const { phone, call } = await setup()
    await call(phone, 'set_pin($1)', [PIN])
    expect(await call(phone, `set_lock_modules('modules', array['jobs','finance','jobs'])`)).toMatchObject({ locked_modules: ['finance', 'jobs'] })
    expect(await call(phone, `set_lock_modules('app')`)).toMatchObject({ lock_scope: 'app', locked_modules: ['finance', 'jobs'], locked: false })
    expect(await call(phone, `set_lock_modules('modules', null)`).catch((e: Error) => e.message)).toMatch(/at least one/)
  })
  it('going back to the whole app brings the lock screen for a locked session', async () => {
    const { phone, laptop, call, lockModules } = await setup()
    await lockModules(['finance'])
    await call(phone, `set_lock_modules('app')`)
    expect(await call(laptop, 'security_state()')).toMatchObject({ locked: true })
  })
  it('turning the app lock off forgets the choice and opens everything', async () => {
    const { phone, laptop, call, lockModules, seed, count, admin, user } = await setup()
    await seed()
    await lockModules(['finance', 'health'])
    expect(await call(phone, 'disable_app_lock($1)', [PIN])).toMatchObject({ ok: true })
    expect((await admin(`select lock_scope, locked_modules from user_security where user_id = $1`, [user])).rows[0]).toEqual({ lock_scope: 'app', locked_modules: [] })
    expect(await count(laptop, 'transactions')).toBe(1)
    expect(await call(laptop, 'security_state()')).toMatchObject({ app_lock_enabled: false, lock_scope: 'app', locked: false })
  })
  it('only an authenticated user can call it', async () => {
    const { user } = await setup()
    void user
    expect(await ctx.fails(ctx.asAnon((q) => q(`select set_lock_modules('app')`)))).toMatch(/permission denied/i)
    expect(await ctx.fails(ctx.asAnon((q) => q(`select module_session_open('finance', true)`)))).toMatch(/permission denied/i)
    expect(await ctx.fails(ctx.asAnon((q) => q(`select _module_open(null, null, 'finance', true)`)))).toMatch(/permission denied/i)
  })
})

describe('the table constraints', () => {
  it('refuse an unknown module and an empty "modules" scope even when written directly', async () => {
    const { user, phone, call, admin } = await setup()
    await call(phone, 'set_pin($1)', [PIN])
    expect(await ctx.fails(admin(`update user_security set locked_modules = array['banking'] where user_id = $1`, [user]))).toMatch(/check constraint/i)
    expect(await ctx.fails(admin(`update user_security set lock_scope = 'modules' where user_id = $1`, [user]))).toMatch(/check constraint/i)
    expect(await ctx.fails(admin(`update user_security set lock_scope = 'galaxy' where user_id = $1`, [user]))).toMatch(/check constraint/i)
  })
})
