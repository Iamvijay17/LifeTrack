import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateStrInTz, formatLpa, pct, plural, timeStrInTz, uid } from '../src'

describe('helpers added when the web and mobile work were merged', () => {
  it('pct is a whole-number percentage and 0 for an empty total', () => {
    expect([pct(1, 3), pct(2, 3), pct(5, 0), pct(0, 0), pct(3, 3)]).toEqual([33, 67, 0, 0, 100])
  })
  it('plural picks the singular only for exactly one, with an irregular plural when given', () => {
    expect([plural(1, 'session'), plural(0, 'session'), plural(2, 'session'), plural(2, 'person', 'people')]).toEqual(['1 session', '0 sessions', '2 sessions', '2 people'])
  })
  it('formatLpa prints stored paise per year as LPA and nothing for no package', () => {
    expect(formatLpa(1_800_000_00)).toBe('18 LPA')
    expect(formatLpa(null)).toBeNull()
    expect(formatLpa(undefined)).toBeNull()
  })
  it('timeStrInTz formats the wall clock in the given zone', () => {
    expect(timeStrInTz('2026-11-02T04:00:00Z', 'Asia/Kolkata')).toBe('09:30')
    expect(timeStrInTz(new Date('2026-11-02T04:00:00Z'), 'UTC')).toBe('04:00')
  })
  it('dateStrInTz reuses its per-zone formatter and still gives each zone its own date', () => {
    expect(dateStrInTz('2026-11-02T20:00:00Z', 'Asia/Kolkata')).toBe('2026-11-03')
    expect(dateStrInTz('2026-11-02T20:00:00Z', 'Asia/Kolkata')).toBe('2026-11-03')
    expect(dateStrInTz('2026-11-02T20:00:00Z', 'UTC')).toBe('2026-11-02')
  })
})

describe('uid', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('uses crypto.randomUUID when available', () => {
    expect(uid()).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('falls back to a random string without crypto.randomUUID, and the ids differ', () => {
    vi.stubGlobal('crypto', undefined)
    const a = uid(), b = uid()
    expect(a).toMatch(/^[a-z0-9]+$/)
    expect(a).not.toBe(b)
  })
})
