import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { expected } from '../../../scripts/sync-function-core.mjs'
import { b64uEncode } from '../src/webauthn'
import { client, fakeDb } from './fixtures/fakeDeviceKeyDb'
import { softDeviceKey } from './fixtures/softDeviceKey'

/** Enrols a phone from the unlocked session and returns it. */
async function enrol(fake, { phone = softDeviceKey(), who = client(fake), label = 'Pixel 8', platform = 'android' } = {}) {
  const { body } = await who.call({ action: 'enroll-options' })
  const proof = phone.enroll(body.options.challenge)
  const res = await who.call({ action: 'enroll-verify', ...proof, label, platform })
  return { phone, res, options: body.options, id: res.body.id }
}
/** A phone that is enrolled, with the app locked on `laptop` (the session that will unlock). */
async function ready() {
  const fake = fakeDb()
  const { phone, id } = await enrol(fake)
  const laptop = client(fake, { session: 'laptop' })
  const challenge = async (keyId = id, who = laptop) => (await who.call({ action: 'unlock-options', keyId })).body.options.challenge
  return { fake, phone, id, laptop, challenge }
}

describe('who may ask', () => {
  it('rejects a caller GoTrue does not recognise, and a token with no session', async () => {
    const fake = fakeDb()
    expect(await client(fake).call({ action: 'capabilities' }, { authorization: 'Bearer stolen-or-expired' })).toMatchObject({ status: 401, body: { error: 'not_signed_in' } })
    expect((await client(fake).call({ action: 'capabilities' }, { authorization: null })).status).toBe(401)
    expect((await client(fake).call({ action: 'capabilities' }, { authorization: 'Bearer nosession' })).status).toBe(401) // unlocking is recorded against a session
  })
  it('accepts POST only, with a small JSON object', async () => {
    const fake = fakeDb()
    expect((await client(fake).call({}, { method: 'GET' })).status).toBe(405)
    expect((await client(fake).call({}, { method: 'OPTIONS' })).status).toBe(405)
    expect((await client(fake).call(null)).status).toBe(400)
    expect((await client(fake).call([])).status).toBe(400)
    expect((await client(fake).call('text')).status).toBe(400)
    expect((await client(fake).call({ action: 'capabilities' }, { rawLength: 1_000_000 })).status).toBe(400)
    expect((await client(fake).call({ action: 'nope' })).body.error).toBe('unknown_action')
    expect((await client(fake).call({})).body.error).toBe('unknown_action')
  })
  it('is for native apps: a browser (any Origin) is refused, and no CORS header is ever sent', async () => {
    const fake = fakeDb()
    for (const origin of ['https://evil.test', 'https://lifetrack.test', 'null']) {
      const r = await client(fake, { origin }).call({ action: 'capabilities' })
      expect(r.status, origin).toBe(403)
      expect(r.body.error).toBe('native_only')
      expect(Object.keys(r.headers).some((h) => h.toLowerCase().startsWith('access-control'))).toBe(false)
    }
    const preflight = await client(fake, { origin: 'https://evil.test' }).call(null, { method: 'OPTIONS' })
    expect(preflight.status).toBe(403)
  })
  it('says it is available, and is never cached', async () => {
    const r = await client(fakeDb()).call({ action: 'capabilities' })
    expect(r).toMatchObject({ status: 200, body: { ok: true, available: true } })
    expect(r.headers['Cache-Control']).toBe('no-store')
    expect(r.headers['Content-Type']).toBe('application/json')
  })
})

describe('adding a phone', () => {
  it('works for an unlocked session with the app lock on, and stores a public key only', async () => {
    const fake = fakeDb()
    const { options, res, phone } = await enrol(fake, { label: '  Pixel 8  ' })
    expect(res.status).toBe(200)
    expect(options).toMatchObject({ algorithm: 'ES256', context: 'lifetrack-device-key/v1' })
    expect(fake.s.keys).toHaveLength(1)
    expect(fake.s.keys[0]).toMatchObject({ userId: 'u1', label: 'Pixel 8', platform: 'android', publicKeyJwk: phone.publicKeyJwk })
    expect(fake.s.keys[0].publicKeyJwk.d).toBeUndefined() // never a private key
    expect(fake.s.challenges).toHaveLength(0) // the challenge was consumed
    const { x, y } = phone.publicKeyJwk
    expect(fake.s.keys[0].thumbprint).toBe(b64uEncode(createHash('sha256').update(`{"crv":"P-256","kty":"EC","x":"${x}","y":"${y}"}`).digest())) // computed by the server, not taken from the app
  })
  it('is refused to a locked session: a stolen token must not be able to enrol its own key', async () => {
    const fake = fakeDb()
    const locked = client(fake, { session: 'laptop' })
    expect((await locked.call({ action: 'enroll-options' })).status).toBe(403)
    expect(fake.s.challenges).toHaveLength(0)
    // …even holding a challenge that was issued while the session WAS unlocked
    const { body } = await client(fake).call({ action: 'enroll-options' })
    fake.s.challenges[0].session = 'laptop'
    const r = await locked.call({ action: 'enroll-verify', ...softDeviceKey().enroll(body.options.challenge) })
    expect(r.status).toBe(403)
    expect(fake.s.keys).toHaveLength(0)
  })
  it('needs the app lock on', async () => {
    const fake = fakeDb({ appLock: false })
    expect((await client(fake).call({ action: 'enroll-options' })).body.error).toBe('app_lock_off')
    const p = softDeviceKey()
    expect((await client(fake).call({ action: 'enroll-verify', ...p.enroll('x'.repeat(43)) })).status).toBe(403)
  })
  it('cannot replay an enrolment', async () => {
    const fake = fakeDb()
    const who = client(fake)
    const { body } = await who.call({ action: 'enroll-options' })
    const proof = softDeviceKey().enroll(body.options.challenge)
    expect((await who.call({ action: 'enroll-verify', ...proof })).status).toBe(200)
    const again = await who.call({ action: 'enroll-verify', ...proof })
    expect(again).toMatchObject({ status: 400, body: { error: 'challenge_expired' } })
    expect(fake.s.keys).toHaveLength(1)
  })
  it('wants proof that the phone holds the private key: someone else\'s public key, a bad signature or a made-up challenge are refused', async () => {
    const fake = fakeDb()
    const who = client(fake)
    const options = async () => (await who.call({ action: 'enroll-options' })).body.options
    const mine = softDeviceKey()
    const theirs = softDeviceKey()
    // 1. my signature, their public key (enrolling a key I do not hold)
    let ch = (await options()).challenge
    let r = await who.call({ action: 'enroll-verify', ...mine.enroll(ch), publicKeyJwk: theirs.publicKeyJwk })
    expect(r).toMatchObject({ status: 400, body: { error: 'registration_rejected', reason: 'bad_signature' } })
    // 2. a corrupted signature
    ch = (await options()).challenge
    r = await who.call({ action: 'enroll-verify', ...mine.enroll(ch, { corruptSignature: true }) })
    expect(r.body).toMatchObject({ error: 'registration_rejected', reason: 'bad_signature' })
    // 3. a signature over a different message (an unlock, not an enrolment)
    ch = (await options()).challenge
    r = await who.call({ action: 'enroll-verify', ...mine.enroll(ch, { message: `lifetrack-device-key/v1|unlock|${ch}|${mine.newKeyId()}|1` }) })
    expect(r.body.reason).toBe('bad_signature')
    // 4. a challenge the server never issued
    r = await who.call({ action: 'enroll-verify', ...mine.enroll('Z'.repeat(43)) })
    expect(r.body.error).toBe('challenge_expired')
    expect(fake.s.keys).toHaveLength(0)
    expect(fake.s.failures).toBe(0) // an enrolment that fails does not count against the PIN: the person is already unlocked
  })
  it('refuses a private key, and anything that is not a P-256 public key', async () => {
    const fake = fakeDb()
    const who = client(fake)
    const p = softDeviceKey()
    for (const jwk of [{ ...p.publicKeyJwk, d: 'c2VjcmV0' }, { ...p.publicKeyJwk, crv: 'P-384' }, { kty: 'RSA', n: 'x', e: 'AQAB' }, null, 'key', { ...p.publicKeyJwk, x: 'short' }]) {
      const ch = (await who.call({ action: 'enroll-options' })).body.options.challenge
      const r = await who.call({ action: 'enroll-verify', ...p.enroll(ch), publicKeyJwk: jwk })
      expect(r, JSON.stringify(jwk)).toMatchObject({ status: 400, body: { error: 'registration_rejected', reason: 'bad_key' } })
    }
    expect(fake.s.keys).toHaveLength(0)
  })
  it('a malformed request leaves the challenge unused (only a signature that fails burns it)', async () => {
    const fake = fakeDb()
    const who = client(fake)
    const { body } = await who.call({ action: 'enroll-options' })
    const p = softDeviceKey()
    expect((await who.call({ action: 'enroll-verify', ...p.enroll(body.options.challenge), publicKeyJwk: null })).status).toBe(400)
    expect(fake.s.challenges).toHaveLength(1)
    expect((await who.call({ action: 'enroll-verify', ...p.enroll(body.options.challenge) })).status).toBe(200)
  })
  it('stores a key once', async () => {
    const fake = fakeDb()
    const phone = softDeviceKey()
    await enrol(fake, { phone })
    const again = await enrol(fake, { phone })
    expect(again.res).toMatchObject({ status: 409, body: { error: 'already_added' } })
    expect(fake.s.keys).toHaveLength(1)
  })
  it('stops at 10 phones, with a clear message before and after the signature', async () => {
    const fake = fakeDb()
    for (let i = 0; i < 10; i++) expect((await enrol(fake)).res.status).toBe(200)
    expect((await client(fake).call({ action: 'enroll-options' })).body.error).toBe('too_many')
    // a request that skipped the options step still meets the database's own cap
    const who = client(fake)
    fake.db.status = async () => ({ app_lock_enabled: true, unlocked: true, key_count: 0 })
    const { body } = await who.call({ action: 'enroll-options' })
    const r = await who.call({ action: 'enroll-verify', ...softDeviceKey().enroll(body.options.challenge) })
    expect(r).toMatchObject({ status: 409, body: { error: 'too_many' } })
  })
  it('tidies the label and only accepts a known platform', async () => {
    const fake = fakeDb()
    expect((await enrol(fake, { label: 'x'.repeat(100), platform: 'windows' })).res.status).toBe(200)
    expect((await enrol(fake, { label: '   ', platform: 'ios' })).res.status).toBe(200)
    expect((await enrol(fake, { label: 42, platform: null })).res.status).toBe(200)
    expect(fake.s.keys.map((k) => [k.label.length, k.platform])).toEqual([[60, 'unknown'], [10, 'ios'], [10, 'unknown']])
    expect(fake.s.keys.slice(1).every((k) => k.label === 'This phone')).toBe(true)
  })
})

describe('unlocking with a phone', () => {
  it('opens the session after a verified signature, and records the counter', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const r = await laptop.call({ action: 'unlock-verify', ...phone.unlock(await challenge(), id) })
    expect(r).toMatchObject({ status: 200, body: { ok: true } })
    expect(fake.s.unlocked.has('laptop')).toBe(true)
    expect(fake.s.keys[0].signCount).toBe(1)
    expect(fake.s.challenges).toHaveLength(0)
    expect(fake.s.failures).toBe(0)
    // and again, later: the counter moves on
    fake.s.unlocked.delete('laptop')
    expect((await laptop.call({ action: 'unlock-verify', ...phone.unlock(await challenge(), id) })).status).toBe(200)
    expect(fake.s.keys[0].signCount).toBe(2)
  })
  it('says nothing is on offer for a key the account does not have (removed elsewhere, or never enrolled)', async () => {
    const { fake, phone, laptop } = await ready()
    expect((await laptop.call({ action: 'unlock-options', keyId: phone.newKeyId() }))).toMatchObject({ status: 409, body: { error: 'unknown_key' } })
    expect((await laptop.call({ action: 'unlock-options', keyId: 'not-a-uuid' })).status).toBe(400)
    expect((await laptop.call({ action: 'unlock-options' })).status).toBe(400)
    expect(fake.s.challenges).toHaveLength(0) // no challenge for a key nobody holds
    expect(fake.s.failures).toBe(0) // and asking is not an attack
  })
  it("never offers, or accepts, another user's key", async () => {
    const { fake, id } = await ready()
    fake.s.unlocked.add('u2-phone')
    const stranger = client(fake, { user: 'u2', session: 'u2-laptop' })
    expect((await stranger.call({ action: 'unlock-options', keyId: id })).body.error).toBe('unknown_key') // my key id is not on their account
    // a challenge they hold for THEIR key cannot be spent on mine
    const theirs = await enrol(fake, { who: client(fake, { user: 'u2', session: 'u2-phone' }) })
    const own = (await stranger.call({ action: 'unlock-options', keyId: theirs.id })).body.options
    const r = await stranger.call({ action: 'unlock-verify', ...theirs.phone.unlock(own.challenge, id) })
    expect(r.body.error).toBe('challenge_expired')
    expect(fake.s.unlocked.has('u2-laptop')).toBe(false)
    // and theirs works for them
    expect((await stranger.call({ action: 'unlock-verify', ...theirs.phone.unlock(own.challenge, theirs.id) })).status).toBe(200)
    expect(fake.s.unlocked.has('u2-laptop')).toBe(true)
  })
  it('cannot be replayed: a recorded signature unlocks nothing the second time', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const response = phone.unlock(await challenge(), id)
    expect((await laptop.call({ action: 'unlock-verify', ...response })).status).toBe(200)
    fake.s.unlocked.clear()
    const replay = await laptop.call({ action: 'unlock-verify', ...response })
    expect(replay).toMatchObject({ status: 400, body: { error: 'challenge_expired' } })
    expect(fake.s.unlocked.size).toBe(0)
  })
  it("a challenge issued to one session cannot unlock another (a stolen signature is useless elsewhere)", async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const response = phone.unlock(await challenge(), id)
    const thief = client(fake, { session: 'thief' })
    expect((await thief.call({ action: 'unlock-verify', ...response })).body.error).toBe('challenge_expired')
    expect(fake.s.unlocked.has('thief')).toBe(false)
    expect((await laptop.call({ action: 'unlock-verify', ...response })).status).toBe(200) // the rightful session still can
  })
  it('a challenge for one key cannot be used with another key id, and a misdirected try does not burn the rightful one', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const second = await enrol(fake) // a second phone on the same account
    const ch = await challenge(id)
    const r = await laptop.call({ action: 'unlock-verify', ...second.phone.unlock(ch, second.id) })
    expect(r.body.error).toBe('challenge_expired')
    expect(fake.s.unlocked.has('laptop')).toBe(false)
    expect(fake.s.failures).toBe(0)
    expect((await laptop.call({ action: 'unlock-verify', ...phone.unlock(ch, id) })).status).toBe(200) // the phone it was issued for can still use it
  })
  it('counts a forged signature as a failed attempt: the 5th locks PIN entry and the 10th ends the session', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const results = []
    for (let i = 0; i < 10; i++) results.push((await laptop.call({ action: 'unlock-verify', ...phone.unlock(await challenge(), id, { corruptSignature: true }) })).body)
    expect(results.every((b) => b.error === 'not_accepted' && b.reason === 'bad_signature')).toBe(true)
    expect(results[4]).toMatchObject({ lockout_seconds: 30, signed_out: false })
    expect(results[9]).toMatchObject({ lockout_seconds: 60, signed_out: true })
    expect(fake.s.unlocked.size).toBe(1) // only the phone session that was unlocked all along
    expect(fake.s.unlocked.has('laptop')).toBe(false)
  })
  it('refuses a signature over something other than what was sent: another counter, challenge or purpose', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const attempt = async (build) => {
      const ch = await challenge()
      const r = await laptop.call({ action: 'unlock-verify', challenge: ch, keyId: id, ...build(ch) })
      expect([r.status, r.body.error, r.body.reason]).toEqual([401, 'not_accepted', 'bad_signature'])
    }
    // the phone signed counter 99, the request says 1
    await attempt((ch) => ({ counter: 1, signature: phone.unlock(ch, id, { counter: 99 }).signature }))
    // the phone signed another challenge
    await attempt(() => ({ counter: 1, signature: phone.unlock('Y'.repeat(43), id, { counter: 1 }).signature }))
    // an enrolment signature offered as an unlock
    await attempt((ch) => ({ counter: 1, signature: phone.enroll(ch).signature }))
    // someone else's phone signing the right message
    await attempt((ch) => ({ counter: 1, signature: softDeviceKey().unlock(ch, id, { counter: 1 }).signature }))
    expect(fake.s.unlocked.has('laptop')).toBe(false)
    expect(fake.s.failures).toBe(4) // each one counted, like a wrong PIN
  })
  it('does not let a cloned key in: the counter must move forward', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    expect((await laptop.call({ action: 'unlock-verify', ...phone.unlock(await challenge(), id) })).status).toBe(200)
    fake.s.unlocked.clear()
    phone.counter = 0 // the clone is behind the original
    const r = await laptop.call({ action: 'unlock-verify', ...phone.unlock(await challenge(), id) })
    expect(r.body).toMatchObject({ error: 'not_accepted', reason: 'counter_regressed' })
    expect(fake.s.unlocked.size).toBe(0)
    expect(fake.s.failures).toBe(1)
    // the original, ahead of the clone, is still fine
    phone.counter = 4
    expect((await laptop.call({ action: 'unlock-verify', ...phone.unlock(await challenge(), id) })).status).toBe(200)
  })
  it('treats an expired challenge as slowness, not as an attack', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const response = phone.unlock(await challenge(), id)
    fake.s.expireAll = true
    const r = await laptop.call({ action: 'unlock-verify', ...response })
    expect(r).toMatchObject({ status: 400, body: { error: 'challenge_expired' } })
    expect(fake.s.failures).toBe(0)
  })
  it('does nothing when the app lock is off', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const response = phone.unlock(await challenge(), id)
    fake.s.appLock = false
    expect((await laptop.call({ action: 'unlock-options', keyId: id })).body.error).toBe('app_lock_off')
    expect((await laptop.call({ action: 'unlock-verify', ...response })).body.error).toBe('app_lock_off')
    expect(fake.s.unlocked.has('laptop')).toBe(false)
  })
  it('a key that was removed after the challenge was issued is refused without counting against the PIN', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const response = phone.unlock(await challenge(), id)
    fake.s.keys.length = 0
    expect((await laptop.call({ action: 'unlock-verify', ...response })).body.error).toBe('unknown_key')
    expect(fake.s.failures).toBe(0)
    expect(fake.s.unlocked.has('laptop')).toBe(false)
  })
  it('there is no way to claim "the biometric check passed": only a signature is read', async () => {
    const { fake, id, laptop, challenge } = await ready()
    await challenge()
    const attempts = [
      { action: 'unlock-verify', keyId: id, biometricPassed: true, passed: true, ok: true, authenticated: true },
      { action: 'unlock-verify', keyId: id, counter: 1, signature: 'AAAA', biometricPassed: true },
      { action: 'unlock-verify', keyId: id, counter: 1, signature: '', challenge: 'x'.repeat(43) },
      { action: 'unlock-verify', keyId: id, counter: 0, signature: 'AAAA', challenge: 'x'.repeat(43) },
      { action: 'unlock-verify', keyId: id, counter: '1', signature: 'AAAA', challenge: 'x'.repeat(43) },
      { action: 'unlock-verify', keyId: id, counter: 1.5, signature: 'AAAA', challenge: 'x'.repeat(43) },
      { action: 'unlock', keyId: id, biometric: true },
    ]
    for (const body of attempts) {
      const r = await laptop.call(body)
      expect(r.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400)
    }
    expect(fake.s.unlocked.has('laptop')).toBe(false)
  })
  it('malformed unlock requests are not counted as attempts', async () => {
    const { fake, laptop, id } = await ready()
    for (const body of [{ action: 'unlock-verify' }, { action: 'unlock-verify', keyId: id }, { action: 'unlock-verify', keyId: 'x', counter: 1, signature: 'a' }, { action: 'unlock-verify', keyId: `${id}|2`, counter: 1, signature: 'a', challenge: 'x'.repeat(43) }]) {
      const r = await laptop.call(body)
      expect([r.status, r.body.error], JSON.stringify(body)).toEqual([400, 'bad_request'])
    }
    expect(fake.s.failures).toBe(0)
  })
  it('lets unexpected failures propagate instead of unlocking (index.ts turns them into a 500)', async () => {
    const { fake, phone, id, laptop, challenge } = await ready()
    const response = phone.unlock(await challenge(), id)
    fake.db.recordAssertion = async () => { throw new Error('database down') }
    await expect(laptop.call({ action: 'unlock-verify', ...response })).rejects.toThrow('database down')
    expect(fake.s.unlocked.has('laptop')).toBe(false)
  })
})

describe('the copy Deno runs', () => {
  it('is the same verifier the apps use (kept in step by scripts/sync-function-core.mjs)', () => {
    for (const name of ['devicekey.js', 'webauthn.js']) {
      const [file, content] = expected().find(([f]) => f.endsWith(`_shared/${name}`))
      expect(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8'), name).toBe(content)
    }
  })
  it('imports only files that exist beside it, so Deno can resolve it', () => {
    const src = readFileSync(new URL('../../../supabase/functions/_shared/devicekey.js', import.meta.url), 'utf8')
    expect([...src.matchAll(/from '(\.\/[^']+)'/g)].map((m) => m[1])).toEqual(['./webauthn.js'])
    const logic = readFileSync(new URL('../../../supabase/functions/device-key/logic.js', import.meta.url), 'utf8')
    expect([...logic.matchAll(/from '(\.\.\/_shared\/[^']+)'/g)].map((m) => m[1]).sort()).toEqual(['../_shared/devicekey.js', '../_shared/webauthn.js'])
  })
})
