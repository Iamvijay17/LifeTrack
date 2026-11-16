import { beforeEach, describe, expect, it } from 'vitest'
import { createApi } from '../src/api'
import { createMemorySupabase } from '../src/testing/memorySupabase'
import { createSupabaseAdapter } from '../src/supabaseAdapter'
import { withSchemaValidation } from '../src/validatingAdapter'
import { setUserId } from '../src/session'
import { insertSchemas, updateSchemas } from '@lifetrack/schemas'

const A = '11111111-1111-4111-8111-111111111111'

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

import { buildMap, nodeKey } from '@lifetrack/core/lifeMap'
const goalKey = (g) => nodeKey('goal', g.id)
const habitKey = (h) => nodeKey('habit', h.id)
const mk = async () => {
  const goal = await store.insert('goals', { title: 'Career' })
  const habit = await store.insert('habits', { name: 'Study', start_date: '2026-11-01' })
  const map = () => buildMap({ goals: store.peek('goals'), habits: store.peek('habits'), links: store.peek('life_map_links') })
  return { goal, habit, map }
}

describe('positions', () => {
  it('saves one place per node: dragging again moves it, never adds a second', async () => {
    const { goal } = await mk()
    await api.saveMapPosition(goalKey(goal), 10.04, 20)
    await api.saveMapPosition(goalKey(goal), 300, -40.26)
    expect(dump('life_map_positions')).toHaveLength(1)
    expect(dump('life_map_positions')[0]).toMatchObject({ node_key: goalKey(goal), x: 300, y: -40.3 })
  })
  it('refuses a bad key or a non-number', async () => {
    await expect(api.saveMapPosition('nonsense', 1, 1)).rejects.toThrow()
    await expect(api.saveMapPosition('goal:11111111-1111-4111-8111-111111111111', NaN, 1)).rejects.toThrow()
  })
  it('auto-arrange saves many at once and reset clears only positions', async () => {
    const { goal, habit } = await mk()
    await api.saveMapPositions([
      { key: goalKey(goal), x: 1, y: 2 },
      { key: habitKey(habit), x: 3, y: 4 },
      { key: 'bad', x: 1, y: 1 },
    ])
    expect(dump('life_map_positions')).toHaveLength(2)
    expect(await api.resetMapLayout()).toBe(2)
    expect(dump('life_map_positions')).toHaveLength(0)
    expect(dump('goals')).toHaveLength(1)
  })
})

describe('links', () => {
  it('connects two items once, and says why it refuses a repeat, a reverse or a loop', async () => {
    const { goal, habit, map } = await mk()
    await api.linkNodes(map(), habitKey(habit), goalKey(goal), '  daily practice ')
    expect(dump('life_map_links')[0]).toMatchObject({ from_key: habitKey(habit), to_key: goalKey(goal), label: 'daily practice' })
    await store.refetch('life_map_links')
    await expect(api.linkNodes(map(), habitKey(habit), goalKey(goal))).rejects.toThrow(/already connected/)
    await expect(api.linkNodes(map(), goalKey(goal), habitKey(habit))).rejects.toThrow(/other way/)
    expect(dump('life_map_links')).toHaveLength(1)
  })
  it('the database refuses a duplicate even when the app check is skipped (two devices)', async () => {
    const { goal, habit } = await mk()
    await store.insert('life_map_links', { from_key: habitKey(habit), to_key: goalKey(goal) })
    await expect(store.insert('life_map_links', { from_key: habitKey(habit), to_key: goalKey(goal) })).rejects.toThrow()
  })
  it('reverses a link in place, and keeps the original if the reverse is refused', async () => {
    const { goal, habit } = await mk()
    const l = await store.insert('life_map_links', { from_key: habitKey(habit), to_key: goalKey(goal), label: 'x' })
    await api.reverseLink(l.id)
    expect(dump('life_map_links')).toHaveLength(1)
    expect(dump('life_map_links')[0]).toMatchObject({ from_key: goalKey(goal), to_key: habitKey(habit), label: 'x' })
  })
  it('validates keys and label length on the way in', async () => {
    await expect(
      store.insert('life_map_links', { from_key: 'nope', to_key: 'goal:11111111-1111-4111-8111-111111111111' }),
    ).rejects.toThrow()
    await expect(
      store.insert('life_map_links', {
        from_key: 'goal:11111111-1111-4111-8111-111111111111',
        to_key: 'habit:22222222-2222-4222-8222-222222222222',
        label: 'x'.repeat(61),
      }),
    ).rejects.toThrow()
  })
})

describe('custom nodes', () => {
  it('stores a project with defaults', async () => {
    const p = await store.insert('life_map_nodes', { kind: 'project', title: 'Portfolio' })
    expect(p).toMatchObject({ kind: 'project', category: 'Personal', status: 'active' })
    await expect(store.insert('life_map_nodes', { kind: 'goal', title: 'x' })).rejects.toThrow()
  })
})
