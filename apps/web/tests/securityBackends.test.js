import { afterEach, describe, expect, it, vi } from 'vitest'

// `__BACKEND__` is a build-time constant (scripts/resolve-backend.js). A production build with NO database configured must get an object that refuses
// everything, never the in-browser dev backend: `pnpm verify:bundles` checks the bundle, this checks the choice itself.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  localStorage.clear()
})

const load = async (backend) => {
  vi.stubGlobal('__BACKEND__', backend)
  vi.resetModules()
  return (await import('@/services/security')).security
}

describe('the security API each kind of build gets', () => {
  it('a build with no database refuses every call, at every level, and writes nothing to the browser', async () => {
    const security = await load('none')
    await expect(security.getState()).rejects.toThrow(/not connected to a database/)
    await expect(security.verifyPin('2486')).rejects.toThrow(/not connected/)
    await expect(security.passkeys.list()).rejects.toThrow(/not connected/)
    await expect(security.sessions.signOutEverywhere()).rejects.toThrow(/not connected/)
    expect(Object.keys(localStorage).filter((k) => k.startsWith('lifetrack-dev'))).toEqual([])
  })
  it('is not mistaken for a promise if something awaits it', async () => {
    const security = await load('none')
    expect(security.then).toBeUndefined()
    expect(await Promise.resolve(security)).toBe(security)
  })
  it('the dev build gets the in-browser implementation', async () => {
    const security = await load('local')
    for (const name of ['getState', 'setPin', 'verifyPin', 'lock', 'touch', 'unlockAfterLogin'])
      expect(typeof security[name], name).toBe('function')
    expect(typeof security.passkeys.available).toBe('function')
    await expect(security.getState()).rejects.toThrow(/Sign in again/) // it works: it just needs a signed-in user
  })
})
