import { describe, expect, it } from 'vitest'
import { addDays, addMonths, dateStrInTz, diffDays, eachDay, endOfWeek, fmtDateTime, fmtDay, fmtDuration, formatMoney, inRange, isValidDay, lpaToPaise, minutesToHours, monthEnd, monthKey, monthStart, paiseToInput, paiseToLpa, parseDay, parseMoney, parseTags, sleepMinutes, startOfWeek, timeStrInTz, timeToMinutes, todayStr, weekday, zonedToIso } from '../src'

// Deterministic pseudo-random so failures are reproducible.
let seed = 42
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))
const day = () => `${int(2020, 2032)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`

describe('date arithmetic properties (1,000 random days)', () => {
  it('addDays and diffDays are inverses, and addDays stays a valid day', () => {
    for (let i = 0; i < 1000; i++) {
      const d = day(), n = int(-800, 800)
      const e = addDays(d, n)
      expect(isValidDay(e)).toBe(true)
      expect(diffDays(e, d)).toBe(n)
      expect(addDays(e, -n)).toBe(d)
    }
  })
  it('startOfWeek is a start-of-week day within 6 days before; endOfWeek is 6 days later; both respect the chosen first day', () => {
    for (let i = 0; i < 500; i++) {
      const d = day(), w = int(0, 1)
      const s = startOfWeek(d, w)
      expect(weekday(s)).toBe(w)
      expect(diffDays(d, s)).toBeGreaterThanOrEqual(0); expect(diffDays(d, s)).toBeLessThanOrEqual(6)
      expect(diffDays(endOfWeek(d, w), s)).toBe(6)
    }
  })
  it('month helpers: monthEnd is the last day, addMonths lands on the 1st, monthKey/monthStart agree', () => {
    for (let i = 0; i < 500; i++) {
      const d = day()
      const end = monthEnd(d)
      expect(monthKey(end)).toBe(monthKey(d))
      expect(monthKey(addDays(end, 1))).not.toBe(monthKey(d))
      expect(addMonths(d, int(-30, 30)).endsWith('-01')).toBe(true)
      expect(monthStart(d)).toBe(`${monthKey(d)}-01`)
    }
    expect(monthEnd('2024-02-10')).toBe('2024-02-29'); expect(monthEnd('2026-02-10')).toBe('2026-02-28')
  })
  it('eachDay is inclusive, ordered and gap-free; inRange is inclusive and null-safe', () => {
    const days = eachDay('2026-02-26', '2026-03-02')
    expect(days).toEqual(['2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
    expect(eachDay('2026-03-02', '2026-02-26')).toEqual([])
    expect([inRange('2026-03-01', '2026-03-01', '2026-03-02'), inRange('2026-03-03', '2026-03-01', '2026-03-02'), inRange(null, 'a', 'z'), inRange(undefined, 'a', 'z')]).toEqual([true, false, false, false])
  })
})

describe('timezone round-trips (zonedToIso ↔ dateStrInTz/timeStrInTz) incl. DST zones', () => {
  const ZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Australia/Sydney', 'Asia/Tokyo']
  it('a local date+time converted to UTC and back is unchanged (away from DST gaps)', () => {
    let checked = 0
    for (let i = 0; i < 1200; i++) {
      const tz = ZONES[int(0, ZONES.length - 1)], d = day(), h = int(5, 21), m = int(0, 59) // 05:00–21:59 avoids the 01:00–03:00 DST transition windows
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const iso = zonedToIso(d, time, tz)
      expect(dateStrInTz(iso, tz), `${d} ${time} ${tz}`).toBe(d)
      expect(timeStrInTz(iso, tz), `${d} ${time} ${tz}`).toBe(time)
      checked++
    }
    expect(checked).toBe(1200)
  })
  it('known conversions, including the day boundary and a DST change', () => {
    expect(zonedToIso('2026-11-02', '09:00', 'Asia/Kolkata')).toBe('2026-11-02T03:30:00.000Z')
    expect(zonedToIso('2026-01-15', '09:00', 'America/New_York')).toBe('2026-01-15T14:00:00.000Z') // EST (UTC-5)
    expect(zonedToIso('2026-07-15', '09:00', 'America/New_York')).toBe('2026-07-15T13:00:00.000Z') // EDT (UTC-4)
    expect(dateStrInTz('2026-11-01T20:00:00Z', 'Asia/Kolkata')).toBe('2026-11-02') // already tomorrow in Kolkata
    expect(dateStrInTz('2026-11-02T03:00:00Z', 'America/Los_Angeles')).toBe('2026-11-01')
    expect(todayStr('Asia/Tokyo', new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
    expect(timeStrInTz('2026-11-02T03:30:00Z', 'Asia/Kolkata')).toBe('09:00')
  })
  it('formatting helpers do not shift the calendar day', () => {
    expect(fmtDay('2026-11-02', 'd MMM yyyy')).toBe('2 Nov 2026')
    expect(fmtDay(null)).toBe(''); expect(fmtDay('')).toBe('')
    expect(parseDay('2026-11-02').getDate()).toBe(2)
    expect(fmtDateTime('2026-11-02T03:30:00Z', 'Asia/Kolkata')).toMatch(/2 Nov.*9:00/i)
  })
})

describe('time-of-day helpers', () => {
  it('sleep, minutes and durations', () => {
    expect([timeToMinutes('06:30'), timeToMinutes(''), timeToMinutes(null)]).toEqual([390, null, null])
    expect([sleepMinutes('23:30', '06:30'), sleepMinutes('22:00', '23:00'), sleepMinutes('00:00', '08:00'), sleepMinutes('06:00', '06:00'), sleepMinutes('x', '06:00'), sleepMinutes(null, null)]).toEqual([420, 60, 480, null, null, null])
    for (let i = 0; i < 300; i++) { const b = int(0, 1439), w = int(0, 1439); if (b !== w) { const s = sleepMinutes(`${String(Math.floor(b / 60)).padStart(2, '0')}:${String(b % 60).padStart(2, '0')}`, `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`); expect(s).toBeGreaterThan(0); expect(s).toBeLessThan(1440) } }
    expect([fmtDuration(0), fmtDuration(59), fmtDuration(60), fmtDuration(61.6), fmtDuration(NaN), fmtDuration(undefined)]).toEqual(['0m', '59m', '1h', '1h 2m', '—', '—'])
    expect([minutesToHours(90), minutesToHours(100)]).toEqual([1.5, 1.7])
  })
})

describe('money properties', () => {
  it('parseMoney ↔ paiseToInput round-trip exactly for 5,000 random amounts (no float drift)', () => {
    for (let i = 0; i < 5000; i++) {
      const paise = int(1, 99_999_999)
      const text = paiseToInput(paise)
      expect(parseMoney(text)).toBe(paise)
    }
  })
  it('parseMoney accepts what people type and rejects what would be ambiguous', () => {
    const cases: [unknown, number | null][] = [['1,250.5', 125050], ['₹99', 9900], ['$ 1 000', 100000], ['0.1', 10], ['0.', 0], ['.5', null], ['1.234', null], ['-5', null], ['1e3', null], ['abc', null], ['', null], [null, null], [undefined, null], [' 12 ', 1200], ['99999999999999999999', null]]
    for (const [input, expected] of cases) expect(parseMoney(input), String(input)).toBe(expected)
  })
  it('formatting: currencies, compact, fractions, null', () => {
    expect(formatMoney(150000, 'INR')).toBe('₹1,500')
    expect(formatMoney(150050, 'INR')).toBe('₹1,500.50')
    expect(formatMoney(150000, 'USD')).toBe('$1,500')
    expect(formatMoney(150000, 'EUR')).toContain('1.500')
    expect(formatMoney(null)).toBe('₹0'); expect(formatMoney(undefined, 'USD')).toBe('$0')
    expect(formatMoney(12345600, 'INR', { compact: true })).toMatch(/1\.2L|123K|1\.2/)
    expect(formatMoney(100, 'XXX')).toBe('₹1') // unknown currency falls back to INR
    expect([paiseToInput(null), paiseToInput(0), paiseToInput(5), paiseToInput(100), paiseToInput(1050)]).toEqual(['', '0', '0.05', '1', '10.50'])
  })
  it('LPA helpers convert annual packages exactly', () => {
    expect([lpaToPaise('18.5'), lpaToPaise('abc'), lpaToPaise('')]).toEqual([185000000, null, null])
    expect([paiseToLpa(185000000), paiseToLpa(null)]).toEqual([18.5, null])
  })
})

describe('parseTags', () => {
  it('normalises, de-duplicates, strips #, ignores blanks, caps at 12', () => {
    expect(parseTags(' React, #Interview ,react,,  ')).toEqual(['react', 'interview'])
    expect(parseTags(null)).toEqual([]); expect(parseTags(undefined)).toEqual([]); expect(parseTags(42)).toEqual(['42'])
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(','))).toHaveLength(12)
  })
})
