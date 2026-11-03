import { afterEach, describe, expect, it, vi } from 'vitest'

const load = async () => { vi.resetModules(); return (await import('../app.config')).default }
afterEach(() => vi.unstubAllEnvs())

describe('app.config.ts', () => {
  it('uses the agreed identifiers and a runtime version policy, with no OTA update URL', async () => {
    const c: any = await load()
    expect(c.ios.bundleIdentifier).toBe('com.aatralex.lifetrack')
    expect(c.android.package).toBe('com.aatralex.lifetrack')
    expect(c.scheme).toBe('lifetrack')
    expect(c.runtimeVersion).toEqual({ policy: 'appVersion' })
    expect(c.updates).toBeUndefined()
  })
  it('only ever reads PUBLIC values into the bundle', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://x.supabase.co'); vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE-SECRET')
    const c: any = await load()
    expect(JSON.stringify(c)).not.toContain('SERVICE-SECRET')
    expect(c.extra.supabaseUrl).toBe('https://x.supabase.co')
  })
  it('development and preview builds do not require production settings', async () => {
    vi.stubEnv('EAS_BUILD_PROFILE', 'preview')
    await expect(load()).resolves.toBeTruthy()
  })
  it.each(['EAS_PROJECT_ID', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'])('a production build fails without %s', async (missing) => {
    const all: Record<string, string> = { EAS_PROJECT_ID: 'p', EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' }
    vi.stubEnv('EAS_BUILD_PROFILE', 'production')
    for (const [k, v] of Object.entries(all)) vi.stubEnv(k, k === missing ? '' : v)
    await expect(load()).rejects.toThrow(missing)
  })
  it('a production build succeeds with everything set, and refuses a secret key in the public slot', async () => {
    vi.stubEnv('EAS_BUILD_PROFILE', 'production'); vi.stubEnv('EAS_PROJECT_ID', 'p'); vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://x.supabase.co'); vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    await expect(load()).resolves.toBeTruthy()
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'sb_secret_abcdef')
    await expect(load()).rejects.toThrow(/secret key/)
  })
})
