import { enrollMessage, unlockMessage } from '@lifetrack/core/devicekey'
import { b64uDecode, b64uEncode } from '@lifetrack/core/webauthn'
import { generateKeyPair, signMessage, type DevicePublicJwk } from './ecdsa'

// Fingerprint / face unlock for the app lock (docs/APP_SECURITY.md §9).
//
// The phone holds an EC P-256 private key that the OPERATING SYSTEM releases only after a biometric check. The server holds the public half and, to unlock,
// verifies a signature over a one-time challenge (the `device-key` Edge Function). Nothing in here can unlock anything by itself: the app never tells the
// server "the biometric check passed", it can only present a signature that the server checks.
//
//   Android  expo-secure-store seals the key under an Android Keystore AES key created with setUserAuthenticationRequired(true) (invalidated by a new
//            fingerprint), and reads it back through BiometricPrompt with a CryptoObject. Reading without a fingerprint is not possible, even for this app.
//   iOS      the key is a Keychain item with the "biometry current set" access control: Face ID / Touch ID (LocalAuthentication) must succeed to read it,
//            and adding a finger or face destroys the item.
//
// What this does NOT give: a key that can never leave the secure hardware. The secret is in this app's memory for the moment it signs (the signature is
// computed in JavaScript, see ecdsa.ts). The server contract is the same for a hardware-resident key, so one can replace this later without a server change.
// expo-local-authentication tells us what the phone can do (sensor, enrolled biometrics, strength); expo-secure-store shows the prompt that releases the key.

export const BIOMETRIC_STRONG = 3 // expo-local-authentication SecurityLevel.BIOMETRIC_STRONG: what the Keystore key needs on Android
const SERVICE = 'lifetrack.devicekey'

/** What expo-secure-store offers, as far as this file uses it (so tests can stand in for it). */
export interface SecretStore {
  getItemAsync(key: string, options?: Record<string, unknown>): Promise<string | null>
  setItemAsync(key: string, value: string, options?: Record<string, unknown>): Promise<void>
  deleteItemAsync(key: string, options?: Record<string, unknown>): Promise<void>
}
/** What expo-local-authentication offers, as far as this file uses it. */
export interface BiometricProbe {
  hasHardwareAsync(): Promise<boolean>
  isEnrolledAsync(): Promise<boolean>
  supportedAuthenticationTypesAsync(): Promise<number[]>
  getEnrolledLevelAsync(): Promise<number>
}
/** The `device-key` Edge Function and the list / rename / remove functions, as createSupabaseSecurity(...).deviceKeys exposes them. */
export interface DeviceKeyApi {
  available(): Promise<boolean>
  list(): Promise<{ id: string; label: string; platform: string; createdAt: string; lastUsedAt: string | null }[]>
  beginEnrollment(): Promise<{ challenge: string }>
  finishEnrollment(a: { challenge: string; publicKeyJwk: DevicePublicJwk; signature: string; label: string; platform: string }): Promise<string>
  beginUnlock(keyId: string): Promise<{ challenge: string; keyId: string }>
  finishUnlock(a: { keyId: string; challenge: string; counter: number; signature: string }): Promise<void>
  rename(id: string, label: string): Promise<void>
  remove(id: string): Promise<void>
}

export type Platform = 'android' | 'ios'
export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'biometrics'
export interface BiometricSupport { available: boolean; kind: BiometricKind; label: string; reason: string | null }

/** What the person calls it: Face ID and Touch ID on an iPhone, "Face unlock" and "Fingerprint" on Android. */
export function biometricLabel(kind: BiometricKind, platform: Platform): string {
  if (kind === 'face') return platform === 'ios' ? 'Face ID' : 'Face unlock'
  if (kind === 'fingerprint') return platform === 'ios' ? 'Touch ID' : 'Fingerprint'
  if (kind === 'iris') return 'Iris unlock'
  return 'Biometrics'
}
/** AuthenticationType: 1 fingerprint, 2 facial recognition, 3 iris. An iPhone has one or the other; on Android the fingerprint prompt is the dependable one. */
export function pickKind(types: number[], platform: Platform): BiometricKind {
  const has = (t: number) => types.includes(t)
  if (platform === 'ios') return has(2) ? 'face' : has(1) ? 'fingerprint' : 'biometrics'
  return has(1) ? 'fingerprint' : has(2) ? 'face' : has(3) ? 'iris' : 'biometrics'
}

interface Meta { kid: string; counter: number; broken?: string }

export interface UnlockFailure {
  ok: false
  /** The person dismissed the prompt: say nothing, leave the PIN pad ready. */
  cancelled: boolean
  message: string
  /** Seconds PIN entry is locked for, when the server says so. */
  lockoutSeconds: number
  /** The server ended this session (too many failures): the app must sign out. */
  signedOut: boolean
  /** Fingerprint / face unlock cannot be used on this phone any more (removed, or the phone's biometrics changed): stop offering it. */
  gone: boolean
}
export type UnlockResult = { ok: true } | UnlockFailure
export type EnrollResult = { ok: true; id: string } | { ok: false; cancelled: true }

export interface DeviceKeyDeps {
  api: DeviceKeyApi
  store: SecretStore
  probe: BiometricProbe
  platform: Platform
  /** The operating system's CSPRNG (expo-crypto getRandomBytes). */
  random: (bytes: number) => Uint8Array
  /** Wraps every system biometric prompt, so the app does not mistake it for "the person left the app" and lock itself. */
  hold?: <T>(fn: () => Promise<T>) => Promise<T>
  /** Names the phone in the list of devices. */
  deviceName?: () => string | null
}

const failure = (over: Partial<UnlockFailure> & { message: string }): UnlockFailure => ({ ok: false, cancelled: false, lockoutSeconds: 0, signedOut: false, gone: false, ...over })
const messageOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : '')
const codeOf = (e: unknown) => (e as { code?: string } | null)?.code
const detailOf = (e: unknown) => (e as { detail?: { reason?: string; lockout_seconds?: number; signed_out?: boolean } } | null)?.detail

const GONE_REASONS = ['counter_regressed', 'bad_signature', 'unknown_credential']
const SETUP_AGAIN = 'Fingerprint and face unlock on this phone needs to be set up again. Use your PIN for now.'

export function createDeviceKeys(deps: DeviceKeyDeps) {
  const { api, store, probe, platform } = deps
  const hold = deps.hold ?? (<T,>(fn: () => Promise<T>) => fn())
  const names = (userId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Sign in again to use fingerprint or face unlock.')
    return { secret: `lifetrack.dk.${userId}.secret`, meta: `lifetrack.dk.${userId}.meta` }
  }
  const plain = { keychainService: SERVICE }
  const sealed = (prompt: string) => ({ keychainService: SERVICE, requireAuthentication: true, authenticationPrompt: prompt })
  let busy = false

  async function readMeta(userId: string): Promise<Meta | null> {
    try {
      const raw = await store.getItemAsync(names(userId).meta, plain)
      const m = raw ? JSON.parse(raw) : null
      return m && typeof m.kid === 'string' && Number.isSafeInteger(m.counter) && m.counter >= 0 ? m : null
    } catch {
      return null
    }
  }
  const writeMeta = (userId: string, m: Meta) => store.setItemAsync(names(userId).meta, JSON.stringify(m), plain)
  /** Removes the sealed key and the bookkeeping from this phone (never touches the server). */
  async function forget(userId: string) {
    const n = names(userId)
    await store.deleteItemAsync(n.secret, plain).catch(() => {}) // deleting never asks for a fingerprint, and removes the sealed variant too
    await store.deleteItemAsync(n.meta, plain).catch(() => {})
  }

  return {
    /** Can this phone do it? Asks the sensors and the enrolled biometrics, and whether they are strong enough for the key store. */
    async support(): Promise<BiometricSupport> {
      const no = (reason: string): BiometricSupport => ({ available: false, kind: 'biometrics', label: 'Biometrics', reason })
      try {
        if (!(await probe.hasHardwareAsync())) return no('This phone has no fingerprint or face sensor.')
        if (!(await probe.isEnrolledAsync())) return no('Add a fingerprint or face in your phone’s settings first.')
        const kind = pickKind(await probe.supportedAuthenticationTypesAsync(), platform)
        // Android's key store only releases a key to a STRONG biometric (class 3). Some phones’ face unlock is weaker: it would fail at the first use.
        if (platform === 'android' && (await probe.getEnrolledLevelAsync().catch(() => BIOMETRIC_STRONG)) < BIOMETRIC_STRONG) {
          return no('This phone’s face unlock is not strong enough for LifeTrack. A fingerprint works, or use your PIN.')
        }
        return { available: true, kind, label: biometricLabel(kind, platform), reason: null }
      } catch {
        return no('Could not check the biometrics on this phone.')
      }
    },

    /** Is a key sealed on this phone for this user? `broken` = it was marked unusable and waits to be tidied away. */
    async localState(userId: string) {
      const m = await readMeta(userId)
      return { enrolled: !!m && !m.broken, broken: !!m?.broken, keyId: m?.kid ?? null }
    },

    /**
     * Adds this phone. Needs an UNLOCKED session with the app lock on (the server refuses otherwise). Generates the key, seals it behind the biometrics,
     * proves to the server that this phone holds it (a signature over a fresh challenge), and keeps only the id the server gives back.
     * Resolves { ok: false, cancelled } when the person dismisses the fingerprint prompt; rejects with a readable message for anything else.
     */
    async enroll(userId: string, { label }: { label?: string } = {}): Promise<EnrollResult> {
      const n = names(userId)
      if (busy) return { ok: false, cancelled: true }
      busy = true
      let sealedNow = false
      let secretKey: Uint8Array | null = null
      try {
        const support = await this.support()
        if (!support.available) throw new Error(support.reason ?? 'Fingerprint and face unlock is not available on this phone.')
        const { challenge } = await api.beginEnrollment() // refused here when the session is locked or the app lock is off
        const pair = await generateKeyPair(deps.random(48))
        secretKey = pair.secretKey
        const prompt = `Turn on ${support.label} for LifeTrack`
        await hold(() => store.setItemAsync(n.secret, b64uEncode(secretKey!), sealed(prompt))) // Android asks for the fingerprint here; iOS asks when it reads
        sealedNow = true
        // iOS adds a Keychain item without asking. Read it back, so the person proves the sensor works NOW and a broken setup fails here, not at the lock screen.
        if (platform === 'ios') {
          const back = await hold(() => store.getItemAsync(n.secret, sealed(prompt)))
          if (!back) throw new Error('This phone would not keep the key. Check that Face ID or Touch ID is set up, then try again.')
        }
        const signature = await signMessage(secretKey, enrollMessage({ challenge, publicKeyJwk: pair.publicKeyJwk }))
        const id = await api.finishEnrollment({ challenge, publicKeyJwk: pair.publicKeyJwk, signature, label: (label ?? deps.deviceName?.() ?? '').trim() || 'This phone', platform })
        await writeMeta(userId, { kid: id, counter: 0 })
        return { ok: true, id }
      } catch (e) {
        if (sealedNow) await forget(userId) // nothing half-made is left behind
        if (/cancel/i.test(messageOf(e))) return { ok: false, cancelled: true }
        throw e
      } finally {
        secretKey?.fill(0)
        busy = false
      }
    },

    /**
     * Unlocks the session with this phone's key. The sealed secret is released by the operating system only after a fingerprint or face check; the
     * signature goes to the server, which decides. Never throws: every outcome is a result the lock screen can show.
     */
    async unlock(userId: string): Promise<UnlockResult> {
      if (busy) return failure({ cancelled: true, message: '' })
      busy = true
      let secretKey: Uint8Array | null = null
      try {
        const n = names(userId)
        const meta = await readMeta(userId)
        if (!meta || meta.broken) return failure({ gone: true, message: SETUP_AGAIN })
        let options
        try {
          options = await api.beginUnlock(meta.kid)
        } catch (e) {
          if (codeOf(e) === 'unknown_key') {
            await forget(userId) // removed from another device, or the lock was turned off meanwhile
            return failure({ gone: true, message: messageOf(e) })
          }
          return failure({ message: messageOf(e) || 'Could not reach the server. Use your PIN.' })
        }
        // The counter goes up BEFORE signing and is saved first, so a number is never used twice even if this request is lost.
        const counter = meta.counter + 1
        await writeMeta(userId, { ...meta, counter })
        let secret: string | null
        try {
          secret = await hold(() => store.getItemAsync(n.secret, sealed('Unlock LifeTrack')))
        } catch (e) {
          if (/cancel/i.test(messageOf(e))) return failure({ cancelled: true, message: '' })
          if (/lockout/i.test(messageOf(e))) return failure({ message: 'Too many tries on the sensor. Use your PIN, or wait a moment.' })
          return failure({ message: 'That did not work. Try again, or use your PIN.' })
        }
        if (!secret) {
          // The key store lost it: the phone’s fingerprints or face changed (by design that destroys the key), or the app was restored from a backup.
          await writeMeta(userId, { ...meta, counter, broken: 'invalidated' })
          return failure({ gone: true, message: 'Your fingerprints or face changed on this phone, so fingerprint and face unlock was turned off. Use your PIN, then set it up again in Security.' })
        }
        secretKey = b64uDecode(secret)
        const signature = await signMessage(secretKey, unlockMessage({ challenge: options.challenge, keyId: meta.kid, counter }))
        try {
          await api.finishUnlock({ keyId: meta.kid, challenge: options.challenge, counter, signature })
          return { ok: true }
        } catch (e) {
          const d = detailOf(e)
          const out = { lockoutSeconds: d?.lockout_seconds ?? 0, signedOut: !!d?.signed_out }
          if (codeOf(e) === 'unknown_key') {
            await forget(userId)
            return failure({ gone: true, message: messageOf(e), ...out })
          }
          if (codeOf(e) === 'not_accepted' && GONE_REASONS.includes(d?.reason ?? '')) {
            // The server and this phone disagree about the key or its counter: re-enrol rather than keep failing (every try counts against the PIN).
            await writeMeta(userId, { ...meta, counter, broken: d?.reason ?? 'refused' })
            return failure({ gone: true, message: SETUP_AGAIN, ...out })
          }
          return failure({ message: messageOf(e) || 'That did not work. Use your PIN.', ...out })
        }
      } catch (e) {
        return failure({ message: messageOf(e) || 'That did not work. Use your PIN.' })
      } finally {
        secretKey?.fill(0)
        busy = false
      }
    },

    /**
     * Compares this phone with the account's list of phones (call it once the session is unlocked): a key that was removed elsewhere, or marked unusable
     * here, is cleaned away on both sides.
     */
    async reconcile(userId: string, serverKeys: { id: string }[]) {
      const m = await readMeta(userId)
      if (!m) return
      const onServer = serverKeys.some((k) => k.id === m.kid)
      if (m.broken) {
        if (onServer) await api.remove(m.kid).catch(() => {})
        return forget(userId)
      }
      if (!onServer) return forget(userId)
    },

    /** Turns it off for this phone: removes it from the account first (so it cannot linger there), then from the phone. */
    async disable(userId: string) {
      const m = await readMeta(userId)
      if (m) {
        try {
          await api.remove(m.kid)
        } catch (e) {
          if (codeOf(e) !== 'P0002') throw e // "not on your account" means it is already gone: carry on
        }
      }
      await forget(userId)
    },

    forget,
  }
}
export type DeviceKeys = ReturnType<typeof createDeviceKeys>
