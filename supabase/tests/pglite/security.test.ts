import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module shared with the apps
import { lockoutSecondsAfter, passwordLockoutSecondsAfter, revokesSession, validatePin, weakPinReason } from '../../../packages/core/src/security.js'
import { FIXTURES } from './fixtures'
import { createDb } from './helpers'

let ctx: Awaited<ReturnType<typeof createDb>>
let n = 0
beforeAll(async () => { ctx = await createDb() })
afterAll(async () => { await ctx.db.close() })

const PROTECTED = ['transactions', 'budgets', 'savings_goals', 'recurring_rules', 'journal_entries', 'notes']
const PIN = '2486'

/** A user with two GoTrue sessions: `phone` (the one that sets things up) and `laptop` (another device). */
async function setup() {
  n++
  const user = await ctx.newUser(`sec${n}@example.com`)
  const phone = await ctx.newSession(user)
  const laptop = await ctx.newSession(user)
  const as = <T>(session: string | undefined, sql: string, params: unknown[] = []) => ctx.asUser(user, (q) => q(sql, params), session)
  const call = async (session: string | undefined, sql: string, params: unknown[] = []) => (await as(session, `select ${sql} as r`, params)).rows[0].r
  const state = (session: string) => call(session, 'security_state()')
  const enable = (pin = PIN) => call(phone, 'set_pin($1)', [pin])
  const admin = (sql: string, params: unknown[] = []) => ctx.q(sql, params)
  return { user, phone, laptop, as, call, state, enable, admin }
}
const denied = /permission denied/i

describe('before the app lock is turned on', () => {
  it('nothing changes: no row, unlocked, sensitive tables behave as before', async () => {
    const { user, phone, as, state } = await setup()
    expect(await state(phone)).toMatchObject({ app_lock_enabled: false, locked: false, passkey_count: 0, auto_lock_seconds: 300, pin_length: null })
    await as(phone, `insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',100,'2026-11-02')`, [user])
    expect((await as(phone, `select 1 from transactions`)).rows).toHaveLength(1)
    expect((await as(undefined, `select app_session_unlocked() as u`)).rows[0].u).toBe(true) // even a token without a session claim
  })
  it('verify_pin has nothing to verify', async () => {
    const { phone, call } = await setup()
    expect(await call(phone, `verify_pin('2486')`)).toMatchObject({ ok: false, reason: 'not_enabled' })
  })
  it('the lock tables cannot be read or written by any client role', async () => {
    const { user, phone, as } = await setup()
    for (const t of ['user_security', 'app_unlocks', 'passkeys', 'webauthn_challenges', 'password_attempts']) {
      expect(await ctx.fails(as(phone, `select * from ${t}`)), t).toMatch(denied)
      expect(await ctx.fails(as(phone, `insert into ${t} (user_id) values ($1)`, [user])), t).toMatch(denied)
      expect(await ctx.fails(ctx.asAnon((q) => q(`select * from ${t}`))), t).toMatch(denied)
    }
  })
})

describe('setting the PIN', () => {
  it('stores a bcrypt hash, never the PIN, and leaves the setting session unlocked', async () => {
    const { user, phone, laptop, enable, state, admin } = await setup()
    const s = await enable()
    expect(s).toMatchObject({ app_lock_enabled: true, pin_length: 4, locked: false, auto_lock_seconds: 300, failed_attempts: 0 })
    const row = (await admin(`select * from user_security where user_id = $1`, [user])).rows[0]
    expect(row.pin_hash).toMatch(/^\$2[aby]\$12\$/)
    expect(JSON.stringify(row)).not.toContain(PIN)
    expect((await admin(`select method from app_unlocks where session_id = $1`, [phone])).rows[0].method).toBe('setup')
    expect((await state(laptop)).locked).toBe(true) // every other session starts locked
  })
  it('accepts 6 digits and a chosen auto-lock time', async () => {
    const { phone, call } = await setup()
    expect(await call(phone, `set_pin('908142', 900)`)).toMatchObject({ pin_length: 6, auto_lock_seconds: 900 })
  })
  it('uses a different salt every time', async () => {
    const a = await setup(), b = await setup()
    await a.enable(); await b.enable()
    const hash = async (u: string) => (await ctx.q(`select pin_hash from user_security where user_id = $1`, [u])).rows[0].pin_hash
    expect(await hash(a.user)).not.toBe(await hash(b.user))
  })
  it.each(['12', '12345', '1234567', 'abcd', '12 34', '', '١٢٣٤', '0000', '1234', '4321', '7890', '2580', '112233'])('refuses %j', async (pin) => {
    const { phone, call, state } = await setup()
    expect(await ctx.fails(call(phone, 'set_pin($1)', [pin]))).toMatch(/PIN|digit|repeating|runs|first an attacker/i)
    expect((await state(phone)).app_lock_enabled).toBe(false)
  })
  it('refuses an auto-lock time that is not offered', async () => {
    const { phone, call } = await setup()
    expect(await ctx.fails(call(phone, `set_pin('2486', 7)`))).toMatch(/listed auto-lock/)
  })
  it('cannot be set twice (use change_pin), nor without a session', async () => {
    const { phone, call, enable, as } = await setup()
    await enable()
    expect(await ctx.fails(call(phone, `set_pin('7319')`))).toMatch(/already on/)
    expect(await ctx.fails(as(undefined, `select set_pin('7319')`))).toMatch(/Sign in again/)
  })
  it('is not available to the anonymous role', async () => {
    expect(await ctx.fails(ctx.asAnon((q) => q(`select set_pin('7319')`)))).toMatch(denied)
    expect(await ctx.fails(ctx.asAnon((q) => q(`select security_state()`)))).toMatch(denied)
  })
  it('judges PINs exactly as the apps do: all 10,000 four-digit PINs and every six-digit run or repeat', async () => {
    const sixes = ['000000', '111111', '123456', '654321', '234567', '890123', '112233', '121212', '159753', '248613', '908142', '555556']
    const pins = [...Array.from({ length: 10_000 }, (_, i) => String(i).padStart(4, '0')), ...sixes]
    const { rows } = await ctx.q(`select p, _weak_pin(p) as reason from unnest($1::text[]) as p`, [pins])
    const mismatches = rows.filter((r) => (r.reason ?? null) !== weakPinReason(r.p))
    expect(mismatches).toEqual([])
    expect(rows.filter((r) => !r.reason).every((r) => validatePin(r.p).ok)).toBe(true)
  })
})

describe('the gate on sensitive tables', () => {
  async function withData() {
    const t = await setup()
    // Create one row per protected table while unlocked.
    for (const table of PROTECTED) await ctx.asUser(t.user, (q) => FIXTURES[table].insert!(q, t.user, {}), t.phone)
    await t.enable()
    // enabling happened AFTER the rows were created: the phone is unlocked, so nothing changes for it.
    return t
  }
  it('the unlocked session reads and writes them; a session that never entered the PIN gets nothing', async () => {
    const { user, phone, laptop, as } = await withData()
    for (const table of PROTECTED) {
      expect((await as(phone, `select id from ${table}`)).rows, `${table} (unlocked)`).toHaveLength(1)
      expect((await as(laptop, `select id from ${table}`)).rows, `${table} (locked)`).toHaveLength(0)
      expect((await as(laptop, `update ${table} set user_id = user_id`)).affectedRows ?? 0, `${table} update (locked)`).toBe(0)
      expect((await as(laptop, `delete from ${table}`)).affectedRows ?? 0, `${table} delete (locked)`).toBe(0)
      expect((await as(phone, `select id from ${table}`)).rows, `${table} survives`).toHaveLength(1)
    }
    expect(await ctx.fails(as(laptop, `insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',1,'2026-11-02')`, [user]))).toMatch(/row-level security/i)
    expect(await ctx.fails(as(laptop, `insert into notes(user_id, title) values ($1,'x')`, [user]))).toMatch(/row-level security/i)
  })
  it('does not touch the rest of the app while locked', async () => {
    const { user, laptop, as } = await withData()
    await as(laptop, `insert into tasks(user_id, title) values ($1,'Still works')`, [user])
    expect((await as(laptop, `select title from tasks`)).rows).toEqual([{ title: 'Still works' }])
  })
  it('opens for a session the moment it proves the PIN, and closes when it locks', async () => {
    const { phone, laptop, as, call } = await withData()
    expect((await as(laptop, `select 1 from transactions`)).rows).toHaveLength(0)
    expect(await call(laptop, `verify_pin($1)`, [PIN])).toEqual({ ok: true })
    expect((await as(laptop, `select 1 from transactions`)).rows).toHaveLength(1)
    await call(laptop, 'lock_app()')
    expect((await as(laptop, `select 1 from transactions`)).rows).toHaveLength(0)
    expect(await call(laptop, 'touch_unlock()')).toBe(false)
    expect((await as(phone, `select 1 from transactions`)).rows).toHaveLength(1) // locking one device does not lock the other
  })
  it('a token with no session claim cannot open it, even for the right user', async () => {
    const { as, call } = await withData()
    expect(await ctx.fails(call(undefined, `verify_pin($1)`, [PIN]))).toMatch(/Sign in again/)
    expect((await as(undefined, `select 1 from transactions`)).rows).toHaveLength(0)
  })
  it("another user's lock does not affect me, and mine does not leak into theirs", async () => {
    const a = await withData()
    const b = await setup()
    await b.as(b.phone, `insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',1,'2026-11-02')`, [b.user])
    expect((await b.as(b.phone, `select 1 from transactions`)).rows).toHaveLength(1)
    expect((await a.as(a.laptop, `select 1 from transactions`)).rows).toHaveLength(0)
  })
  it('closes by itself when the user goes quiet, and a heartbeat keeps it open', async () => {
    const { phone, as, call, admin } = await withData()
    await call(phone, 'set_auto_lock(60)') // window = 60 s + 30 s of slack
    await admin(`update app_unlocks set last_active_at = now() - interval '80 seconds'`)
    expect(await call(phone, 'touch_unlock()')).toBe(true) // still inside the window: renewed
    await admin(`update app_unlocks set last_active_at = now() - interval '80 seconds'`)
    expect(await call(phone, 'touch_unlock()')).toBe(true)
    await admin(`update app_unlocks set last_active_at = now() - interval '100 seconds'`)
    expect((await as(phone, `select 1 from transactions`)).rows).toHaveLength(0) // gone quiet
    expect(await call(phone, 'touch_unlock()')).toBe(false) // a heartbeat cannot revive it
    expect((await call(phone, 'security_state()')).locked).toBe(true)
  })
  it('"when I leave the app" still leaves a minute for a slow heartbeat', async () => {
    const { phone, as, call, admin } = await withData()
    await call(phone, 'set_auto_lock(0)')
    await admin(`update app_unlocks set last_active_at = now() - interval '45 seconds'`)
    expect((await as(phone, `select 1 from transactions`)).rows).toHaveLength(1)
    await admin(`update app_unlocks set last_active_at = now() - interval '95 seconds'`)
    expect((await as(phone, `select 1 from transactions`)).rows).toHaveLength(0)
  })
})

describe('verifying the PIN', () => {
  it('rejects a wrong PIN without unlocking, and counts down the tries', async () => {
    const { laptop, call, state } = await setup().then(async (t) => (await t.enable(), t))
    const r = await call(laptop, `verify_pin('1357')`)
    expect(r).toMatchObject({ ok: false, reason: 'wrong_pin', failed_attempts: 1, tries_left: 4, lockout_seconds: 0, signed_out: false })
    expect((await state(laptop)).locked).toBe(true)
    expect(await call(laptop, `verify_pin('1357')`)).toMatchObject({ failed_attempts: 2, tries_left: 3 })
  })
  it('does not roll the count back: a wrong PIN returns a result instead of raising', async () => {
    const { laptop, call, state } = await setup().then(async (t) => (await t.enable(), t))
    await call(laptop, `verify_pin('1357')`)
    expect((await state(laptop)).failed_attempts).toBe(1)
  })
  it.each(['', 'abcd', '24 86', '24860000', null])('treats %j as a wrong PIN, not a free pass', async (bad) => {
    const { laptop, call } = await setup().then(async (t) => (await t.enable(), t))
    expect(await call(laptop, 'verify_pin($1)', [bad])).toMatchObject({ ok: false, reason: 'wrong_pin', failed_attempts: 1 })
  })
  it('a correct PIN resets the count', async () => {
    const { laptop, call, state } = await setup().then(async (t) => (await t.enable(), t))
    await call(laptop, `verify_pin('1357')`); await call(laptop, `verify_pin('1357')`)
    expect(await call(laptop, `verify_pin($1)`, [PIN])).toEqual({ ok: true })
    expect(await state(laptop)).toMatchObject({ failed_attempts: 0, locked: false })
  })
  it('locks PIN entry after 5 wrong tries — even the right PIN is refused during the lockout', async () => {
    const { laptop, call, state, admin, user } = await setup().then(async (t) => (await t.enable(), t))
    let last: any
    for (let i = 0; i < 5; i++) last = await call(laptop, `verify_pin('1357')`)
    expect(last).toMatchObject({ reason: 'wrong_pin', lockout_seconds: 30, tries_left: 0, signed_out: false })
    const refused = await call(laptop, `verify_pin($1)`, [PIN])
    expect(refused).toMatchObject({ ok: false, reason: 'locked_out' })
    expect(refused.lockout_seconds).toBeGreaterThan(25)
    expect((await state(laptop)).lockout_seconds).toBeGreaterThan(25)
    expect((await state(laptop)).failed_attempts).toBe(5) // a refused try during lockout is not counted again
    await admin(`update user_security set lockout_until = now() - interval '1 second' where user_id = $1`, [user])
    expect(await call(laptop, `verify_pin($1)`, [PIN])).toEqual({ ok: true })
    expect((await state(laptop)).failed_attempts).toBe(0)
  })
  it('follows the same schedule as the apps for the first 40 wrong tries', async () => {
    const { user, admin } = await setup().then(async (t) => (await t.enable(), t))
    for (let i = 1; i <= 40; i++) {
      const r = (await admin(`select _register_failure($1, null) as r`, [user])).rows[0].r
      expect(r.lockout_seconds, `try ${i}`).toBe(lockoutSecondsAfter(i))
      expect(r.signed_out, `try ${i}`).toBe(revokesSession(i))
    }
  })
  it('from the 10th wrong try the session itself is ended, so guessing on needs the password again', async () => {
    const { laptop, phone, user, call, admin } = await setup().then(async (t) => (await t.enable(), t))
    const wrong = async () => {
      await admin(`update user_security set lockout_until = null where user_id = $1`, [user]) // pretend the previous lockout has run out
      return call(laptop, `verify_pin('1357')`)
    }
    for (let i = 0; i < 9; i++) await wrong()
    expect((await admin(`select 1 from auth.sessions where id = $1`, [laptop])).rows).toHaveLength(1)
    const r = await wrong()
    expect(r).toMatchObject({ failed_attempts: 10, signed_out: true, lockout_seconds: 60 })
    expect((await admin(`select 1 from auth.sessions where id = $1`, [laptop])).rows).toHaveLength(0)
    expect((await admin(`select 1 from auth.sessions where id = $1`, [phone])).rows).toHaveLength(1) // other sessions are not collateral
  })
  it('the lockout is per account, not per session: switching device does not reset it', async () => {
    const { laptop, phone, call, state } = await setup().then(async (t) => (await t.enable(), t))
    for (let i = 0; i < 5; i++) await call(laptop, `verify_pin('1357')`)
    expect(await call(phone, `verify_pin($1)`, [PIN])).toMatchObject({ reason: 'locked_out' })
    expect((await state(phone)).lockout_seconds).toBeGreaterThan(0)
  })
})

describe('changing and removing the PIN', () => {
  it('changes it only with the current PIN, and the old one stops working', async () => {
    const { phone, laptop, call } = await setup().then(async (t) => (await t.enable(), t))
    expect(await call(phone, `change_pin('1357','7319')`)).toMatchObject({ ok: false, reason: 'wrong_pin', failed_attempts: 1 }) // wrong current: counted
    expect(await call(phone, `change_pin($1,'7319')`, [PIN])).toEqual({ ok: true })
    expect(await call(laptop, `verify_pin($1)`, [PIN])).toMatchObject({ ok: false })
    expect(await call(laptop, `verify_pin('7319')`)).toEqual({ ok: true })
  })
  it('can move between 4 and 6 digits', async () => {
    const { phone, call, state } = await setup().then(async (t) => (await t.enable(), t))
    await call(phone, `change_pin($1,'908142')`, [PIN])
    expect((await state(phone)).pin_length).toBe(6)
  })
  it('validates the new PIN before it touches the counters', async () => {
    const { phone, call, state } = await setup().then(async (t) => (await t.enable(), t))
    expect(await ctx.fails(call(phone, `change_pin($1,'1234')`, [PIN]))).toMatch(/runs/)
    expect(await ctx.fails(call(phone, `change_pin($1,$1)`, [PIN]))).toMatch(/different/)
    expect((await state(phone)).failed_attempts).toBe(0)
  })
  it('needs an unlocked session', async () => {
    const { laptop, call } = await setup().then(async (t) => (await t.enable(), t))
    expect(await ctx.fails(call(laptop, `change_pin($1,'7319')`, [PIN]))).toMatch(/locked/i)
  })
  it('turning the lock off needs the PIN, clears everything, and opens the tables for every session', async () => {
    const { user, phone, laptop, call, as, admin } = await setup().then(async (t) => (await t.enable(), t))
    await as(phone, `insert into notes(user_id, title) values ($1,'private')`, [user])
    expect(await call(phone, `disable_app_lock('1357')`)).toMatchObject({ ok: false, reason: 'wrong_pin' })
    expect(await call(phone, `disable_app_lock($1)`, [PIN])).toEqual({ ok: true })
    const row = (await admin(`select * from user_security where user_id = $1`, [user])).rows[0]
    expect(row).toMatchObject({ app_lock_enabled: false, pin_hash: null, pin_length: null, biometric_enabled: false, failed_attempts: 0 })
    expect((await admin(`select 1 from app_unlocks where user_id = $1`, [user])).rows).toHaveLength(0)
    expect((await as(laptop, `select title from notes`)).rows).toEqual([{ title: 'private' }])
    expect(await call(phone, `verify_pin($1)`, [PIN])).toMatchObject({ reason: 'not_enabled' })
  })
})

describe('forgot the PIN', () => {
  it('refuses a stale session, accepts a fresh one, and locks every other session again', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const stale = await ctx.newSession(t.user, 30)
    expect(await ctx.fails(t.call(stale, `reset_app_lock('7319')`))).toMatch(/Sign in again with your password/)
    await t.call(t.laptop, `verify_pin($1)`, [PIN]) // laptop is unlocked too…
    for (let i = 0; i < 5; i++) await t.call(t.phone, `verify_pin('1357')`) // …and the PIN is locked out
    const fresh = await ctx.newSession(t.user, 2)
    const s = await t.call(fresh, `reset_app_lock('7319')`)
    expect(s).toMatchObject({ app_lock_enabled: true, locked: false, failed_attempts: 0, lockout_seconds: 0 })
    expect((await t.state(t.laptop)).locked).toBe(true) // …now locked again
    expect((await t.state(t.phone)).locked).toBe(true)
    expect(await t.call(t.laptop, `verify_pin('7319')`)).toEqual({ ok: true })
  })
  it('can turn the app lock off instead', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const fresh = await ctx.newSession(t.user, 1)
    expect(await t.call(fresh, `reset_app_lock()`)).toMatchObject({ app_lock_enabled: false, locked: false })
  })
  it('still validates the new PIN', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const fresh = await ctx.newSession(t.user, 1)
    expect(await ctx.fails(t.call(fresh, `reset_app_lock('1234')`))).toMatch(/runs/)
  })
})

describe('unlocking right after typing the password', () => {
  it('opens a brand-new session without the PIN, once, and clears the PIN lockout', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    for (let i = 0; i < 5; i++) await t.call(t.laptop, `verify_pin('1357')`) // someone has been guessing
    expect((await t.state(t.laptop)).lockout_seconds).toBeGreaterThan(0)
    const fresh = await ctx.newSession(t.user, 0)
    expect((await t.state(fresh)).locked).toBe(true)
    const s = await t.call(fresh, 'unlock_after_login()')
    expect(s).toMatchObject({ locked: false, failed_attempts: 0, lockout_seconds: 0 })
    expect((await t.admin(`select method from app_unlocks where session_id = $1`, [fresh])).rows[0].method).toBe('password')
    expect((await t.state(t.laptop)).locked).toBe(true) // other sessions are untouched
  })
  it('does nothing for a session that is a minute old: that is a stolen or idle session, not a sign-in', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const old = await ctx.newSession(t.user, 2)
    expect(await t.call(old, 'unlock_after_login()')).toMatchObject({ locked: true })
  })
  it('does nothing for a session that was unlocked and locked again: "Lock now" then reload must ask for the PIN', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const fresh = await ctx.newSession(t.user, 0)
    await t.call(fresh, 'unlock_after_login()')
    await t.call(fresh, 'lock_app()')
    expect(await t.call(fresh, 'unlock_after_login()')).toMatchObject({ locked: true })
    expect((await t.admin(`select count(*)::int n from app_unlocks where session_id = $1`, [fresh])).rows[0].n).toBe(1) // tombstone, not a delete
  })
  it('does nothing for a session that expired by itself being idle', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const fresh = await ctx.newSession(t.user, 0)
    await t.call(fresh, 'unlock_after_login()')
    await t.admin(`update app_unlocks set last_active_at = now() - interval '1 day' where session_id = $1`, [fresh])
    expect(await t.call(fresh, 'unlock_after_login()')).toMatchObject({ locked: true })
  })
  it('changes nothing when there is no app lock, and refuses a token without a session', async () => {
    const t = await setup()
    expect(await t.call(t.phone, 'unlock_after_login()')).toMatchObject({ app_lock_enabled: false, locked: false })
    expect((await t.admin(`select count(*)::int n from app_unlocks where user_id = $1`, [t.user])).rows[0].n).toBe(0)
    expect(await ctx.fails(t.as(undefined, 'select unlock_after_login()'))).toMatch(/Sign in again/)
  })
  it('is not available to the anonymous role', async () => {
    expect(await ctx.fails(ctx.asAnon((q) => q('select unlock_after_login()')))).toMatch(denied)
  })
})

describe('what a locked session may not manage', () => {
  it.each([
    ['list_my_sessions()', 'select * from list_my_sessions()'],
    ['revoke_session', `select revoke_session(gen_random_uuid())`],
    ['set_auto_lock', `select set_auto_lock(60)`],
    ['set_biometric_enabled', `select set_biometric_enabled(false)`],
    ['list_passkeys', `select * from list_passkeys()`],
    ['rename_passkey', `select rename_passkey(gen_random_uuid(), 'x')`],
    ['remove_passkey', `select remove_passkey(gen_random_uuid())`],
  ])('%s', async (_name, sql) => {
    const { laptop, as } = await setup().then(async (t) => (await t.enable(), t))
    expect(await ctx.fails(as(laptop, sql))).toMatch(/locked/i)
  })
  it('but may always lock itself, ask its state, and sign in with the PIN', async () => {
    const { laptop, call } = await setup().then(async (t) => (await t.enable(), t))
    await call(laptop, 'lock_app()')
    expect((await call(laptop, 'security_state()')).locked).toBe(true)
    expect(await call(laptop, 'touch_unlock()')).toBe(false)
  })
})

describe('sessions', () => {
  it('lists only my sessions, marks the current one, and shows which are unlocked', async () => {
    const t = await setup()
    const other = await setup()
    await t.admin(`update auth.sessions set user_agent = 'Mozilla/5.0 Chrome', ip = '203.0.113.7' where id = $1`, [t.laptop])
    await t.enable()
    const rows = (await t.as(t.phone, `select * from list_my_sessions()`)).rows
    expect(rows.map((r) => r.id).sort()).toEqual([t.phone, t.laptop].sort())
    expect(rows.map((r) => r.id)).not.toContain(other.phone)
    expect(rows[0]).toMatchObject({ id: t.phone, is_current: true, unlocked: true }) // current first
    expect(rows.find((r) => r.id === t.laptop)).toMatchObject({ is_current: false, unlocked: false, user_agent: 'Mozilla/5.0 Chrome', ip: '203.0.113.7' })
  })
  it('hides sessions that have already expired', async () => {
    const t = await setup()
    await t.admin(`update auth.sessions set not_after = now() - interval '1 minute' where id = $1`, [t.laptop])
    expect((await t.as(t.phone, `select id from list_my_sessions()`)).rows.map((r) => r.id)).toEqual([t.phone])
  })
  it('ends another session and closes its tables at once', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    await t.call(t.laptop, `verify_pin($1)`, [PIN])
    await t.call(t.phone, `revoke_session($1)`, [t.laptop])
    expect((await t.admin(`select 1 from auth.sessions where id = $1`, [t.laptop])).rows).toHaveLength(0)
    expect((await t.admin(`select 1 from app_unlocks where session_id = $1`, [t.laptop])).rows).toHaveLength(0)
    expect((await t.as(t.laptop, `select 1 from transactions`)).rows).toHaveLength(0) // the still-valid token reads nothing
  })
  it("cannot end or see someone else's session", async () => {
    const t = await setup(), other = await setup()
    expect(await ctx.fails(t.call(t.phone, `revoke_session($1)`, [other.phone]))).toMatch(/no longer exists/)
    expect((await t.admin(`select 1 from auth.sessions where id = $1`, [other.phone])).rows).toHaveLength(1)
  })
  it('works without the app lock too', async () => {
    const t = await setup()
    await t.call(t.phone, `revoke_session($1)`, [t.laptop])
    expect((await t.admin(`select 1 from auth.sessions where user_id = $1`, [t.user])).rows).toHaveLength(1)
  })
})

describe('a device signed out elsewhere is told so, instead of sitting at a lock screen that can never open', () => {
  it('every entry point says the session has ended (so the app can sign out), while the others keep working', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    await t.admin(`delete from auth.sessions where id = $1`, [t.laptop])
    for (const sql of [`security_state()`, `verify_pin('2486')`, `set_pin('7319')`, `set_auto_lock(60)`, `change_pin('2486','7319')`, `trust_session(gen_random_uuid())`]) {
      expect(await ctx.fails(t.call(t.laptop, sql)), sql).toMatch(/Your session has ended/)
    }
    expect(await t.state(t.phone)).toMatchObject({ locked: false }) // the device still signed in is untouched
    expect((await t.admin(`select count(*)::int n from app_unlocks where session_id = $1`, [t.laptop])).rows[0].n).toBe(0) // and no unlock record was made for it
  })
  it('a token with no session claim at all is still just "locked", as before', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    expect((await t.as(undefined, `select security_state() as s`)).rows[0].s.locked).toBe(true)
  })
})

describe('a signed-out device loses sensitive data at once', () => {
  it('even though its access token is still valid and its unlock record is fresh', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    await t.call(t.laptop, `verify_pin($1)`, [PIN])
    await t.as(t.phone, `insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',1,'2026-11-02')`, [t.user])
    expect((await t.as(t.laptop, `select 1 from transactions`)).rows).toHaveLength(1)
    await t.admin(`delete from auth.sessions where id = $1`, [t.laptop]) // what GoTrue does for "sign out other devices" / a password change
    expect((await t.as(t.laptop, `select 1 from transactions`)).rows).toHaveLength(0)
    expect(await t.call(t.laptop, 'touch_unlock()')).toBe(false)
    expect((await t.as(t.phone, `select 1 from transactions`)).rows).toHaveLength(1) // the device still signed in is untouched
  })
  it('and a session that never existed cannot borrow an unlock record', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    await t.as(t.phone, `insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',1,'2026-11-02')`, [t.user])
    const ghost = '00000000-0000-4000-8000-000000000001'
    await t.admin(`insert into app_unlocks(session_id, user_id, method) values ($1, $2, 'pin')`, [ghost, t.user])
    expect((await t.as(ghost, `select 1 from transactions`)).rows).toHaveLength(0) // a fresh unlock record, but no such session
    expect(await ctx.fails(t.state(ghost))).toMatch(/Your session has ended/)
  })
})

describe('trusted devices (an app with no lock screen of its own)', () => {
  async function withMobile() {
    const t = await setup()
    const mobile = await ctx.newSession(t.user)
    await t.as(t.phone, `insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',100,'2026-11-02')`, [t.user])
    await t.enable()
    return { ...t, mobile, seen: () => t.as(mobile, `select 1 from transactions`).then((r) => r.rows.length) }
  }
  it('with the lock on, a device that cannot unlock loses Finance until it is trusted', async () => {
    const t = await withMobile()
    expect(await t.seen()).toBe(0)
    await t.call(t.phone, 'trust_session($1)', [t.mobile])
    expect(await t.seen()).toBe(1)
    expect(await t.state(t.mobile)).toMatchObject({ locked: false })
  })
  it('stays trusted however long it is quiet, and a heartbeat does not turn it back into a normal session', async () => {
    const t = await withMobile()
    await t.call(t.phone, 'trust_session($1)', [t.mobile])
    await t.admin(`update auth.sessions set updated_at = now() - interval '30 days' where id = $1`, [t.mobile])
    expect(await t.call(t.mobile, 'touch_unlock()')).toBe(true)
    expect((await t.admin(`select last_active_at = 'infinity' as forever, method from app_unlocks where session_id = $1`, [t.mobile])).rows[0]).toEqual({ forever: true, method: 'trusted' })
    expect(await t.seen()).toBe(1)
  })
  it('is shown in the session list', async () => {
    const t = await withMobile()
    const trustedOf = async () => (await t.as(t.phone, `select id, trusted from list_my_sessions()`)).rows.find((r) => r.id === t.mobile).trusted
    expect(await trustedOf()).toBe(false)
    await t.call(t.phone, 'trust_session($1)', [t.mobile])
    expect(await trustedOf()).toBe(true)
  })
  it('can be withdrawn: the PIN is asked for again', async () => {
    const t = await withMobile()
    await t.call(t.phone, 'trust_session($1)', [t.mobile])
    await t.call(t.phone, 'untrust_session($1)', [t.mobile])
    expect(await t.seen()).toBe(0)
    expect(await t.call(t.mobile, `verify_pin($1)`, [PIN])).toEqual({ ok: true }) // and it can unlock the normal way
    expect(await t.seen()).toBe(1)
    await t.admin(`update app_unlocks set last_active_at = now() - interval '1 day' where session_id = $1`, [t.mobile])
    expect(await t.seen()).toBe(0) // now an ordinary session again: it expires
  })
  it('is lost when the device locks itself, signs out, or when the PIN is reset or the lock turned off', async () => {
    const t = await withMobile()
    await t.call(t.phone, 'trust_session($1)', [t.mobile])
    await t.call(t.mobile, 'lock_app()')
    expect(await t.seen()).toBe(0)

    await t.call(t.phone, 'trust_session($1)', [t.mobile])
    await t.call(t.phone, 'revoke_session($1)', [t.mobile])
    expect((await t.admin(`select 1 from app_unlocks where session_id = $1`, [t.mobile])).rows).toHaveLength(0)

    const second = await ctx.newSession(t.user)
    await t.call(t.phone, 'trust_session($1)', [second])
    const fresh = await ctx.newSession(t.user, 1)
    await t.call(fresh, `reset_app_lock('7319')`) // after a suspected break-in: every other device must prove itself again
    expect((await t.as(second, `select 1 from transactions`)).rows).toHaveLength(0)

    await t.call(fresh, `disable_app_lock('7319')`)
    expect((await t.admin(`select 1 from app_unlocks where user_id = $1`, [t.user])).rows).toHaveLength(0)
    expect((await t.state(second)).locked).toBe(false) // no lock at all now
    await t.call(fresh, `set_pin('2486')`)
    expect((await t.state(second)).locked).toBe(true) // and turning it on again does not bring the trust back
  })
  it('only an unlocked session can grant it, only with the lock on, and never to itself or to someone else\'s session', async () => {
    const t = await withMobile()
    const other = await setup()
    expect(await ctx.fails(t.call(t.laptop, 'trust_session($1)', [t.mobile]))).toMatch(/locked/i) // the laptop never entered the PIN
    expect(await ctx.fails(t.call(t.phone, 'trust_session($1)', [t.phone]))).toMatch(/turn the app lock off/i)
    expect(await ctx.fails(t.call(t.phone, 'trust_session($1)', [other.phone]))).toMatch(/no longer exists/)
    expect(await ctx.fails(t.call(t.phone, 'trust_session($1)', ['00000000-0000-4000-8000-000000000009']))).toMatch(/no longer exists/)
    await t.call(t.phone, `disable_app_lock($1)`, [PIN])
    expect(await ctx.fails(t.call(t.phone, 'trust_session($1)', [t.mobile]))).toMatch(/Turn on the app lock first/)
    expect(await ctx.fails(t.call(t.laptop, 'untrust_session($1)', [t.mobile]))).toBeNull() // no lock: everyone is unlocked, nothing to withdraw
  })
  it('cannot be used by the anonymous role', async () => {
    expect(await ctx.fails(ctx.asAnon((q) => q(`select trust_session(gen_random_uuid())`)))).toMatch(denied)
    expect(await ctx.fails(ctx.asAnon((q) => q(`select untrust_session(gen_random_uuid())`)))).toMatch(denied)
  })
})

describe('auto-lock and biometric settings', () => {
  it('stores only the offered times', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    expect((await t.call(t.phone, 'set_auto_lock(1800)')).auto_lock_seconds).toBe(1800)
    for (const bad of [-1, 7, 301, 86_400]) expect(await ctx.fails(t.call(t.phone, 'set_auto_lock($1)', [bad])), String(bad)).toMatch(/listed auto-lock/)
  })
  it('biometrics need the app lock and at least one registered key', async () => {
    const t = await setup()
    expect(await ctx.fails(t.call(t.phone, 'set_biometric_enabled(true)'))).toMatch(/Turn on the app lock first/)
    await t.enable()
    expect(await ctx.fails(t.call(t.phone, 'set_biometric_enabled(true)'))).toMatch(/Add a fingerprint/)
    expect((await t.call(t.phone, 'set_biometric_enabled(false)')).biometric_enabled).toBe(false)
  })
})

describe('passkey functions (Edge Function only)', () => {
  const JWK = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }
  const add = (s: Awaited<ReturnType<typeof setup>>, id = 'cred-' + Math.random().toString(36).slice(2).padEnd(20, 'x'), count = 0) =>
    ctx.asService((q) => q(`select pk_add_credential($1,$2,$3,-7,$4,'{internal}','My laptop','multiDevice',true) as id`, [s.user, id, JSON.stringify(JWK), count])).then((r) => ({ id: r.rows[0].id as string, credential: id }))

  it('refuses every client role, signed in or not', async () => {
    const t = await setup()
    const calls = [
      `pk_status($1, $2)`, `pk_issue_challenge($1, $2, 'register', repeat('a', 43))`, `pk_take_challenge($1, $2, 'register', repeat('a', 43))`,
      `pk_credentials($1)`, `pk_unlock($1, $2)`, `pk_failure($1, $2)`, `pk_record_assertion(gen_random_uuid(), $1, 5)`,
      `pk_add_credential($1, repeat('c', 20), '{}', -7, 0, '{}', 'x', 'singleDevice', false)`, `_is_unlocked($1, $2)`, `_register_failure($1, $2)`, `_check_pin($1, $2, '2486')`,
    ]
    for (const c of calls) {
      const p = c.includes('$2') ? [t.user, t.phone] : [t.user]
      expect(await ctx.fails(ctx.asUser(t.user, (q) => q(`select ${c}`, p), t.phone)), c).toMatch(denied)
      expect(await ctx.fails(ctx.asAnon((q) => q(`select ${c}`, p))), c).toMatch(denied)
    }
  })

  it('challenges are single-use: a recorded response cannot be replayed', async () => {
    const t = await setup()
    const ch = 'A'.repeat(43)
    const service = <T>(sql: string, p: unknown[]) => ctx.asService((q) => q(sql, p))
    await service(`select pk_issue_challenge($1,$2,'authenticate',$3)`, [t.user, t.phone, ch])
    const take = async (user = t.user, session = t.phone, purpose = 'authenticate', c = ch) => (await service(`select pk_take_challenge($1,$2,$3,$4) as ok`, [user, session, purpose, c])).rows[0].ok
    expect(await take(t.user, t.laptop)).toBe(false) // another session
    expect(await take(t.user, t.phone, 'register')).toBe(false) // another purpose
    expect(await take((await setup()).user)).toBe(false) // another user
    expect(await take()).toBe(true)
    expect(await take()).toBe(false) // replay
  })
  it('challenges expire', async () => {
    const t = await setup()
    const ch = 'B'.repeat(43)
    await ctx.asService((q) => q(`select pk_issue_challenge($1,$2,'register',$3)`, [t.user, t.phone, ch]))
    await t.admin(`update webauthn_challenges set expires_at = now() - interval '1 second' where challenge = $1`, [ch])
    expect((await ctx.asService((q) => q(`select pk_take_challenge($1,$2,'register',$3) as ok`, [t.user, t.phone, ch]))).rows[0].ok).toBe(false)
  })
  it('keeps at most 10 open challenges per user', async () => {
    const t = await setup()
    for (let i = 0; i < 14; i++) await ctx.asService((q) => q(`select pk_issue_challenge($1,$2,'register',$3)`, [t.user, t.phone, String(i).padStart(2, '0') + 'C'.repeat(41)]))
    expect((await t.admin(`select count(*)::int n from webauthn_challenges where user_id = $1`, [t.user])).rows[0].n).toBe(10)
  })

  it('the first key turns biometrics on, and is capped at 10 keys', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    expect((await t.state(t.phone)).biometric_enabled).toBe(false)
    await add(t)
    expect(await t.state(t.phone)).toMatchObject({ biometric_enabled: true, passkey_count: 1 })
    for (let i = 0; i < 9; i++) await add(t)
    expect(await ctx.fails(add(t))).toMatch(/up to 10/)
  })
  it('stores a credential id once', async () => {
    const t = await setup(), other = await setup()
    const { credential } = await add(t)
    expect(await ctx.fails(add(other, credential))).toMatch(/duplicate key|unique/i)
  })
  it('a client lists, renames and removes its own keys — without ever seeing the public key', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const other = await setup().then(async (x) => (await x.enable(), x))
    const mine = await add(t)
    const theirs = await add(other)
    const rows = (await t.as(t.phone, `select * from list_passkeys()`)).rows
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['backed_up', 'created_at', 'device_type', 'id', 'label', 'last_used_at', 'transports'])
    await t.call(t.phone, `rename_passkey($1, '  Work laptop ')`, [mine.id])
    expect((await t.as(t.phone, `select label from list_passkeys()`)).rows[0].label).toBe('Work laptop')
    expect(await ctx.fails(t.call(t.phone, `rename_passkey($1, '')`, [mine.id]))).toMatch(/1 to 60/)
    expect(await ctx.fails(t.call(t.phone, `rename_passkey($1, 'x')`, [theirs.id]))).toMatch(/not on your account/)
    expect(await ctx.fails(t.call(t.phone, `remove_passkey($1)`, [theirs.id]))).toMatch(/not on your account/)
    expect((await other.as(other.phone, `select 1 from list_passkeys()`)).rows).toHaveLength(1)
    expect(await t.call(t.phone, `remove_passkey($1)`, [mine.id])).toMatchObject({ passkey_count: 0, biometric_enabled: false })
  })
  it('only counts a sign-in whose counter moved forward', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const { id } = await add(t, undefined, 10)
    const record = async (c: number, user = t.user) => (await ctx.asService((q) => q(`select pk_record_assertion($1,$2,$3) as ok`, [id, user, c]))).rows[0].ok
    expect(await record(11)).toBe(true)
    expect(await record(11)).toBe(false)
    expect(await record(5)).toBe(false) // a clone that fell behind
    expect(await record(12, (await setup()).user)).toBe(false) // someone else's key
    expect(await record(12)).toBe(true)
    const { id: counterless } = await add(t, undefined, 0)
    expect((await ctx.asService((q) => q(`select pk_record_assertion($1,$2,0) as ok`, [counterless, t.user]))).rows[0].ok).toBe(true) // synced passkeys stay at 0
  })
  it('unlocks a session, clears the PIN lockout, and needs biometrics on', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const unlock = () => ctx.asService((q) => q(`select pk_unlock($1,$2)`, [t.user, t.laptop]))
    expect(await ctx.fails(unlock())).toMatch(/not turned on/)
    await add(t)
    for (let i = 0; i < 5; i++) await t.call(t.laptop, `verify_pin('1357')`)
    expect((await t.state(t.laptop)).lockout_seconds).toBeGreaterThan(0)
    await unlock()
    expect(await t.state(t.laptop)).toMatchObject({ locked: false, lockout_seconds: 0, failed_attempts: 0 })
    expect((await t.admin(`select method from app_unlocks where session_id = $1`, [t.laptop])).rows[0].method).toBe('passkey')
    expect(await ctx.fails(ctx.asService((q) => q(`select pk_unlock($1, null)`, [t.user])))).toMatch(/No session/)
  })
  it('reports what the Edge Function needs to decide', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const status = async (session: string) => (await ctx.asService((q) => q(`select pk_status($1,$2) as s`, [t.user, session]))).rows[0].s
    expect(await status(t.phone)).toEqual({ app_lock_enabled: true, biometric_enabled: false, unlocked: true, passkey_count: 0 })
    expect((await status(t.laptop)).unlocked).toBe(false)
  })
  it('failed assertions count toward the same lockout', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    let r: any
    for (let i = 0; i < 5; i++) r = (await ctx.asService((q) => q(`select pk_failure($1,$2) as r`, [t.user, t.laptop]))).rows[0].r
    expect(r).toMatchObject({ failed_attempts: 5, lockout_seconds: 30 })
    expect(await t.call(t.laptop, `verify_pin($1)`, [PIN])).toMatchObject({ reason: 'locked_out' })
  })
})

describe('password lockout hook', () => {
  const hook = async (user: string, valid: boolean) => (await ctx.q(`select hook_password_verification_attempt($1::jsonb) as r`, [JSON.stringify({ user_id: user, valid })])).rows[0].r
  it('lets sign-ins through and counts wrong passwords', async () => {
    const { user, admin } = await setup()
    expect(await hook(user, true)).toEqual({ decision: 'continue' })
    expect(await hook(user, false)).toEqual({ decision: 'continue' }) // GoTrue answers "invalid credentials" itself
    expect((await admin(`select failed from password_attempts where user_id = $1`, [user])).rows[0].failed).toBe(1)
  })
  it('follows the schedule of the apps: every 5th wrong password blocks sign-in, even with the right one', async () => {
    const { user, admin } = await setup()
    for (let i = 1; i <= 25; i++) {
      await admin(`update password_attempts set locked_until = null where user_id = $1`, [user]) // the previous lockout has run out
      await hook(user, false)
      const row = (await admin(`select failed, extract(epoch from locked_until - now()) as wait from password_attempts where user_id = $1`, [user])).rows[0]
      const expected = passwordLockoutSecondsAfter(i)
      expect(row.failed).toBe(i)
      if (expected === 0) expect(row.wait).toBeNull()
      else expect(Math.round(Number(row.wait))).toBeGreaterThan(expected - 3)
    }
    const during = await hook(user, true)
    expect(during.decision).toBe('reject')
    expect(during.message).toMatch(/Too many sign-in attempts. Try again in \d+ min/)
  })
  it('a correct password after the lockout clears the count', async () => {
    const { user, admin } = await setup()
    for (let i = 0; i < 5; i++) await hook(user, false)
    expect((await hook(user, true)).decision).toBe('reject')
    await admin(`update password_attempts set locked_until = now() - interval '1 second' where user_id = $1`, [user])
    expect(await hook(user, true)).toEqual({ decision: 'continue' })
    expect((await admin(`select failed, locked_until from password_attempts where user_id = $1`, [user])).rows[0]).toEqual({ failed: 0, locked_until: null })
  })
  it('forgets old failures after a day, and keeps accounts apart', async () => {
    const a = await setup(), b = await setup()
    for (let i = 0; i < 4; i++) await hook(a.user, false)
    await a.admin(`update password_attempts set last_failed_at = now() - interval '25 hours' where user_id = $1`, [a.user])
    await hook(a.user, false)
    expect((await a.admin(`select failed from password_attempts where user_id = $1`, [a.user])).rows[0].failed).toBe(1)
    expect((await hook(b.user, true)).decision).toBe('continue')
  })
  it('can be called by GoTrue only', async () => {
    const { user } = await setup()
    const sql = `select hook_password_verification_attempt('{"user_id":"${user}","valid":true}'::jsonb)`
    expect(await ctx.fails(ctx.asUser(user, (q) => q(sql)))).toMatch(denied)
    expect(await ctx.fails(ctx.asAnon((q) => q(sql)))).toMatch(denied)
    expect(await ctx.fails(ctx.asUser(user, (q) => q('select * from password_attempts')))).toMatch(denied)
  })
})

describe('who may execute what', () => {
  // Postgres grants EXECUTE on a new function to everyone unless it is revoked, so one forgotten line would expose an internal function. This reads the
  // function names out of the migration itself and checks the exact privileges of every one, so a new function cannot slip through unclassified.
  const CLIENT = ['current_session_id', 'app_session_unlocked', 'security_state', 'set_pin', 'verify_pin', 'change_pin', 'disable_app_lock', 'reset_app_lock', 'lock_app', 'unlock_after_login', 'touch_unlock', 'set_auto_lock', 'set_biometric_enabled', 'list_passkeys', 'rename_passkey', 'remove_passkey', 'list_my_sessions', 'revoke_session', 'trust_session', 'untrust_session']
  const SERVICE = ['pk_status', 'pk_issue_challenge', 'pk_take_challenge', 'pk_credentials', 'pk_add_credential', 'pk_record_assertion', 'pk_unlock', 'pk_failure']
  const INTERNAL = ['_is_unlocked', '_require_session', '_require_unlocked', '_is_run', '_weak_pin', '_validate_pin', '_register_failure', '_check_pin']
  const HOOK = ['hook_password_verification_attempt']
  const sql = readFileSync(new URL('../../migrations/0012_security.sql', import.meta.url), 'utf8')
  const defined = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])
  const can = async (role: string, fn: string) =>
    (await ctx.q(`select bool_or(has_function_privilege($1, p.oid, 'execute')) as ok from pg_proc p where p.proname = $2 and p.pronamespace = 'public'::regnamespace`, [role, fn])).rows[0].ok as boolean

  it('every function the migration defines is classified here (so a new one forces a decision)', () => {
    expect([...defined].sort()).toEqual([...CLIENT, ...SERVICE, ...INTERNAL, ...HOOK].sort())
  })
  it.each(CLIENT)('%s: signed-in clients, not the anonymous role', async (fn) => {
    expect(await can('authenticated', fn), 'authenticated').toBe(true)
    expect(await can('anon', fn), 'anon').toBe(false)
  })
  it.each(SERVICE)('%s: the service role only', async (fn) => {
    expect(await can('service_role', fn), 'service_role').toBe(true)
    expect(await can('authenticated', fn), 'authenticated').toBe(false)
    expect(await can('anon', fn), 'anon').toBe(false)
  })
  it.each([...INTERNAL, ...HOOK])('%s: no client role at all', async (fn) => {
    expect(await can('authenticated', fn), 'authenticated').toBe(false)
    expect(await can('anon', fn), 'anon').toBe(false)
  })
})

describe('the migration itself', () => {
  it('can be run again without losing a thing', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    const before = (await t.admin(`select pin_hash, pin_set_at from user_security where user_id = $1`, [t.user])).rows[0]
    await ctx.db.exec(readFileSync(new URL('../../migrations/0012_security.sql', import.meta.url), 'utf8'))
    expect((await t.admin(`select pin_hash, pin_set_at from user_security where user_id = $1`, [t.user])).rows[0]).toEqual(before)
    expect(await t.call(t.laptop, `verify_pin($1)`, [PIN])).toEqual({ ok: true })
    const policies = (await t.admin(`select tablename from pg_policies where policyname = 'app_lock_gate' order by 1`)).rows.map((r) => r.tablename)
    expect(policies).toEqual([...PROTECTED].sort())
  })
  it('only ever restricts: the gate is RESTRICTIVE, so it cannot widen anyone\'s access', async () => {
    const { rows } = await ctx.q(`select tablename, permissive from pg_policies where policyname = 'app_lock_gate'`)
    expect(rows).toHaveLength(PROTECTED.length)
    expect(rows.every((r) => r.permissive === 'RESTRICTIVE')).toBe(true)
  })
  it('turns RLS on, forced, for the five new tables', async () => {
    const { rows } = await ctx.q(`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('user_security','app_unlocks','passkeys','webauthn_challenges','password_attempts') and relkind = 'r'`)
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true)
  })
  it('deleting an account removes everything the lock stored', async () => {
    const t = await setup().then(async (x) => (await x.enable(), x))
    await ctx.asService((q) => q(`select pk_add_credential($1, repeat('d', 20), '{}', -7, 0, '{}', 'x', 'singleDevice', false)`, [t.user]))
    await ctx.asService((q) => q(`select pk_issue_challenge($1,$2,'register',repeat('e', 43))`, [t.user, t.phone]))
    await t.call(t.phone, 'delete_my_account()')
    for (const table of ['user_security', 'app_unlocks', 'passkeys', 'webauthn_challenges']) expect((await t.admin(`select 1 from ${table} where user_id = $1`, [t.user])).rows, table).toHaveLength(0)
  })
})
