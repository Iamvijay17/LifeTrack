import { describe, expect, it } from 'vitest'
import { fmtClock, localDayMinutes, minutesToTime, tzOffsetMs, zonedToMs } from '../src'

const iso = (ms: number) => new Date(ms).toISOString()

describe('zonedToMs (wall clock -> instant)', () => {
  it('a zone without daylight saving is a fixed offset', () => {
    expect(iso(zonedToMs('2026-11-10', '09:00', 'Asia/Kolkata'))).toBe('2026-11-10T03:30:00.000Z')
    expect(iso(zonedToMs('2026-06-01', '00:00', 'UTC'))).toBe('2026-06-01T00:00:00.000Z')
  })
  it('uses the offset in force on that date (New York: EST in winter, EDT in summer)', () => {
    expect(iso(zonedToMs('2026-01-15', '09:00', 'America/New_York'))).toBe('2026-01-15T14:00:00.000Z')
    expect(iso(zonedToMs('2026-07-15', '09:00', 'America/New_York'))).toBe('2026-07-15T13:00:00.000Z')
  })
  it('a time skipped by the clocks moving forward lands after the gap (02:30 -> 03:30)', () => {
    expect(iso(zonedToMs('2026-03-08', '02:30', 'America/New_York'))).toBe('2026-03-08T07:30:00.000Z') // 03:30 EDT
    expect(iso(zonedToMs('2026-03-29', '02:30', 'Europe/Berlin'))).toBe('2026-03-29T01:30:00.000Z') // 03:30 CEST
  })
  it('a time repeated when the clocks fall back resolves to the first occurrence', () => {
    expect(iso(zonedToMs('2026-11-01', '01:30', 'America/New_York'))).toBe('2026-11-01T05:30:00.000Z') // EDT, not EST
    expect(iso(zonedToMs('2026-10-25', '02:30', 'Europe/Berlin'))).toBe('2026-10-25T00:30:00.000Z') // CEST, not CET
  })
  it('southern hemisphere and half-hour shifts (Sydney, Lord Howe)', () => {
    expect(iso(zonedToMs('2026-01-10', '12:00', 'Australia/Sydney'))).toBe('2026-01-10T01:00:00.000Z') // AEDT +11
    expect(iso(zonedToMs('2026-07-10', '12:00', 'Australia/Sydney'))).toBe('2026-07-10T02:00:00.000Z') // AEST +10
    expect(iso(zonedToMs('2026-01-10', '12:00', 'Australia/Lord_Howe'))).toBe('2026-01-10T01:00:00.000Z') // +11
    expect(iso(zonedToMs('2026-07-10', '12:00', 'Australia/Lord_Howe'))).toBe('2026-07-10T01:30:00.000Z') // +10:30
  })
  it('round-trips every quarter hour of a daylight-saving day, except the skipped ones', () => {
    const tz = 'America/New_York'
    for (let m = 0; m < 1440; m += 15) {
      const t = minutesToTime(m)
      const back = localDayMinutes(zonedToMs('2026-03-08', t, tz), tz)
      expect(back.date).toBe('2026-03-08')
      if (m < 120 || m >= 180) expect(back.minutes).toBe(m)
      else expect(back.minutes).toBe(m + 60) // 02:00-02:59 does not exist
    }
  })
})

describe('reading wall-clock parts back', () => {
  it('local date and minutes follow the zone, not the device', () => {
    expect(localDayMinutes('2026-11-10T20:00:00Z', 'Asia/Kolkata')).toEqual({ date: '2026-11-11', minutes: 90 })
    expect(localDayMinutes('2026-11-10T20:00:00Z', 'America/New_York')).toEqual({ date: '2026-11-10', minutes: 15 * 60 })
  })
  it('midnight is hour 0, never 24', () => {
    expect(localDayMinutes('2026-11-10T00:00:00Z', 'UTC')).toEqual({ date: '2026-11-10', minutes: 0 })
  })
  it('offsets move with daylight saving', () => {
    expect(tzOffsetMs(Date.parse('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-5 * 3600000)
    expect(tzOffsetMs(Date.parse('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-4 * 3600000)
  })
})

describe('clock formatting', () => {
  it('24-hour and 12-hour', () => {
    expect(fmtClock(9 * 60 + 5)).toBe('09:05')
    expect(fmtClock(0, true)).toBe('12:00 AM')
    expect(fmtClock(12 * 60 + 30, true)).toBe('12:30 PM')
    expect(fmtClock(23 * 60 + 59, true)).toBe('11:59 PM')
    expect(minutesToTime(75)).toBe('01:15')
  })
})
