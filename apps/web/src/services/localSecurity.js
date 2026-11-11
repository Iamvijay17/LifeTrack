// DEV-ONLY counterpart of the Supabase security functions, for the in-browser local backend (no Supabase credentials). Same interface and the same
// rules as supabase/migrations/0012_security.sql and the `webauthn` Edge Function (they share packages/core/src/security.js and webauthn.js), but there
// is NO server here: everything lives in this browser's localStorage, which anyone with this browser can edit. So the lock is a real UI lock, not a
// protection of the data. Production = Supabase, where the database enforces it.
import {
  DEFAULT_AUTO_LOCK,
  isAutoLockSeconds,
  lockoutSecondsAfter,
  revokesSession,
  triesLeftBeforeLockout,
  validatePin,
} from '@lifetrack/core/security'
import * as wa from '@lifetrack/core/webauthn'
import { AppError } from './errors'
import { getUserId } from './session'

const KEY = (uid) => `lifetrack-dev:security:${uid}`
const ITERATIONS = 120_000 // PBKDF2-SHA256; the real backend uses bcrypt cost 12
const FRESH_LOGIN_MS = 60_000
const RESET_WINDOW_MS = 10 * 60_000
const CHALLENGE_MS = 2 * 60_000
const enc = new TextEncoder()

const blank = () => ({
  enabled: false,
  pin: null,
  autoLock: DEFAULT_AUTO_LOCK,
  biometric: false,
  failed: 0,
  lockoutUntil: 0,
  unlock: null,
  loginAt: 0,
  keys: [],
})
const read = (uid) => {
  try {
    return { ...blank(), ...(JSON.parse(localStorage.getItem(KEY(uid))) ?? {}) }
  } catch {
    return blank()
  }
}
const write = (uid, rec) => localStorage.setItem(KEY(uid), JSON.stringify(rec))

// ---------------------------------------------------------------------------------------------------------------- hashing
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16))
async function derive(secret, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits'])
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}
export async function hashSecret(secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { algo: 'pbkdf2-sha256', iterations: ITERATIONS, salt: toHex(salt), hash: await derive(secret, salt, ITERATIONS) }
}
const sameText = (a, b) => {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
export async function checkSecret(secret, stored) {
  if (!stored?.hash) return false
  return sameText(await derive(secret, fromHex(stored.salt), stored.iterations), stored.hash)
}

// ---------------------------------------------------------------------------------------------------------------- rules
const windowMs = (rec) => (Math.max(rec.autoLock, 60) + 30) * 1000
const isUnlocked = (rec, now) => !rec.enabled || (!!rec.unlock && rec.unlock.last > now - windowMs(rec))
const wait = (rec, now) => (rec.lockoutUntil > now ? Math.ceil((rec.lockoutUntil - now) / 1000) : 0)
const invalid = (message) => new AppError(message, { code: '22023' })
const locked = () => new AppError('LifeTrack is locked. Enter your PIN first.', { code: 'APP_LOCKED' })
const toState = (rec, now) => ({
  appLockEnabled: rec.enabled,
  pinLength: rec.pin?.length ?? null,
  pinSetAt: rec.pin?.setAt ?? null,
  autoLockSeconds: rec.autoLock,
  biometricEnabled: rec.biometric && rec.keys.length > 0,
  passkeyCount: rec.keys.length,
  locked: rec.enabled && !isUnlocked(rec, now),
  lockoutSeconds: wait(rec, now),
  failedAttempts: rec.failed,
  sessionId: 'this-browser',
})

/**
 * @param deps.endSession  ends the dev session (the real backend deletes the GoTrue session)
 * @param deps.now         clock, for tests
 */
export function createLocalSecurity({ endSession, now: clock = Date.now } = {}) {
  const uid = () => {
    const id = getUserId()
    if (!id) throw new AppError('Sign in again.', { code: '28000' })
    return id
  }
  const open = () => {
    const id = uid()
    return { id, rec: read(id), now: clock() }
  }
  const save = (id, rec) => write(id, rec)
  const requireUnlocked = () => {
    const c = open()
    if (!isUnlocked(c.rec, c.now)) throw locked()
    return c
  }
  const markUnlocked = (rec, now, method) => {
    rec.unlock = { at: now, last: now, method }
  }

  /** One more wrong try; mirrors _register_failure in the migration. */
  const registerFailure = async (c) => {
    c.rec.failed += 1
    const lockoutSeconds = lockoutSecondsAfter(c.rec.failed)
    if (lockoutSeconds) c.rec.lockoutUntil = c.now + lockoutSeconds * 1000
    const signedOut = revokesSession(c.rec.failed)
    if (signedOut) c.rec.unlock = null
    save(c.id, c.rec)
    if (signedOut) await endSession?.()
    return {
      ok: false,
      reason: 'wrong_pin',
      triesLeft: lockoutSeconds ? 0 : triesLeftBeforeLockout(c.rec.failed),
      lockoutSeconds,
      signedOut,
      failedAttempts: c.rec.failed,
    }
  }
  /** Mirrors _check_pin: lockout first (a right PIN is refused during it), then the hash. Never throws for a wrong PIN. */
  const checkPin = async (c, pin) => {
    if (!c.rec.enabled) return { ok: false, reason: 'not_enabled', triesLeft: null, lockoutSeconds: 0, signedOut: false, failedAttempts: 0 }
    const left = wait(c.rec, c.now)
    if (left) return { ok: false, reason: 'locked_out', triesLeft: 0, lockoutSeconds: left, signedOut: false, failedAttempts: c.rec.failed }
    if (typeof pin === 'string' && /^([0-9]{4}|[0-9]{6})$/.test(pin) && (await checkSecret(pin, c.rec.pin))) {
      c.rec.failed = 0
      c.rec.lockoutUntil = 0
      save(c.id, c.rec)
      return { ok: true, reason: null, triesLeft: null, lockoutSeconds: 0, signedOut: false, failedAttempts: 0 }
    }
    return registerFailure(c)
  }
  const checkNewPin = (pin) => {
    const v = validatePin(pin)
    if (!v.ok) throw invalid(v.reason)
  }
  const pinFor = async (pin) => ({ ...(await hashSecret(pin)), length: pin.length, setAt: new Date().toISOString() })

  // ------------------------------------------------------------------------------------------------ passkeys (in-memory challenges, like the table)
  const challenges = new Map() // challenge -> { uid, purpose, expires }
  const issue = (id, purpose, now) => {
    const challenge = wa.generateChallenge()
    for (const [k, v] of challenges) if (v.expires < now) challenges.delete(k)
    challenges.set(challenge, { uid: id, purpose, expires: now + CHALLENGE_MS })
    return challenge
  }
  const take = (id, purpose, challenge, now) => {
    const c = challenges.get(challenge)
    challenges.delete(challenge) // single use, whatever happens next
    return !!c && c.uid === id && c.purpose === purpose && c.expires > now
  }
  const rp = () => ({ rpId: location.hostname, origins: [location.origin] })
  const wrapVerify = async (fn) => {
    try {
      return await fn()
    } catch (e) {
      if (e?.name === 'WebAuthnError')
        throw Object.assign(new AppError('That fingerprint or face unlock was not accepted.', { code: 'not_accepted' }), {
          detail: { reason: e.code },
        })
      throw e
    }
  }

  return {
    // ---------------------------------------------------------------------------------------------- app lock
    async getState() {
      const c = open()
      return toState(c.rec, c.now)
    },
    async setPin(pin, { autoLockSeconds = null } = {}) {
      const c = open()
      checkNewPin(pin)
      if (autoLockSeconds != null && !isAutoLockSeconds(autoLockSeconds)) throw invalid('Choose one of the listed auto-lock times.')
      if (c.rec.enabled) throw new AppError('App lock is already on. Change the PIN instead.', { code: '55000' })
      Object.assign(c.rec, {
        enabled: true,
        pin: await pinFor(pin),
        autoLock: autoLockSeconds ?? c.rec.autoLock,
        failed: 0,
        lockoutUntil: 0,
      })
      markUnlocked(c.rec, c.now, 'setup')
      save(c.id, c.rec)
      return toState(c.rec, c.now)
    },
    async verifyPin(pin) {
      const c = open()
      const r = await checkPin(c, pin)
      if (r.ok) {
        markUnlocked(c.rec, c.now, 'pin')
        save(c.id, c.rec)
      }
      return r
    },
    async changePin(current, next) {
      const c = requireUnlocked()
      checkNewPin(next)
      if (next === current) throw invalid('Choose a PIN different from the current one.')
      const r = await checkPin(c, current)
      if (r.ok) {
        c.rec.pin = await pinFor(next)
        save(c.id, c.rec)
      }
      return r
    },
    async disableAppLock(pin) {
      const c = open()
      const r = await checkPin(c, pin)
      if (r.ok) {
        Object.assign(c.rec, { enabled: false, pin: null, biometric: false, failed: 0, lockoutUntil: 0, unlock: null })
        save(c.id, c.rec)
      }
      return r
    },
    /** "I forgot my PIN": only within 10 minutes of typing the password. `newPin = null` turns the app lock off. */
    async resetAppLock(newPin = null) {
      const c = open()
      if (!c.rec.loginAt || c.now - c.rec.loginAt > RESET_WINDOW_MS)
        throw new AppError('Sign in again with your password first.', { code: '42501' })
      if (newPin != null) checkNewPin(newPin)
      if (newPin == null) Object.assign(c.rec, { enabled: false, pin: null, biometric: false, failed: 0, lockoutUntil: 0, unlock: null })
      else {
        Object.assign(c.rec, { enabled: true, pin: await pinFor(newPin), failed: 0, lockoutUntil: 0 })
        markUnlocked(c.rec, c.now, 'password')
      }
      save(c.id, c.rec)
      return toState(c.rec, c.now)
    },
    async lock() {
      const c = open()
      if (c.rec.unlock) {
        c.rec.unlock = { ...c.rec.unlock, last: 0 } // a tombstone, like the real backend: "Lock now" then reload still asks for the PIN
        save(c.id, c.rec)
      }
    },
    async unlockAfterLogin() {
      const c = open()
      if (c.rec.enabled && !c.rec.unlock && c.rec.loginAt && c.now - c.rec.loginAt < FRESH_LOGIN_MS) {
        markUnlocked(c.rec, c.now, 'password')
        Object.assign(c.rec, { failed: 0, lockoutUntil: 0 })
        save(c.id, c.rec)
      }
      return toState(c.rec, c.now)
    },
    async touch() {
      const c = open()
      if (!isUnlocked(c.rec, c.now)) return false
      if (c.rec.enabled && c.rec.unlock) {
        c.rec.unlock.last = c.now
        save(c.id, c.rec)
      }
      return true
    },
    async setAutoLock(seconds) {
      const c = requireUnlocked()
      if (!isAutoLockSeconds(seconds)) throw invalid('Choose one of the listed auto-lock times.')
      c.rec.autoLock = seconds
      save(c.id, c.rec)
      return toState(c.rec, c.now)
    },
    async setBiometricEnabled(enabled) {
      const c = requireUnlocked()
      if (enabled && !c.rec.enabled) throw new AppError('Turn on the app lock first.', { code: '55000' })
      if (enabled && !c.rec.keys.length) throw new AppError('Add a fingerprint or face unlock first.', { code: '55000' })
      c.rec.biometric = !!enabled
      save(c.id, c.rec)
      return toState(c.rec, c.now)
    },

    // ---------------------------------------------------------------------------------------------- passkeys
    passkeys: {
      async available() {
        return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
      },
      async list() {
        const c = requireUnlocked()
        return c.rec.keys.map((k) => ({
          id: k.id,
          label: k.label,
          deviceType: k.deviceType,
          backedUp: k.backedUp,
          transports: k.transports,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        }))
      },
      async beginRegistration() {
        const c = requireUnlocked()
        if (!c.rec.enabled) throw new AppError('Turn on the app lock before adding a fingerprint or face unlock.', { code: '55000' })
        return wa.registrationOptions({
          rpId: rp().rpId,
          rpName: 'LifeTrack',
          user: { id: wa.b64uEncode(enc.encode(c.id)), name: 'LifeTrack (this browser)', displayName: 'LifeTrack' },
          challenge: issue(c.id, 'register', c.now),
          excludeCredentialIds: c.rec.keys.map((k) => k.credentialId),
        })
      },
      async finishRegistration({ credential, transports = [], label }) {
        const c = requireUnlocked()
        const challenge = wa.challengeOf(credential?.response?.clientDataJSON)
        if (!challenge || !take(c.id, 'register', challenge, c.now))
          throw new AppError('That took too long. Try adding it again.', { code: 'challenge_expired' })
        const reg = await wrapVerify(() => wa.verifyRegistration({ credential, expectedChallenge: challenge, ...rp() }))
        if (c.rec.keys.length >= 10)
          throw new AppError('You can register up to 10 fingerprint or face unlocks. Remove one first.', { code: '54000' })
        const key = {
          id: crypto.randomUUID(),
          credentialId: reg.credentialId,
          publicKeyJwk: reg.publicKeyJwk,
          alg: reg.alg,
          signCount: reg.signCount,
          transports: transports.slice(0, 6),
          label: (label ?? '').trim().slice(0, 60) || 'This device',
          deviceType: reg.deviceType,
          backedUp: reg.backedUp,
          createdAt: new Date(c.now).toISOString(),
          lastUsedAt: null,
        }
        if (!c.rec.keys.length && c.rec.enabled) c.rec.biometric = true
        c.rec.keys.push(key)
        save(c.id, c.rec)
        return key.id
      },
      async beginAuthentication() {
        const c = open()
        if (!c.rec.enabled || !c.rec.biometric || !c.rec.keys.length)
          throw new AppError('Fingerprint or face unlock is not turned on.', { code: 'biometric_off' })
        return wa.authenticationOptions({
          rpId: rp().rpId,
          challenge: issue(c.id, 'authenticate', c.now),
          credentialIds: c.rec.keys.map((k) => k.credentialId),
        })
      },
      async finishAuthentication(credential) {
        const c = open()
        if (!c.rec.enabled || !c.rec.biometric)
          throw new AppError('Fingerprint or face unlock is not turned on.', { code: 'biometric_off' })
        const challenge = wa.challengeOf(credential?.response?.clientDataJSON)
        if (!challenge || !take(c.id, 'authenticate', challenge, c.now))
          throw new AppError('That took too long. Try again.', { code: 'challenge_expired' })
        const key = c.rec.keys.find((k) => k.credentialId === credential.id)
        const reject = async (reason) => {
          const f = await registerFailure(c)
          throw Object.assign(new AppError('That fingerprint or face unlock was not accepted.', { code: 'not_accepted' }), {
            detail: { reason, lockout_seconds: f.lockoutSeconds, signed_out: f.signedOut },
          })
        }
        if (!key) return reject('unknown_credential')
        let result
        try {
          result = await wa.verifyAuthentication({
            credential,
            expectedChallenge: challenge,
            stored: { publicKeyJwk: key.publicKeyJwk, alg: key.alg, signCount: key.signCount },
            ...rp(),
          })
        } catch (e) {
          if (e?.name !== 'WebAuthnError') throw e
          return reject(e.code)
        }
        key.signCount = result.signCount
        key.lastUsedAt = new Date(c.now).toISOString()
        Object.assign(c.rec, { failed: 0, lockoutUntil: 0 })
        markUnlocked(c.rec, c.now, 'passkey')
        save(c.id, c.rec)
      },
      async rename(id, label) {
        const c = requireUnlocked()
        const name = (label ?? '').trim()
        if (name.length < 1 || name.length > 60) throw invalid('Give it a name of 1 to 60 characters.')
        const key = c.rec.keys.find((k) => k.id === id)
        if (!key) throw new AppError('That fingerprint or face unlock is not on your account.', { code: 'P0002' })
        key.label = name
        save(c.id, c.rec)
      },
      async remove(id) {
        const c = requireUnlocked()
        if (!c.rec.keys.some((k) => k.id === id))
          throw new AppError('That fingerprint or face unlock is not on your account.', { code: 'P0002' })
        c.rec.keys = c.rec.keys.filter((k) => k.id !== id)
        if (!c.rec.keys.length) c.rec.biometric = false
        save(c.id, c.rec)
        return toState(c.rec, c.now)
      },
    },

    // ---------------------------------------------------------------------------------------------- sessions
    // The dev backend has exactly one session: this browser.
    sessions: {
      async list() {
        const c = requireUnlocked()
        return [
          {
            id: 'this-browser',
            createdAt: new Date(c.rec.loginAt || c.now).toISOString(),
            lastActiveAt: new Date(c.rec.unlock?.last || c.now).toISOString(),
            userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
            ip: '',
            current: true,
            unlocked: true,
            trusted: false,
          },
        ]
      },
      async revoke() {
        requireUnlocked()
        await endSession?.()
      },
      async trust() {
        throw new AppError('The dev backend has only this browser, so there is no other device to trust.', { code: '22023' })
      },
      async untrust() {},
      async signOutOthers() {},
      async signOutEverywhere() {
        await endSession?.()
      },
    },
  }
}

/** Called by the dev sign-in after the password checked out: starts a fresh "session" (so the app opens without the PIN). */
export function markLogin(userId, now = Date.now()) {
  const rec = read(userId)
  rec.loginAt = now
  rec.unlock = null
  write(userId, rec)
}
/** Removes everything stored for a user (account deletion). */
export const wipeSecurity = (userId) => localStorage.removeItem(KEY(userId))
