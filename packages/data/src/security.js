import { AppError, toAppError } from './errors'

// Client for the security functions in supabase/migrations/0012_security.sql (+ 0014_device_keys.sql) and the `webauthn` and `device-key` Edge Functions.
// Shared by the web app and the mobile app. It holds NO secrets and makes NO decisions: the PIN is hashed and checked in the database, passkey and
// phone-key signatures are checked in the Edge Functions, and "locked" is whatever the database says. The functions below only carry requests and
// translate the answers.

// SQLSTATEs the security functions raise on purpose; their messages are written for people, so pass them through (toAppError would
// replace, for example, 42501 with a generic "permission" message).
const OWN_CODES = new Set(['22023', '55000', '54000', 'P0002', '28000', '42501'])
const fromDb = (error, migration = '0012_security.sql') => {
  // The database has not had the migration run on it yet (PostgREST: function not in the schema cache / undefined function).
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new AppError(`Security features are not installed in your database yet. Run supabase/migrations/${migration} in the SQL Editor.`, {
      code: 'NOT_INSTALLED',
      cause: error,
    })
  }
  if (OWN_CODES.has(error?.code) && typeof error.message === 'string' && error.message.length < 200) {
    return new AppError(error.message, {
      code: error.code === '42501' && /locked/i.test(error.message) ? 'APP_LOCKED' : error.code,
      cause: error,
    })
  }
  return toAppError(error)
}

/** Is this error "migration 0012 has not been run"? The app then simply has no app lock, exactly as before the feature existed. */
export const isNotInstalled = (e) => e?.code === 'NOT_INSTALLED'

/** Is this error "you are not signed in / your session has ended"? The app answers it by signing out. */
export const isSessionEnded = (e) => e?.code === '28000'

/** Is this error "the app is locked"? The UI answers it by showing the lock screen. */
export const isLockedError = (e) => e?.code === 'APP_LOCKED'

export const normalizeState = (s = {}) => ({
  appLockEnabled: !!s.app_lock_enabled,
  pinLength: s.pin_length ?? null,
  pinSetAt: s.pin_set_at ?? null,
  autoLockSeconds: s.auto_lock_seconds ?? 300,
  biometricEnabled: !!s.biometric_enabled,
  passkeyCount: s.passkey_count ?? 0,
  locked: !!s.locked,
  // Module locks (migration 0015). A database without it answers neither field: the lock then covers the whole app, as it always did.
  moduleLocksSupported: s.lock_scope !== undefined,
  lockScope: s.lock_scope === 'modules' ? 'modules' : 'app',
  lockedModules: Array.isArray(s.locked_modules) ? s.locked_modules : [],
  // Is THIS session unlocked right now? (With the whole-app lock the page only ever runs while it is; with module locks it is the module gate.)
  sessionUnlocked: s.session_unlocked ?? !s.locked,
  lockoutSeconds: s.lockout_seconds ?? 0,
  failedAttempts: s.failed_attempts ?? 0,
  sessionId: s.session_id ?? null,
})
export const normalizePin = (r = {}) => ({
  ok: !!r.ok,
  reason: r.reason ?? null, // 'wrong_pin' | 'locked_out' | 'not_enabled'
  triesLeft: r.tries_left ?? null,
  lockoutSeconds: r.lockout_seconds ?? 0,
  signedOut: !!r.signed_out,
  failedAttempts: r.failed_attempts ?? 0,
})

const DEVICE_KEYS_MIGRATION = '0014_device_keys.sql'

/**
 * @param supabase  the injected Supabase client (the user's session; never a service key)
 * @param options   { functionName } of the passkey Edge Function (web), { deviceFunctionName } of the phone-key Edge Function (mobile)
 */
export const createSupabaseSecurity = (supabase, { functionName = 'webauthn', deviceFunctionName = 'device-key' } = {}) => {
  const rpc = async (fn, args, migration) => {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw fromDb(error, migration)
    return data
  }

  /** Calls an Edge Function. Its 4xx answers carry { error, message, … } which the UI needs (lockout seconds, "expired", …). */
  const callEdge = async (name, body) => {
    let res
    try {
      res = await supabase.functions.invoke(name, { body })
    } catch (e) {
      throw toAppError(e)
    }
    if (!res.error) return res.data
    let payload = null
    try {
      payload = await res.error.context?.json?.()
    } catch {
      /* not JSON */
    }
    if (payload?.error)
      throw Object.assign(new AppError(payload.message ?? 'That did not work.', { code: payload.error }), { detail: payload })
    throw new AppError("Can't reach fingerprint and face unlock right now. Use your PIN instead.", {
      code: 'unreachable',
      isNetwork: true,
      cause: res.error,
    })
  }
  const edge = (body) => callEdge(functionName, body)
  const deviceEdge = (body) => callEdge(deviceFunctionName, body)

  return {
    // ---------------------------------------------------------------- app lock
    async getState() {
      return normalizeState(await rpc('security_state'))
    },
    async setPin(pin, { autoLockSeconds = null } = {}) {
      return normalizeState(await rpc('set_pin', { p_pin: pin, p_auto_lock_seconds: autoLockSeconds }))
    },
    async verifyPin(pin) {
      return normalizePin(await rpc('verify_pin', { p_pin: pin }))
    },
    async changePin(current, next) {
      return normalizePin(await rpc('change_pin', { p_current: current, p_new: next }))
    },
    async disableAppLock(pin) {
      return normalizePin(await rpc('disable_app_lock', { p_pin: pin }))
    },
    /**
     * After the user signed in again with their password. `newPin = null` turns the app lock off instead.
     * @param {string | null} [newPin]
     */
    async resetAppLock(newPin = null) {
      return normalizeState(await rpc('reset_app_lock', { p_new_pin: newPin }))
    },
    /** Right after a password sign-in: opens the brand-new session without asking for the PIN (the server decides if it is eligible). Resolves to the state. */
    async unlockAfterLogin() {
      return normalizeState(await rpc('unlock_after_login'))
    },
    async lock() {
      await rpc('lock_app')
    },
    /** Heartbeat while the user is active. Resolves to whether the session is still unlocked. */
    async touch() {
      return !!(await rpc('touch_unlock'))
    },
    async setAutoLock(seconds) {
      return normalizeState(await rpc('set_auto_lock', { p_seconds: seconds }))
    },
    /** Lock the whole app (`scope = 'app'`) or only the chosen modules (`'modules'`). Needs an unlocked session. */
    async setLockModules(scope, modules = []) {
      try {
        return normalizeState(await rpc('set_lock_modules', { p_scope: scope, p_modules: modules }))
      } catch (e) {
        // `rpc` reports a missing function as "0012 not run"; here the likelier truth is that 0015 has not been.
        if (isNotInstalled(e))
          throw new AppError('Module locks are not installed in your database yet. Run supabase/migrations/0015_module_locks.sql in the SQL Editor.', { code: 'MODULE_LOCKS_NOT_INSTALLED', cause: e })
        throw e
      }
    },
    async setBiometricEnabled(enabled) {
      return normalizeState(await rpc('set_biometric_enabled', { p_enabled: !!enabled }))
    },

    // ---------------------------------------------------------------- passkeys (web: WebAuthn)
    passkeys: {
      /** Can this server do fingerprint / face unlock? False when the function is not deployed or not configured. */
      async available() {
        try {
          return !!(await edge({ action: 'capabilities' }))?.available
        } catch {
          return false
        }
      },
      async list() {
        const rows = await rpc('list_passkeys')
        return (rows ?? []).map((k) => ({
          id: k.id,
          label: k.label,
          deviceType: k.device_type,
          backedUp: !!k.backed_up,
          transports: k.transports ?? [],
          createdAt: k.created_at,
          lastUsedAt: k.last_used_at,
        }))
      },
      /** → options for navigator.credentials.create() (base64url strings, not yet buffers) */
      async beginRegistration() {
        return (await edge({ action: 'register-options' })).options
      },
      /** `credential` is the browser's response as JSON; `label` names the device in the list. */
      async finishRegistration({ credential, transports, label }) {
        return (await edge({ action: 'register-verify', credential, transports, label })).id
      },
      async beginAuthentication() {
        return (await edge({ action: 'authenticate-options' })).options
      },
      async finishAuthentication(credential) {
        await edge({ action: 'authenticate-verify', credential })
      },
      async rename(id, label) {
        await rpc('rename_passkey', { p_id: id, p_label: label })
      },
      async remove(id) {
        return normalizeState(await rpc('remove_passkey', { p_id: id }))
      },
    },

    // ---------------------------------------------------------------- device keys (mobile: the phone's own biometrics)
    // The app holds an EC P-256 key that the operating system releases only after a fingerprint or face check. These calls carry its public half and its
    // signatures to the `device-key` Edge Function, which is what unlocks the session: the app never claims "the biometric check passed".
    deviceKeys: {
      /** Can this server do fingerprint / face unlock for phones? False when the function is not deployed or cannot be reached. */
      async available() {
        try {
          return !!(await deviceEdge({ action: 'capabilities' }))?.available
        } catch {
          return false
        }
      },
      /** The phones enrolled on this account (needs an unlocked session). No key material is ever returned. */
      async list() {
        const rows = await rpc('list_device_keys', undefined, DEVICE_KEYS_MIGRATION)
        return (rows ?? []).map((k) => ({ id: k.id, label: k.label, platform: k.platform, createdAt: k.created_at, lastUsedAt: k.last_used_at }))
      },
      /** → { challenge, algorithm, context }: a one-time challenge the new key must sign (needs an unlocked session). */
      async beginEnrollment() {
        return (await deviceEdge({ action: 'enroll-options' })).options
      },
      /** `signature` is base64url DER over the enrolment message; resolves to the id the server gave the key. */
      async finishEnrollment({ challenge, publicKeyJwk, signature, label, platform }) {
        return (await deviceEdge({ action: 'enroll-verify', challenge, publicKeyJwk, signature, label, platform })).id
      },
      /** → { challenge, keyId, context}. Rejects with code 'unknown_key' when this phone's key is no longer on the account. */
      async beginUnlock(keyId) {
        return (await deviceEdge({ action: 'unlock-options', keyId })).options
      },
      /** Resolves when the session is unlocked; otherwise rejects with the server's reason (`detail.lockout_seconds`, `detail.signed_out`). */
      async finishUnlock({ keyId, challenge, counter, signature }) {
        await deviceEdge({ action: 'unlock-verify', keyId, challenge, counter, signature })
      },
      async rename(id, label) {
        await rpc('rename_device_key', { p_id: id, p_label: label }, DEVICE_KEYS_MIGRATION)
      },
      async remove(id) {
        await rpc('remove_device_key', { p_id: id }, DEVICE_KEYS_MIGRATION)
      },
    },

    // ---------------------------------------------------------------- sessions
    sessions: {
      async list() {
        const rows = await rpc('list_my_sessions')
        return (rows ?? []).map((s) => ({
          id: s.id,
          createdAt: s.created_at,
          lastActiveAt: s.updated_at,
          userAgent: s.user_agent ?? '',
          ip: s.ip ?? '',
          current: !!s.is_current,
          unlocked: !!s.unlocked,
          trusted: !!s.trusted,
        }))
      },
      async revoke(id) {
        await rpc('revoke_session', { p_id: id })
      },
      /** Lets ANOTHER device skip the PIN (for an app with no lock screen of its own). Needs an unlocked session. */
      async trust(id) {
        await rpc('trust_session', { p_id: id })
      },
      /** Takes that back: the device is asked for the PIN again. */
      async untrust(id) {
        await rpc('untrust_session', { p_id: id })
      },
      /** Every device except this one. */
      async signOutOthers() {
        const { error } = await supabase.auth.signOut({ scope: 'others' })
        if (error) throw toAppError(error)
      },
      /** Every device including this one. */
      async signOutEverywhere() {
        const { error } = await supabase.auth.signOut({ scope: 'global' })
        if (error) throw toAppError(error)
      },
    },
  }
}
