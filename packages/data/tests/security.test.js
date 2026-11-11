import { describe, expect, it, vi } from 'vitest'
import {
  createSupabaseAuth,
  createSupabaseSecurity,
  isLockedError,
  isNotInstalled,
  isSessionEnded,
  normalizePin,
  normalizeState,
} from '../src'

const mk = ({
  rpc = async () => ({ data: null, error: null }),
  invoke = async () => ({ data: null, error: null }),
  signOut = async () => ({ error: null }),
} = {}) => ({
  rpc: vi.fn(rpc),
  functions: { invoke: vi.fn(invoke) },
  auth: { signOut: vi.fn(signOut) },
})
const dbError = (message, code) => ({ data: null, error: { message, code } })
const httpError = (payload) => ({
  data: null,
  error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { json: async () => payload } },
})

describe('state and PIN answers', () => {
  it('turns the database row into the shape the apps use, with safe defaults', () => {
    expect(
      normalizeState({
        app_lock_enabled: true,
        pin_length: 6,
        auto_lock_seconds: 900,
        biometric_enabled: true,
        passkey_count: 2,
        locked: true,
        lockout_seconds: 30,
        failed_attempts: 5,
        session_id: 's',
      }),
    ).toEqual({
      appLockEnabled: true,
      pinLength: 6,
      pinSetAt: null,
      autoLockSeconds: 900,
      biometricEnabled: true,
      passkeyCount: 2,
      locked: true,
      lockoutSeconds: 30,
      failedAttempts: 5,
      sessionId: 's',
    })
    expect(normalizeState()).toMatchObject({
      appLockEnabled: false,
      locked: false,
      autoLockSeconds: 300,
      passkeyCount: 0,
      lockoutSeconds: 0,
    })
    expect(normalizePin({ ok: false, reason: 'wrong_pin', tries_left: 3, failed_attempts: 2 })).toEqual({
      ok: false,
      reason: 'wrong_pin',
      triesLeft: 3,
      lockoutSeconds: 0,
      signedOut: false,
      failedAttempts: 2,
    })
    expect(normalizePin({ ok: true })).toMatchObject({ ok: true, reason: null, triesLeft: null })
  })
})

describe('app lock calls', () => {
  it('send the PIN to the database function and nothing else, and read back the answer', async () => {
    const sb = mk({
      rpc: async (fn) => ({ data: fn === 'verify_pin' ? { ok: true } : { locked: false, app_lock_enabled: true }, error: null }),
    })
    const s = createSupabaseSecurity(sb)
    expect(await s.verifyPin('2486')).toMatchObject({ ok: true })
    expect(sb.rpc).toHaveBeenLastCalledWith('verify_pin', { p_pin: '2486' })
    expect(await s.setPin('2486', { autoLockSeconds: 900 })).toMatchObject({ appLockEnabled: true })
    expect(sb.rpc).toHaveBeenLastCalledWith('set_pin', { p_pin: '2486', p_auto_lock_seconds: 900 })
    await s.setPin('2486')
    expect(sb.rpc).toHaveBeenLastCalledWith('set_pin', { p_pin: '2486', p_auto_lock_seconds: null })
    await s.changePin('2486', '7319')
    expect(sb.rpc).toHaveBeenLastCalledWith('change_pin', { p_current: '2486', p_new: '7319' })
    await s.disableAppLock('2486')
    expect(sb.rpc).toHaveBeenLastCalledWith('disable_app_lock', { p_pin: '2486' })
    await s.resetAppLock()
    expect(sb.rpc).toHaveBeenLastCalledWith('reset_app_lock', { p_new_pin: null })
    await s.setAutoLock(60)
    expect(sb.rpc).toHaveBeenLastCalledWith('set_auto_lock', { p_seconds: 60 })
    await s.setBiometricEnabled(1)
    expect(sb.rpc).toHaveBeenLastCalledWith('set_biometric_enabled', { p_enabled: true })
  })
  it('heartbeat says whether the session is still unlocked', async () => {
    expect(await createSupabaseSecurity(mk({ rpc: async () => ({ data: true, error: null }) })).touch()).toBe(true)
    expect(await createSupabaseSecurity(mk({ rpc: async () => ({ data: false, error: null }) })).touch()).toBe(false)
  })
  it('lock() and getState() call the right functions', async () => {
    const sb = mk({ rpc: async () => ({ data: { locked: true }, error: null }) })
    const s = createSupabaseSecurity(sb)
    expect((await s.getState()).locked).toBe(true)
    await s.lock()
    expect(sb.rpc.mock.calls.map((c) => c[0])).toEqual(['security_state', 'lock_app'])
  })
})

describe('errors', () => {
  it("keep the database's own wording and recognise a locked app", async () => {
    const locked = createSupabaseSecurity(mk({ rpc: async () => dbError('LifeTrack is locked. Enter your PIN first.', '42501') }))
    const e = await locked.sessions.list().catch((x) => x)
    expect(e.message).toBe('LifeTrack is locked. Enter your PIN first.')
    expect(isLockedError(e)).toBe(true)
    const weak = createSupabaseSecurity(mk({ rpc: async () => dbError('Avoid straight runs like 1234 or 4321.', '22023') }))
    const w = await weak.setPin('1234').catch((x) => x)
    expect(w.message).toBe('Avoid straight runs like 1234 or 4321.')
    expect(isLockedError(w)).toBe(false)
  })
  it('a plain permission error stays a permission error', async () => {
    const e = await createSupabaseSecurity(mk({ rpc: async () => dbError('permission denied for table x', '42501') }))
      .getState()
      .catch((x) => x)
    expect(isLockedError(e)).toBe(false)
  })
  it('hides raw server text it does not recognise, and reports being offline', async () => {
    const odd = await createSupabaseSecurity(mk({ rpc: async () => dbError('x'.repeat(500), 'XX000') }))
      .getState()
      .catch((x) => x)
    expect(odd.message).toMatch(/Something went wrong/)
    const off = await createSupabaseSecurity(mk({ rpc: async () => dbError('Failed to fetch', undefined) }))
      .getState()
      .catch((x) => x)
    expect(off.isNetwork).toBe(true)
  })
})

describe('passkeys', () => {
  it('lists keys without any key material, and renames / removes through the database', async () => {
    const sb = mk({
      rpc: async (fn) => ({
        data:
          fn === 'list_passkeys'
            ? [
                {
                  id: 'k1',
                  label: 'MacBook',
                  device_type: 'multiDevice',
                  backed_up: true,
                  transports: ['internal'],
                  created_at: 'c',
                  last_used_at: null,
                },
              ]
            : { passkey_count: 0 },
        error: null,
      }),
    })
    const p = createSupabaseSecurity(sb).passkeys
    expect(await p.list()).toEqual([
      { id: 'k1', label: 'MacBook', deviceType: 'multiDevice', backedUp: true, transports: ['internal'], createdAt: 'c', lastUsedAt: null },
    ])
    await p.rename('k1', 'Work')
    expect(sb.rpc).toHaveBeenLastCalledWith('rename_passkey', { p_id: 'k1', p_label: 'Work' })
    expect(await p.remove('k1')).toMatchObject({ passkeyCount: 0 })
    expect(sb.rpc).toHaveBeenLastCalledWith('remove_passkey', { p_id: 'k1' })
  })
  it('runs both ceremonies through the Edge Function', async () => {
    const sb = mk({
      invoke: async (_n, { body }) => ({
        data: { ok: true, options: { challenge: 'c' }, id: 'k9', available: true, action: body.action },
        error: null,
      }),
    })
    const p = createSupabaseSecurity(sb, { functionName: 'webauthn' }).passkeys
    expect(await p.beginRegistration()).toEqual({ challenge: 'c' })
    expect(await p.finishRegistration({ credential: { id: 'x' }, transports: ['internal'], label: 'Mac' })).toBe('k9')
    expect(sb.functions.invoke).toHaveBeenLastCalledWith('webauthn', {
      body: { action: 'register-verify', credential: { id: 'x' }, transports: ['internal'], label: 'Mac' },
    })
    expect(await p.beginAuthentication()).toEqual({ challenge: 'c' })
    await p.finishAuthentication({ id: 'x' })
    expect(sb.functions.invoke).toHaveBeenLastCalledWith('webauthn', { body: { action: 'authenticate-verify', credential: { id: 'x' } } })
  })
  it("surfaces the function's reason, including how long PIN entry is locked", async () => {
    const sb = mk({
      invoke: async () =>
        httpError({
          ok: false,
          error: 'not_accepted',
          message: 'That fingerprint or face unlock was not accepted.',
          lockout_seconds: 30,
          signed_out: false,
        }),
    })
    const e = await createSupabaseSecurity(sb)
      .passkeys.finishAuthentication({ id: 'x' })
      .catch((x) => x)
    expect(e.message).toBe('That fingerprint or face unlock was not accepted.')
    expect(e.code).toBe('not_accepted')
    expect(e.detail).toMatchObject({ lockout_seconds: 30 })
  })
  it('falls back to the PIN message when the function cannot be reached', async () => {
    const sb = mk({
      invoke: async () => ({
        data: null,
        error: { name: 'FunctionsFetchError', message: 'Failed to send a request', context: new TypeError('Failed to fetch') },
      }),
    })
    const e = await createSupabaseSecurity(sb)
      .passkeys.beginAuthentication()
      .catch((x) => x)
    expect(e.code).toBe('unreachable')
    expect(e.message).toMatch(/PIN/)
    expect(await createSupabaseSecurity(sb).passkeys.available()).toBe(false)
  })
  it('turns a function call that THROWS (rather than returning an error) into a friendly offline error', async () => {
    const sb = mk({
      invoke: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    const e = await createSupabaseSecurity(sb)
      .passkeys.beginAuthentication()
      .catch((x) => x)
    expect(e.isNetwork).toBe(true)
  })
  it('copes with an error body that is not JSON', async () => {
    const sb = mk({
      invoke: async () => ({
        data: null,
        error: {
          name: 'FunctionsHttpError',
          message: 'non-2xx',
          context: {
            json: async () => {
              throw new Error('not json')
            },
          },
        },
      }),
    })
    const e = await createSupabaseSecurity(sb)
      .passkeys.beginRegistration()
      .catch((x) => x)
    expect(e.code).toBe('unreachable')
    expect(e.message).toMatch(/PIN/)
  })
  it('has a plain default when the function names a problem but gives no message', async () => {
    const sb = mk({ invoke: async () => httpError({ error: 'weird_failure' }) })
    const e = await createSupabaseSecurity(sb)
      .passkeys.beginAuthentication()
      .catch((x) => x)
    expect(e.code).toBe('weird_failure')
    expect(e.message).toBe('That did not work.')
  })
  it('lists nothing, not an error, when the database returns no rows or incomplete ones', async () => {
    const none = createSupabaseSecurity(mk({ rpc: async () => ({ data: null, error: null }) }))
    expect(await none.passkeys.list()).toEqual([])
    expect(await none.sessions.list()).toEqual([])
    const sparse = createSupabaseSecurity(mk({ rpc: async () => ({ data: [{ id: 'k' }], error: null }) }))
    expect(await sparse.passkeys.list()).toEqual([
      { id: 'k', label: undefined, deviceType: undefined, backedUp: false, transports: [], createdAt: undefined, lastUsedAt: undefined },
    ])
  })
  it('available() is true only when the server says so', async () => {
    expect(
      await createSupabaseSecurity(mk({ invoke: async () => ({ data: { ok: true, available: true }, error: null }) })).passkeys.available(),
    ).toBe(true)
    expect(
      await createSupabaseSecurity(
        mk({ invoke: async () => ({ data: { ok: true, available: false }, error: null }) }),
      ).passkeys.available(),
    ).toBe(false)
    expect(
      await createSupabaseSecurity(
        mk({ invoke: async () => httpError({ error: 'origin_not_allowed', message: 'x' }) }),
      ).passkeys.available(),
    ).toBe(false)
  })
})

describe('sessions', () => {
  it('lists, revokes, and signs out the other devices or all of them through GoTrue', async () => {
    const sb = mk({
      rpc: async () => ({
        data: [
          { id: 's1', created_at: 'c', updated_at: 'u', user_agent: 'UA', ip: '1.2.3.4', is_current: true, unlocked: true, trusted: false },
          { id: 's2', created_at: 'c', updated_at: 'u', user_agent: null, ip: null, is_current: false, unlocked: false, trusted: true },
        ],
        error: null,
      }),
    })
    const s = createSupabaseSecurity(sb).sessions
    expect(await s.list()).toEqual([
      { id: 's1', createdAt: 'c', lastActiveAt: 'u', userAgent: 'UA', ip: '1.2.3.4', current: true, unlocked: true, trusted: false },
      { id: 's2', createdAt: 'c', lastActiveAt: 'u', userAgent: '', ip: '', current: false, unlocked: false, trusted: true },
    ])
    await s.revoke('s2')
    expect(sb.rpc).toHaveBeenLastCalledWith('revoke_session', { p_id: 's2' })
    await s.trust('s2')
    expect(sb.rpc).toHaveBeenLastCalledWith('trust_session', { p_id: 's2' })
    await s.untrust('s2')
    expect(sb.rpc).toHaveBeenLastCalledWith('untrust_session', { p_id: 's2' })
    await s.signOutOthers()
    expect(sb.auth.signOut).toHaveBeenLastCalledWith({ scope: 'others' })
    await s.signOutEverywhere()
    expect(sb.auth.signOut).toHaveBeenLastCalledWith({ scope: 'global' })
  })
  it('reports a sign-out failure instead of pretending it worked', async () => {
    const sb = mk({ signOut: async () => ({ error: { message: 'Failed to fetch' } }) })
    await expect(createSupabaseSecurity(sb).sessions.signOutEverywhere()).rejects.toMatchObject({ isNetwork: true })
  })
  it('reports a failure to sign the other devices out too', async () => {
    const sb = mk({ signOut: async () => ({ error: { message: 'Failed to fetch' } }) })
    await expect(createSupabaseSecurity(sb).sessions.signOutOthers()).rejects.toMatchObject({ isNetwork: true })
  })
})

describe('a session that has ended', () => {
  it('is recognised so the app can sign out, and keeps the server wording', async () => {
    const e = await createSupabaseSecurity(mk({ rpc: async () => dbError('Your session has ended. Sign in again.', '28000') }))
      .getState()
      .catch((x) => x)
    expect(isSessionEnded(e)).toBe(true)
    expect(e.message).toBe('Your session has ended. Sign in again.')
    expect(isSessionEnded(new Error('x'))).toBe(false)
    expect(isSessionEnded({ code: '42501' })).toBe(false)
  })
})

describe('a database without migration 0012', () => {
  it('is recognised, with instructions, so the app can carry on without an app lock', async () => {
    for (const code of ['PGRST202', '42883']) {
      const e = await createSupabaseSecurity(mk({ rpc: async () => dbError('Could not find the function public.security_state', code) }))
        .getState()
        .catch((x) => x)
      expect(isNotInstalled(e)).toBe(true)
      expect(e.message).toMatch(/0012_security\.sql/)
    }
    expect(isNotInstalled(new Error('x'))).toBe(false)
  })
  it('unlockAfterLogin reads the state back', async () => {
    const sb = mk({ rpc: async () => ({ data: { locked: false, app_lock_enabled: true }, error: null }) })
    expect(await createSupabaseSecurity(sb).unlockAfterLogin()).toMatchObject({ locked: false, appLockEnabled: true })
    expect(sb.rpc).toHaveBeenCalledWith('unlock_after_login', undefined)
  })
})

describe('changing the account password', () => {
  const session = { user: { email: 'ann@example.com' } }
  const live = (over = {}) => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      ...over,
    },
  })
  it('checks the current password on a throwaway client, so the live session (and its unlock) is not replaced', async () => {
    const main = live(),
      probe = live()
    const out = await createSupabaseAuth(main, {}, { verifierClient: () => probe }).changePassword('old-pw', 'New-Pass-42!')
    expect(probe.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'old-pw' })
    expect(main.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(probe.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }) // never the default (global), which would end every session
    expect(main.auth.updateUser).toHaveBeenCalledWith({ password: 'New-Pass-42!' })
    expect(main.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(out).toEqual({ othersSignedOut: true })
  })
  it('stops at a wrong current password, changing nothing', async () => {
    const main = live(),
      probe = live({ signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }) })
    await expect(createSupabaseAuth(main, {}, { verifierClient: () => probe }).changePassword('nope', 'New-Pass-42!')).rejects.toThrow(
      'Your current password is not correct.',
    )
    expect(main.auth.updateUser).not.toHaveBeenCalled()
    expect(main.auth.signOut).not.toHaveBeenCalled()
  })
  it('shows the lockout message instead of "incorrect" when the hook refuses the attempt', async () => {
    const probe = live({ signInWithPassword: async () => ({ error: { message: 'Too many sign-in attempts. Try again in 1 min.' } }) })
    await expect(createSupabaseAuth(live(), {}, { verifierClient: () => probe }).changePassword('x', 'y')).rejects.toThrow(
      /Too many sign-in attempts/,
    )
  })
  it('reports when signing the other devices out failed, and does not hide a failed update', async () => {
    const main = live({ signOut: async () => ({ error: { message: 'boom' } }) })
    expect(await createSupabaseAuth(main, {}, { verifierClient: () => live() }).changePassword('a', 'b')).toEqual({
      othersSignedOut: false,
    })
    const failing = live({ updateUser: async () => ({ error: { message: 'Password should be at least 8 characters' } }) })
    await expect(createSupabaseAuth(failing, {}, { verifierClient: () => live() }).changePassword('a', 'b')).rejects.toThrow(/at least 8/)
  })
  it('copes with "Secure password change" on an old session: signs in afresh with the password it just checked, then retries', async () => {
    let calls = 0
    const main = live({
      updateUser: vi.fn(async () =>
        ++calls === 1
          ? { error: { code: 'reauthentication_needed', message: 'Password update requires reauthentication' } }
          : { error: null },
      ),
    })
    const out = await createSupabaseAuth(main, {}, { verifierClient: () => live() }).changePassword('old-pw', 'New-Pass-42!')
    expect(main.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'old-pw' })
    expect(main.auth.updateUser).toHaveBeenCalledTimes(2)
    expect(out).toEqual({ othersSignedOut: true })
  })
  it('gives up with the real reason if the retry fails too', async () => {
    const main = live({
      updateUser: async () => ({ error: { code: 'reauthentication_needed', message: 'Password update requires reauthentication' } }),
    })
    await expect(createSupabaseAuth(main, {}, { verifierClient: () => live() }).changePassword('a', 'b')).rejects.toThrow(
      /reauthentication/,
    )
  })
  it('without a throwaway client it checks the password on the live one, and signs only the OTHER devices out', async () => {
    const main = live()
    expect(await createSupabaseAuth(main).changePassword('old-pw', 'New-Pass-42!')).toEqual({ othersSignedOut: true })
    expect(main.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'old-pw' })
    expect(main.auth.signOut).toHaveBeenCalledTimes(1)
    expect(main.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })
  it('recognises the reauthentication demand by its message alone', async () => {
    let calls = 0
    const main = live({
      updateUser: vi.fn(async () =>
        ++calls === 1 ? { error: { message: 'Password update requires reauthentication' } } : { error: null },
      ),
    })
    expect(await createSupabaseAuth(main, {}, { verifierClient: () => live() }).changePassword('a', 'b')).toEqual({ othersSignedOut: true })
    expect(main.auth.updateUser).toHaveBeenCalledTimes(2)
  })
  it('does not mistake an error with no message for that demand', async () => {
    const main = live({ updateUser: async () => ({ error: { code: 'something_else' } }) })
    await expect(createSupabaseAuth(main, {}, { verifierClient: () => live() }).changePassword('a', 'b')).rejects.toBeTruthy()
    expect(main.auth.signInWithPassword).not.toHaveBeenCalled() // no retry
  })
  it('reports a failed fresh sign-in during that retry', async () => {
    const main = live({
      updateUser: async () => ({ error: { code: 'reauthentication_needed', message: 'x' } }),
      signInWithPassword: async () => ({ error: { message: 'Failed to fetch' } }),
    })
    await expect(createSupabaseAuth(main, {}, { verifierClient: () => live() }).changePassword('a', 'b')).rejects.toMatchObject({
      isNetwork: true,
    })
  })
  it('needs a signed-in user', async () => {
    const main = live({ getSession: async () => ({ data: { session: null }, error: null }) })
    await expect(createSupabaseAuth(main).changePassword('a', 'b')).rejects.toThrow(/Sign in again/)
  })
})
