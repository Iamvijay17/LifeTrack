import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module shared with the apps
import { lockoutSecondsAfter, revokesSession } from '../../../packages/core/src/security.js'
import { FIXTURES } from './fixtures'
import { createDb } from './helpers'

// Migration 0014: the phone's biometric keys. The security of the lock itself is covered by security.test.ts; this file covers what 0014 adds:
// enrolling and listing keys, single-use challenges, the signature counter, unlocking a session, the shared PIN lockout, and who may call what.

let ctx: Awaited<ReturnType<typeof createDb>>
let n = 0
beforeAll(async () => { ctx = await createDb() })
afterAll(async () => { await ctx.db.close() })

const PIN = '2486'
const MIGRATION = new URL('../../migrations/0014_device_keys.sql', import.meta.url)
const denied = /permission denied/i
// A real P-256 point is not needed here (the Edge Function verifies keys); the database stores what it is given, within its own checks.
const JWK = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }
const thumb = () => Math.random().toString(36).slice(2).padEnd(43, 't').slice(0, 43)
let seq = 0
/** A fresh 43-character challenge each call (the column is unique across users, and every test here shares one database). Keep the value if you need it twice. */
const challenge = (tag = 'A') => `${tag}${String(++seq).padStart(6, '0')}`.padEnd(43, tag)

/** A user with two GoTrue sessions: `phone` (sets things up, unlocked) and `laptop` (another device, locked once the app lock is on). */
async function setup(lock = true) {
  n++
  const user = await ctx.newUser(`dk${n}@example.com`)
  const phone = await ctx.newSession(user)
  const laptop = await ctx.newSession(user)
  const as = <T>(session: string | undefined, sql: string, params: unknown[] = []) => ctx.asUser(user, (q) => q(sql, params), session)
  const call = async (session: string | undefined, sql: string, params: unknown[] = []) => (await as(session, `select ${sql} as r`, params)).rows[0].r
  const service = async (sql: string, params: unknown[] = []) => (await ctx.asService((q) => q(sql, params))).rows
  const admin = (sql: string, params: unknown[] = []) => ctx.q(sql, params)
  if (lock) await call(phone, 'set_pin($1)', [PIN])
  const addKey = async (label = 'My phone', platform = 'android', jwk: unknown = JWK, thumbprint = thumb(), who = user) =>
    (await service(`select dk_add_key($1,$2,$3,$4,$5) as id`, [who, thumbprint, JSON.stringify(jwk), label, platform]))[0].id as string
  const state = (session: string) => call(session, 'security_state()')
  return { user, phone, laptop, as, call, service, admin, addKey, state }
}

describe('the new tables', () => {
  it('cannot be read or written by any client role', async () => {
    const { user, phone, as } = await setup()
    for (const t of ['device_keys', 'device_key_challenges']) {
      expect(await ctx.fails(as(phone, `select * from ${t}`)), t).toMatch(denied)
      expect(await ctx.fails(as(phone, `insert into ${t} (user_id) values ($1)`, [user])), t).toMatch(denied)
      expect(await ctx.fails(as(phone, `delete from ${t}`)), t).toMatch(denied)
      expect(await ctx.fails(ctx.asAnon((q) => q(`select * from ${t}`))), t).toMatch(denied)
    }
  })
  it('have RLS on and forced, and the fixture map knows them (so isolation tests cannot be skipped)', async () => {
    const { rows } = await ctx.q(`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('device_keys','device_key_challenges') and relkind = 'r'`)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true)
    expect(FIXTURES.device_keys?.kind).toBe('rpc')
    expect(FIXTURES.device_key_challenges?.kind).toBe('rpc')
  })
  it('only hold an EC P-256 ES256 public key, a plausible thumbprint, and a known platform', async () => {
    const t = await setup()
    const bad = (jwk: unknown, thumbprint = thumb(), platform = 'android') => ctx.fails(t.addKey('x', platform, jwk, thumbprint))
    expect(await bad({ kty: 'RSA', n: 'x', e: 'AQAB' })).toMatch(/check constraint/i)
    expect(await bad({ kty: 'EC', crv: 'P-384', x: 'x', y: 'y' })).toMatch(/check constraint/i)
    expect(await bad(JWK, 'short')).toMatch(/check constraint/i)
    expect(await bad(JWK, thumb(), 'windows')).toMatch(/check constraint/i)
    expect(await t.addKey('ok', 'ios')).toBeTruthy()
    expect((await t.admin(`select alg, sign_count from device_keys where user_id = $1`, [t.user])).rows).toEqual([{ alg: -7, sign_count: 0 }])
  })
})

describe('what a client may do with its own keys', () => {
  it('lists, renames and removes them, and never sees the public key or the counter', async () => {
    const t = await setup()
    const other = await setup()
    const mine = await t.addKey('Pixel')
    const theirs = await other.addKey('Their phone')
    const rows = (await t.as(t.phone, `select * from list_device_keys()`)).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: mine, label: 'Pixel', platform: 'android', last_used_at: null })
    expect(Object.keys(rows[0]).sort()).toEqual(['created_at', 'id', 'label', 'last_used_at', 'platform'])
    await t.call(t.phone, `rename_device_key($1, '  Work phone ')`, [mine])
    expect((await t.as(t.phone, `select label from list_device_keys()`)).rows[0].label).toBe('Work phone')
    expect(await ctx.fails(t.call(t.phone, `rename_device_key($1, '')`, [mine]))).toMatch(/1 to 60/)
    expect(await ctx.fails(t.call(t.phone, `rename_device_key($1, repeat('x', 61))`, [mine]))).toMatch(/1 to 60/)
    expect(await ctx.fails(t.call(t.phone, `rename_device_key($1, 'x')`, [theirs]))).toMatch(/not on your account/)
    expect(await ctx.fails(t.call(t.phone, `remove_device_key($1)`, [theirs]))).toMatch(/not on your account/)
    expect((await other.as(other.phone, `select 1 from list_device_keys()`)).rows).toHaveLength(1) // not collateral
    await t.call(t.phone, `remove_device_key($1)`, [mine])
    expect((await t.as(t.phone, `select 1 from list_device_keys()`)).rows).toHaveLength(0)
  })
  it('removing a key also drops its pending challenges, so it cannot be used afterwards', async () => {
    const t = await setup()
    const key = await t.addKey()
    await t.service(`select dk_issue_challenge($1,$2,'unlock',$3,$4)`, [t.user, t.laptop, challenge(), key])
    await t.call(t.phone, `remove_device_key($1)`, [key])
    expect((await t.admin(`select 1 from device_key_challenges where user_id = $1`, [t.user])).rows).toHaveLength(0)
  })
  it.each([
    ['list_device_keys', 'select * from list_device_keys()'],
    ['rename_device_key', `select rename_device_key(gen_random_uuid(), 'x')`],
    ['remove_device_key', `select remove_device_key(gen_random_uuid())`],
  ])('%s needs an unlocked session: a locked phone cannot manage biometrics', async (_name, sql) => {
    const t = await setup()
    expect(await ctx.fails(t.as(t.laptop, sql))).toMatch(/locked/i)
    expect(await ctx.fails(ctx.asAnon((q) => q(sql)))).toMatch(denied)
  })
  it('a session that has ended is told so (the app then signs out) rather than sitting at a lock that cannot open', async () => {
    const t = await setup()
    await t.admin(`delete from auth.sessions where id = $1`, [t.laptop])
    expect(await ctx.fails(t.as(t.laptop, 'select * from list_device_keys()'))).toMatch(/Your session has ended/)
  })
})

describe('the Edge Function functions refuse every client role', () => {
  it('signed in or not', async () => {
    const t = await setup()
    const calls = [
      `dk_status($1, $2)`, `dk_issue_challenge($1, $2, 'enroll', repeat('a', 43))`, `dk_take_challenge($1, $2, 'enroll', repeat('a', 43))`, `dk_keys($1)`,
      `dk_add_key($1, repeat('t', 43), '{"kty":"EC","crv":"P-256"}', 'x', 'android')`, `dk_record_assertion(gen_random_uuid(), $1, 5)`,
      `dk_unlock($1, $2)`, `dk_failure($1, $2)`, `_drop_device_keys()`,
    ]
    for (const c of calls) {
      const p = c.includes('$2') ? [t.user, t.phone] : c.includes('$1') ? [t.user] : []
      expect(await ctx.fails(ctx.asUser(t.user, (q) => q(`select ${c}`, p), t.phone)), c).toMatch(denied)
      expect(await ctx.fails(ctx.asAnon((q) => q(`select ${c}`, p))), c).toMatch(denied)
    }
    expect((await t.admin(`select 1 from device_keys where user_id = $1`, [t.user])).rows).toHaveLength(0) // and nothing was written on the way
    expect((await t.admin(`select 1 from device_key_challenges where user_id = $1`, [t.user])).rows).toHaveLength(0)
  })
})

describe('challenges', () => {
  it('are single-use: a recorded signature cannot be replayed', async () => {
    const t = await setup()
    const key = await t.addKey()
    const issued = challenge()
    await t.service(`select dk_issue_challenge($1,$2,'unlock',$3,$4)`, [t.user, t.phone, issued, key])
    const take = async (user = t.user, session: string | null = t.phone, purpose = 'unlock', c = issued, k: string | null = key) =>
      (await t.service(`select dk_take_challenge($1,$2,$3,$4,$5) as ok`, [user, session, purpose, c, k]))[0].ok
    expect(await take(t.user, t.laptop)).toBe(false) // another session
    expect(await take(t.user, t.phone, 'enroll')).toBe(false) // another purpose
    expect(await take(t.user, t.phone, 'unlock', issued, null)).toBe(false) // not for this key
    expect(await take(t.user, t.phone, 'unlock', issued, (await setup().then((x) => x.addKey())))).toBe(false) // another key
    expect(await take((await setup()).user)).toBe(false) // another user
    expect(await take(t.user, null)).toBe(false) // no session
    expect(await take()).toBe(true)
    expect(await take()).toBe(false) // replay
  })
  it('an enrolment challenge carries no key, and cannot be taken as one', async () => {
    const t = await setup()
    const issued = challenge('E')
    await t.service(`select dk_issue_challenge($1,$2,'enroll',$3)`, [t.user, t.phone, issued])
    const take = async (k: string | null) => (await t.service(`select dk_take_challenge($1,$2,'enroll',$3,$4) as ok`, [t.user, t.phone, issued, k]))[0].ok
    expect(await take(await t.addKey())).toBe(false)
    expect(await take(null)).toBe(true)
  })
  it('expire after two minutes', async () => {
    const t = await setup()
    const issued = challenge('B')
    await t.service(`select dk_issue_challenge($1,$2,'enroll',$3)`, [t.user, t.phone, issued])
    expect(Number((await t.admin(`select extract(epoch from expires_at - created_at) as s from device_key_challenges where challenge = $1`, [issued])).rows[0].s)).toBe(120)
    await t.admin(`update device_key_challenges set expires_at = now() - interval '1 second' where challenge = $1`, [issued])
    expect((await t.service(`select dk_take_challenge($1,$2,'enroll',$3) as ok`, [t.user, t.phone, issued]))[0].ok).toBe(false)
  })
  it('are limited to 10 open per user, the oldest going first, and expired ones are swept', async () => {
    const t = await setup()
    await t.service(`select dk_issue_challenge($1,$2,'enroll',$3)`, [t.user, t.phone, '00' + 'x'.repeat(41)])
    await t.admin(`update device_key_challenges set expires_at = now() - interval '1 minute', created_at = now() - interval '5 minutes' where user_id = $1`, [t.user])
    for (let i = 1; i <= 14; i++) await t.service(`select dk_issue_challenge($1,$2,'enroll',$3)`, [t.user, t.phone, String(i).padStart(2, '0') + 'C'.repeat(41)])
    const rows = (await t.admin(`select challenge from device_key_challenges where user_id = $1`, [t.user])).rows
    expect(rows).toHaveLength(10)
    expect(rows.map((r) => r.challenge)).not.toContain('00' + 'x'.repeat(41))
  })
  it('sweeps the expired ones whenever a new one is issued (on its own, not only through the cap of 10)', async () => {
    const t = await setup()
    const stale = challenge('S'), fresh = challenge('S')
    await t.service(`select dk_issue_challenge($1,$2,'enroll',$3)`, [t.user, t.phone, stale])
    await t.admin(`update device_key_challenges set expires_at = now() - interval '1 second' where challenge = $1`, [stale])
    await t.service(`select dk_issue_challenge($1,$2,'enroll',$3)`, [t.user, t.phone, fresh])
    expect((await t.admin(`select challenge from device_key_challenges where user_id = $1`, [t.user])).rows.map((r) => r.challenge)).toEqual([fresh])
  })
  it('keep users apart', async () => {
    const a = await setup(), b = await setup()
    for (let i = 0; i < 12; i++) await a.service(`select dk_issue_challenge($1,$2,'enroll',$3)`, [a.user, a.phone, String(i).padStart(2, '0') + 'D'.repeat(41)])
    await b.service(`select dk_issue_challenge($1,$2,'enroll',$3)`, [b.user, b.phone, challenge('F')])
    expect((await b.admin(`select 1 from device_key_challenges where user_id = $1`, [b.user])).rows).toHaveLength(1)
  })
  it('refuse a purpose that does not exist, and a challenge that is too short', async () => {
    const t = await setup()
    expect(await ctx.fails(t.service(`select dk_issue_challenge($1,$2,'authenticate',$3)`, [t.user, t.phone, challenge()]))).toMatch(/check constraint/i)
    expect(await ctx.fails(t.service(`select dk_issue_challenge($1,$2,'enroll','abc')`, [t.user, t.phone]))).toMatch(/check constraint/i)
  })
})

describe('enrolling a key', () => {
  it('needs the app lock on', async () => {
    const t = await setup(false)
    expect(await ctx.fails(t.addKey())).toMatch(/Turn on the app lock first/)
    await t.call(t.phone, 'set_pin($1)', [PIN])
    expect(await t.addKey()).toBeTruthy()
  })
  it('is capped at 10 phones', async () => {
    const t = await setup()
    for (let i = 0; i < 10; i++) await t.addKey()
    expect(await ctx.fails(t.addKey())).toMatch(/up to 10 phones/)
  })
  it('stores a public key once, even across accounts', async () => {
    const t = await setup(), other = await setup()
    const same = thumb()
    await t.addKey('a', 'ios', JWK, same)
    expect(await ctx.fails(t.addKey('b', 'ios', JWK, same))).toMatch(/duplicate key|unique/i)
    expect(await ctx.fails(other.addKey('c', 'ios', JWK, same))).toMatch(/duplicate key|unique/i)
  })
  it('tidies the label and the platform', async () => {
    const t = await setup()
    await t.service(`select dk_add_key($1,$2,$3,'   ','')`, [t.user, thumb(), JSON.stringify(JWK)])
    expect((await t.admin(`select label, platform from device_keys where user_id = $1`, [t.user])).rows[0]).toEqual({ label: 'This phone', platform: 'unknown' })
  })
  it('does not change biometric_enabled or the passkey count: web passkeys and phone keys are separate', async () => {
    const t = await setup()
    await t.addKey()
    expect(await t.state(t.phone)).toMatchObject({ biometric_enabled: false, passkey_count: 0, locked: false })
  })
})

describe('the signature counter', () => {
  it('counts a sign-in only when it moved strictly forward', async () => {
    const t = await setup()
    const id = await t.addKey()
    const record = async (c: number, user = t.user) => (await t.service(`select dk_record_assertion($1,$2,$3) as ok`, [id, user, c]))[0].ok
    expect(await record(1)).toBe(true)
    expect(await record(1)).toBe(false) // a replay of the same signature
    expect(await record(0)).toBe(false)
    expect(await record(5)).toBe(true) // the phone may skip numbers (a request that never arrived)
    expect(await record(4)).toBe(false) // a clone that fell behind
    expect(await record(6, (await setup()).user)).toBe(false) // someone else's key
    expect((await t.admin(`select sign_count, last_used_at is not null as used from device_keys where id = $1`, [id])).rows[0]).toEqual({ sign_count: 5, used: true })
  })
  it('the same counter value cannot win twice, even when two requests arrive together', async () => {
    const t = await setup()
    const id = await t.addKey()
    const wins = (await Promise.all([1, 2].map(() => t.service(`select dk_record_assertion($1,$2,7) as ok`, [id, t.user])))).filter((r) => r[0].ok).length
    expect(wins).toBe(1)
  })
})

describe('unlocking a session with a key', () => {
  async function withData() {
    const t = await setup()
    await t.as(t.phone, `insert into transactions(user_id, type, amount_paise, txn_date) values ($1,'expense',100,'2026-11-02')`, [t.user])
    await t.as(t.phone, `insert into notes(user_id, title) values ($1,'private')`, [t.user])
    await t.addKey()
    const seen = (table = 'transactions') => t.as(t.laptop, `select 1 from ${table}`).then((r) => r.rows.length)
    return { ...t, seen }
  }
  it('opens Finance, Journal and Notes for that session only, without the PIN', async () => {
    const t = await withData()
    expect(await t.seen()).toBe(0)
    expect((await t.state(t.laptop)).locked).toBe(true)
    await t.service(`select dk_unlock($1,$2)`, [t.user, t.laptop])
    expect(await t.seen()).toBe(1)
    expect(await t.seen('notes')).toBe(1)
    expect((await t.state(t.laptop)).locked).toBe(false)
    expect((await t.admin(`select method from app_unlocks where session_id = $1`, [t.laptop])).rows[0].method).toBe('device')
    const third = await ctx.newSession(t.user)
    expect((await t.state(third)).locked).toBe(true) // other sessions are untouched
  })
  it('behaves like any unlocked session afterwards: a heartbeat keeps it open, going quiet closes it, lock_app locks it', async () => {
    const t = await withData()
    await t.service(`select dk_unlock($1,$2)`, [t.user, t.laptop])
    expect(await t.call(t.laptop, 'touch_unlock()')).toBe(true)
    await t.call(t.laptop, 'lock_app()')
    expect(await t.seen()).toBe(0)
    await t.service(`select dk_unlock($1,$2)`, [t.user, t.laptop])
    await t.admin(`update app_unlocks set last_active_at = now() - interval '1 day' where session_id = $1`, [t.laptop])
    expect(await t.seen()).toBe(0)
    expect(await t.call(t.laptop, 'touch_unlock()')).toBe(false)
  })
  it('clears the PIN lockout, like any proof of ownership', async () => {
    const t = await withData()
    for (let i = 0; i < 5; i++) await t.call(t.laptop, `verify_pin('1357')`)
    expect((await t.state(t.laptop)).lockout_seconds).toBeGreaterThan(0)
    await t.service(`select dk_unlock($1,$2)`, [t.user, t.laptop])
    expect(await t.state(t.laptop)).toMatchObject({ locked: false, lockout_seconds: 0, failed_attempts: 0 })
  })
  it('needs a session, the app lock, and at least one enrolled phone', async () => {
    const t = await setup()
    expect(await ctx.fails(t.service(`select dk_unlock($1,$2)`, [t.user, t.laptop]))).toMatch(/not set up on any phone/)
    await t.addKey()
    expect(await ctx.fails(t.service(`select dk_unlock($1, null)`, [t.user]))).toMatch(/No session/)
    const noLock = await setup(false)
    expect(await ctx.fails(noLock.service(`select dk_unlock($1,$2)`, [noLock.user, noLock.laptop]))).toMatch(/Turn on the app lock first/)
    expect((await noLock.admin(`select 1 from app_unlocks where user_id = $1`, [noLock.user])).rows).toHaveLength(0)
  })
  it('opens only the session and the user it names', async () => {
    const a = await withData(), b = await setup()
    await b.addKey()
    await a.service(`select dk_unlock($1,$2)`, [b.user, b.laptop]) // b's key opens b's session…
    expect((await b.state(b.laptop)).locked).toBe(false)
    expect(await a.seen()).toBe(0) // …and says nothing about a's
  })
  it('a session that no longer exists cannot be opened (the gate checks auth.sessions too)', async () => {
    const t = await withData()
    await t.service(`select dk_unlock($1,$2)`, [t.user, t.laptop])
    await t.admin(`delete from auth.sessions where id = $1`, [t.laptop])
    expect(await t.seen()).toBe(0)
  })
})

describe('a bad signature counts toward the same lockout as a wrong PIN', () => {
  it('and the lockout is shared: the PIN is refused while the keys are locked out', async () => {
    const t = await setup()
    await t.addKey()
    let r: any
    for (let i = 0; i < 5; i++) r = (await t.service(`select dk_failure($1,$2) as r`, [t.user, t.laptop]))[0].r
    expect(r).toMatchObject({ failed_attempts: 5, lockout_seconds: 30, signed_out: false })
    expect(await t.call(t.laptop, `verify_pin($1)`, [PIN])).toMatchObject({ ok: false, reason: 'locked_out' })
  })
  it('follows the schedule of the apps, and ends the session from the 10th failure', async () => {
    const t = await setup()
    await t.addKey()
    for (let i = 1; i <= 20; i++) {
      const r = (await t.service(`select dk_failure($1, null) as r`, [t.user]))[0].r
      expect(r.lockout_seconds, `try ${i}`).toBe(lockoutSecondsAfter(i))
      expect(r.signed_out, `try ${i}`).toBe(revokesSession(i))
    }
    const t2 = await setup()
    await t2.addKey()
    for (let i = 0; i < 10; i++) await t2.service(`select dk_failure($1,$2)`, [t2.user, t2.laptop])
    expect((await t2.admin(`select 1 from auth.sessions where id = $1`, [t2.laptop])).rows).toHaveLength(0)
    expect((await t2.admin(`select 1 from auth.sessions where id = $1`, [t2.phone])).rows).toHaveLength(1) // other sessions are not collateral
  })
  it('and a wrong PIN counts against the keys, the other way round', async () => {
    const t = await setup()
    await t.addKey()
    for (let i = 0; i < 4; i++) await t.call(t.laptop, `verify_pin('1357')`)
    const r = (await t.service(`select dk_failure($1,$2) as r`, [t.user, t.laptop]))[0].r
    expect(r).toMatchObject({ failed_attempts: 5, lockout_seconds: 30 })
  })
})

describe('what the Edge Function reads', () => {
  it('dk_status says whether the lock is on, whether THIS session is unlocked, and how many phones are enrolled', async () => {
    const t = await setup()
    const status = async (session: string) => (await t.service(`select dk_status($1,$2) as s`, [t.user, session]))[0].s
    expect(await status(t.phone)).toEqual({ app_lock_enabled: true, unlocked: true, key_count: 0 })
    await t.addKey()
    expect(await status(t.laptop)).toEqual({ app_lock_enabled: true, unlocked: false, key_count: 1 })
    const off = await setup(false)
    expect((await off.service(`select dk_status($1,$2) as s`, [off.user, off.phone]))[0].s).toEqual({ app_lock_enabled: false, unlocked: true, key_count: 0 })
  })
  it('dk_keys hands over the public keys and counters of one user only', async () => {
    const t = await setup(), other = await setup()
    const mine = await t.addKey()
    await other.addKey()
    const rows = await t.service(`select * from dk_keys($1)`, [t.user])
    expect(rows).toEqual([{ id: mine, public_key_jwk: JWK, alg: -7, sign_count: 0 }])
  })
})

describe('turning the app lock off', () => {
  it('removes every enrolled phone and every pending challenge, so turning it on again starts clean', async () => {
    const t = await setup()
    const key = await t.addKey()
    await t.service(`select dk_issue_challenge($1,$2,'unlock',$3,$4)`, [t.user, t.laptop, challenge(), key])
    await t.call(t.phone, `disable_app_lock($1)`, [PIN])
    expect((await t.admin(`select 1 from device_keys where user_id = $1`, [t.user])).rows).toHaveLength(0)
    expect((await t.admin(`select 1 from device_key_challenges where user_id = $1`, [t.user])).rows).toHaveLength(0)
    await t.call(t.phone, `set_pin($1)`, [PIN])
    expect((await t.as(t.phone, `select 1 from list_device_keys()`)).rows).toHaveLength(0)
  })
  it('does the same when it is reset to "off" after a password sign-in, but keeps the phones when a new PIN is chosen', async () => {
    const t = await setup()
    await t.addKey()
    const fresh = await ctx.newSession(t.user, 1)
    await t.call(fresh, `reset_app_lock('7319')`)
    expect((await t.admin(`select 1 from device_keys where user_id = $1`, [t.user])).rows).toHaveLength(1) // a new PIN: the lock stayed on
    await t.call(fresh, `reset_app_lock()`)
    expect((await t.admin(`select 1 from device_keys where user_id = $1`, [t.user])).rows).toHaveLength(0)
  })
  it('changing the PIN or the auto-lock time touches nothing', async () => {
    const t = await setup()
    await t.addKey()
    await t.call(t.phone, `change_pin($1,'7319')`, [PIN])
    await t.call(t.phone, `set_auto_lock(900)`)
    expect((await t.admin(`select 1 from device_keys where user_id = $1`, [t.user])).rows).toHaveLength(1)
  })
  it("leaves another account's phones alone", async () => {
    const a = await setup(), b = await setup()
    await a.addKey(); await b.addKey()
    await a.call(a.phone, `disable_app_lock($1)`, [PIN])
    expect((await b.admin(`select 1 from device_keys where user_id = $1`, [b.user])).rows).toHaveLength(1)
  })
})

describe('passkeys are untouched', () => {
  it('a passkey unlock still records "passkey", and the widened check still refuses an unknown method', async () => {
    const t = await setup()
    await t.service(`select pk_add_credential($1, repeat('p', 20), '{}', -7, 0, '{}', 'x', 'singleDevice', false)`, [t.user])
    await t.service(`select pk_unlock($1,$2)`, [t.user, t.laptop])
    expect((await t.admin(`select method from app_unlocks where session_id = $1`, [t.laptop])).rows[0].method).toBe('passkey')
    expect(await ctx.fails(t.admin(`insert into app_unlocks(session_id, user_id, method) values (gen_random_uuid(), $1, 'magic')`, [t.user]))).toMatch(/check constraint/i)
    for (const method of ['setup', 'pin', 'passkey', 'password', 'trusted', 'device']) {
      await t.admin(`insert into app_unlocks(session_id, user_id, method) values (gen_random_uuid(), $1, $2)`, [t.user, method])
    }
  })
})

describe('who may execute what', () => {
  // Postgres grants EXECUTE on a new function to everyone unless it is revoked. This reads the function names out of the migration itself and checks the
  // exact privileges of each, so a function added later cannot slip through unclassified (the same guard security.test.ts has for 0012).
  const CLIENT = ['list_device_keys', 'rename_device_key', 'remove_device_key']
  const SERVICE = ['dk_status', 'dk_issue_challenge', 'dk_take_challenge', 'dk_keys', 'dk_add_key', 'dk_record_assertion', 'dk_unlock', 'dk_failure']
  const INTERNAL = ['_drop_device_keys']
  const sql = readFileSync(MIGRATION, 'utf8')
  const defined = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])
  const can = async (role: string, fn: string) =>
    (await ctx.q(`select bool_or(has_function_privilege($1, p.oid, 'execute')) as ok from pg_proc p where p.proname = $2 and p.pronamespace = 'public'::regnamespace`, [role, fn])).rows[0].ok as boolean

  it('every function the migration defines is classified here (so a new one forces a decision)', () => {
    expect([...defined].sort()).toEqual([...CLIENT, ...SERVICE, ...INTERNAL].sort())
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
  it.each(INTERNAL)('%s: no client role at all', async (fn) => {
    expect(await can('authenticated', fn), 'authenticated').toBe(false)
    expect(await can('anon', fn), 'anon').toBe(false)
  })
  it('every function runs as its owner with an empty search_path (so a client cannot shadow a table or function)', async () => {
    const { rows } = await ctx.q(`select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1::text[])`, [[...CLIENT, ...SERVICE, ...INTERNAL]])
    expect(rows).toHaveLength(CLIENT.length + SERVICE.length + INTERNAL.length)
    for (const r of rows) {
      expect(r.prosecdef, `${r.proname} security definer`).toBe(true)
      expect(r.proconfig, `${r.proname} search_path`).toContain('search_path=""')
    }
  })
})

describe('the migration itself', () => {
  it('can be run again without losing a key, a challenge, or an unlock', async () => {
    const t = await setup()
    const key = await t.addKey('Pixel')
    await t.service(`select dk_issue_challenge($1,$2,'unlock',$3,$4)`, [t.user, t.laptop, challenge(), key])
    await t.service(`select dk_unlock($1,$2)`, [t.user, t.laptop])
    const before = (await t.admin(`select id, thumbprint, label, sign_count from device_keys where user_id = $1`, [t.user])).rows
    await ctx.db.exec(readFileSync(MIGRATION, 'utf8'))
    expect((await t.admin(`select id, thumbprint, label, sign_count from device_keys where user_id = $1`, [t.user])).rows).toEqual(before)
    expect((await t.admin(`select 1 from device_key_challenges where user_id = $1`, [t.user])).rows).toHaveLength(1)
    expect((await t.state(t.laptop)).locked).toBe(false)
    expect((await t.admin(`select count(*)::int n from pg_trigger where tgname = 'user_security_drop_device_keys'`)).rows[0].n).toBe(1) // not duplicated
  })
  it('leaves the lock of 0012 as it was when 0012 is run again afterwards', async () => {
    const t = await setup()
    await t.addKey()
    await ctx.db.exec(readFileSync(new URL('../../migrations/0012_security.sql', import.meta.url), 'utf8'))
    expect((await t.admin(`select 1 from device_keys where user_id = $1`, [t.user])).rows).toHaveLength(1)
    expect(await t.call(t.laptop, `verify_pin($1)`, [PIN])).toEqual({ ok: true })
  })
  it('is additive: it only creates things, never drops a table or column', () => {
    const text = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '')
    expect(text).not.toMatch(/\bdrop\s+(table|column|schema|type)\b/i)
    expect(text).not.toMatch(/\btruncate\b/i)
  })
  it('deleting an account removes every key and challenge', async () => {
    const t = await setup()
    const key = await t.addKey()
    await t.service(`select dk_issue_challenge($1,$2,'unlock',$3,$4)`, [t.user, t.phone, challenge(), key])
    await t.call(t.phone, 'delete_my_account()')
    for (const table of ['device_keys', 'device_key_challenges']) expect((await t.admin(`select 1 from ${table} where user_id = $1`, [t.user])).rows, table).toHaveLength(0)
  })
})
