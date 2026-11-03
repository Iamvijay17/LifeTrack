import { describe, expect, it, vi } from 'vitest'
import { createSupabaseAuth } from '../src/auth'
import { createSupabaseClient, hasCredentials } from '../src/client'
import { AppError, toAppError } from '../src/errors'

const ok = { error: null }
const mkClient = (over = {}) => {
  const unsub = vi.fn()
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u' } } }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: unsub } } })),
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ok),
    signOut: vi.fn(async () => ok),
    resetPasswordForEmail: vi.fn(async () => ok),
    updateUser: vi.fn(async () => ok),
    ...over.auth,
  }
  return { auth, rpc: vi.fn(async () => ok), unsub, ...over.top }
}

describe('createSupabaseAuth', () => {
  it('getSession returns the session or throws a friendly error', async () => {
    expect((await createSupabaseAuth(mkClient()).getSession()).user.id).toBe('u')
    const bad = mkClient({ auth: { getSession: async () => ({ data: { session: null }, error: { message: 'Failed to fetch' } }) } })
    await expect(createSupabaseAuth(bad).getSession()).rejects.toMatchObject({ isNetwork: true })
  })
  it('onChange forwards events and returns an unsubscribe', () => {
    const c = mkClient(); const cb = vi.fn()
    const off = createSupabaseAuth(c).onChange(cb)
    c.auth.onAuthStateChange.mock.calls[0][0]('SIGNED_IN', { x: 1 })
    expect(cb).toHaveBeenCalledWith('SIGNED_IN', { x: 1 })
    off(); expect(c.unsub).toHaveBeenCalled()
  })
  it('signUp passes the platform redirect and reports whether email confirmation is needed', async () => {
    const c = mkClient()
    expect(await createSupabaseAuth(c, { signUp: 'lifetrack://auth-callback' }).signUp('a@b.c', 'pw', 'Ann')).toEqual({ needsConfirmation: true })
    expect(c.auth.signUp.mock.calls[0][0]).toMatchObject({ email: 'a@b.c', options: { data: { display_name: 'Ann' }, emailRedirectTo: 'lifetrack://auth-callback' } })
    const instant = mkClient({ auth: { signUp: async () => ({ data: { session: { user: {} } }, error: null }) } })
    expect(await createSupabaseAuth(instant).signUp('a@b.c', 'pw', 'Ann')).toEqual({ needsConfirmation: false })
    const dup = mkClient({ auth: { signUp: async () => ({ data: {}, error: { message: 'User already registered' } }) } })
    await expect(createSupabaseAuth(dup).signUp('a@b.c', 'pw', 'Ann')).rejects.toThrow('User already registered')
  })
  it('signIn maps bad credentials to a friendly message and keeps other errors', async () => {
    await expect(createSupabaseAuth(mkClient()).signIn('a@b.c', 'pw')).resolves.toBeUndefined()
    const bad = mkClient({ auth: { signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }) } })
    await expect(createSupabaseAuth(bad).signIn('a@b.c', 'x')).rejects.toThrow('Incorrect email or password.')
    const down = mkClient({ auth: { signInWithPassword: async () => ({ error: { message: 'Email not confirmed' } }) } })
    await expect(createSupabaseAuth(down).signIn('a@b.c', 'x')).rejects.toThrow('Email not confirmed')
  })
  it('signOut, reset, password and name updates surface errors', async () => {
    const c = mkClient(); const auth = createSupabaseAuth(c, { passwordReset: () => 'lifetrack://reset-password' })
    await auth.signOut(); await auth.sendPasswordReset('a@b.c'); await auth.updatePassword('newpass12'); await auth.updateDisplayName('Ann')
    expect(c.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', { redirectTo: 'lifetrack://reset-password' })
    expect(c.auth.updateUser.mock.calls.map((x) => x[0])).toEqual([{ password: 'newpass12' }, { data: { display_name: 'Ann' } }])
    const e = { error: { message: 'boom' } }
    const failing = mkClient({ auth: { signOut: async () => e, resetPasswordForEmail: async () => e, updateUser: async () => e } })
    const f = createSupabaseAuth(failing)
    for (const fn of [() => f.signOut(), () => f.sendPasswordReset('a@b.c'), () => f.updatePassword('x'), () => f.updateDisplayName('x')]) await expect(fn()).rejects.toThrow('boom')
  })
  it('deleteAccount calls the RPC, then signs out (even if that sign-out fails); an RPC error stops before signing out', async () => {
    const c = mkClient({ auth: { signOut: async () => { throw new Error('already gone') } } })
    await expect(createSupabaseAuth(c).deleteAccount()).resolves.toBeUndefined()
    expect(c.rpc).toHaveBeenCalledWith('delete_my_account')
    const failing = mkClient({ top: { rpc: async () => ({ error: { message: 'not authenticated' } }) } })
    await expect(createSupabaseAuth(failing).deleteAccount()).rejects.toThrow('not authenticated')
    expect(failing.auth.signOut).not.toHaveBeenCalled()
  })
})

describe('toAppError', () => {
  it('passes AppErrors through and maps known database codes to friendly text', () => {
    const e = new AppError('x'); expect(toAppError(e)).toBe(e)
    const map = { '23505': /already exists/, '23503': /linked/, '23514': /not allowed/, '23502': /required/, '42501': /permission/, PGRST301: /expired/, PGRST116: /not be found/ }
    for (const [code, re] of Object.entries(map)) { const r = toAppError({ code, message: 'raw db text' }); expect(r.message).toMatch(re); expect(r.code).toBe(code); expect(r.message).not.toContain('raw db text') }
  })
  it('detects network failures, expired tokens, and hides long internal messages', () => {
    for (const m of ['Failed to fetch', 'NetworkError when attempting', 'Load failed', 'Network request failed']) expect(toAppError(new Error(m)).isNetwork).toBe(true)
    expect(toAppError(new TypeError('fetch failed')).isNetwork).toBe(true)
    expect(toAppError(new Error('JWT expired')).code).toBe('jwt')
    expect(toAppError({ message: 'token has expired' }).message).toMatch(/session has expired/)
    expect(toAppError(new Error('x'.repeat(500))).message).toBe('Something went wrong. Please try again.')
    expect(toAppError(null).message).toBe('Something went wrong. Please try again.')
    expect(toAppError({ userMessage: 'Custom' }).message).toBe('Custom')
    expect(toAppError('plain string').message).toBe('plain string')
  })
})

describe('client factory', () => {
  it('rejects placeholder or missing credentials and accepts real-looking ones', () => {
    expect(hasCredentials(undefined, 'k')).toBe(false)
    expect(hasCredentials('https://x.supabase.co', undefined)).toBe(false)
    expect(hasCredentials('https://YOUR-PROJECT-REF.supabase.co', 'k')).toBe(false)
    expect(hasCredentials('https://x.supabase.co', 'YOUR-ANON-KEY')).toBe(false)
    expect(hasCredentials('https://x.supabase.co', 'anon')).toBe(true)
  })
  it('creates a client with the platform auth options (storage, redirect handling)', () => {
    const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }
    const c = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'anon', auth: { storage, detectSessionInUrl: false, flowType: 'pkce' } })
    expect(typeof c.from).toBe('function'); expect(typeof c.auth.signInWithPassword).toBe('function')
    c.auth.stopAutoRefresh()
  })
})
