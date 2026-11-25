import { afterEach, describe, expect, it } from 'vitest'
import { fmtClock, fmtDateTime, fmtDay, localizeDatePattern, setDisplayPrefs } from '../src/dates'

afterEach(() => setDisplayPrefs({ date: 'auto', time: 'auto' }))

describe('date display preference', () => {
  it('leaves every pattern alone by default', () => {
    expect(fmtDay('2026-11-24')).toBe('Tue, 24 Nov')
    expect(fmtDay('2026-11-24', 'd MMM yyyy')).toBe('24 Nov 2026')
  })
  it('rewrites the day-and-month part into the chosen numeric style', () => {
    setDisplayPrefs({ date: 'dmy' })
    expect(fmtDay('2026-11-24', 'd MMM yyyy')).toBe('24/11/2026')
    expect(fmtDay('2026-11-04')).toBe('Wed, 04/11')
    setDisplayPrefs({ date: 'mdy' })
    expect(fmtDay('2026-11-24', 'd MMMM yyyy')).toBe('11/24/2026')
    expect(fmtDay('2026-11-24', 'MMM d, yyyy')).toBe('11/24/2026')
    setDisplayPrefs({ date: 'ymd' })
    expect(fmtDay('2026-11-24', 'EEE d MMM yyyy')).toBe('Tue 2026-11-24')
  })
  it('leaves month-only, year-only and weekday-only patterns alone', () => {
    setDisplayPrefs({ date: 'dmy' })
    expect(fmtDay('2026-11-24', 'MMMM yyyy')).toBe('November 2026')
    expect(fmtDay('2026-11-24', 'EEE')).toBe('Tue')
    expect(localizeDatePattern('HH:mm', 'dmy')).toBe('HH:mm')
  })
})

describe('time display preference', () => {
  it('fmtClock follows the preference unless the caller decides', () => {
    expect(fmtClock(13 * 60 + 5)).toBe('13:05')
    setDisplayPrefs({ time: '12h' })
    expect(fmtClock(13 * 60 + 5)).toBe('1:05 PM')
    expect(fmtClock(13 * 60 + 5, false)).toBe('13:05') // an explicit choice wins
    setDisplayPrefs({ time: '24h' })
    expect(fmtClock(13 * 60 + 5)).toBe('13:05')
  })
  it('fmtDateTime uses the chosen clock and date style', () => {
    setDisplayPrefs({ time: '24h', date: 'dmy' })
    expect(fmtDateTime('2026-11-24T10:30:00Z', 'UTC')).toMatch(/^24\/11.*10:30$/)
    setDisplayPrefs({ time: '12h', date: 'mdy' })
    expect(fmtDateTime('2026-11-24T15:30:00Z', 'UTC')).toMatch(/11\/24.*3:30\s?PM/i)
  })
})
