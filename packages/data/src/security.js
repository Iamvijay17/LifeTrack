import { AppError, toAppError } from './errors'

// Client for the security functions in supabase/migrations/0012_security.sql and the `webauthn` Edge Function. Shared by the web app and the
// future mobile apps. It holds NO secrets and makes NO decisions: the PIN is hashed and checked in the database, passkey signatures are checked
// in the Edge Function, and "locked" is whatever the database says. The functions below only carry requests and translate the answers.

// SQLSTATEs the security functions raise on purpose; their messages are written for people, so pass them through (toAppError would
// replace, for example, 42501 with a generic "permission" message).
const OWN_CODES = new Set(['22023', '55000', '54000', 'P0002', '28000', '42501'])
const fromDb = (error) => {
  // The database has not had supabase/migrations/0012_security.sql run on it yet (PostgREST: function not in the schema cache / undefined function).
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new AppError(
      'Security features are not installed in your database yet. Run supabase/migrations/0012_security.sql in the SQL Editor.',
      { code: 'NOT_INSTALLED', cause: error },
    )
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

/**
 * @param supabase  the injected Supabase client (the user's session; never a service key)
 * @param options   { functionName } of the passkey Edge Function
 */
export const createSupabaseSecurity = (supabase, { functionName = 'webauthn' } = {}) => {
  const rpc = async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw fromDb(error)
    return data
  }

  /** Calls the Edge Function. Its 4xx answers carry { error, message, … } which the UI needs (lockout seconds, "expired", …). */
  const edge = async (body) => {
    let res
    try {
      res = await supabase.functions.invoke(functionName, { body })
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
    /** After the user signed in again with their password. `newPin = null` turns the app lock off instead. */
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
