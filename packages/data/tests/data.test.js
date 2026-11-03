import { describe, expect, it, vi } from 'vitest'
import { createApi, createSupabaseAuth, createSupabaseAdapter, setUserId, toAppError, hasCredentials } from '../src'

const fakeStore = () => {
  const calls = []
  return {
    calls,
    insert: vi.fn(async (t, r) => { calls.push(['insert', t, r]); return { id: 'new', ...r } }),
    update: vi.fn(async (t, id, p) => { calls.push(['update', t, id, p]); return { id, ...p } }),
    upsert: vi.fn(), remove: vi.fn(), removeMany: vi.fn(), refetch: vi.fn(), load: vi.fn(), peek: vi.fn(() => []),
  }
}

describe('createApi', () => {
  it('creates a recurring task series id and requires a due date', async () => {
    const store = fakeStore()
    const api = createApi(store)
    expect(() => api.createTask({ title: 'x', recurrence: 'daily' })).toThrow(/due date/i)
    await api.createTask({ title: 'x', recurrence: 'daily', due_date: '2024-05-01' })
    expect(store.calls[0][2].series_id).toBeTruthy()
  })
  it('spawns the next occurrence when a recurring task is completed, tolerating a duplicate from another device', async () => {
    const store = fakeStore()
    store.insert.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    const api = createApi(store)
    const task = { id: 't1', title: 'x', status: 'pending', recurrence: 'daily', due_date: '2024-05-01', series_id: 's' }
    await expect(api.setTaskStatus(task, 'done', '2024-05-01')).resolves.toBeDefined()
    expect(store.update).toHaveBeenCalled()
  })
  it('refuses a second running study timer', async () => {
    const store = fakeStore()
    store.peek.mockReturnValue([{ status: 'running' }])
    await expect(createApi(store).startStudy({}, '2024-05-01')).rejects.toThrow(/already running/i)
  })
})

describe('createSupabaseAuth', () => {
  const client = (over = {}) => ({ auth: { signUp: vi.fn(async () => ({ data: { session: null }, error: null })), signInWithPassword: vi.fn(async () => ({ error: { message: 'Invalid login credentials' } })), resetPasswordForEmail: vi.fn(async () => ({ error: null })) }, ...over })
  it('passes platform redirect URLs (string or function)', async () => {
    const c = client()
    const auth = createSupabaseAuth(c, { signUp: 'lifetrack://auth', passwordReset: () => 'lifetrack://reset' })
    expect(await auth.signUp('a@b.c', 'pw', 'A')).toEqual({ needsConfirmation: true })
    expect(c.auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe('lifetrack://auth')
    await auth.sendPasswordReset('a@b.c')
    expect(c.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', { redirectTo: 'lifetrack://reset' })
  })
  it('maps invalid login to a friendly message', async () => {
    await expect(createSupabaseAuth(client()).signIn('a@b.c', 'bad')).rejects.toThrow('Incorrect email or password.')
  })
})

describe('createSupabaseAdapter', () => {
  it('never sends user_id (the database fills it from the session) and strips it from updates', async () => {
    const q = { insert: vi.fn(() => q), select: vi.fn(() => Object.assign(Promise.resolve({ data: [{ id: 1 }], error: null }), { single: async () => ({ data: { id: 1 }, error: null }) })), update: vi.fn(() => q), eq: vi.fn(() => q) }
    const adapter = createSupabaseAdapter({ from: () => q })
    setUserId('user-1')
    await adapter.insert('tasks', [{ title: 'a', user_id: 'attacker' }])
    expect(q.insert).toHaveBeenCalledWith([{ title: 'a' }])
    await adapter.update('tasks', 1, { title: 'b', user_id: 'attacker', id: 'x' })
    expect(q.update).toHaveBeenCalledWith({ title: 'b' })
  })
})

describe('errors & config', () => {
  it('normalises network and postgres errors', () => {
    expect(toAppError(new TypeError('Failed to fetch')).isNetwork).toBe(true)
    expect(toAppError({ code: '23505', message: 'x' }).message).toMatch(/already exists/)
  })
  it('rejects placeholder credentials', () => {
    expect(hasCredentials('https://YOUR-PROJECT-REF.supabase.co', 'k')).toBe(false)
    expect(hasCredentials('https://abc.supabase.co', 'real')).toBe(true)
  })
})
