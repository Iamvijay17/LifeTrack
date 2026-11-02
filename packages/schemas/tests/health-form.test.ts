import { describe, expect, it } from 'vitest'
import { healthFormSchema, healthFormToPayload, healthToForm, insertSchemas } from '../src'

describe('health form', () => {
  const base = healthToForm(null)
  it('requires both sleep times, and distinct ones', () => {
    expect(healthFormSchema.safeParse({ ...base, bedtime: '23:00' }).success).toBe(false)
    expect(healthFormSchema.safeParse({ ...base, bedtime: '06:00', wake_time: '06:00' }).success).toBe(false)
    expect(healthFormSchema.safeParse({ ...base, bedtime: '23:00', wake_time: '06:30' }).success).toBe(true)
  })
  it('range-checks numbers', () => {
    expect(healthFormSchema.safeParse({ ...base, weight_kg: '10' }).success).toBe(false)
    expect(healthFormSchema.safeParse({ ...base, water_ml: '20001' }).success).toBe(false)
    expect(healthFormSchema.safeParse({ ...base, steps: 'abc' }).success).toBe(false)
  })
  it('maps to a database-valid payload', () => {
    const p = healthFormToPayload(healthFormSchema.parse({ ...base, bedtime: '23:30', wake_time: '06:30', water_ml: '1500', energy_level: '4', weight_kg: '71.5' }))
    expect(p).toMatchObject({ sleep_minutes: 420, water_ml: 1500, energy_level: 4, weight_kg: 71.5, steps: 0 })
    expect(insertSchemas.health_logs.safeParse({ log_date: '2026-11-02', ...p }).success).toBe(true)
    expect(healthFormToPayload(healthFormSchema.parse(base))).toMatchObject({ bedtime: null, sleep_minutes: null, weight_kg: null })
    expect(healthToForm({ bedtime: '23:30:00', water_ml: 10, weight_kg: 70.2 })).toMatchObject({ bedtime: '23:30', water_ml: '10', weight_kg: '70.2' })
  })
})
