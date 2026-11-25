import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(async () => {}),
  toastError: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: h.getUser } } }))
vi.mock('@/services/auth', () => ({ auth: { signOut: h.signOut } }))
vi.mock('sonner', () => ({ toast: { error: h.toastError } }))

const { handleExpiredSession, isSessionExpiredError } = await import('@/services/sessionGuard')

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.advanceTimersByTime(5000) // let the previous test's de-dupe window close
  vi.useRealTimers()
})

describe('isSessionExpiredError', () => {
  it('recognises the expired-session codes only', () => {
    expect(isSessionExpiredError({ code: 'jwt' })).toBe(true)
    expect(isSessionExpiredError({ code: 'PGRST301' })).toBe(true)
    expect(isSessionExpiredError({ code: '42501' })).toBe(false)
    expect(isSessionExpiredError({ isNetwork: true })).toBe(false)
    expect(isSessionExpiredError(null)).toBe(false)
  })
})

describe('handleExpiredSession', () => {
  it('signs out when the server rejects the token', async () => {
    h.getUser.mockResolvedValue({ error: { status: 401, message: 'invalid JWT' } })
    expect(await handleExpiredSession()).toBe(true)
    expect(h.signOut).toHaveBeenCalledTimes(1)
    expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/session has expired/i), expect.anything())
  })

  it('does not sign out when the check itself cannot reach the server', async () => {
    await new Promise((r) => setTimeout(r, 2100)) // previous check's de-dupe window
    h.getUser.mockResolvedValue({ error: { status: 0, name: 'AuthRetryableFetchError', message: 'Failed to fetch' } })
    expect(await handleExpiredSession()).toBe(false)
    expect(h.signOut).not.toHaveBeenCalled()
  })

  it('does not sign out when the session is still valid', async () => {
    await new Promise((r) => setTimeout(r, 2100))
    h.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    expect(await handleExpiredSession()).toBe(false)
    expect(h.signOut).not.toHaveBeenCalled()
  })

  it('runs one check for a burst of failing requests', async () => {
    await new Promise((r) => setTimeout(r, 2100))
    h.getUser.mockResolvedValue({ error: { status: 401, message: 'JWT expired' } })
    const all = await Promise.all([handleExpiredSession(), handleExpiredSession(), handleExpiredSession()])
    expect(all).toEqual([true, true, true])
    expect(h.getUser).toHaveBeenCalledTimes(1)
    expect(h.signOut).toHaveBeenCalledTimes(1)
  })
})
