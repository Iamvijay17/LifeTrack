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
const mk = (x = {}) => api.createChallenge({ title: 'Read daily', kind: 'daily', target: 1, start_date: '2026-11-01', end_date: '2026-11-10', ...x })
const checkin = (id, date, x = {}) => api.checkInChallenge(id, { date, today: TODAY, ...x })

describe('creating challenges', () => {
  it('stores a valid challenge with its defaults, trimmed and cleaned', async () => {
    const c = await mk({ title: '  Read daily  ', unit: ' pages ', milestones: [{ pct: 50, title: 'Half' }, { pct: 50, title: 'dup' }] })
    expect(c).toMatchObject({ title: 'Read daily', unit: 'pages', status: 'active', pauses: [], milestones: [{ pct: 50, title: 'Half' }], user_id: A })
  })
  it('refuses a bad challenge with the first problem in words, and writes nothing', async () => {
    await expect(mk({ title: ' ' })).rejects.toThrow(/name/)
    await expect(mk({ end_date: '2026-10-01' })).rejects.toThrow(/before the start/)
    await expect(mk({ kind: 'weekly', target: 9 })).rejects.toThrow(/7 days/)
    expect(dump('challenges')).toHaveLength(0)
  })
  it('links only to a real, unarchived habit, and never for a total challenge', async () => {
    const h = await habit()
    expect((await mk({ habit_id: h.id })).habit_id).toBe(h.id)
    await expect(mk({ habit_id: '22222222-2222-4222-8222-222222222222' })).rejects.toThrow(/habit/)
    await expect(mk({ kind: 'total', target: 10, habit_id: h.id })).rejects.toThrow(/habit/)
    const old = await habit({ name: 'Old', archived_at: '2026-10-01T00:00:00Z' })
    await expect(mk({ habit_id: old.id })).rejects.toThrow(/not available/)
  })
  it('starts from a template with the right dates', async () => {
    const c = await api.startFromTemplate({ key: 'x', name: 'Gym', kind: 'weekly', target: 4, duration_days: 28, category: 'Fitness', color: '#EF4444' }, '2026-12-07')
    expect(c).toMatchObject({ title: 'Gym', kind: 'weekly', target: 4, start_date: '2026-12-07', end_date: '2027-01-03', template_key: 'x' })
  })
})

describe('daily check-ins', () => {
  it('records a check-in and refuses a second one for the same day', async () => {
    const c = await mk()
    const { checkin: k } = await checkin(c.id, '2026-11-03', { note: ' felt good ' })
    expect(k).toMatchObject({ challenge_id: c.id, checkin_date: '2026-11-03', amount: 1, note: 'felt good' })
    await expect(checkin(c.id, '2026-11-03')).rejects.toThrow(/already checked in/)
    expect(dump('challenge_checkins')).toHaveLength(1)
  })
  it('also stops two devices: the database rule catches what the screen could not see', async () => {
    const c = await mk()
    await checkin(c.id, '2026-11-03')
    // a second device whose cache is stale inserts straight into the adapter
    await expect(adapter.insert('challenge_checkins', [{ challenge_id: c.id, checkin_date: '2026-11-03' }])).rejects.toMatchObject({ code: '23505' })
  })
  it('refuses future days, days outside the dates and paused challenges', async () => {
    const c = await mk({ end_date: '2026-11-30' })
    await expect(checkin(c.id, '2026-11-11')).rejects.toThrow(/not started/)
    await expect(checkin(c.id, '2026-10-31')).rejects.toThrow(/before the challenge/)
    await api.pauseChallenge(c.id, TODAY)
    await expect(checkin(c.id, '2026-11-09')).rejects.toThrow(/Resume/)
  })
  it('judges "today" by the day the caller says it is, not the machine clock', async () => {
    const c = await mk({ end_date: '2026-11-30' })
    await expect(api.checkInChallenge(c.id, { date: '2026-11-11', today: '2026-11-10' })).rejects.toThrow(/not started/)
    expect((await api.checkInChallenge(c.id, { date: '2026-11-11', today: '2026-11-11' })).checkin.checkin_date).toBe('2026-11-11')
  })
  it('lets a day be topped up instead of duplicated', async () => {
    const c = await mk({ target: 20, unit: 'pages' })
    const { checkin: k } = await checkin(c.id, '2026-11-02', { amount: 8 })
    const { checkin: more } = await api.addToCheckin(k.id, 12, TODAY)
    expect(more.amount).toBe(20)
    expect(dump('challenge_checkins')).toHaveLength(1)
    await expect(api.addToCheckin(k.id, 0, TODAY)).rejects.toThrow(/whole amount/)
  })
  it('counts a linked habit’s day and refuses a second check-in for it', async () => {
    const h = await habit()
    const c = await mk({ habit_id: h.id })
    await store.insert('habit_logs', { habit_id: h.id, log_date: '2026-11-02', status: 'done' })
    await expect(checkin(c.id, '2026-11-02')).rejects.toThrow(/linked habit/)
    await checkin(c.id, '2026-11-03')
  })
  it('removes a check-in, and a deleted challenge takes its check-ins with it', async () => {
    const c = await mk()
    const { checkin: k } = await checkin(c.id, '2026-11-03')
    await api.removeCheckin(k.id)
    expect(dump('challenge_checkins')).toHaveLength(0)
    await checkin(c.id, '2026-11-04')
    await api.deleteChallenge(c.id)
    expect(dump('challenge_checkins')).toHaveLength(0)
  })
})

describe('evidence and notes', () => {
  it('keeps http(s) links with labels and rejects anything else', async () => {
    const c = await mk()
    const { checkin: k } = await checkin(c.id, '2026-11-03', { evidence: [{ label: ' Photo ', url: 'https://example.com/a.jpg' }, { url: '' }] })
    expect(k.evidence).toEqual([{ label: 'Photo', url: 'https://example.com/a.jpg' }])
    await expect(checkin(c.id, '2026-11-04', { evidence: [{ url: 'javascript:alert(1)' }] })).rejects.toThrow(/http/)
    await expect(checkin(c.id, '2026-11-04', { evidence: Array.from({ length: 6 }, (_, i) => ({ url: `https://e.com/${i}` })) })).rejects.toThrow(/at most 5/)
    await expect(checkin(c.id, '2026-11-04', { note: 'x'.repeat(501) })).rejects.toThrow(/500/)
  })
  it('edits the note and evidence of an existing check-in', async () => {
    const c = await mk()
    const { checkin: k } = await checkin(c.id, '2026-11-03')
    const { checkin: edited } = await api.updateCheckin(k.id, { note: 'better', evidence: [{ url: 'https://example.com/x' }] }, TODAY)
    expect(edited).toMatchObject({ note: 'better', evidence: [{ label: '', url: 'https://example.com/x' }], amount: 1 })
  })
})

describe('pause, resume, cancel, complete', () => {
  it('pausing makes days neutral, resuming ends the window, and pausing twice is harmless', async () => {
    const c = await mk({ end_date: '2026-11-30' })
    await api.pauseChallenge(c.id, '2026-11-05')
    await api.pauseChallenge(c.id, '2026-11-06')
    expect(dump('challenges')[0]).toMatchObject({ status: 'paused', pauses: [{ from: '2026-11-05', to: null }] })
    await api.resumeChallenge(c.id, '2026-11-08')
    expect(dump('challenges')[0]).toMatchObject({ status: 'active', pauses: [{ from: '2026-11-05', to: '2026-11-07' }] })
    await expect(checkin(c.id, '2026-11-06')).rejects.toThrow(/paused/)
  })
  it('pausing and resuming on one day leaves no trace', async () => {
    const c = await mk()
    await api.pauseChallenge(c.id, TODAY)
    await api.resumeChallenge(c.id, TODAY)
    expect(dump('challenges')[0]).toMatchObject({ status: 'active', pauses: [] })
  })
  it('cancels while keeping every check-in, and a cancelled challenge cannot be touched', async () => {
    const c = await mk()
    await checkin(c.id, '2026-11-03')
    await api.cancelChallenge(c.id)
    expect(dump('challenges')[0]).toMatchObject({ status: 'cancelled' })
    expect(dump('challenge_checkins')).toHaveLength(1)
    await expect(checkin(c.id, '2026-11-04')).rejects.toThrow(/cancelled/)
    await expect(api.pauseChallenge(c.id, TODAY)).rejects.toThrow(/running/)
    await expect(api.updateChallenge(c.id, { title: 'x' })).rejects.toThrow(/finished/)
  })
  it('completes early with the achieved percentage', async () => {
    const c = await mk()
    await checkin(c.id, '2026-11-01')
    await checkin(c.id, '2026-11-02')
    const done = await api.completeChallenge(c.id, TODAY)
    expect(done).toMatchObject({ status: 'completed', final_pct: 20 })
    expect(done.completed_at).toBeTruthy()
    await expect(api.cancelChallenge(c.id)).rejects.toThrow(/completed/)
  })
})

describe('completion', () => {
  it('a total challenge completes itself the moment the target is reached', async () => {
    const c = await mk({ kind: 'total', target: 50, unit: 'km' })
    const first = await checkin(c.id, '2026-11-02', { amount: 30 })
    expect(first.completed).toBeNull()
    const second = await checkin(c.id, '2026-11-03', { amount: 25 })
    expect(second.completed).toMatchObject({ status: 'completed', final_pct: 100 })
  })
  it('settling closes only challenges whose time is up, and is idempotent', async () => {
    const ended = await mk({ title: 'Ended', end_date: '2026-11-05' })
    const running = await mk({ title: 'Running', end_date: '2026-11-30' })
    await checkin(ended.id, '2026-11-01')
    await checkin(ended.id, '2026-11-02')
    const done = await api.settleChallenges(TODAY)
    expect(done.map((d) => d.id)).toEqual([ended.id])
    expect(dump('challenges').find((c) => c.id === ended.id)).toMatchObject({ status: 'completed', final_pct: 40 })
    expect(dump('challenges').find((c) => c.id === running.id).status).toBe('active')
    expect(await api.settleChallenges(TODAY)).toEqual([])
  })
})

describe('editing', () => {
  it('changes the details, but not the kind after check-ins, nor dates that would strand them', async () => {
    const c = await mk({ end_date: '2026-11-30' })
    await checkin(c.id, '2026-11-03')
    expect((await api.updateChallenge(c.id, { title: 'Read more', color: '#10B981' })).title).toBe('Read more')
    await expect(api.updateChallenge(c.id, { kind: 'total' })).rejects.toThrow(/kind/)
    await expect(api.updateChallenge(c.id, { start_date: '2026-11-05' })).rejects.toThrow(/outside the new dates/)
    expect((await api.updateChallenge(c.id, { end_date: '2026-12-15' })).end_date).toBe('2026-12-15')
  })
})

describe('templates', () => {
  it('saves a template, checks it with the challenge rules, and turns it into a challenge', async () => {
    const t = await api.saveChallengeTemplate({ name: 'Morning run', kind: 'weekly', target: 3, unit: '', duration_days: 42, category: 'Fitness', color: '#F97316' })
    expect(t).toMatchObject({ name: 'Morning run', duration_days: 42 })
    await expect(api.saveChallengeTemplate({ name: 'Bad', kind: 'weekly', target: 9, duration_days: 30 })).rejects.toThrow(/7 days/)
    await expect(api.saveChallengeTemplate({ name: '', kind: 'daily', target: 1, duration_days: 30 })).rejects.toThrow(/name/)
    const c = await api.startFromTemplate(t, '2026-11-02')
    expect(c.end_date).toBe('2026-12-13')
  })
})

describe('data is private to its owner', () => {
  it('another user sees none of it', async () => {
    const c = await mk()
    await checkin(c.id, '2026-11-02')
    setUserId('99999999-9999-4999-8999-999999999999')
    expect(await adapter.list('challenges')).toEqual([])
    expect(await adapter.list('challenge_checkins')).toEqual([])
    expect(await adapter.list('challenge_templates')).toEqual([])
  })
})
