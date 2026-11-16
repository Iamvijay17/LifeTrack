import { beforeEach, describe, expect, it } from 'vitest'
import { createApi } from '../src/api'
import { createMemorySupabase } from '../src/testing/memorySupabase'
import { createSupabaseAdapter } from '../src/supabaseAdapter'
import { withSchemaValidation } from '../src/validatingAdapter'
import { setUserId } from '../src/session'
import { insertSchemas, updateSchemas } from '@lifetrack/schemas'

const A = '11111111-1111-4111-8111-111111111111'
const TODAY = '2026-11-10'

function makeStore(adapter) {
  const cache = new Map()
  const rows = (t) => cache.get(t) ?? []
  const merge = (t, incoming) => {
    const cur = [...rows(t)]
    for (const r of incoming) {
      const i = cur.findIndex((x) => x.id === r.id)
      if (i >= 0) cur[i] = r
      else cur.push(r)
    }
    cache.set(t, cur)
  }
  const drop = (t, ids) =>
    cache.set(
      t,
      rows(t).filter((r) => !ids.includes(r.id)),
    )
  const one = (input, out) => (Array.isArray(input) ? out : out[0])
  const hooks = { failTaskUpdate: false }
  return {
    hooks,
    peek: rows,
    load: async (t) => {
      if (!cache.has(t)) cache.set(t, await adapter.list(t))
    },
    refetch: async (t) => {
      cache.set(t, await adapter.list(t))
    },
    insert: async (t, input) => {
      const out = await adapter.insert(t, Array.isArray(input) ? input : [input])
      merge(t, out)
      return one(input, out)
    },
    update: async (t, id, patch) => {
      if (t === 'tasks' && hooks.failTaskUpdate) throw new Error('boom')
      const r = await adapter.update(t, id, patch)
      merge(t, [r])
      return r
    },
    upsert: async (t, input, opts) => {
      const out = await adapter.upsert(t, Array.isArray(input) ? input : [input], opts)
      merge(t, out)
      return one(input, out)
    },
    rpc: (fn, args) => adapter.rpc(fn, args),
    patch: (t, incoming) => merge(t, incoming),
    patchGroup: (t, dropFn, incoming) => cache.set(t, [...rows(t).filter((r) => !dropFn(r)), ...incoming]),
    remove: async (t, id) => {
      await adapter.remove(t, id)
      drop(t, [id])
    },
    removeMany: async (t, ids) => {
      await adapter.removeMany(t, ids)
      drop(t, ids)
    },
  }
}

let client, store, api, adapter
beforeEach(() => {
  client = createMemorySupabase()
  setUserId(A)
  adapter = withSchemaValidation(createSupabaseAdapter(client), { insertSchemas, updateSchemas })
  store = makeStore(adapter)
  api = createApi(store)
})
const dump = (t) => client.dump(t)
const habit = (x = {}) => store.insert('habits', { name: 'Read', start_date: '2026-11-01', ...x })

describe('pause and resume', () => {
  it('pauses once, even when asked twice, and keeps check-ins', async () => {
    const h = await habit()
    await store.insert('habit_logs', { habit_id: h.id, log_date: '2026-11-08', status: 'done' })
    await api.pauseHabit(h.id, TODAY)
    await api.pauseHabit(h.id, TODAY)
    expect(dump('habit_pauses')).toHaveLength(1)
    expect(dump('habit_logs')).toHaveLength(1)
  })
  it('resume closes the window the day before, and a same-day pause leaves no trace', async () => {
    const h = await habit()
    await api.pauseHabit(h.id, '2026-11-05')
    await api.resumeHabit(h.id, TODAY)
    expect(dump('habit_pauses')[0]).toMatchObject({ start_date: '2026-11-05', end_date: '2026-11-09' })
    await api.pauseHabit(h.id, TODAY)
    await api.resumeHabit(h.id, TODAY)
    expect(dump('habit_pauses')).toHaveLength(1)
    expect(await api.resumeHabit(h.id, TODAY)).toBeNull()
  })
  it('the database allows only one open pause per habit', async () => {
    const h = await habit()
    await store.insert('habit_pauses', { habit_id: h.id, start_date: '2026-11-05' })
    await expect(store.insert('habit_pauses', { habit_id: h.id, start_date: '2026-11-06' })).rejects.toThrow()
  })
})

describe('recoverHabitDay', () => {
  it('adds a recovered check-in for a missed past day', async () => {
    const h = await habit()
    await api.recoverHabitDay(h.id, '2026-11-08', TODAY)
    expect(dump('habit_logs')[0]).toMatchObject({ habit_id: h.id, log_date: '2026-11-08', status: 'done' })
    expect(dump('habit_logs')[0].recovered_at).toBeTruthy()
  })
  it('never overwrites an existing log, even a skipped one', async () => {
    const h = await habit()
    await store.insert('habit_logs', { habit_id: h.id, log_date: '2026-11-08', status: 'skipped' })
    await expect(api.recoverHabitDay(h.id, '2026-11-08', TODAY)).rejects.toThrow(/already has a check-in/)
    expect(dump('habit_logs')[0].status).toBe('skipped')
  })
  it('refuses today, the future, days outside the window and days before the start', async () => {
    const h = await habit()
    await expect(api.recoverHabitDay(h.id, TODAY, TODAY)).rejects.toThrow(/past day/)
    await expect(api.recoverHabitDay(h.id, '2026-11-12', TODAY)).rejects.toThrow(/past day/)
    await expect(api.recoverHabitDay(h.id, '2026-11-02', TODAY)).rejects.toThrow(/no longer be recovered/)
    const late = await habit({ name: 'Late', start_date: '2026-11-09' })
    await expect(api.recoverHabitDay(late.id, '2026-11-08', TODAY)).rejects.toThrow(/before the habit started/)
  })
})
