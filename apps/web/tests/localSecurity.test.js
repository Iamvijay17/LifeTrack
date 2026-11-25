import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lockoutSecondsAfter } from '@lifetrack/core/security'
import { auth } from '@/services/auth'
import { createLocalSecurity, hashSecret, checkSecret, markLogin } from '@/services/localSecurity'
import { setUserId } from '@/services/session'
import { softAuthenticator } from '../../../packages/core/tests/fixtures/softAuthenticator'

const PIN = '2486'
let clock
let endSession
let sec
let uid

const rec = () => JSON.parse(localStorage.getItem(`lifetrack-dev:security:${uid}`))
const advance = (s) => {
  clock += s * 1000
}
const authn = () => softAuthenticator({ rpId: location.hostname, origin: location.origin })

beforeEach(async () => {
  localStorage.clear()
  clock = Date.UTC(2026, 10, 11, 9, 0, 0)
  endSession = vi.fn(async () => {})
  await auth.signUp('ann@example.com', 'Violet-Harbor-42', 'Ann')
  uid = (await auth.getSession()).user.id
  setUserId(uid)
  sec = createLocalSecurity({ endSession, now: () => clock })
})

describe('hashing', () => {
  it('salts and slows: the same secret never hashes the same way twice, and only the right one checks out', async () => {
    const a = await hashSecret('2486'),
      b = await hashSecret('2486')
    expect(a.algo).toBe('pbkdf2-sha256')
    expect(a.iterations).toBeGreaterThanOrEqual(100_000)
    expect(a.hash).not.toBe(b.hash)
    expect(a.salt).not.toBe(b.salt)
    expect(await checkSecret('2486', a)).toBe(true)
    expect(await checkSecret('2487', a)).toBe(false)
    expect(await checkSecret('2486', null)).toBe(false)
  })
})

describe('setting up the PIN', () => {
  it('stores a hash, never the PIN, and starts unlocked', async () => {
    const s = await sec.setPin(PIN)
    expect(s).toMatchObject({ appLockEnabled: true, pinLength: 4, locked: false, autoLockSeconds: 300 })
    expect(localStorage.getItem(`lifetrack-dev:security:${uid}`)).not.toContain(PIN)
    expect(rec().pin).toMatchObject({ algo: 'pbkdf2-sha256', length: 4 })
  })
  it('refuses weak or malformed PINs with the reason, and a second setup', async () => {
    await expect(sec.setPin('1234')).rejects.toThrow(/runs/)
    await expect(sec.setPin('0000')).rejects.toThrow(/repeating/)
    await expect(sec.setPin('12a4')).rejects.toThrow(/digits only/)
    await expect(sec.setPin(PIN, { autoLockSeconds: 7 })).rejects.toThrow(/listed auto-lock/)
    expect((await sec.getState()).appLockEnabled).toBe(false)
    await sec.setPin('908142', { autoLockSeconds: 900 })
    expect(await sec.getState()).toMatchObject({ pinLength: 6, autoLockSeconds: 900 })
    await expect(sec.setPin(PIN)).rejects.toThrow(/already on/)
  })
})

describe('verifying the PIN', () => {
  beforeEach(async () => {
    await sec.setPin(PIN)
    await sec.lock()
  })
  it('opens the lock for the right PIN and counts tries for the wrong one', async () => {
    expect((await sec.getState()).locked).toBe(true)
    expect(await sec.verifyPin('1357')).toMatchObject({ ok: false, reason: 'wrong_pin', triesLeft: 4, failedAttempts: 1 })
    expect((await sec.getState()).locked).toBe(true)
    expect(await sec.verifyPin(PIN)).toMatchObject({ ok: true })
    expect(await sec.getState()).toMatchObject({ locked: false, failedAttempts: 0 })
  })
  it.each(['', 'abcd', '24 86', null])('treats %j as a wrong PIN', async (bad) => {
    expect(await sec.verifyPin(bad)).toMatchObject({ ok: false, reason: 'wrong_pin' })
  })
  it('locks after 5 wrong tries on the same schedule as the server, and refuses even the right PIN meanwhile', async () => {
    let r
    for (let i = 0; i < 5; i++) r = await sec.verifyPin('1357')
    expect(r).toMatchObject({ lockoutSeconds: 30, triesLeft: 0, signedOut: false })
    expect(await sec.verifyPin(PIN)).toMatchObject({ ok: false, reason: 'locked_out' })
    expect((await sec.getState()).lockoutSeconds).toBeGreaterThan(25)
    advance(31)
    expect(await sec.verifyPin(PIN)).toMatchObject({ ok: true })
  })
  it('follows the shared schedule up to the 40th wrong try, and ends the session from the 10th', async () => {
    for (let i = 1; i <= 40; i++) {
      advance(4000) // longer than any lockout, so each try is counted
      const r = await sec.verifyPin('1357')
      expect(r.lockoutSeconds, `try ${i}`).toBe(lockoutSecondsAfter(i))
      expect(r.signedOut, `try ${i}`).toBe(i >= 10 && i % 5 === 0)
    }
    expect(endSession).toHaveBeenCalledTimes(7) // 10, 15, … 40
  })
  it('does nothing when the lock is off', async () => {
    localStorage.clear()
    expect(await createLocalSecurity({ now: () => clock }).verifyPin(PIN)).toMatchObject({ ok: false, reason: 'not_enabled' })
  })
})

describe('changing and turning off', () => {
  beforeEach(() => sec.setPin(PIN))
  it('changes the PIN only with the current one', async () => {
    expect(await sec.changePin('1357', '7319')).toMatchObject({ ok: false, failedAttempts: 1 })
    await expect(sec.changePin(PIN, '1234')).rejects.toThrow(/runs/)
    await expect(sec.changePin(PIN, PIN)).rejects.toThrow(/different/)
    expect(await sec.changePin(PIN, '7319')).toMatchObject({ ok: true })
    await sec.lock()
    expect(await sec.verifyPin(PIN)).toMatchObject({ ok: false })
    expect(await sec.verifyPin('7319')).toMatchObject({ ok: true })
  })
  it('cannot be changed while locked', async () => {
    await sec.lock()
    await expect(sec.changePin(PIN, '7319')).rejects.toMatchObject({ code: 'APP_LOCKED' })
  })
  it('turns off with the PIN and forgets everything', async () => {
    expect(await sec.disableAppLock('1357')).toMatchObject({ ok: false })
    expect(await sec.disableAppLock(PIN)).toMatchObject({ ok: true })
    expect(rec()).toMatchObject({ enabled: false, pin: null, biometric: false })
    expect(await sec.getState()).toMatchObject({ appLockEnabled: false, locked: false })
  })
})

describe('locking and unlocking by time', () => {
  beforeEach(() => sec.setPin(PIN))
  it('locks itself when the user goes quiet, and a heartbeat keeps it open', async () => {
    await sec.setAutoLock(60) // window = 60 s + 30 s of slack
    advance(80)
    expect(await sec.touch()).toBe(true) // inside the window: renewed
    advance(80)
    expect(await sec.touch()).toBe(true)
    advance(100)
    expect((await sec.getState()).locked).toBe(true)
    expect(await sec.touch()).toBe(false) // a heartbeat cannot revive it
  })
  it('only accepts the offered auto-lock times, and only while unlocked', async () => {
    await expect(sec.setAutoLock(299)).rejects.toThrow(/listed auto-lock/)
    await sec.lock()
    await expect(sec.setAutoLock(60)).rejects.toMatchObject({ code: 'APP_LOCKED' })
  })
  it('a fresh sign-in opens the lock once, but "Lock now" then a reload does not undo it', async () => {
    await sec.lock()
    markLogin(uid, clock) // what the dev sign-in does after the password checks out
    expect((await sec.unlockAfterLogin()).locked).toBe(false)
    await sec.lock()
    expect((await sec.unlockAfterLogin()).locked).toBe(true) // tombstone: not eligible any more
  })
  it('a sign-in older than a minute does not open it', async () => {
    markLogin(uid, clock)
    advance(61)
    expect((await sec.unlockAfterLogin()).locked).toBe(true)
  })
  it('signing in clears a PIN lockout that someone else caused', async () => {
    for (let i = 0; i < 5; i++) await sec.verifyPin('1357')
    expect((await sec.getState()).lockoutSeconds).toBeGreaterThan(0)
    markLogin(uid, clock)
    expect(await sec.unlockAfterLogin()).toMatchObject({ locked: false, lockoutSeconds: 0, failedAttempts: 0 })
  })
})

describe('forgot the PIN', () => {
  beforeEach(() => sec.setPin(PIN))
  it('needs a sign-in from the last 10 minutes', async () => {
    markLogin(uid, clock)
    advance(11 * 60)
    await expect(sec.resetAppLock('7319')).rejects.toThrow(/Sign in again with your password/)
    markLogin(uid, clock)
    advance(5 * 60)
    expect(await sec.resetAppLock('7319')).toMatchObject({ appLockEnabled: true, locked: false, failedAttempts: 0 })
    await sec.lock()
    expect(await sec.verifyPin('7319')).toMatchObject({ ok: true })
  })
  it('can turn the lock off instead, and validates the new PIN', async () => {
    markLogin(uid, clock)
    await expect(sec.resetAppLock('1234')).rejects.toThrow(/runs/)
    expect(await sec.resetAppLock()).toMatchObject({ appLockEnabled: false })
  })
})

describe('fingerprint / face unlock (passkeys)', () => {
  beforeEach(() => sec.setPin(PIN))

  async function enrol(a = authn(), label = 'MacBook') {
    const options = await sec.passkeys.beginRegistration()
    expect(options).toMatchObject({
      rp: { id: location.hostname },
      attestation: 'none',
      authenticatorSelection: { userVerification: 'required' },
    })
    const id = await sec.passkeys.finishRegistration({ credential: a.register(options.challenge), transports: ['internal'], label })
    return { a, id }
  }

  it('registers a device, turns biometrics on, and lists it without any key material', async () => {
    const { id } = await enrol()
    expect(await sec.getState()).toMatchObject({ biometricEnabled: true, passkeyCount: 1 })
    const list = await sec.passkeys.list()
    expect(list).toEqual([
      expect.objectContaining({ id, label: 'MacBook', deviceType: 'singleDevice', transports: ['internal'], lastUsedAt: null }),
    ])
    expect(JSON.stringify(list)).not.toMatch(/publicKey|jwk/i)
  })
  it('unlocks with a valid signature, and only once per challenge', async () => {
    const { a } = await enrol()
    await sec.lock()
    const options = await sec.passkeys.beginAuthentication()
    expect(options.allowCredentials).toEqual([{ type: 'public-key', id: a.credentialId }])
    const response = a.assert(options.challenge)
    await sec.passkeys.finishAuthentication(response)
    expect((await sec.getState()).locked).toBe(false)
    await sec.lock()
    await expect(sec.passkeys.finishAuthentication(response)).rejects.toMatchObject({ code: 'challenge_expired' }) // replay
    expect((await sec.getState()).locked).toBe(true)
  })
  it('counts a forged signature like a wrong PIN, and rejects an unknown key', async () => {
    const { a } = await enrol()
    await sec.lock()
    const forged = a.assert((await sec.passkeys.beginAuthentication()).challenge, { corruptSignature: true })
    await expect(sec.passkeys.finishAuthentication(forged)).rejects.toMatchObject({
      code: 'not_accepted',
      detail: { reason: 'bad_signature' },
    })
    const stranger = authn()
    await expect(
      sec.passkeys.finishAuthentication(stranger.assert((await sec.passkeys.beginAuthentication()).challenge)),
    ).rejects.toMatchObject({ detail: { reason: 'unknown_credential' } })
    expect(await sec.getState()).toMatchObject({ locked: true, failedAttempts: 2 })
  })
  it('refuses a response aimed at another site', async () => {
    const { a } = await enrol()
    await sec.lock()
    const wrongSite = a.assert((await sec.passkeys.beginAuthentication()).challenge, { rp: 'evil.test' })
    await expect(sec.passkeys.finishAuthentication(wrongSite)).rejects.toMatchObject({ detail: { reason: 'rp_mismatch' } })
  })
  it('cannot add a device while locked, or without the app lock', async () => {
    await sec.lock()
    await expect(sec.passkeys.beginRegistration()).rejects.toMatchObject({ code: 'APP_LOCKED' })
    await sec.verifyPin(PIN)
    await sec.disableAppLock(PIN)
    await expect(sec.passkeys.beginRegistration()).rejects.toThrow(/Turn on the app lock/)
  })
  it('does nothing when biometrics are off', async () => {
    await expect(sec.passkeys.beginAuthentication()).rejects.toMatchObject({ code: 'biometric_off' })
  })
  it('renames and removes; removing the last one turns biometrics off', async () => {
    const { id } = await enrol()
    await sec.passkeys.rename(id, '  Work laptop ')
    expect((await sec.passkeys.list())[0].label).toBe('Work laptop')
    await expect(sec.passkeys.rename(id, '')).rejects.toThrow(/1 to 60/)
    await expect(sec.passkeys.rename('nope', 'x')).rejects.toThrow(/not on your account/)
    expect(await sec.passkeys.remove(id)).toMatchObject({ passkeyCount: 0, biometricEnabled: false })
    await expect(sec.setBiometricEnabled(true)).rejects.toThrow(/Add a fingerprint/)
  })
  it('stops at 10 devices, and does not register the same one twice', async () => {
    const first = authn()
    await enrol(first)
    const options = await sec.passkeys.beginRegistration()
    expect(options.excludeCredentials).toEqual([{ type: 'public-key', id: first.credentialId }])
    for (let i = 0; i < 9; i++) await enrol(authn())
    const o = await sec.passkeys.beginRegistration()
    await expect(sec.passkeys.finishRegistration({ credential: authn().register(o.challenge) })).rejects.toThrow(/up to 10/)
  })
  it('rejects a registration answered to the wrong challenge or after it expired', async () => {
    const options = await sec.passkeys.beginRegistration()
    await expect(sec.passkeys.finishRegistration({ credential: authn().register('A'.repeat(43)) })).rejects.toMatchObject({
      code: 'challenge_expired',
    })
    advance(3 * 60)
    await expect(sec.passkeys.finishRegistration({ credential: authn().register(options.challenge) })).rejects.toMatchObject({
      code: 'challenge_expired',
    })
  })
  it('is available only where the browser has passkeys', async () => {
    expect(await sec.passkeys.available()).toBe(false) // jsdom has no PublicKeyCredential
  })
})

describe('sessions in the dev backend', () => {
  it('has exactly one, and revoking or signing out everywhere ends it', async () => {
    const list = await sec.sessions.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'this-browser', current: true })
    await sec.sessions.signOutOthers()
    expect(endSession).not.toHaveBeenCalled()
    await sec.sessions.revoke('this-browser')
    await sec.sessions.signOutEverywhere()
    expect(endSession).toHaveBeenCalledTimes(2)
  })
})

describe('accounts', () => {
  it('keep their own settings and are removed with the account', async () => {
    await sec.setPin(PIN)
    await auth.signUp('bob@example.com', 'Violet-Harbor-42', 'Bob')
    setUserId((await auth.getSession()).user.id)
    expect((await sec.getState()).appLockEnabled).toBe(false)
    setUserId(uid)
    expect((await sec.getState()).appLockEnabled).toBe(true)
    await auth.signIn('ann@example.com', 'Violet-Harbor-42')
    await auth.deleteAccount()
    expect(localStorage.getItem(`lifetrack-dev:security:${uid}`)).toBeNull()
  })
  it('need a signed-in user', async () => {
    setUserId(null)
    await expect(sec.getState()).rejects.toThrow(/Sign in again/)
  })
})
