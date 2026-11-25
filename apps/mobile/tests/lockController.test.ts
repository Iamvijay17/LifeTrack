import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLockController, type LockDeps } from '../src/features/security/lockController'
import type { PinResult, SecurityState } from '../src/features/security/lockPolicy'

// The behaviour of the app lock on a phone, with a fake clock and a fake server: when it locks, what it asks the server, and what it does when the server cannot
// be asked. The same rules as the web's SecurityProvider (apps/web/src/features/security), which these tests mirror.

const st = (over: Partial<SecurityState> = {}): SecurityState => ({ appLockEnabled: true, pinLength: 4, pinSetAt: null, autoLockSeconds: 300, biometricEnabled: false, passkeyCount: 0, locked: false, lockoutSeconds: 0, failedAttempts: 0, sessionId: 's', ...over })
const err = (code: string, message = code) => Object.assign(new Error(message), { code })
const ok: PinResult = { ok: true, reason: null, triesLeft: null, lockoutSeconds: 0, signedOut: false, failedAttempts: 0 }

function make(initial: Partial<SecurityState> = {}, over: Partial<LockDeps> = {}) {
  const server = { state: st(initial), touch: true as boolean, lockFails: false }
  const api = {
    getState: vi.fn(async () => ({ ...server.state })),
    unlockAfterLogin: vi.fn(async () => ({ ...server.state })),
    touch: vi.fn(async () => server.touch),
    lock: vi.fn(async () => { if (server.lockFails) throw new Error('offline'); server.state.locked = true }),
    verifyPin: vi.fn(async () => ok),
  }
  const signOut = vi.fn(async () => {})
  const c = createLockController({ api, signOut, isNotInstalled: (e: any) => e?.code === 'NOT_INSTALLED', isSessionEnded: (e: any) => e?.code === '28000', errorMessage: (e: any) => String(e?.message ?? e), ...over })
  return { c, api, signOut, server }
}
const settle = () => vi.advanceTimersByTimeAsync(0)
/** A controller that has been told who is signed in and has had its first answer. */
async function ready(initial: Partial<SecurityState> = {}, over: Partial<LockDeps> = {}) {
  const m = make(initial, over)
  m.c.setUser('u1')
  await settle()
  return m
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('the first look', () => {
  it('shows nothing until the server has answered, and never claims to be unlocked before that', async () => {
    const { c } = make()
    expect(c.getSnapshot()).toMatchObject({ status: 'idle', locked: false, enabled: false })
    c.setUser('u1')
    expect(c.getSnapshot()).toMatchObject({ status: 'loading', state: null, locked: false, enabled: false })
    await settle()
    expect(c.getSnapshot()).toMatchObject({ status: 'ready', locked: false, enabled: true })
  })
  it('on a first look, a locked session tries the "just typed my password" shortcut, once', async () => {
    const m = make({ locked: true })
    m.c.setUser('u1')
    await settle()
    expect(m.api.unlockAfterLogin).toHaveBeenCalledTimes(1)
    await m.c.refresh()
    expect(m.api.unlockAfterLogin).toHaveBeenCalledTimes(1) // a later look never tries it again
    expect(m.c.getSnapshot().locked).toBe(true) // the fake server leaves it locked: the shortcut is the server's call
  })
  it('opens when the server grants the shortcut, and stays locked when it refuses or fails', async () => {
    const granted = make({ locked: true })
    granted.api.unlockAfterLogin.mockResolvedValue(st({ locked: false }))
    granted.c.setUser('u1'); await settle()
    expect(granted.c.getSnapshot().locked).toBe(false)
    const failed = make({ locked: true })
    failed.api.unlockAfterLogin.mockRejectedValue(new Error('boom'))
    failed.c.setUser('u1'); await settle()
    expect(failed.c.getSnapshot()).toMatchObject({ status: 'ready', locked: true })
  })
  it('does not try the shortcut for a session that is already unlocked', async () => {
    const m = await ready({ locked: false })
    expect(m.api.unlockAfterLogin).not.toHaveBeenCalled()
  })
  it('is "unsupported" on a database without migration 0012: the app opens as before, with no clocks running', async () => {
    const m = make()
    m.api.getState.mockRejectedValue(err('NOT_INSTALLED'))
    m.c.setUser('u1'); await settle()
    expect(m.c.getSnapshot()).toMatchObject({ status: 'unsupported', locked: false, enabled: false })
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(m.api.touch).not.toHaveBeenCalled()
  })
  it('signs out when the server says the session has ended, instead of sitting at a lock that can never open', async () => {
    const m = make()
    m.api.getState.mockRejectedValue(err('28000', 'Your session has ended. Sign in again.'))
    m.c.setUser('u1'); await settle()
    expect(m.signOut).toHaveBeenCalledTimes(1)
    expect(m.c.getSnapshot().locked).toBe(false)
  })
  it('fails CLOSED when the server cannot be asked at all: an error screen, not the app', async () => {
    const m = make()
    m.api.getState.mockRejectedValueOnce(new Error('Network request failed'))
    m.c.setUser('u1'); await settle()
    expect(m.c.getSnapshot()).toMatchObject({ status: 'error', error: 'Network request failed', state: null, locked: false })
    const retry = m.c.retry()
    expect(m.c.getSnapshot().status).toBe('loading')
    await retry
    expect(m.c.getSnapshot()).toMatchObject({ status: 'ready', error: null })
  })
  it('a blip after the first answer keeps what it knew (the next heartbeat finds out)', async () => {
    const m = await ready({ locked: false })
    m.api.getState.mockRejectedValueOnce(new Error('offline'))
    expect(await m.c.refresh()).toMatchObject({ appLockEnabled: true })
    expect(m.c.getSnapshot()).toMatchObject({ status: 'ready', locked: false })
  })
  it('does nothing for nobody: no calls without a signed-in person', async () => {
    const m = make()
    expect(await m.c.refresh()).toBeNull()
    expect(m.api.getState).not.toHaveBeenCalled()
  })
})

describe('who is signed in', () => {
  it('forgets everything when the person changes, and ignores a late answer meant for the person before', async () => {
    const m = make()
    let release: (s: SecurityState) => void = () => {}
    m.api.getState.mockImplementationOnce(() => new Promise<SecurityState>((r) => { release = r }))
    m.c.setUser('u1') // the answer for u1 is still on its way…
    m.api.getState.mockResolvedValueOnce(st({ locked: true, sessionId: 'u2s' }))
    m.api.unlockAfterLogin.mockResolvedValue(st({ locked: true, sessionId: 'u2s' })) // the server refuses the shortcut
    m.c.setUser('u2')
    await settle()
    expect(m.c.getSnapshot()).toMatchObject({ locked: true }) // u2's answer
    release(st({ locked: false, sessionId: 'u1s' })) // …and arrives late
    await settle()
    expect(m.c.getSnapshot().state?.sessionId).toBe('u2s') // dropped
  })
  it('looks again quietly for the same person (a token refresh): the screen does not blink back to loading', async () => {
    const m = await ready()
    m.c.setUser('u1')
    expect(m.c.getSnapshot().status).toBe('ready')
    await settle()
    expect(m.api.getState).toHaveBeenCalledTimes(2)
  })
  it('goes idle on sign-out and stops every clock', async () => {
    const m = await ready()
    m.c.setUser(null)
    expect(m.c.getSnapshot()).toMatchObject({ status: 'idle', state: null, enabled: false, locked: false })
    m.api.touch.mockClear()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(m.api.touch).not.toHaveBeenCalled()
    expect(m.api.lock).not.toHaveBeenCalled()
  })
  it('tells whoever is listening, and stops when they stop', async () => {
    const m = make()
    const seen: string[] = []
    const off = m.c.subscribe(() => seen.push(m.c.getSnapshot().status))
    m.c.setUser('u1'); await settle()
    expect(seen).toEqual(['loading', 'ready'])
    off()
    m.c.setUser(null)
    expect(seen).toHaveLength(2)
    m.c.dispose()
  })
})

describe('the heartbeat', () => {
  it('beats as soon as the app is unlocked, then at most once per interval while the person is active', async () => {
    const m = await ready({ autoLockSeconds: 300 }) // every 30 s
    expect(m.api.touch).toHaveBeenCalledTimes(1)
    m.c.noteActivity()
    expect(m.api.touch).toHaveBeenCalledTimes(1) // too soon
    await vi.advanceTimersByTimeAsync(31_000)
    m.c.noteActivity()
    expect(m.api.touch).toHaveBeenCalledTimes(2)
    m.c.noteActivity(); m.c.noteActivity()
    expect(m.api.touch).toHaveBeenCalledTimes(2)
  })
  it('does not beat while the person is idle (the server\'s own window then runs out)', async () => {
    const m = await ready({ autoLockSeconds: 3600 })
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(m.api.touch).toHaveBeenCalledTimes(1)
  })
  it('an answer of "no longer unlocked" makes it ask the server and show the lock screen', async () => {
    const m = await ready()
    await vi.advanceTimersByTimeAsync(31_000)
    m.server.touch = false
    m.server.state.locked = true // the server locked this session meanwhile (another device, or its own window)
    m.c.noteActivity()
    await settle()
    expect(m.c.getSnapshot().locked).toBe(true)
  })
  it('a failed beat is only a blip', async () => {
    const m = await ready()
    await vi.advanceTimersByTimeAsync(31_000)
    m.api.touch.mockRejectedValueOnce(new Error('offline'))
    m.c.noteActivity()
    await settle()
    expect(m.c.getSnapshot().locked).toBe(false)
  })
  it('does not run while locked, nor when the app lock is off', async () => {
    const locked = await ready({ locked: true })
    locked.c.noteActivity()
    expect(locked.api.touch).not.toHaveBeenCalled()
    const off = await ready({ appLockEnabled: false })
    off.c.noteActivity()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(off.api.touch).not.toHaveBeenCalled()
  })
})

describe('going quiet', () => {
  it('locks by itself after the auto-lock time, screen first and then the server', async () => {
    const m = await ready({ autoLockSeconds: 60 })
    await vi.advanceTimersByTimeAsync(55_000)
    expect(m.c.getSnapshot().locked).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(m.c.getSnapshot().locked).toBe(true)
    expect(m.api.lock).toHaveBeenCalledTimes(1)
  })
  it('every touch starts the clock again', async () => {
    const m = await ready({ autoLockSeconds: 60 })
    for (let i = 0; i < 5; i++) { await vi.advanceTimersByTimeAsync(40_000); m.c.noteActivity() }
    expect(m.c.getSnapshot().locked).toBe(false)
    await vi.advanceTimersByTimeAsync(70_000)
    expect(m.c.getSnapshot().locked).toBe(true)
  })
  it('typing counts as activity: the phone cannot see key presses, so an open keyboard keeps it unlocked', async () => {
    let keyboard = true
    const m = await ready({ autoLockSeconds: 60 }, { keyboardVisible: () => keyboard })
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(m.c.getSnapshot().locked).toBe(false)
    expect(m.api.touch.mock.calls.length).toBeGreaterThan(5) // and the server's window is kept open too
    keyboard = false
    await vi.advanceTimersByTimeAsync(70_000)
    expect(m.c.getSnapshot().locked).toBe(true)
  })
  it('"when I leave the app" has no idle clock at all', async () => {
    const m = await ready({ autoLockSeconds: 0 })
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(m.c.getSnapshot().locked).toBe(false)
  })
  it('a fresh unlock starts a fresh idle clock', async () => {
    const m = await ready({ autoLockSeconds: 60, locked: true })
    await vi.advanceTimersByTimeAsync(120_000)
    m.server.state.locked = false
    await m.c.finishUnlock()
    await vi.advanceTimersByTimeAsync(40_000)
    expect(m.c.getSnapshot().locked).toBe(false)
    expect(m.api.touch).toHaveBeenCalled() // and the heartbeat starts with it
  })
})

describe('lock now', () => {
  it('changes the screen first: the lock shows before the server has answered, and an older "unlocked" answer cannot flip it back', async () => {
    const m = await ready()
    let done: () => void = () => {}
    m.api.lock.mockImplementationOnce(() => new Promise<void>((r) => { done = () => { m.server.state.locked = true; r() } }))
    const p = m.c.lockNow()
    expect(m.c.getSnapshot().locked).toBe(true)
    await m.c.refresh() // a refresh that started before the lock finished must not undo it
    expect(m.c.getSnapshot().locked).toBe(true)
    expect(m.api.getState).toHaveBeenCalledTimes(1)
    done(); await p
    expect(m.c.getSnapshot().locked).toBe(true)
  })
  it('still locks the screen when the request is lost (the server\'s inactivity window closes the data)', async () => {
    const m = await ready()
    m.server.lockFails = true
    await m.c.lockNow()
    expect(m.c.getSnapshot().locked).toBe(true)
  })
  it('does nothing when there is no app lock', async () => {
    const m = await ready({ appLockEnabled: false })
    await m.c.lockNow()
    expect(m.api.lock).not.toHaveBeenCalled()
    expect(m.c.getSnapshot().locked).toBe(false)
  })
  it('stops the clocks while locked', async () => {
    const m = await ready()
    await m.c.lockNow()
    m.api.touch.mockClear(); m.api.lock.mockClear()
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(m.api.touch).not.toHaveBeenCalled()
    expect(m.api.lock).not.toHaveBeenCalled()
  })
})

describe('leaving the app and coming back', () => {
  it('"when I leave the app" locks the moment the app goes to the background', async () => {
    const m = await ready({ autoLockSeconds: 0 })
    m.c.appWentBackground()
    expect(m.c.getSnapshot().locked).toBe(true)
    expect(m.api.lock).toHaveBeenCalledTimes(1)
  })
  it('any other setting leaves it open for a short trip to another app', async () => {
    const m = await ready({ autoLockSeconds: 300 })
    m.c.appWentBackground()
    await vi.advanceTimersByTimeAsync(100_000)
    m.api.getState.mockClear()
    m.c.appCameBack()
    await settle()
    expect(m.c.getSnapshot().locked).toBe(false)
    expect(m.api.getState).toHaveBeenCalledTimes(1) // it asks the server instead: it may have locked meanwhile
  })
  it('locks on coming back after the whole auto-lock time away (an iPhone suspends the clock while backgrounded)', async () => {
    const m = await ready({ autoLockSeconds: 300 })
    m.c.appWentBackground()
    vi.setSystemTime(Date.now() + 301_000) // the timers did not run; the wall clock did
    m.c.appCameBack()
    expect(m.c.getSnapshot().locked).toBe(true)
  })
  it('a second "went to background" does not restart the away clock', async () => {
    const m = await ready({ autoLockSeconds: 60 })
    m.c.appWentBackground()
    vi.setSystemTime(Date.now() + 40_000)
    m.c.appWentBackground()
    vi.setSystemTime(Date.now() + 30_000)
    m.c.appCameBack()
    expect(m.c.getSnapshot().locked).toBe(true) // 70 s since the FIRST one
  })
  it('coming back is not activity: the idle clock keeps counting from the last touch', async () => {
    const m = await ready({ autoLockSeconds: 60 })
    await vi.advanceTimersByTimeAsync(50_000)
    m.c.appWentBackground()
    m.c.appCameBack() // gone for no time at all
    await vi.advanceTimersByTimeAsync(15_000)
    expect(m.c.getSnapshot().locked).toBe(true) // 65 s since the last touch
  })
  it('a system prompt (the fingerprint sheet) is not "leaving": nothing locks while it is up', async () => {
    const m = await ready({ autoLockSeconds: 0 })
    await m.c.hold(async () => {
      m.c.appWentBackground()
      m.c.appCameBack()
      await vi.advanceTimersByTimeAsync(10 * 60_000) // not even idling counts while a prompt is up
    })
    expect(m.c.getSnapshot().locked).toBe(false)
    expect(m.api.lock).not.toHaveBeenCalled()
  })
  it('after the prompt the idle clock starts afresh, and the lock works again', async () => {
    const m = await ready({ autoLockSeconds: 60 })
    await m.c.hold(() => vi.advanceTimersByTimeAsync(5 * 60_000))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(m.c.getSnapshot().locked).toBe(false)
    await vi.advanceTimersByTimeAsync(40_000)
    expect(m.c.getSnapshot().locked).toBe(true)
  })
  it('hold passes the result (and the error) through', async () => {
    const m = await ready()
    expect(await m.c.hold(async () => 7)).toBe(7)
    await expect(m.c.hold(async () => { throw new Error('cancelled') })).rejects.toThrow('cancelled')
    m.c.appWentBackground() // and nothing is left held
    expect(m.c.getSnapshot().locked).toBe(false) // (300 s: no lock on leaving)
  })
  it('coming back asks the server even when there is no lock, because one may have been switched on elsewhere', async () => {
    const m = await ready({ appLockEnabled: false })
    m.api.getState.mockClear()
    m.server.state = st({ appLockEnabled: true, locked: true })
    m.c.appCameBack()
    await settle()
    expect(m.c.getSnapshot()).toMatchObject({ enabled: true, locked: true })
  })
  it('leaving with no lock does nothing', async () => {
    const m = await ready({ appLockEnabled: false })
    m.c.appWentBackground()
    expect(m.api.lock).not.toHaveBeenCalled()
  })
})

describe('entering the PIN', () => {
  it('hands the answer back as it is, wrong tries included', async () => {
    const m = await ready({ locked: true })
    const wrong: PinResult = { ...ok, ok: false, reason: 'wrong_pin', triesLeft: 4, failedAttempts: 1 }
    m.api.verifyPin.mockResolvedValueOnce(wrong)
    expect(await m.c.unlockWithPin('1357')).toEqual(wrong)
    expect(m.api.verifyPin).toHaveBeenCalledWith('1357')
    expect(m.signOut).not.toHaveBeenCalled()
  })
  it('signs out when the server ended the session for too many wrong PINs', async () => {
    const m = await ready({ locked: true })
    m.api.verifyPin.mockResolvedValueOnce({ ...ok, ok: false, reason: 'wrong_pin', signedOut: true })
    expect((await m.c.unlockWithPin('1357')).signedOut).toBe(true)
    expect(m.signOut).toHaveBeenCalledTimes(1)
  })
  it('signs out, and says why, when the session no longer exists', async () => {
    const m = await ready({ locked: true })
    m.api.verifyPin.mockRejectedValueOnce(err('28000', 'Your session has ended.'))
    await expect(m.c.unlockWithPin('2486')).rejects.toThrow('Your session has ended.')
    expect(m.signOut).toHaveBeenCalledTimes(1)
    m.api.verifyPin.mockRejectedValueOnce(new Error('offline'))
    await expect(m.c.unlockWithPin('2486')).rejects.toThrow('offline')
    expect(m.signOut).toHaveBeenCalledTimes(1) // a network error does not sign anyone out
  })
  it('opens only when the server then says so: a right PIN changes nothing until the answer is read back', async () => {
    const m = await ready({ locked: true })
    expect((await m.c.unlockWithPin('2486')).ok).toBe(true)
    expect(m.c.getSnapshot().locked).toBe(true) // the screen is the server's to change
    m.server.state.locked = false
    await m.c.finishUnlock()
    expect(m.c.getSnapshot().locked).toBe(false)
  })
  it('a sign-out failure while ending a session is not fatal', async () => {
    const m = await ready({ locked: true })
    m.signOut.mockRejectedValue(new Error('offline'))
    m.api.verifyPin.mockResolvedValueOnce({ ...ok, ok: false, signedOut: true })
    await expect(m.c.unlockWithPin('1357')).resolves.toMatchObject({ signedOut: true })
    m.api.getState.mockRejectedValueOnce(err('28000'))
    await m.c.refresh()
  })
})
