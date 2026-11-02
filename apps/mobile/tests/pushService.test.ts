import { describe, expect, it, vi } from 'vitest'
import { createPushService, describeEnableResult, permissionOf, type PushDeps } from '../src/features/notifications/pushService'
import { notificationIdFromData, routeFromNotificationData } from '../src/features/notifications/payload'

const mem = () => { const m = new Map<string, string>(); return { m, storage: { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v) }, removeItem: async (k: string) => { m.delete(k) } } } }
const make = (over: Partial<PushDeps> = {}, perm: { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean } = { status: 'undetermined', canAskAgain: true }) => {
  const { m, storage } = mem()
  const state = { perm }
  const rpc = vi.fn(async () => ({ error: null as { message: string } | null }))
  const requestPermission = vi.fn(async () => state.perm)
  const deps: PushDeps = {
    platform: 'ios', isDevice: true, deviceName: 'Vijay iPhone', projectId: 'proj-1',
    getPermission: async () => state.perm, requestPermission, getExpoPushToken: async () => 'ExponentPushToken[abc]', storage, rpc, ...over,
  }
  return { svc: createPushService(deps), m, rpc, requestPermission, state }
}

describe('permission mapping', () => {
  it('granted / askable / blocked', () => {
    expect(permissionOf({ status: 'granted', canAskAgain: true })).toBe('granted')
    expect(permissionOf({ status: 'undetermined', canAskAgain: true })).toBe('ask')
    expect(permissionOf({ status: 'denied', canAskAgain: true })).toBe('ask') // Android can ask again once
    expect(permissionOf({ status: 'denied', canAskAgain: false })).toBe('blocked')
  })
})

describe('enable()', () => {
  it('asks for permission, registers the token with platform and device name, and remembers it', async () => {
    const { svc, rpc, requestPermission, state, m } = make()
    requestPermission.mockImplementation(async () => (state.perm = { status: 'granted', canAskAgain: true }))
    const r = await svc.enable()
    expect(r).toEqual({ ok: true, token: 'ExponentPushToken[abc]' })
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('register_push_token', { p_token: 'ExponentPushToken[abc]', p_platform: 'ios', p_device_name: 'Vijay iPhone' })
    expect(m.get('lifetrack:push-token')).toBe('ExponentPushToken[abc]')
    expect((await svc.status()).enabled).toBe(true)
  })
  it('does not show the prompt again when already granted', async () => {
    const { svc, requestPermission } = make({}, { status: 'granted', canAskAgain: true })
    expect((await svc.enable()).ok).toBe(true)
    expect(requestPermission).not.toHaveBeenCalled()
  })
  it('reports denied, blocked, simulator and missing project id without registering anything', async () => {
    const denied = make()
    denied.requestPermission.mockResolvedValue({ status: 'denied', canAskAgain: true })
    expect(await denied.svc.enable()).toEqual({ ok: false, reason: 'denied' })
    const blocked = make({}, { status: 'denied', canAskAgain: false })
    expect(await blocked.svc.enable()).toEqual({ ok: false, reason: 'blocked' })
    expect(blocked.requestPermission).not.toHaveBeenCalled() // the OS would ignore it; send the user to Settings instead
    const sim = make({ isDevice: false }, { status: 'granted', canAskAgain: true })
    expect(await sim.svc.enable()).toEqual({ ok: false, reason: 'not-a-device' })
    const noProj = make({ projectId: undefined }, { status: 'granted', canAskAgain: true })
    expect(await noProj.svc.enable()).toEqual({ ok: false, reason: 'no-project-id' })
    for (const x of [denied, blocked, sim, noProj]) expect(x.rpc).not.toHaveBeenCalled()
    expect((await denied.svc.status()).enabled).toBe(false)
  })
  it('surfaces token and server failures and does not claim success', async () => {
    const tokenFail = make({ getExpoPushToken: async () => { throw new Error('FCM not configured') } }, { status: 'granted', canAskAgain: true })
    expect(await tokenFail.svc.enable()).toEqual({ ok: false, reason: 'token-failed', message: 'FCM not configured' })
    const serverFail = make({}, { status: 'granted', canAskAgain: true })
    serverFail.rpc.mockResolvedValue({ error: { message: 'not authenticated' } })
    expect(await serverFail.svc.enable()).toEqual({ ok: false, reason: 'register-failed', message: 'not authenticated' })
    expect((await serverFail.svc.status()).enabled).toBe(false)
  })
})

describe('refresh / disable / unregister', () => {
  it('refresh keeps the token current without prompting, and respects "off" and missing permission', async () => {
    const a = make({}, { status: 'granted', canAskAgain: true })
    expect((await a.svc.refresh())?.ok).toBe(true)
    expect(a.rpc).toHaveBeenCalledTimes(1)
    const asks = make({}, { status: 'undetermined', canAskAgain: true })
    expect(await asks.svc.refresh()).toBeNull()
    expect(asks.requestPermission).not.toHaveBeenCalled()
    const off = make({}, { status: 'granted', canAskAgain: true })
    await off.svc.disable()
    expect(await off.svc.refresh()).toBeNull()
    await expect(make({ isDevice: false }, { status: 'granted', canAskAgain: true }).svc.refresh()).resolves.toBeNull()
  })
  it('disable unregisters this device and turns it off; enable can turn it back on', async () => {
    const { svc, rpc, m, state } = make({}, { status: 'granted', canAskAgain: true })
    await svc.enable()
    await svc.disable()
    expect(rpc).toHaveBeenLastCalledWith('unregister_push_token', { p_token: 'ExponentPushToken[abc]' })
    expect(m.has('lifetrack:push-token')).toBe(false)
    expect((await svc.status()).enabled).toBe(false)
    state.perm = { status: 'granted', canAskAgain: true }
    await svc.enable()
    expect((await svc.status()).enabled).toBe(true)
  })
  it('unregister keeps the stored token when the server call fails so it can be retried, and is a no-op without a token', async () => {
    const { svc, rpc, m } = make({}, { status: 'granted', canAskAgain: true })
    await svc.unregister()
    expect(rpc).not.toHaveBeenCalled()
    await svc.enable()
    rpc.mockResolvedValueOnce({ error: { message: 'offline' } })
    await svc.unregister()
    expect(m.get('lifetrack:push-token')).toBe('ExponentPushToken[abc]')
    await svc.unregister()
    expect(m.has('lifetrack:push-token')).toBe(false)
  })
})

describe('notification payload', () => {
  it('maps links to routes and ignores anything untrusted or malformed', () => {
    expect(routeFromNotificationData({ link: '/learning', kind: 'study' })).toBe('/module/learning')
    expect(routeFromNotificationData({ link: '/planner' })).toBe('/planner')
    for (const bad of [null, undefined, 'x', 42, {}, { link: 5 }, { link: 'javascript:alert(1)' }, { link: { a: 1 } }]) expect(routeFromNotificationData(bad)).toBe('/')
    expect(notificationIdFromData({ notificationId: '123e4567-e89b-12d3-a456-426614174000' })).toBe('123e4567-e89b-12d3-a456-426614174000')
    for (const bad of [null, {}, { notificationId: 5 }, { notificationId: "x'; drop table" }]) expect(notificationIdFromData(bad)).toBeNull()
  })
})

describe('describeEnableResult', () => {
  it('has a clear message for every outcome', () => {
    expect(describeEnableResult({ ok: true, token: 't' })).toMatch(/are on/)
    for (const reason of ['not-a-device', 'blocked', 'denied', 'no-project-id', 'token-failed', 'register-failed'] as const) expect(describeEnableResult({ ok: false, reason }).length).toBeGreaterThan(20)
    expect(describeEnableResult({ ok: false, reason: 'token-failed', message: 'FCM missing' })).toContain('FCM missing')
    expect(describeEnableResult({ ok: false, reason: 'blocked' })).toMatch(/settings/i)
  })
})
