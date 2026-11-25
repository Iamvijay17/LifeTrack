import { describe, expect, it } from 'vitest'
import {
  AUTO_LOCK_OPTIONS,
  assessPassword,
  formatWait,
  isAutoLockSeconds,
  LOCKOUT,
  lockoutSecondsAfter,
  passwordLockoutSecondsAfter,
  patternShare,
  revokesSession,
  triesLeftBeforeLockout,
  validatePin,
  weakPinReason,
} from '../src/security'

describe('PIN rules', () => {
  it.each(['2486', '7319', '583920', '908142'])('accepts %s', (pin) => expect(validatePin(pin)).toEqual({ ok: true, reason: null }))
  it.each([
    ['12', /4 or 6/],
    ['12345', /4 or 6/],
    ['1234567', /4 or 6/],
    ['12a4', /digits only/],
    ['', /digits only/],
    ['١٢٣٤', /digits only/], // Arabic-Indic digits are not ASCII digits
    ['0000', /repeating/],
    ['777777', /repeating/],
    ['1234', /runs/],
    ['4321', /runs/],
    ['7890', /runs/],
    ['0987', /runs/],
    ['123456', /runs/],
    ['2580', /first an attacker/],
    ['1212', /first an attacker/],
    ['112233', /first an attacker/],
  ])('rejects %s', (pin, reason) => {
    const r = validatePin(pin)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(reason)
  })
  it('enforces the chosen length when there is one', () => {
    expect(validatePin('2486', 6).ok).toBe(false)
    expect(validatePin('248613', 6).ok).toBe(true)
  })
  it('does not accept non-strings', () => {
    for (const v of [null, undefined, 2486, ['2486']]) expect(validatePin(v).ok).toBe(false)
  })
  it('weakPinReason is null for a fine PIN', () => expect(weakPinReason('2486')).toBeNull())
})

describe('lockout schedule', () => {
  it('locks after every 5th wrong try, for twice as long each round, up to an hour', () => {
    const at = (n) => lockoutSecondsAfter(n)
    expect([1, 2, 3, 4].map(at)).toEqual([0, 0, 0, 0])
    expect([5, 10, 15, 20, 25, 30, 35, 40].map(at)).toEqual([30, 60, 120, 240, 480, 960, 1920, 3600])
    expect(at(500)).toBe(LOCKOUT.maxSeconds)
    expect([0, -1, NaN, undefined].map(at)).toEqual([0, 0, 0, 0])
  })
  it('ends the session from the second lockout on', () => {
    expect([5, 9, 10, 11, 15, 20].map(revokesSession)).toEqual([false, false, true, false, true, true])
  })
  it('counts the tries left in the current round', () => {
    expect([0, 1, 4, 5, 6].map(triesLeftBeforeLockout)).toEqual([5, 4, 1, 5, 4])
  })
  it('locks password sign-in for 1 minute after every 5th wrong password, doubling up to 15 minutes', () => {
    expect([1, 4, 5, 9, 10, 15, 20, 25, 100, 0, NaN].map(passwordLockoutSecondsAfter)).toEqual([0, 0, 60, 0, 120, 240, 480, 900, 900, 0, 0])
  })
  it('says how long to wait', () => {
    expect([0, 1, 59, 60, 90, 3600, 3660, 0.2].map(formatWait)).toEqual(['0 s', '1 s', '59 s', '1 min', '1 min 30 s', '1 h', '1 h 1 min', '1 s'])
  })
  it('knows the auto-lock choices', () => {
    expect(AUTO_LOCK_OPTIONS.map((o) => o.seconds)).toEqual([0, 60, 300, 900, 1800, 3600])
    expect(isAutoLockSeconds(300)).toBe(true)
    expect(isAutoLockSeconds(299)).toBe(false)
  })
})

describe('password strength', () => {
  const ok = (pw, ctx) => assessPassword(pw, ctx).ok
  it.each(['Violet-Harbor-42', 'correct horse battery staple', 'k7#Qm2!vXz9p', 'Sunrise over Chennai 2031', 'mango tiger lamp river'])('accepts %s', (pw) => {
    expect(ok(pw)).toBe(true)
  })
  it.each([
    ['', 'at least 8'],
    ['Ab1!', 'at least 8'],
    ['password', 'most common'],
    ['password123', 'most common'],
    ['Password1!', 'most common'],
    ['p@ssw0rd', 'most common'],
    ['Welcome2024!', 'most common'],
    ['QWERTYUIOP', 'most common'],
    ['12345678', 'runs'],
    ['abcdefgh', 'runs'],
    ['abcd1234', 'runs'],
    ['aaaaaaaaaa', 'runs'],
    ['qwerty12345', 'runs'],
  ])('rejects %j', (pw, why) => {
    const r = assessPassword(pw)
    expect(r.ok).toBe(false)
    expect(r.issues.join(' ')).toContain(why)
  })
  it('rejects passwords built from the name or the email', () => {
    expect(ok('Ananya-2031-x', { name: 'Ananya Rao' })).toBe(false)
    expect(ok('vijay-kumar-77', { email: 'vijay@example.com' })).toBe(false)
    expect(ok('Ananya-2031-x', { name: 'Al' })).toBe(true) // too short to be a signal
    expect(ok('Violet-Harbor-42', { name: 'Ananya Rao', email: 'ann@example.com' })).toBe(true)
  })
  it('refuses more than bcrypt can use, counted in bytes', () => {
    expect(ok('Ab1-'.repeat(18))).toBe(true) // 72 bytes
    expect(assessPassword('Ab1-'.repeat(19)).issues.join(' ')).toMatch(/at most 72/)
    expect(assessPassword('é'.repeat(40)).issues.join(' ')).toMatch(/at most 72/) // 40 characters, 80 bytes
  })
  it('scores length and variety, and caps what is guessable', () => {
    const score = (pw) => assessPassword(pw).score
    expect(score('mango tiger lamp river')).toBeGreaterThanOrEqual(3)
    expect(score('k7#Qm2!vXz9p')).toBeGreaterThanOrEqual(3)
    expect(score('password')).toBeLessThanOrEqual(1)
    expect(score('Violet-Harbor-42')).toBeGreaterThan(score('violetha'))
    expect(assessPassword('Violet-Harbor-42').label).toMatch(/strong/i)
    expect(assessPassword('x').label).toBe('Very weak')
  })
  it('measures runs without being fooled by coincidences', () => {
    expect(patternShare('abcd1234')).toBe(1)
    expect(patternShare('zyxw')).toBe(1)
    expect(patternShare('aaaa')).toBe(1)
    expect(patternShare('ab')).toBe(0)
    expect(patternShare('k7#Qm2!vXz9p')).toBe(0)
    expect(patternShare('Violet-Harbor-42')).toBe(0)
    expect(patternShare('')).toBe(0)
  })
})
