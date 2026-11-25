import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../../../supabase/functions/webauthn/logic.js'
import { expected } from '../../../scripts/sync-function-core.mjs'
import { lockoutSecondsAfter, revokesSession } from '../src/security'
import { softAuthenticator } from './fixtures/softAuthenticator'

const RP = 'lifetrack.test'
const ORIGIN = 'https://lifetrack.test'
const config = { rpId: RP, rpName: 'LifeTrack', origins: [ORIGIN] }

/** In-memory stand-in for the pk_* SQL functions, with their semantics (single-use challenges, counter compare-and-swap, shared failure count). */
function fakeDb({ appLock = true, biometric = true, unlockedSessions = ['phone'] } = {}) {
  const s = { challenges: [], keys: [], unlocked: new Set(unlockedSessions), failures: 0, signedOut: false, appLock, biometric, nextId: 1, expireAll: false }
  const db = {
    status: async (user, session) => ({ app_lock_enabled: s.appLock, biometric_enabled: s.biometric, unlocked: s.unlocked.has(session), passkey_count: s.keys.filter((k) => k.user === user).length }),
    issueChallenge: async (user, session, purpose, challenge) => void s.challenges.push({ user, session, purpose, challenge }),
    takeChallenge: async (user, session, purpose, challenge) => {
      const i = s.challenges.findIndex((c) => c.user === user && c.session === session && c.purpose === purpose && c.challenge === challenge)
      if (i < 0 || s.expireAll) return false
      s.challenges.splice(i, 1)
      return true
    },
    credentials: async (user) => s.keys.filter((k) => k.user === user).map((k) => ({ id: k.id, credential_id: k.credentialId, public_key_jwk: k.publicKeyJwk, alg: k.alg, sign_count: k.signCount })),
    addCredential: async (c) => {
      if (s.keys.some((k) => k.credentialId === c.credentialId)) throw Object.assign(new Error('duplicate key'), { code: '23505' })
      const k = { ...c, id: `k${s.nextId++}`, user: c.userId }
      s.keys.push(k)
      return k.id
    },
    recordAssertion: async (id, user, count) => {
      const k = s.keys.find((x) => x.id === id && x.user === user)
      if (!k || !(count > k.signCount || (count === 0 && k.signCount === 0))) return false
      k.signCount = count
      return true
    },
    unlock: async (_user, session) => void s.unlocked.add(session),
    failure: async () => {
      s.failures++
      const signedOut = revokesSession(s.failures)
      if (signedOut) s.signedOut = true
      return { failed_attempts: s.failures, lockout_seconds: lockoutSecondsAfter(s.failures), signed_out: signedOut }
    },
  }
  return { s, db }
}

/** Calls the function as `user` on `session`, the way index.ts would. */
function client(fake, { user = 'u1', session = 'phone', origin = ORIGIN, cfg = config } = {}) {
  const authenticate = async (auth) => (auth === 'Bearer good' ? { userId: user, sessionId: session, email: 'ann@example.com' } : null)
  const call = (body, over = {}) => handleRequest({ method: 'POST', origin, authorization: 'Bearer good', body, rawLength: 100, ...over }, { config: cfg, authenticate, db: fake.db })
  return { call }
}
const enrol = async (fake, who = client(fake), authenticator = softAuthenticator({ rpId: RP, origin: ORIGIN })) => {
  const { body } = await who.call({ action: 'register-options' })
  const credential = authenticator.register(body.options.challenge)
  const done = await who.call({ action: 'register-verify', credential, label: 'MacBook' })
  return { authenticator, options: body.options, done }
}

describe('who may ask', () => {
  it('rejects a caller GoTrue does not recognise', async () => {
    const fake = fakeDb()
    const r = await client(fake).call({ action: 'authenticate-options' }, { authorization: 'Bearer stolen-or-expired' })
    expect(r.status).toBe(401)
    expect(r.body.error).toBe('not_signed_in')
    expect(await client(fake).call({ action: 'capabilities' }, { authorization: null })).toMatchObject({ status: 401 })
  })
  it('accepts POST only, with a small JSON body', async () => {
    const fake = fakeDb()
    expect((await client(fake).call({}, { method: 'GET' })).status).toBe(405)
    expect((await client(fake).call(null)).status).toBe(400)
    expect((await client(fake).call({ action: 'capabilities' }, { rawLength: 1_000_000 })).status).toBe(400)
    expect((await client(fake).call({ action: 'nope' })).body.error).toBe('unknown_action')
  })
  it('answers browsers from our own origins only', async () => {
    const fake = fakeDb()
    const ok = await client(fake).call({ action: 'capabilities' })
    expect(ok.headers['Access-Control-Allow-Origin']).toBe(ORIGIN)
    expect(ok.headers.Vary).toBe('Origin')
    expect(ok.headers['Cache-Control']).toBe('no-store')
    const evil = await client(fake, { origin: 'https://evil.test' }).call({ action: 'capabilities' })
    expect(evil.status).toBe(403)
    expect(evil.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect((await client(fake).call(null, { method: 'OPTIONS' })).status).toBe(204)
    expect((await client(fake, { origin: 'https://evil.test' }).call(null, { method: 'OPTIONS' })).status).toBe(403)
    expect((await client(fake, { origin: null }).call({ action: 'capabilities' })).status).toBe(200) // a native app sends no Origin
  })
  it('says it is not available (and refuses everything else) until RP ID and origins are configured', async () => {
    const fake = fakeDb()
    const unset = client(fake, { origin: null, cfg: { rpId: '', origins: [] } })
    expect((await unset.call({ action: 'capabilities' })).body).toEqual({ ok: true, available: false })
    expect((await unset.call({ action: 'authenticate-options' })).status).toBe(503)
    // A browser is refused outright (no origin is allowed yet); the web client treats "cannot reach it" as "not available".
    expect((await client(fake, { cfg: { rpId: '', origins: [] } }).call({ action: 'capabilities' })).status).toBe(403)
    expect((await client(fake).call({ action: 'capabilities' })).body).toEqual({ ok: true, available: true })
  })
})

describe('adding a fingerprint or face unlock', () => {
  it('works for an unlocked session with the app lock on, and stores a public key only', async () => {
    const fake = fakeDb()
    const { options, done } = await enrol(fake)
    expect(done.status).toBe(200)
    expect(options).toMatchObject({ rp: { id: RP }, attestation: 'none', authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' } })
    expect(fake.s.keys).toHaveLength(1)
    expect(fake.s.keys[0]).toMatchObject({ label: 'MacBook', alg: -7, deviceType: 'singleDevice' })
    expect(fake.s.keys[0].publicKeyJwk.d).toBeUndefined() // never a private key
    expect(fake.s.challenges).toHaveLength(0) // the challenge was consumed
  })
  it('is refused to a locked session: a stolen token must not be able to enrol its own key', async () => {
    const fake = fakeDb()
    const locked = client(fake, { session: 'laptop' })
    expect((await locked.call({ action: 'register-options' })).status).toBe(403)
    expect(fake.s.challenges).toHaveLength(0)
    // …even holding a challenge issued earlier, while the session WAS unlocked
    const { body } = await client(fake).call({ action: 'register-options' })
    const a = softAuthenticator({ rpId: RP, origin: ORIGIN })
    fake.s.challenges[0].session = 'laptop'
    const r = await locked.call({ action: 'register-verify', credential: a.register(body.options.challenge) })
    expect(r.status).toBe(403)
    expect(fake.s.keys).toHaveLength(0)
  })
  it('needs the app lock on', async () => {
    expect((await client(fakeDb({ appLock: false })).call({ action: 'register-options' })).body.error).toBe('app_lock_off')
  })
  it('cannot replay a registration', async () => {
    const fake = fakeDb()
    const who = client(fake)
    const { body } = await who.call({ action: 'register-options' })
    const credential = softAuthenticator({ rpId: RP, origin: ORIGIN }).register(body.options.challenge)
    expect((await who.call({ action: 'register-verify', credential })).status).toBe(200)
    const again = await who.call({ action: 'register-verify', credential })
    expect(again.status).toBe(400)
    expect(again.body.error).toBe('challenge_expired')
    expect(fake.s.keys).toHaveLength(1)
  })
  it('rejects a response made for another site, another challenge, or without a verified user', async () => {
    const fake = fakeDb()
    const who = client(fake)
    for (const make of [
      (a, c) => softAuthenticator({ rpId: 'evil.test', origin: ORIGIN }).register(c),
      (a, c) => softAuthenticator({ rpId: RP, origin: 'https://evil.test' }).register(c),
      (a, c) => a.register(c, { flags: 0x01 | 0x40 }), // no user verification
    ]) {
      const { body } = await who.call({ action: 'register-options' })
      const r = await who.call({ action: 'register-verify', credential: make(softAuthenticator({ rpId: RP, origin: ORIGIN }), body.options.challenge) })
      expect(r.status).toBe(400)
      expect(r.body.error).toBe('registration_rejected')
    }
    expect(fake.s.keys).toHaveLength(0)
  })
  it('refuses a key that already belongs to an account, and tells the browser which keys to skip', async () => {
    const fake = fakeDb()
    const a = softAuthenticator({ rpId: RP, origin: ORIGIN })
    await enrol(fake, client(fake), a)
    const second = await client(fake).call({ action: 'register-options' })
    expect(second.body.options.excludeCredentials).toEqual([{ type: 'public-key', id: a.credentialId }])
    const other = client(fake, { user: 'u2', session: 'phone' })
    const { body } = await other.call({ action: 'register-options' })
    const r = await other.call({ action: 'register-verify', credential: a.register(body.options.challenge) })
    expect(r.body.error).toBe('already_added')
  })
  it('trims the label and falls back to a default', async () => {
    const fake = fakeDb()
    const who = client(fake)
    const { body } = await who.call({ action: 'register-options' })
    await who.call({ action: 'register-verify', credential: softAuthenticator({ rpId: RP, origin: ORIGIN }).register(body.options.challenge), label: '   ' })
    expect(fake.s.keys[0].label).toBe('This device')
  })
})

describe('unlocking with a fingerprint or face', () => {
  async function ready(opts) {
    const fake = fakeDb(opts)
    const { authenticator } = await enrol(fake)
    fake.s.unlocked.clear() // the user locks the app
    const laptop = client(fake, { session: 'laptop' })
    const challenge = async () => (await laptop.call({ action: 'authenticate-options' })).body.options.challenge
    return { fake, authenticator, laptop, challenge }
  }

  it('unlocks the session that asked, after a valid signature', async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    const c = await challenge()
    const opts = (await laptop.call({ action: 'authenticate-options' })).body.options
    expect(opts.allowCredentials).toEqual([{ type: 'public-key', id: authenticator.credentialId }])
    expect(opts.userVerification).toBe('required')
    const r = await laptop.call({ action: 'authenticate-verify', credential: authenticator.assert(c) })
    expect(r).toMatchObject({ status: 200, body: { ok: true } })
    expect(fake.s.unlocked.has('laptop')).toBe(true)
    expect(fake.s.unlocked.has('phone')).toBe(false) // only the session that asked
    expect(fake.s.failures).toBe(0)
  })
  it('cannot be replayed: a recorded response unlocks nothing the second time', async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    const response = authenticator.assert(await challenge())
    expect((await laptop.call({ action: 'authenticate-verify', credential: response })).status).toBe(200)
    fake.s.unlocked.clear()
    const replay = await laptop.call({ action: 'authenticate-verify', credential: response })
    expect(replay.body.error).toBe('challenge_expired')
    expect(fake.s.unlocked.size).toBe(0)
  })
  it("a challenge issued to one session cannot unlock another (a stolen response is useless elsewhere)", async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    const response = authenticator.assert(await challenge())
    const thief = client(fake, { session: 'thief' })
    expect((await thief.call({ action: 'authenticate-verify', credential: response })).body.error).toBe('challenge_expired')
    expect(fake.s.unlocked.has('thief')).toBe(false)
    expect((await laptop.call({ action: 'authenticate-verify', credential: response })).status).toBe(200) // the rightful session still can
  })
  it("a different user's key does not work, and neither does an unknown one", async () => {
    const { fake, laptop, challenge } = await ready()
    const stranger = softAuthenticator({ rpId: RP, origin: ORIGIN })
    const r = await laptop.call({ action: 'authenticate-verify', credential: stranger.assert(await challenge()) })
    expect(r).toMatchObject({ status: 401, body: { error: 'not_accepted', reason: 'unknown_credential' } })
    expect(fake.s.unlocked.size).toBe(0)
    expect(fake.s.failures).toBe(1)
  })
  it('counts a forged signature as a failed attempt, and the 5th locks PIN entry; the 10th ends the session', async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    const results = []
    for (let i = 0; i < 10; i++) results.push((await laptop.call({ action: 'authenticate-verify', credential: authenticator.assert(await challenge(), { corruptSignature: true }) })).body)
    expect(results.every((b) => b.error === 'not_accepted' && b.reason === 'bad_signature')).toBe(true)
    expect(results[4]).toMatchObject({ lockout_seconds: 30, signed_out: false })
    expect(results[9]).toMatchObject({ lockout_seconds: 60, signed_out: true })
    expect(fake.s.unlocked.size).toBe(0)
  })
  it('does not let a cloned authenticator in: the counter must move forward', async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    expect((await laptop.call({ action: 'authenticate-verify', credential: authenticator.assert(await challenge()) })).status).toBe(200)
    fake.s.unlocked.clear()
    authenticator.counter = 0 // the clone is behind the original
    const r = await laptop.call({ action: 'authenticate-verify', credential: authenticator.assert(await challenge(), {}) })
    expect(r.body).toMatchObject({ error: 'not_accepted', reason: 'counter_regressed' })
    expect(fake.s.unlocked.size).toBe(0)
  })
  it('refuses a response aimed at another site or origin', async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    const r1 = await laptop.call({ action: 'authenticate-verify', credential: authenticator.assert(await challenge(), { rp: 'evil.test' }) })
    const r2 = await laptop.call({ action: 'authenticate-verify', credential: authenticator.assert(await challenge(), { extra: { origin: 'https://evil.test' } }) })
    expect([r1.body.reason, r2.body.reason]).toEqual(['rp_mismatch', 'origin_mismatch'])
    expect(fake.s.unlocked.size).toBe(0)
  })
  it('treats an expired challenge as slowness, not as an attack', async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    const response = authenticator.assert(await challenge())
    fake.s.expireAll = true
    const r = await laptop.call({ action: 'authenticate-verify', credential: response })
    expect(r).toMatchObject({ status: 400, body: { error: 'challenge_expired' } })
    expect(fake.s.failures).toBe(0)
  })
  it('does nothing when biometrics are off', async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    const response = authenticator.assert(await challenge())
    fake.s.biometric = false
    expect((await laptop.call({ action: 'authenticate-options' })).body.error).toBe('biometric_off')
    expect((await laptop.call({ action: 'authenticate-verify', credential: response })).body.error).toBe('biometric_off')
    expect(fake.s.unlocked.size).toBe(0)
  })
  it('has nothing to offer a user with no keys', async () => {
    const fake = fakeDb()
    expect((await client(fake).call({ action: 'authenticate-options' })).body.error).toBe('biometric_off')
  })
  it('lets unexpected failures propagate instead of unlocking (index.ts turns them into a 500)', async () => {
    const { fake, authenticator, laptop, challenge } = await ready()
    const response = authenticator.assert(await challenge())
    fake.db.recordAssertion = async () => { throw new Error('database down') }
    await expect(laptop.call({ action: 'authenticate-verify', credential: response })).rejects.toThrow('database down')
    expect(fake.s.unlocked.size).toBe(0)
  })
})

describe('the copy Deno runs', () => {
  it('is the same verifier the apps use (kept in step by scripts/sync-function-core.mjs)', () => {
    const [file, content] = expected().find(([f]) => f.endsWith('_shared/webauthn.js'))
    expect(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')).toBe(content)
  })
})
