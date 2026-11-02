// Push registration logic with every dependency injected (no Expo imports here), so it is unit-tested without a device.

export type Permission = 'granted' | 'ask' | 'blocked'
export interface PermissionState { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean }
export type EnableResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not-a-device' | 'blocked' | 'denied' | 'no-project-id' | 'token-failed' | 'register-failed'; message?: string }

export interface PushDeps {
  platform: 'ios' | 'android'
  isDevice: boolean
  deviceName: string | null
  projectId: string | undefined
  getPermission: () => Promise<PermissionState>
  requestPermission: () => Promise<PermissionState>
  getExpoPushToken: (projectId: string) => Promise<string>
  storage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }
  rpc: (fn: 'register_push_token' | 'unregister_push_token', args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
}

const TOKEN_KEY = 'lifetrack:push-token'
const FLAG_KEY = 'lifetrack:push-enabled' // 'on' | 'off' (absent = never chosen)

/** What to do about the OS permission: use it, show the system prompt, or send the user to system settings. */
export const permissionOf = (s: PermissionState): Permission => (s.status === 'granted' ? 'granted' : s.status === 'denied' && !s.canAskAgain ? 'blocked' : 'ask')

export function createPushService(d: PushDeps) {
  const register = async (): Promise<EnableResult> => {
    if (!d.projectId) return { ok: false, reason: 'no-project-id' } // `eas init` has not been run for this build
    let token: string
    try { token = await d.getExpoPushToken(d.projectId) } catch (e) { return { ok: false, reason: 'token-failed', message: (e as Error).message } }
    const { error } = await d.rpc('register_push_token', { p_token: token, p_platform: d.platform, p_device_name: d.deviceName ?? '' })
    if (error) return { ok: false, reason: 'register-failed', message: error.message }
    await d.storage.setItem(TOKEN_KEY, token)
    return { ok: true, token }
  }

  return {
    /** Current state for the Settings screen. Never prompts. */
    async status() {
      const permission = permissionOf(await d.getPermission())
      const flag = await d.storage.getItem(FLAG_KEY)
      const token = await d.storage.getItem(TOKEN_KEY)
      return { supported: d.isDevice, permission, enabled: permission === 'granted' && flag !== 'off' && !!token, token }
    },

    /** User turned push on: ask for permission if needed (with the OS dialog), then register this device. */
    async enable(): Promise<EnableResult> {
      if (!d.isDevice) return { ok: false, reason: 'not-a-device' } // simulators/emulators cannot receive remote push
      let perm = permissionOf(await d.getPermission())
      if (perm === 'blocked') return { ok: false, reason: 'blocked' }
      if (perm === 'ask') {
        perm = permissionOf(await d.requestPermission())
        if (perm !== 'granted') return { ok: false, reason: perm === 'blocked' ? 'blocked' : 'denied' }
      }
      const r = await register()
      if (r.ok) await d.storage.setItem(FLAG_KEY, 'on')
      return r
    },

    /** User turned push off for this device: stop pushes here and remember the choice. */
    async disable() {
      await this.unregister()
      await d.storage.setItem(FLAG_KEY, 'off')
    },

    /** App start / sign-in: keep the token fresh when push is already allowed. Never shows a prompt. */
    async refresh(): Promise<EnableResult | null> {
      if (!d.isDevice) return null
      if ((await d.storage.getItem(FLAG_KEY)) === 'off') return null
      if (permissionOf(await d.getPermission()) !== 'granted') return null
      return register()
    },

    /** Remove this device's token from the signed-in account (sign-out, or switching accounts on a shared phone). */
    async unregister() {
      const token = await d.storage.getItem(TOKEN_KEY)
      if (!token) return
      const { error } = await d.rpc('unregister_push_token', { p_token: token })
      if (!error) await d.storage.removeItem(TOKEN_KEY) // keep it on failure so a later attempt can retry
    },
  }
}
export type PushService = ReturnType<typeof createPushService>

/** User-facing explanation for the result of enabling push (plain language, with what to do next). */
export function describeEnableResult(r: EnableResult): string {
  if (r.ok) return 'Push notifications are on for this device.'
  switch (r.reason) {
    case 'not-a-device': return 'Push notifications need a real phone or tablet — they do not work in simulators or emulators.'
    case 'blocked': return "Notifications are blocked for LifeTrack in your phone's settings. Turn them on there, then come back."
    case 'denied': return 'Permission was not granted. You can turn notifications on any time.'
    case 'no-project-id': return 'This build is not linked to an Expo project yet (run eas init and rebuild), so push cannot be enabled.'
    case 'token-failed': return `Could not get a push token${r.message ? `: ${r.message}` : '.'}`
    case 'register-failed': return `Could not register this device${r.message ? `: ${r.message}` : '.'}`
  }
}
