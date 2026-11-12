import { describe, expect, it, vi } from 'vitest'
import { createSupabaseSecurity, isNotInstalled } from '../src'

// The phone's biometric keys (migration 0014 + the `device-key` Edge Function), as the mobile app calls them.
const mk = ({ rpc = async () => ({ data: null, error: null }), invoke = async () => ({ data: null, error: null }) } = {}) => ({
  rpc: vi.fn(rpc),
  functions: { invoke: vi.fn(invoke) },
  auth: { signOut: vi.fn(async () => ({ error: null })) },
})
const dbError = (message, code) => ({ data: null, error: { message, code } })
const httpError = (payload) => ({
  data: null,
  error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { json: async () => payload } },
})
const KEY = '3f1c5a2e-7b9d-4c1a-8e6f-0a1b2c3d4e5f'

describe('the phone-key Edge Function', () => {
  it('is its own function, separate from the web passkeys', async () => {
    const sb = mk({ invoke: async () => ({ data: { ok: true, available: true }, error: null }) })
    await createSupabaseSecurity(sb).deviceKeys.available()
    expect(sb.functions.invoke).toHaveBeenCalledWith('device-key', { body: { action: 'capabilities' } })
    await createSupabaseSecurity(sb).passkeys.available()
    expect(sb.functions.invoke).toHaveBeenLastCalledWith('webauthn', { body: { action: 'capabilities' } })
    await createSupabaseSecurity(sb, { deviceFunctionName: 'dk2', functionName: 'wa2' }).deviceKeys.available()
    expect(sb.functions.invoke).toHaveBeenLastCalledWith('dk2', { body: { action: 'capabilities' } })
  })
  it('available() is true only when the server says so, and false when it cannot be reached', async () => {
    const ask = (invoke) => createSupabaseSecurity(mk({ invoke })).deviceKeys.available()
    expect(await ask(async () => ({ data: { ok: true, available: true }, error: null }))).toBe(true)
    expect(await ask(async () => ({ data: { ok: true, available: false }, error: null }))).toBe(false)
    expect(await ask(async () => ({ data: null, error: null }))).toBe(false)
    expect(await ask(async () => httpError({ error: 'native_only' }))).toBe(false)
    expect(await ask(async () => { throw new Error('offline') })).toBe(false)
    expect(await ask(async () => ({ data: null, error: { message: 'Function not found', context: { status: 404 } } }))).toBe(false)
  })
})

describe('enrolling a phone', () => {
  it('asks for a challenge, then sends the public key and the signature, and nothing else', async () => {
    const sb = mk({
      invoke: async (_name, { body }) => ({
        data: body.action === 'enroll-options' ? { ok: true, options: { challenge: 'c'.repeat(43), algorithm: 'ES256', context: 'lifetrack-device-key/v1' } } : { ok: true, id: KEY },
        error: null,
      }),
    })
    const s = createSupabaseSecurity(sb).deviceKeys
    expect(await s.beginEnrollment()).toEqual({ challenge: 'c'.repeat(43), algorithm: 'ES256', context: 'lifetrack-device-key/v1' })
    const jwk = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }
    expect(await s.finishEnrollment({ challenge: 'c'.repeat(43), publicKeyJwk: jwk, signature: 'sig', label: 'Pixel', platform: 'android' })).toBe(KEY)
    expect(sb.functions.invoke).toHaveBeenLastCalledWith('device-key', {
      body: { action: 'enroll-verify', challenge: 'c'.repeat(43), publicKeyJwk: jwk, signature: 'sig', label: 'Pixel', platform: 'android' },
    })
  })
  it("surfaces the server's reason when the phone is refused", async () => {
    const sb = mk({ invoke: async () => httpError({ ok: false, error: 'locked', message: 'Unlock LifeTrack first.' }) })
    const err = await createSupabaseSecurity(sb).deviceKeys.beginEnrollment().catch((e) => e)
    expect(err).toMatchObject({ message: 'Unlock LifeTrack first.', code: 'locked' })
    expect(err.detail).toMatchObject({ error: 'locked' })
  })
})

describe('unlocking with a phone', () => {
  it('asks which key it will sign with, then sends the signature and the counter', async () => {
    const sb = mk({
      invoke: async (_name, { body }) => ({
        data: body.action === 'unlock-options' ? { ok: true, options: { challenge: 'n'.repeat(43), keyId: body.keyId, context: 'lifetrack-device-key/v1' } } : { ok: true },
        error: null,
      }),
    })
    const s = createSupabaseSecurity(sb).deviceKeys
    expect(await s.beginUnlock(KEY)).toMatchObject({ challenge: 'n'.repeat(43), keyId: KEY })
    expect(sb.functions.invoke).toHaveBeenLastCalledWith('device-key', { body: { action: 'unlock-options', keyId: KEY } })
    await expect(s.finishUnlock({ keyId: KEY, challenge: 'n'.repeat(43), counter: 3, signature: 'sig' })).resolves.toBeUndefined()
    expect(sb.functions.invoke).toHaveBeenLastCalledWith('device-key', { body: { action: 'unlock-verify', keyId: KEY, challenge: 'n'.repeat(43), counter: 3, signature: 'sig' } })
  })
  it('reports how long PIN entry is locked, and whether the session was ended, when a signature is refused', async () => {
    const sb = mk({ invoke: async () => httpError({ ok: false, error: 'not_accepted', message: 'That fingerprint or face unlock was not accepted.', reason: 'bad_signature', lockout_seconds: 30, signed_out: true }) })
    const err = await createSupabaseSecurity(sb).deviceKeys.finishUnlock({ keyId: KEY, challenge: 'c', counter: 1, signature: 's' }).catch((e) => e)
    expect(err.code).toBe('not_accepted')
    expect(err.detail).toMatchObject({ lockout_seconds: 30, signed_out: true, reason: 'bad_signature' })
  })
  it('tells the app when this phone is no longer on the account', async () => {
    const sb = mk({ invoke: async () => httpError({ ok: false, error: 'unknown_key', message: 'This phone is not set up any more. Use your PIN.' }) })
    expect(await createSupabaseSecurity(sb).deviceKeys.beginUnlock(KEY).catch((e) => e)).toMatchObject({ code: 'unknown_key' })
  })
  it('falls back to the PIN message when the function cannot be reached', async () => {
    const down = mk({ invoke: async () => ({ data: null, error: { message: 'Failed to fetch', context: { json: async () => { throw new Error('not json') } } } }) })
    const err = await createSupabaseSecurity(down).deviceKeys.beginUnlock(KEY).catch((e) => e)
    expect(err).toMatchObject({ code: 'unreachable', isNetwork: true })
    expect(err.message).toMatch(/Use your PIN/)
    const thrown = mk({ invoke: async () => { throw new TypeError('Network request failed') } })
    expect((await createSupabaseSecurity(thrown).deviceKeys.beginUnlock(KEY).catch((e) => e)).isNetwork).toBe(true)
  })
})

describe('listing, renaming and removing phones', () => {
  it('lists them without any key material', async () => {
    const sb = mk({ rpc: async () => ({ data: [{ id: KEY, label: 'Pixel', platform: 'android', created_at: '2026-11-11T10:00:00Z', last_used_at: null, public_key_jwk: { x: 'leak' }, sign_count: 9 }], error: null }) })
    const rows = await createSupabaseSecurity(sb).deviceKeys.list()
    expect(rows).toEqual([{ id: KEY, label: 'Pixel', platform: 'android', createdAt: '2026-11-11T10:00:00Z', lastUsedAt: null }])
    expect(sb.rpc).toHaveBeenCalledWith('list_device_keys', undefined)
    expect(JSON.stringify(rows)).not.toMatch(/leak|sign_count|public_key/)
  })
  it('lists nothing, not an error, when the database returns no rows', async () => {
    expect(await createSupabaseSecurity(mk()).deviceKeys.list()).toEqual([])
  })
  it('renames and removes through the database, keeping its wording', async () => {
    const sb = mk()
    const s = createSupabaseSecurity(sb).deviceKeys
    await s.rename(KEY, 'Work phone')
    expect(sb.rpc).toHaveBeenLastCalledWith('rename_device_key', { p_id: KEY, p_label: 'Work phone' })
    await s.remove(KEY)
    expect(sb.rpc).toHaveBeenLastCalledWith('remove_device_key', { p_id: KEY })
    const gone = mk({ rpc: async () => dbError('That phone is not on your account.', 'P0002') })
    expect(await createSupabaseSecurity(gone).deviceKeys.remove(KEY).catch((e) => e)).toMatchObject({ message: 'That phone is not on your account.', code: 'P0002' })
    const locked = mk({ rpc: async () => dbError('LifeTrack is locked. Enter your PIN first.', '42501') })
    expect(await createSupabaseSecurity(locked).deviceKeys.list().catch((e) => e)).toMatchObject({ code: 'APP_LOCKED' })
  })
  it('says which migration is missing: 0014 for phone keys, 0012 for the lock itself', async () => {
    const missing = mk({ rpc: async () => dbError('Could not find the function public.list_device_keys', 'PGRST202') })
    const err = await createSupabaseSecurity(missing).deviceKeys.list().catch((e) => e)
    expect(isNotInstalled(err)).toBe(true)
    expect(err.message).toMatch(/0014_device_keys\.sql/)
    expect(err.message).not.toMatch(/0012/)
    const err12 = await createSupabaseSecurity(missing).getState().catch((e) => e)
    expect(err12.message).toMatch(/0012_security\.sql/)
    for (const fn of ['rename', 'remove']) {
      expect((await createSupabaseSecurity(missing).deviceKeys[fn](KEY, 'x').catch((e) => e)).message, fn).toMatch(/0014/)
    }
  })
})
