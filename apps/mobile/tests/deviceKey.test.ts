import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { client, fakeDb } from '../../../packages/core/tests/fixtures/fakeDeviceKeyDb.js'
import { b64uEncode } from '@lifetrack/core/webauthn'
import { createDeviceKeys, type BiometricProbe, type DeviceKeyApi, type Platform, type SecretStore } from '../src/features/security/deviceKey'

// The phone's biometric key, end to end: this file drives the REAL decisions of the `device-key` Edge Function (supabase/functions/device-key/logic.js, with an
// in-memory database that has the semantics of migration 0014) from the app's own code, so a signature made in JavaScript on the phone is verified by WebCrypto
// on the "server", exactly as in production. What it cannot reach is the hardware: the fake store below only models what expo-secure-store promises.

const USER = '11111111-1111-4111-8111-111111111111'
const sentinel = (e: any) => e

/**
 * expo-secure-store, as far as this feature relies on it: an item stored behind authentication is released only after the operating system's prompt succeeds
 * (any read of it prompts), the prompt can be cancelled or locked out, and the key can be destroyed when the phone's biometrics change.
 */
function fakeStore(platform: Platform) {
  const items = new Map<string, { value: string; sealed: boolean }>()
  const s = { mode: 'ok' as 'ok' | 'cancel' | 'lockout' | 'fail', prompts: 0, invalidated: false, setFails: false, writes: [] as string[], calls: [] as { op: 'get' | 'set'; key: string; options: Record<string, unknown> | undefined }[] }
  const prompt = async () => {
    s.prompts++
    if (s.mode === 'cancel') throw new Error('Could not authenticate the user: User canceled the authentication')
    if (s.mode === 'lockout') throw new Error('Could not authenticate the user: Lockout. Too many attempts')
    if (s.mode === 'fail') throw new Error('Could not authenticate the user: Authentication failed')
  }
  const store: SecretStore = {
    async getItemAsync(key, options) {
      s.calls.push({ op: 'get', key, options })
      const it = items.get(key)
      if (it?.sealed) {
        await prompt()
        if (s.invalidated) return null // the key store destroyed it
      }
      expect(options?.keychainService).toBe('lifetrack.devicekey')
      return it?.value ?? null
    },
    async setItemAsync(key, value, options) {
      s.calls.push({ op: 'set', key, options })
      if (s.setFails) throw new Error('Could not write to the keystore')
      if (options?.requireAuthentication && platform === 'android') await prompt() // Android authenticates on write too; iOS only on read
      s.writes.push(key)
      items.set(key, { value, sealed: !!options?.requireAuthentication })
    },
    async deleteItemAsync(key) { items.delete(key) },
  }
  return { store, items, s }
}

const unwrap = (r: any) => {
  if (r.body.ok) return r.body
  throw Object.assign(new Error(r.body.message), { code: r.body.error, detail: r.body })
}
function world({ platform = 'android', types = [1], level = 3, hardware = true, enrolled = true }: { platform?: Platform; types?: number[]; level?: number; hardware?: boolean; enrolled?: boolean } = {}) {
  const fake: any = fakeDb() // plain JavaScript: its rows are typed loosely
  const who = client(fake) // the phone's own session: unlocked at first, "locked" by removing it from fake.s.unlocked
  const bodies: any[] = []
  const send = (body: any) => { bodies.push(body); return who.call(body) }
  const api = {
    available: vi.fn(async () => true),
    list: vi.fn(async () => fake.s.keys.map((k: any) => ({ id: k.id, label: k.label, platform: k.platform, createdAt: '2026-11-11T10:00:00Z', lastUsedAt: null }))),
    beginEnrollment: vi.fn(async () => unwrap(await send({ action: 'enroll-options' })).options),
    finishEnrollment: vi.fn(async (a: any) => unwrap(await send({ action: 'enroll-verify', ...a })).id),
    beginUnlock: vi.fn(async (keyId: string) => unwrap(await send({ action: 'unlock-options', keyId })).options),
    finishUnlock: vi.fn(async (a: any) => { unwrap(await send({ action: 'unlock-verify', ...a })) }),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async (id: string) => {
      const i = fake.s.keys.findIndex((k: any) => k.id === id)
      if (i < 0) throw Object.assign(new Error('That phone is not on your account.'), { code: 'P0002' })
      fake.s.keys.splice(i, 1)
    }),
  } satisfies DeviceKeyApi
  const st = fakeStore(platform)
  const probe: BiometricProbe = {
    hasHardwareAsync: async () => hardware,
    isEnrolledAsync: async () => enrolled,
    supportedAuthenticationTypesAsync: async () => types,
    getEnrolledLevelAsync: async () => level,
  }
  const holds = { n: 0 }
  const dk = createDeviceKeys({ api, store: st.store, probe, platform, random: (n) => new Uint8Array(randomBytes(n)), hold: async (fn) => { holds.n++; return fn() }, deviceName: () => 'Pixel 8' })
  const lock = () => fake.s.unlocked.delete('phone') // the session locks: the phone must now prove itself
  return { fake, api, st, probe, dk, holds, bodies, lock, who }
}
const enrolled = async (over: Parameters<typeof world>[0] = {}) => {
  const w = world(over)
  const r = await w.dk.enroll(USER)
  expect(r.ok).toBe(true)
  w.lock()
  w.api.beginEnrollment.mockClear(); w.api.finishEnrollment.mockClear()
  return { ...w, id: (r as any).id as string }
}
const secretOf = (w: ReturnType<typeof world>) => w.st.items.get(`lifetrack.dk.${USER}.secret`)
const metaOf = (w: ReturnType<typeof world>) => JSON.parse(w.st.items.get(`lifetrack.dk.${USER}.meta`)?.value ?? 'null')

describe('what this phone can do', () => {
  it.each([
    ['an iPhone with Face ID', { platform: 'ios', types: [2] }, 'Face ID', 'face'],
    ['an iPhone with Touch ID', { platform: 'ios', types: [1] }, 'Touch ID', 'fingerprint'],
    ['an Android phone with a fingerprint sensor', { platform: 'android', types: [1] }, 'Fingerprint', 'fingerprint'],
    ['an Android phone with face and fingerprint (the fingerprint prompt is the dependable one)', { platform: 'android', types: [2, 1] }, 'Fingerprint', 'fingerprint'],
    ['an Android phone with strong face unlock only', { platform: 'android', types: [2] }, 'Face unlock', 'face'],
    ['an Android phone with an iris scanner', { platform: 'android', types: [3] }, 'Iris unlock', 'iris'],
    ['a phone that does not say which', { platform: 'android', types: [] }, 'Biometrics', 'biometrics'],
  ] as const)('%s', async (_name, over, label, kind) => {
    expect(await world(over as any).dk.support()).toEqual({ available: true, kind, label, reason: null })
  })
  it('says why not: no sensor, nothing enrolled, or a face unlock too weak for the key store', async () => {
    expect(await world({ hardware: false }).dk.support()).toMatchObject({ available: false, reason: expect.stringMatching(/no fingerprint or face sensor/) })
    expect(await world({ enrolled: false }).dk.support()).toMatchObject({ available: false, reason: expect.stringMatching(/Add a fingerprint or face/) })
    expect(await world({ level: 2, types: [2] }).dk.support()).toMatchObject({ available: false, reason: expect.stringMatching(/not strong enough/) })
    expect(await world({ platform: 'ios', level: 2, types: [2] }).dk.support()).toMatchObject({ available: true }) // the strength rule is Android's
  })
  it('lets the first use find out when the phone will not say how strong its biometrics are, and is calm when the sensors cannot be asked', async () => {
    const w = world()
    w.probe.getEnrolledLevelAsync = async () => { throw new Error('unavailable') }
    expect((await w.dk.support()).available).toBe(true)
    w.probe.hasHardwareAsync = async () => { throw new Error('module missing') }
    expect(await w.dk.support()).toMatchObject({ available: false, reason: expect.stringMatching(/Could not check/) })
  })
})

describe('adding this phone', () => {
  it('seals the key behind the biometrics, proves to the server that the phone holds it, and keeps only the id', async () => {
    const w = world()
    const r = await w.dk.enroll(USER)
    expect(r).toMatchObject({ ok: true })
    expect(w.fake.s.keys).toHaveLength(1)
    const key = w.fake.s.keys[0]
    expect(key).toMatchObject({ label: 'Pixel 8', platform: 'android' })
    expect(key.publicKeyJwk).toMatchObject({ kty: 'EC', crv: 'P-256' })
    expect(key.publicKeyJwk.d).toBeUndefined() // the server only ever sees the public key
    expect(secretOf(w)).toMatchObject({ sealed: true }) // behind authentication
    expect(metaOf(w)).toEqual({ kid: (r as any).id, counter: 0 })
    expect(w.st.items.get(`lifetrack.dk.${USER}.meta`)?.sealed).toBe(false) // the id and counter are not secret, and must be readable without a prompt
    expect(JSON.stringify([...w.st.items.entries()].filter(([k]) => k.endsWith('meta')))).not.toContain(secretOf(w)!.value)
    expect(JSON.stringify(w.fake.s)).not.toContain(secretOf(w)!.value) // …nor anywhere on the server
    expect(b64uEncode(Buffer.from(secretOf(w)!.value, 'base64url'))).toHaveLength(43) // 32 bytes
    expect(await w.dk.localState(USER)).toEqual({ enrolled: true, broken: false, keyId: (r as any).id })
    expect(w.holds.n).toBe(1) // Android asks for the fingerprint when it seals; the app was told so it does not lock itself meanwhile
  })
  it('asks the operating system to protect the secret with the biometrics, says why in the prompt, and keeps everything else outside that protection', async () => {
    const w = world()
    await w.dk.enroll(USER)
    const secret = w.st.s.calls.find((c) => c.op === 'set' && c.key.endsWith('.secret'))!
    expect(secret.options).toEqual({ keychainService: 'lifetrack.devicekey', requireAuthentication: true, authenticationPrompt: 'Turn on Fingerprint for LifeTrack' })
    const meta = w.st.s.calls.find((c) => c.op === 'set' && c.key.endsWith('.meta'))!
    expect(meta.options).toEqual({ keychainService: 'lifetrack.devicekey' }) // the id and the counter are readable without a prompt: and carry no secret
    const iphone = world({ platform: 'ios', types: [2] })
    await iphone.dk.enroll(USER)
    expect(iphone.st.s.calls.find((c) => c.op === 'set' && c.key.endsWith('.secret'))!.options).toMatchObject({ requireAuthentication: true, authenticationPrompt: 'Turn on Face ID for LifeTrack' })
  })
  it('on an iPhone the Keychain adds the item silently, so it reads it back: the person proves the sensor works now', async () => {
    const w = world({ platform: 'ios', types: [2] })
    expect((await w.dk.enroll(USER)).ok).toBe(true)
    expect(w.st.s.prompts).toBe(1) // one Face ID prompt, at the read-back
    expect(w.holds.n).toBe(2)
    const sheet = world({ platform: 'ios', types: [2] })
    sheet.st.s.mode = 'cancel'
    expect(await sheet.dk.enroll(USER)).toEqual({ ok: false, cancelled: true })
    expect(sheet.fake.s.keys).toHaveLength(0)
    expect(secretOf(sheet)).toBeUndefined() // the half-made key is removed
  })
  it('names the phone as asked', async () => {
    const w = world()
    await w.dk.enroll(USER, { label: '  Work phone ' })
    expect(w.fake.s.keys[0].label).toBe('Work phone')
  })
  it('a dismissed prompt leaves nothing behind and is not an error', async () => {
    const w = world()
    w.st.s.mode = 'cancel'
    expect(await w.dk.enroll(USER)).toEqual({ ok: false, cancelled: true })
    expect(w.fake.s.keys).toHaveLength(0)
    expect(w.st.items.size).toBe(0)
    expect(await w.dk.localState(USER)).toEqual({ enrolled: false, broken: false, keyId: null })
  })
  it('is refused, with the server\'s words, when the session is locked or the app lock is off; nothing is sealed', async () => {
    const locked = world()
    locked.lock()
    await expect(locked.dk.enroll(USER)).rejects.toThrow('Unlock LifeTrack first.')
    expect(locked.st.items.size).toBe(0)
    const off = world()
    off.fake.s.appLock = false
    await expect(off.dk.enroll(USER)).rejects.toThrow(/Turn on the app lock/)
    expect(off.st.items.size).toBe(0)
  })
  it('takes the key back out if the server turns the phone down after it was sealed', async () => {
    const w = world()
    w.api.finishEnrollment.mockRejectedValueOnce(Object.assign(new Error('That fingerprint or face unlock is already on an account.'), { code: 'already_added' }))
    await expect(w.dk.enroll(USER)).rejects.toThrow(/already on an account/)
    expect(secretOf(w)).toBeUndefined()
    expect(w.st.items.size).toBe(0)
    expect(w.fake.s.keys).toHaveLength(0)
  })
  it('does not even ask the server when the phone cannot do it', async () => {
    const w = world({ hardware: false })
    await expect(w.dk.enroll(USER)).rejects.toThrow(/no fingerprint or face sensor/)
    expect(w.fake.s.challenges).toHaveLength(0)
    expect(w.api.beginEnrollment).not.toHaveBeenCalled()
  })
  it('fails here, not at the lock screen, when the Keychain would not keep the key', async () => {
    const w = world({ platform: 'ios', types: [2] })
    const get = w.st.store.getItemAsync
    w.st.store.getItemAsync = async (k, o) => (k.endsWith('secret') ? null : get(k, o))
    await expect(w.dk.enroll(USER)).rejects.toThrow(/would not keep the key/)
    expect(w.st.items.has(`lifetrack.dk.${USER}.secret`)).toBe(false)
  })
  it('a second tap while the first is still working does nothing', async () => {
    const w = world()
    const [a, b] = await Promise.all([w.dk.enroll(USER), w.dk.enroll(USER)])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(w.fake.s.keys).toHaveLength(1)
  })
  it('refuses a user id that is not a UUID rather than build odd storage names', async () => {
    const w = world()
    await expect(w.dk.enroll('../../etc')).rejects.toThrow(/Sign in again/)
    expect(await w.dk.unlock('nope')).toMatchObject({ ok: false, gone: false, message: expect.stringMatching(/Sign in again/) })
  })
})

describe('unlocking with this phone', () => {
  it('opens the session with a signature the server verified, and every unlock counts higher than the last', async () => {
    const w = await enrolled()
    for (const n of [1, 2, 3]) {
      expect(w.fake.s.unlocked.has('phone')).toBe(false)
      expect(await w.dk.unlock(USER)).toEqual({ ok: true })
      expect(w.fake.s.unlocked.has('phone')).toBe(true)
      expect(w.fake.s.keys[0].signCount).toBe(n)
      expect(metaOf(w).counter).toBe(n)
      w.lock()
    }
    expect(w.st.s.prompts).toBeGreaterThanOrEqual(3 + 1)
    expect(w.fake.s.failures).toBe(0)
  })
  it('reads the sealed secret with the protection and the prompt text the operating system needs, and never reads it any other way', async () => {
    const w = await enrolled()
    w.st.s.calls.length = 0
    await w.dk.unlock(USER)
    const reads = w.st.s.calls.filter((c) => c.op === 'get' && c.key.endsWith('.secret'))
    expect(reads).toHaveLength(1)
    expect(reads[0].options).toEqual({ keychainService: 'lifetrack.devicekey', requireAuthentication: true, authenticationPrompt: 'Unlock LifeTrack' })
  })
  it('sends the server a signature and nothing that could be a claim: no "the biometric check passed" flag exists anywhere in the request', async () => {
    const w = await enrolled()
    w.bodies.length = 0
    await w.dk.unlock(USER)
    expect(w.bodies.map((b) => b.action)).toEqual(['unlock-options', 'unlock-verify'])
    expect(Object.keys(w.bodies[1]).sort()).toEqual(['action', 'challenge', 'counter', 'keyId', 'signature'])
    expect(Object.keys(w.bodies[0]).sort()).toEqual(['action', 'keyId'])
  })
  it('cannot unlock anything if the sensor does not release the key: no signature, so no request to unlock', async () => {
    for (const mode of ['cancel', 'lockout', 'fail'] as const) {
      const w = await enrolled()
      w.st.s.mode = mode
      const r = await w.dk.unlock(USER)
      expect(r.ok).toBe(false)
      expect(w.api.finishUnlock).not.toHaveBeenCalled()
      expect(w.fake.s.unlocked.has('phone')).toBe(false)
      expect(w.fake.s.failures).toBe(0) // it never reached the server: a fingerprint that did not match is not a bad signature
    }
  })
  it('a dismissed prompt is silent, a locked-out sensor and a failed read say what to do, and none of them gives up on the key', async () => {
    const w = await enrolled()
    w.st.s.mode = 'cancel'
    expect(await w.dk.unlock(USER)).toMatchObject({ ok: false, cancelled: true, message: '', gone: false })
    w.st.s.mode = 'lockout'
    expect(await w.dk.unlock(USER)).toMatchObject({ ok: false, cancelled: false, gone: false, message: expect.stringMatching(/Too many tries/) })
    w.st.s.mode = 'fail'
    expect(await w.dk.unlock(USER)).toMatchObject({ ok: false, cancelled: false, gone: false, message: expect.stringMatching(/Try again, or use your PIN/) })
    w.st.s.mode = 'ok'
    expect(await w.dk.unlock(USER)).toEqual({ ok: true }) // and it still works: the counter simply skipped ahead, which the server accepts
    expect(w.fake.s.keys[0].signCount).toBe(4)
  })
  it('stops offering it when the phone\'s fingerprints or face changed (the key store destroyed the key), and says so', async () => {
    const w = await enrolled()
    w.st.s.invalidated = true
    const r = await w.dk.unlock(USER)
    expect(r).toMatchObject({ ok: false, gone: true, message: expect.stringMatching(/changed on this phone/) })
    expect(w.api.finishUnlock).not.toHaveBeenCalled()
    expect(await w.dk.localState(USER)).toMatchObject({ enrolled: false, broken: true })
    expect(await w.dk.unlock(USER)).toMatchObject({ ok: false, gone: true, message: expect.stringMatching(/set up again/) }) // and it does not keep trying
    expect(w.api.beginUnlock).toHaveBeenCalledTimes(1)
  })
  it('forgets the key when the account no longer lists it (removed from another device, or the lock was turned off)', async () => {
    const w = await enrolled()
    w.fake.s.keys.length = 0
    const r = await w.dk.unlock(USER)
    expect(r).toMatchObject({ ok: false, gone: true, message: expect.stringMatching(/not set up for fingerprint or face unlock any more/) })
    expect(w.st.items.size).toBe(0)
    expect(await w.dk.localState(USER)).toEqual({ enrolled: false, broken: false, keyId: null })
  })
  it('a key the server lists but this phone lost is told apart from a key the server dropped', async () => {
    const w = await enrolled()
    w.st.items.delete(`lifetrack.dk.${USER}.meta`)
    expect(await w.dk.unlock(USER)).toMatchObject({ ok: false, gone: true })
    expect(w.api.beginUnlock).not.toHaveBeenCalled()
  })
  it('gives up on a key whose counter the server has already passed (a restored backup, or a copy), and counts it like a wrong PIN', async () => {
    const w = await enrolled()
    w.fake.s.keys[0].signCount = 50
    const r = await w.dk.unlock(USER)
    expect(r).toMatchObject({ ok: false, gone: true, message: expect.stringMatching(/set up again/), lockoutSeconds: 0, signedOut: false })
    expect(w.fake.s.unlocked.has('phone')).toBe(false)
    expect(w.fake.s.failures).toBe(1)
    expect(await w.dk.localState(USER)).toMatchObject({ enrolled: false, broken: true })
  })
  it('gives up on a key that does not match the one the server holds, and passes the lockout and the sign-out on', async () => {
    const w = await enrolled()
    const other = await enrolled() // a different key pair in this phone's store: its signatures are not this account's
    w.st.items.set(`lifetrack.dk.${USER}.secret`, { value: secretOf(other)!.value, sealed: true })
    w.fake.s.failures = 4 // four wrong tries already: this is the fifth
    const r = await w.dk.unlock(USER)
    expect(r).toMatchObject({ ok: false, gone: true, lockoutSeconds: 30, signedOut: false })
    expect(w.fake.s.failures).toBe(5)
    const w2 = await enrolled()
    w2.st.items.set(`lifetrack.dk.${USER}.secret`, { value: secretOf(other)!.value, sealed: true })
    w2.fake.s.failures = 9 // the tenth ends the session
    expect(await w2.dk.unlock(USER)).toMatchObject({ ok: false, signedOut: true, lockoutSeconds: 60 })
  })
  it('says what the server said when the app lock was turned off meanwhile, without giving up on the key', async () => {
    const w = await enrolled()
    w.fake.s.appLock = false
    expect(await w.dk.unlock(USER)).toMatchObject({ ok: false, gone: false, message: 'The app lock is off.' })
  })
  it('a lost connection is just a failure: use the PIN, and the key is kept', async () => {
    const before = await enrolled()
    before.api.beginUnlock.mockRejectedValueOnce(new Error("Can't reach fingerprint and face unlock right now. Use your PIN instead."))
    expect(await before.dk.unlock(USER)).toMatchObject({ ok: false, gone: false, message: expect.stringMatching(/Use your PIN/) })
    expect(metaOf(before).counter).toBe(0) // nothing was signed, so no number was used
    const after = await enrolled()
    after.api.finishUnlock.mockRejectedValueOnce(Object.assign(new Error('Network request failed'), { code: 'unreachable' }))
    expect(await after.dk.unlock(USER)).toMatchObject({ ok: false, gone: false, message: 'Network request failed' })
    expect(metaOf(after).counter).toBe(1) // a number that may have reached the server is never used twice
    expect(await after.dk.unlock(USER)).toEqual({ ok: true })
    expect(after.fake.s.keys[0].signCount).toBe(2)
    const blank = await enrolled()
    blank.api.beginUnlock.mockRejectedValueOnce(new Error(''))
    expect(await blank.dk.unlock(USER)).toMatchObject({ ok: false, message: expect.stringMatching(/Could not reach the server/) })
  })
  it('an expired challenge is slowness: try again, nothing is given up and nothing counts against the PIN', async () => {
    const w = await enrolled()
    w.fake.s.expireAll = true
    expect(await w.dk.unlock(USER)).toMatchObject({ ok: false, gone: false, message: 'That took too long. Try again.' })
    expect(w.fake.s.failures).toBe(0)
    w.fake.s.expireAll = false
    expect(await w.dk.unlock(USER)).toEqual({ ok: true })
  })
  it('has nothing to offer when no key is enrolled', async () => {
    const w = world()
    expect(await w.dk.unlock(USER)).toMatchObject({ ok: false, gone: true })
    expect(w.api.beginUnlock).not.toHaveBeenCalled()
  })
  it('a second tap while an unlock is in flight does nothing', async () => {
    const w = await enrolled()
    const [a, b] = await Promise.all([w.dk.unlock(USER), w.dk.unlock(USER)])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect([a, b].find((r) => !r.ok)).toMatchObject({ cancelled: true })
  })
  it('tells the app it has no stored meta when the bookkeeping is corrupt', async () => {
    const w = await enrolled()
    for (const bad of ['not json', '{}', '{"kid":1,"counter":0}', '{"kid":"x","counter":-1}', '{"kid":"x","counter":1.5}']) {
      w.st.items.set(`lifetrack.dk.${USER}.meta`, { value: bad, sealed: false })
      expect(await w.dk.localState(USER), bad).toEqual({ enrolled: false, broken: false, keyId: null })
    }
  })
})

describe('keeping the phone and the account in step', () => {
  it('leaves a key alone while the account still lists it', async () => {
    const w = await enrolled()
    await w.dk.reconcile(USER, await w.api.list())
    expect(await w.dk.localState(USER)).toMatchObject({ enrolled: true })
  })
  it('forgets a key the account dropped (removed from another device)', async () => {
    const w = await enrolled()
    await w.dk.reconcile(USER, [])
    expect(w.st.items.size).toBe(0)
  })
  it('tidies a key marked unusable on both sides: it is removed from the account, then from the phone', async () => {
    const w = await enrolled()
    w.st.s.invalidated = true
    await w.dk.unlock(USER)
    w.fake.s.unlocked.add('phone')
    await w.dk.reconcile(USER, await w.api.list())
    expect(w.api.remove).toHaveBeenCalledWith(w.id)
    expect(w.fake.s.keys).toHaveLength(0)
    expect(w.st.items.size).toBe(0)
    // already gone from the account: still cleared locally
    const w2 = await enrolled()
    w2.st.s.invalidated = true
    await w2.dk.unlock(USER)
    await w2.dk.reconcile(USER, [])
    expect(w2.st.items.size).toBe(0)
    expect(w2.api.remove).not.toHaveBeenCalled()
  })
  it('does nothing for a phone that has no key', async () => {
    const w = world()
    await w.dk.reconcile(USER, [{ id: 'x' }])
    expect(w.api.remove).not.toHaveBeenCalled()
  })
})

describe('turning it off', () => {
  it('removes this phone from the account first, so it cannot linger there, then from the phone', async () => {
    const w = await enrolled()
    w.fake.s.unlocked.add('phone')
    await w.dk.disable(USER)
    expect(w.api.remove).toHaveBeenCalledWith(w.id)
    expect(w.fake.s.keys).toHaveLength(0)
    expect(w.st.items.size).toBe(0)
  })
  it('carries on when the account has already dropped it', async () => {
    const w = await enrolled()
    w.fake.s.keys.length = 0
    await w.dk.disable(USER)
    expect(w.st.items.size).toBe(0)
  })
  it('keeps everything, and says so, when the account cannot be reached: a key that is still listed must not be orphaned', async () => {
    const w = await enrolled()
    w.api.remove.mockRejectedValueOnce(Object.assign(new Error('Network request failed'), { code: 'unreachable' }))
    await expect(w.dk.disable(USER)).rejects.toThrow('Network request failed')
    expect(await w.dk.localState(USER)).toMatchObject({ enrolled: true })
  })
  it('does nothing for a phone that has no key, and forget() clears only this user', async () => {
    const w = await enrolled()
    await w.dk.disable('22222222-2222-4222-8222-222222222222')
    expect(await w.dk.localState(USER)).toMatchObject({ enrolled: true })
    await w.dk.forget(USER)
    expect(w.st.items.size).toBe(0)
  })
})

describe('several accounts on one phone', () => {
  it('keeps each account\'s key apart: signing in as someone else offers no fingerprint for them', async () => {
    const w = await enrolled()
    const other = '22222222-2222-4222-8222-222222222222'
    expect(await w.dk.localState(other)).toEqual({ enrolled: false, broken: false, keyId: null })
    expect(await w.dk.unlock(other)).toMatchObject({ ok: false, gone: true })
    expect(await w.dk.localState(USER)).toMatchObject({ enrolled: true })
  })
})

void sentinel
