import { describe, expect, it } from 'vitest'
import { healthSummary, healthWeek, historyLine, isValidCustomWater, signedKg } from '../src/health'
import { sleepMinutes } from '../src/sleep'

const L = (d, o = {}) => ({ id: d, log_date: d, sleep_minutes: null, water_ml: 0, steps: 0, energy_level: null, weight_kg: null, ...o })
describe('health', () => {
  it('handles overnight sleep and ambiguous times', () => {
    expect(sleepMinutes('23:30', '06:30')).toBe(420)
    expect(sleepMinutes('06:00', '06:00')).toBeNull()
    expect(sleepMinutes('', '06:00')).toBeNull()
  })
  const logs = [L('2026-10-30', { sleep_minutes: 420, weight_kg: '72.0' }), L('2026-11-01', { sleep_minutes: 480, water_ml: 1000, weight_kg: '71.4' }), L('2026-11-02', { water_ml: 500, steps: 4000, weight_kg: '71.0', energy_level: 4 })]
  it('builds a 7-day window ending today with null gaps', () => {
    const w = healthWeek(logs, '2026-11-02')
    expect(w).toHaveLength(7)
    expect(w[0].d).toBe('2026-10-27')
    expect(w.find((x) => x.d === '2026-10-31').sleep).toBeNull()
    expect(w.find((x) => x.d === '2026-11-01')).toMatchObject({ sleep: 8, water: 1000 })
  })
  it('summarises averages and weight trend', () => {
    const s = healthSummary(logs, '2026-11-02')
    expect(s.nightsLogged).toBe(2)
    expect(s.avgSleepMinutes).toBe(450)
    expect(s.todayLog.steps).toBe(4000)
    expect(s.latestWeight).toBe(71)
    expect(s.weightChange).toBeCloseTo(-1, 5)
    expect(s.history[0].log_date).toBe('2026-11-02')
    expect(healthSummary([], '2026-11-02')).toMatchObject({ avgSleepMinutes: null, latestWeight: null, weightChange: null })
  })
  it('formats', () => {
    expect(signedKg(-1)).toBe('-1.0 kg')
    expect(signedKg(0.5)).toBe('+0.5 kg')
    expect(historyLine(L('x', { sleep_minutes: 90, water_ml: 250, energy_level: 3 }))).toBe('Sleep 1h 30m  ·  Water 250 ml  ·  Energy 3/5')
    expect([0, 1, 5000, 5001, NaN].map(isValidCustomWater)).toEqual([false, true, true, false, false])
  })
})
