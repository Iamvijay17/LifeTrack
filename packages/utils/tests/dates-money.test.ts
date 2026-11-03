import { describe, it, expect } from 'vitest'
import { dateStrInTz, addDays, startOfWeek, weekday, zonedToIso, fmtDuration, monthEnd, eachDay, parseMoney, formatMoney, paiseToInput, lpaToPaise } from '../src'

describe('dates (Asia/Kolkata)', () => {
  it('uses IST for the calendar day, not UTC', () => {
    // 2026-03-10 20:00 UTC == 2026-03-11 01:30 IST
    expect(dateStrInTz(new Date('2026-03-10T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-03-11')
    expect(dateStrInTz(new Date('2026-03-10T20:00:00Z'), 'UTC')).toBe('2026-03-10')
  })
  it('date arithmetic is timezone independent', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(weekday('2026-11-01')).toBe(0)
    expect(startOfWeek('2026-11-01', 1)).toBe('2026-10-26')
    expect(startOfWeek('2026-11-01', 0)).toBe('2026-11-01')
    expect(monthEnd('2026-02-10')).toBe('2026-02-28')
    expect(eachDay('2026-01-30', '2026-02-02')).toHaveLength(4)
  })
  it('converts IST wall-clock to UTC', () => {
    expect(zonedToIso('2026-03-11', '09:00', 'Asia/Kolkata')).toBe('2026-03-11T03:30:00.000Z')
  })
  it('formats durations', () => {
    expect(fmtDuration(125)).toBe('2h 5m'); expect(fmtDuration(60)).toBe('1h'); expect(fmtDuration(45)).toBe('45m')
  })
})

describe('money (integer paise)', () => {
  it('parses without float error', () => {
    expect(parseMoney('0.1')).toBe(10)
    expect(parseMoney('1,250.50')).toBe(125050)
    expect(parseMoney('19.99')).toBe(1999)
    expect(parseMoney('1.005')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
    expect(0.1 + 0.2).not.toBe(0.3) // why we use paise
    expect(parseMoney('0.1')! + parseMoney('0.2')!).toBe(30)
  })
  it('round-trips and formats', () => {
    expect(paiseToInput(125050)).toBe('1250.50'); expect(paiseToInput(5000)).toBe('50')
    expect(formatMoney(125050)).toContain('1,250.50'); expect(formatMoney(100000)).toContain('1,000')
    expect(lpaToPaise('12.5')).toBe(125000000)
  })
})

