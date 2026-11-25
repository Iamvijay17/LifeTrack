import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), handle: vi.fn(async () => true) }))
vi.mock('@/services/db', () => ({ db: { list: h.list, update: h.update, subscribe: () => () => {} }, isDevMode: false }))
vi.mock('@/services/sessionGuard', async (orig) => ({ ...(await orig()), handleExpiredSession: h.handle }))

const store = await import('@/hooks/store')
const expired = () => Object.assign(new Error('JWT expired'), { code: 'PGRST301' })

beforeEach(() => {
  store.resetStore()
  vi.clearAllMocks()
})

describe('store: expired session', () => {
  it('checks the session when a save is refused as expired, undoes the guess and rethrows', async () => {
    h.list.mockResolvedValue([{ id: 'a', v: 1 }])
    h.update.mockRejectedValue(expired())
    await store.load('t_exp')
    await expect(store.update('t_exp', 'a', { v: 2 })).rejects.toMatchObject({ code: 'PGRST301' })
    expect(h.handle).toHaveBeenCalled()
    expect(store.peek('t_exp')[0].v).toBe(1)
  })

  it('checks the session when a first load is refused as expired', async () => {
    h.list.mockRejectedValue(expired())
    await store.load('t_exp2')
    expect(h.handle).toHaveBeenCalled()
  })

  it('does not check the session for an ordinary failure', async () => {
    h.list.mockRejectedValue(Object.assign(new Error('boom'), { code: '23505' }))
    await store.load('t_exp3')
    expect(h.handle).not.toHaveBeenCalled()
  })
})
