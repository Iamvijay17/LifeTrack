import { describe, expect, it } from 'vitest'
import { healthSummary } from '@lifetrack/core/health'
import { healthFormSchema, healthFormToPayload, healthToForm } from '@lifetrack/schemas'
import { setup } from './helpers'

const TODAY = '2026-11-02'
describe('health flows', () => {
  it('saves a day from the form; saving again updates the same row (one log per day)', async () => {
    const { store, api, tables } = setup()
    await store.load('health_logs')
    const base = healthToForm(null)
    await api.saveHealth(TODAY, healthFormToPayload(healthFormSchema.parse({ ...base, bedtime: '23:30', wake_time: '06:30', water_ml: '500' })))
    await api.saveHealth(TODAY, healthFormToPayload(healthFormSchema.parse({ ...base, bedtime: '23:00', wake_time: '06:30', water_ml: '900', weight_kg: '71' })))
    expect(tables.health_logs).toHaveLength(1)
    expect(tables.health_logs[0]).toMatchObject({ sleep_minutes: 450, water_ml: 900, weight_kg: 71 })
    await store.refetch('health_logs')
    expect(healthSummary(store.peek('health_logs') as any, TODAY).avgSleepMinutes).toBe(450)
  })
  it('water accumulates, never goes below zero, and creates the day if missing', async () => {
    const { store, api, tables } = setup()
    await store.load('health_logs')
    await api.addWater(TODAY, 250)
    await store.refetch('health_logs')
    await api.addWater(TODAY, 500)
    await store.refetch('health_logs')
    expect(tables.health_logs[0].water_ml).toBe(750)
    await api.addWater(TODAY, -250); await store.refetch('health_logs')
    await api.addWater(TODAY, -5000)
    expect(tables.health_logs[0].water_ml).toBe(0)
    expect(tables.health_logs).toHaveLength(1)
  })
})
