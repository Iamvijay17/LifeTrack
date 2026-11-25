import { describe, expect, it } from 'vitest'
import { LOCKOUT } from '@lifetrack/core/security'
import { TICK_MS, describeDevice, explainPin, heartbeatEvery, idleExpired, lockOnLeave, lockOnReturn, timeAgo, type PinResult } from '../src/features/security/lockPolicy'

const pin = (over: Partial<PinResult> = {}): PinResult => ({ ok: false, reason: 'wrong_pin', triesLeft: 4, lockoutSeconds: 0, signedOut: false, failedAttempts: 1, ...over })

describe('when the phone locks itself', () => {
  it('renews the server\'s window often enough that it never lapses under an active person: every third of the auto-lock time, between 10 s and 30 s', () => {
    expect(heartbeatEvery(60)).toBe(20_000)
    expect(heartbeatEvery(300)).toBe(30_000)
    expect(heartbeatEvery(3600)).toBe(30_000)
    expect(heartbeatEvery(0)).toBe(10_000) // "when I leave the app": still renewed while the app is open
    expect(heartbeatEvery(15)).toBe(10_000)
    // the server keeps a session open for the auto-lock time (at least 60 s) plus 30 s: a beat is always sooner than that
    for (const auto of [0, 60, 300, 900, 1800, 3600]) expect(heartbeatEvery(auto)).toBeLessThan((Math.max(auto, 60) + 30) * 1000)
  })
  it('checks for idleness every few seconds', () => expect(TICK_MS).toBe(5_000))
  it('is idle only after the whole time, and never for "when I leave the app"', () => {
    expect(idleExpired(60, 59_999, 0)).toBe(false)
    expect(idleExpired(60, 60_000, 0)).toBe(true)
    expect(idleExpired(60, 100_000, 50_000)).toBe(false)
    expect(idleExpired(0, 10_000_000, 0)).toBe(false)
  })
  it('locks on leaving the app only for "when I leave the app"', () => {
    expect(lockOnLeave(0)).toBe(true)
    for (const s of [60, 300, 3600]) expect(lockOnLeave(s)).toBe(false)
  })
  it('locks on coming back only after at least the auto-lock time away', () => {
    expect(lockOnReturn(300, 299_999)).toBe(false)
    expect(lockOnReturn(300, 300_000)).toBe(true)
    expect(lockOnReturn(0, 10 * 60_000)).toBe(false) // that one locked when the app was left
  })
})

describe('what a wrong PIN means to a person', () => {
  it('counts the tries left', () => {
    expect(explainPin(pin({ triesLeft: 4 }))).toBe('Wrong PIN. 4 tries left before a short lockout.')
    expect(explainPin(pin({ triesLeft: 1 }))).toBe('Wrong PIN. 1 try left before a short lockout.')
  })
  it('says how long to wait during a lockout, however it is reported', () => {
    expect(explainPin(pin({ reason: 'locked_out', lockoutSeconds: 90 }))).toBe('Too many wrong PINs. Wait 1 min 30 s.')
    expect(explainPin(pin({ lockoutSeconds: 30, triesLeft: 0 }))).toBe('Too many wrong PINs. Wait 30 s.')
    expect(LOCKOUT.every).toBe(5) // the rule this wording is written for: the 5th wrong PIN locks entry
  })
  it('says so when the session was ended', () => {
    expect(explainPin(pin({ signedOut: true, lockoutSeconds: 60 }))).toBe('Too many wrong PINs. For your safety you have been signed out.')
  })
})

describe('describing a device in the list of sessions', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36', 'Chrome on Windows', 'desktop'],
    ['Mozilla/5.0 (Windows NT 10.0) Chrome/126 Safari/537 Edg/126', 'Edge on Windows', 'desktop'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605 Version/17.5 Safari/605', 'Safari on macOS', 'desktop'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox on Linux', 'desktop'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36', 'Chrome on Android', 'phone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605 Version/17.5 Mobile Safari/604', 'Safari on iOS', 'phone'],
    ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605 Safari/604', 'Safari on iOS', 'tablet'],
    ['okhttp/4.12.0', 'LifeTrack app', 'phone'],
    ['LifeTrack/1 CFNetwork/1494 Darwin/23.4', 'LifeTrack app on iOS', 'phone'],
    ['', 'Unknown device', 'unknown'],
    ['curl/8.0', 'Unknown device', 'unknown'],
  ])('%s', (ua, label, kind) => expect(describeDevice(ua)).toEqual({ label, kind }))
  it('copes with a missing user agent', () => expect(describeDevice(undefined as unknown as string).label).toBe('Unknown device'))
  it('names an operating system alone when there is no browser', () => expect(describeDevice('SomeClient (Windows NT 10.0)').label).toBe('Windows device'))
})

describe('times in the lists', () => {
  const now = Date.parse('2026-11-11T12:00:00Z')
  it.each([
    ['2026-11-11T11:59:40Z', 'just now'],
    ['2026-11-11T11:55:00Z', '5 min ago'],
    ['2026-11-11T09:00:00Z', '3 h ago'],
    ['2026-11-10T00:00:00Z', '36 h ago'],
    ['2026-11-07T12:00:00Z', '4 days ago'],
    ['2026-11-12T12:00:00Z', 'just now'], // a clock a little ahead is not "in the future"
    [null, 'never'],
    [undefined, 'never'],
    ['not a date', 'never'],
  ])('%s → %s', (iso, text) => expect(timeAgo(iso as string, now)).toBe(text))
})
