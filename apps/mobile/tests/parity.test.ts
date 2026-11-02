import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { analyticsRange, resolveRange } from '@lifetrack/core/analytics'
import { dashboardData } from '@lifetrack/core/dashboard'
import { GOLDEN, NOW_MS, SETTINGS, TABLES, TODAY, toInput } from '../../../packages/core/tests/fixtures/dataset.js'
import { createQueryStore, type DbAdapter } from '../src/data/queryStore'

/** A read-only database holding the golden account. */
const seeded = (): DbAdapter => ({
  list: async (t) => structuredClone((TABLES as Record<string, any[]>)[t] ?? []),
  insert: async () => { throw new Error('read-only') }, update: async () => { throw new Error('read-only') }, upsert: async () => { throw new Error('read-only') },
  remove: async () => { throw new Error('read-only') }, removeMany: async () => { throw new Error('read-only') },
})

describe('mobile data path shows the same numbers as the shared golden dataset', () => {
  it('rows loaded through the TanStack store compute identical Dashboard and Analytics output', async () => {
    const store = createQueryStore(seeded(), new QueryClient())
    const names = Object.keys(TABLES)
    for (const t of names) await store.load(t)
    const viaStore = Object.fromEntries(names.map((t) => [t, store.peek(t)]))

    const direct = dashboardData(toInput(TABLES), { settings: SETTINGS, today: TODAY, nowMs: NOW_MS })
    const mobile = dashboardData(toInput(viaStore), { settings: SETTINGS, today: TODAY, nowMs: NOW_MS })
    expect(JSON.stringify(mobile)).toBe(JSON.stringify(direct))
    expect(mobile).toMatchObject({ openToday: GOLDEN.dashboard.openToday, studyMin: GOLDEN.dashboard.studyMin, spentToday: GOLDEN.dashboard.spentToday, gym: GOLDEN.dashboard.gym })

    const r = resolveRange('custom', { from: '2026-10-01', to: '2026-11-30' }, TODAY, 1)
    const opts = { ...r, today: TODAY, weekStartsOn: 1, workoutPlan: SETTINGS.workout_plan }
    expect(JSON.stringify(analyticsRange(toInput(viaStore), opts))).toBe(JSON.stringify(analyticsRange(toInput(TABLES), opts)))
  })
  it('cache updates after a write produce the same result as recomputing from the database', async () => {
    const rows = structuredClone(TABLES) as Record<string, any[]>
    const db: DbAdapter = {
      ...seeded(), list: async (t) => structuredClone(rows[t] ?? []),
      insert: async (t, input) => input.map((r) => { const row = { id: crypto.randomUUID(), user_id: 'u', created_at: '2026-11-02T06:00:00Z', ...r }; rows[t].push(row); return row as any }),
    }
    const store = createQueryStore(db, new QueryClient())
    for (const t of Object.keys(TABLES)) await store.load(t)
    await store.insert('transactions', { type: 'expense', amount_paise: 50000, category: 'Food', txn_date: TODAY, note: '', payment_method: 'UPI' })
    const cached = dashboardData(toInput(Object.fromEntries(Object.keys(TABLES).map((t) => [t, store.peek(t)]))), { settings: SETTINGS, today: TODAY, nowMs: NOW_MS })
    const fresh = dashboardData(toInput(rows), { settings: SETTINGS, today: TODAY, nowMs: NOW_MS })
    expect(cached.spentToday).toBe(75050)
    expect(JSON.stringify(cached)).toBe(JSON.stringify(fresh))
  })
})
