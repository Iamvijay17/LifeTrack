import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { nonNegativeNumber, optionalNumber } from '@/lib/validation'
import { parseBackup } from '@/services/backup'

const msg = (schema, v) => schema.safeParse(v).error?.issues[0]?.message

describe('custom validation messages survive the zod upgrade', () => {
  it('a non-numeric value gets the field-specific message, not zod’s default', () => {
    expect(msg(nonNegativeNumber(10, 'Sets'), 'abc')).toBe('Sets: enter a number')
    expect(msg(z.coerce.number({ error: 'Enter hours' }), 'abc')).toBe('Enter hours')
  })
  it('range messages', () => {
    expect(msg(nonNegativeNumber(10, 'Sets'), -1)).toBe('Sets can’t be negative')
    expect(msg(nonNegativeNumber(10, 'Sets'), 11)).toBe('Sets is too large')
    expect(nonNegativeNumber(10, 'Sets').safeParse('7').data).toBe(7)
  })
  it('blank is allowed only for the optional variant', () => {
    expect(optionalNumber(10, 'Sets').safeParse('').success).toBe(true)
    expect(optionalNumber(10, 'Sets').safeParse('abc').success).toBe(false)
  })
  it('backup parsing: wrong app marker, too-new version, malformed tables', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1, tables: {} }))).toThrow('This is not a LifeTrack backup file.')
    expect(() => parseBackup(JSON.stringify({ app: 'lifetrack', version: 999, tables: {} }))).toThrow(/newer version/)
    expect(() => parseBackup(JSON.stringify({ app: 'lifetrack', version: 1, tables: { tasks: [{ title: 'no id' }] } }))).toThrow()
  })
})
