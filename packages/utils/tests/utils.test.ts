import { describe, expect, it } from 'vitest'
import { addDays, addMonths, dateStrInTz, diffDays, eachDay, fmtDuration, formatMoney, isValidDay, monthEnd, parseMoney, paiseToInput, startOfWeek, uid, zonedToIso } from '../src'

describe('dates', () => {
  it('does day arithmetic independent of device timezone', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01')
    expect(diffDays('2024-03-01', '2024-02-28')).toBe(2)
    expect(monthEnd('2024-02-10')).toBe('2024-02-29')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-01')
  })
  it('computes week start and ranges', () => {
    expect(startOfWeek('2024-05-15', 1)).toBe('2024-05-13')
    expect(eachDay('2024-05-01', '2024-05-03')).toEqual(['2024-05-01', '2024-05-02', '2024-05-03'])
  })
  it('validates days', () => {
    expect(isValidDay('2024-02-30')).toBe(false)
    expect(isValidDay('2024-02-29')).toBe(true)
  })
  it('resolves the user-local date in a timezone', () => {
    expect(dateStrInTz('2024-05-01T20:00:00Z', 'Asia/Kolkata')).toBe('2024-05-02')
    expect(zonedToIso('2024-05-02', '01:30', 'Asia/Kolkata')).toBe('2024-05-01T20:00:00.000Z')
  })
  it('formats durations', () => {
    expect(fmtDuration(125)).toBe('2h 5m')
    expect(fmtDuration(null)).toBe('—')
  })
})

describe('money', () => {
  it('parses to integer paise with string math', () => {
    expect(parseMoney('1,250.5')).toBe(125050)
    expect(parseMoney('12.345')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(paiseToInput(125050)).toBe('1250.50')
    expect(formatMoney(150000, 'INR')).toContain('1,500')
  })
})

describe('uid', () => {
  it('is unique', () => expect(uid()).not.toBe(uid()))
})
