import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApi } from '../src/api'
import { createMemorySupabase } from '../src/testing/memorySupabase'
import { createSupabaseAdapter } from '../src/supabaseAdapter'
import { withSchemaValidation } from '../src/validatingAdapter'
import { setUserId } from '../src/session'
import { insertSchemas, updateSchemas } from '@lifetrack/schemas'

const A = '11111111-1111-4111-8111-111111111111'
const TODAY = '2026-11-02'

/** Minimal cache/mutation store over an adapter (the contract createApi needs): writes patch the cache from confirmed responses. */
function makeStore(adapter) {
  const cache = new Map()
  const rows = (t) => cache.get(t) ?? []
  const merge = (t, incoming) => { const cur = [...rows(t)]; for (const r of incoming) { const i = cur.findIndex((x) => x.id === r.id); if (i >= 0) cur[i] = r; else cur.push(r) } cache.set(t, cur) }
  const drop = (t, ids) => cache.set(t, rows(t).filter((r) => !ids.includes(r.id)))
  const one = (input, out) => (Array.isArray(input) ? out : out[0])
  return {
    peek: rows,
    load: async (t) => { if (!cache.has(t)) cache.set(t, await adapter.list(t)) },
    refetch: async (t) => { cache.set(t, await adapter.list(t)) },
    insert: async (t, input) => { const out = await adapter.insert(t, Array.isArray(input) ? input : [input]); merge(t, out); return one(input, out) },
    update: async (t, id, patch) => { const r = await adapter.update(t, id, patch); merge(t, [r]); return r },
    upsert: async (t, input, o) => { const out = await adapter.upsert(t, Array.isArray(input) ? input : [input], o); merge(t, out); return one(input, out) },
    rpc: (fn, args) => adapter.rpc(fn, args),
    patch: (t, incoming) => merge(t, incoming),
    patchGroup: (t, dropFn, incoming) => cache.set(t, [...rows(t).filter((r) => !dropFn(r)), ...incoming]),
    remove: async (t, id) => { await adapter.remove(t, id); drop(t, [id]) },
    removeMany: async (t, ids) => { await adapter.removeMany(t, ids); drop(t, ids) },
  }
}
let client, store, api, adapter
beforeEach(() => {
  client = createMemorySupabase(); setUserId(A)
  // Every write is also validated against the shared schemas, so these tests fail if an operation sends a column the table does not have.
  adapter = withSchemaValidation(createSupabaseAdapter(client), { insertSchemas, updateSchemas })
  store = makeStore(adapter); api = createApi(store)
})
const db = (t) => client.dump(t)

describe('tasks', () => {
  it('recurring tasks need a due date and get a series id; one-off tasks do not', async () => {
    expect(() => api.createTask({ title: 'x', recurrence: 'daily' })).toThrow('Recurring tasks need a due date.')
    const r = await api.createTask({ title: 'daily', recurrence: 'daily', due_date: TODAY })
    expect(r.series_id).toBeTruthy()
    expect((await api.createTask({ title: 'once', due_date: TODAY })).series_id).toBeNull()
  })
  it('status changes stamp started_at / completed_at and reopening clears completed_at', async () => {
    const t = await api.createTask({ title: 'x', due_date: TODAY })
    const started = await api.setTaskStatus(t, 'in_progress', TODAY)
    expect(started.started_at).toBeTruthy()
    const done = await api.setTaskStatus(started, 'done', TODAY)
    expect(done.completed_at).toBeTruthy()
    expect(done.started_at).toBe(started.started_at) // keeps the original start
    expect((await api.setTaskStatus(done, 'pending', TODAY)).completed_at).toBeNull()
  })
  it('completing a recurring task creates the next occurrence, once; re-completing does not duplicate it', async () => {
    const t = await api.createTask({ title: 'daily', recurrence: 'daily', due_date: TODAY })
    await api.setTaskStatus(t, 'done', TODAY)
    expect(db('tasks').map((x) => x.due_date).sort()).toEqual(['2026-11-02', '2026-11-03'])
    await api.setTaskStatus({ ...t, status: 'pending' }, 'done', TODAY) // another device already created it → 23505 is tolerated
    expect(db('tasks')).toHaveLength(2)
  })
  it('a late completion skips occurrences already in the past, and respects recurrence_until', async () => {
    const late = await api.createTask({ title: 'daily', recurrence: 'daily', due_date: '2026-10-25' })
    await api.setTaskStatus(late, 'done', TODAY)
    expect(db('tasks').map((x) => x.due_date).sort()).toEqual(['2026-10-25', '2026-11-02'])
    const bounded = await api.createTask({ title: 'ends', recurrence: 'daily', due_date: '2026-12-01', recurrence_until: '2026-12-01' })
    await api.setTaskStatus(bounded, 'done', '2026-12-01')
    expect(db('tasks').filter((x) => x.title === 'ends')).toHaveLength(1)
    const w = await api.createTask({ title: 'weekdays', recurrence: 'weekdays', due_date: '2026-11-06' }) // Friday
    await api.setTaskStatus(w, 'done', '2026-11-06')
    expect(db('tasks').filter((x) => x.title === 'weekdays').map((x) => x.due_date).sort()).toEqual(['2026-11-06', '2026-11-09']) // Monday
  })
  it('a non-recurring or already-done task does not spawn anything', async () => {
    const t = await api.createTask({ title: 'once', due_date: TODAY })
    const done = await api.setTaskStatus(t, 'done', TODAY)
    await api.setTaskStatus(done, 'done', TODAY)
    expect(db('tasks')).toHaveLength(1)
  })
})

describe('habits', () => {
  it('check in, change, and clear: always one log per habit and day', async () => {
    const [h] = await store.insert('habits', [{ name: 'Read' }])
    await store.load('habit_logs')
    expect(await api.setHabitStatus(h.id, TODAY, null)).toBeNull() // clearing nothing is fine
    await api.setHabitStatus(h.id, TODAY, 'done'); await api.setHabitStatus(h.id, TODAY, 'done'); await api.setHabitStatus(h.id, TODAY, 'skipped')
    expect(db('habit_logs')).toHaveLength(1)
    expect(db('habit_logs')[0].status).toBe('skipped')
    await api.setHabitStatus(h.id, TODAY, null)
    expect(db('habit_logs')).toHaveLength(0)
  })
})

describe('study timer', () => {
  it('one running timer; stop caps minutes at the real elapsed time; discard never counts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z'))
    await store.load('study_sessions')
    const s = await api.startStudy({ goal_id: null, topic_id: null }, TODAY)
    await expect(api.startStudy({}, TODAY)).rejects.toThrow('A study timer is already running.')
    vi.setSystemTime(new Date('2026-11-02T10:20:00Z'))
    const done = await api.stopStudy(s, { minutes: 999, problems_solved: 2, notes: 'ch1' })
    expect(done).toMatchObject({ status: 'completed', duration_seconds: 1200, problems_solved: 2 })
    const again = await api.startStudy({}, TODAY)
    const lowered = await api.stopStudy(again, { minutes: 5 }) // can correct a forgotten timer downwards
    expect(lowered.duration_seconds).toBe(0) // asked for 5 min but no time has elapsed since start, so it is capped at 0
    const third = await api.startStudy({}, TODAY)
    expect((await api.discardStudy(third)).status).toBe('discarded')
    vi.useRealTimers()
  })
  it('a second device starting a timer is refused by the database and told why', async () => {
    await api.startStudy({}, TODAY)
    const otherDevice = makeStore(withSchemaValidation(createSupabaseAdapter(client), { insertSchemas, updateSchemas }))
    const e = await createApi(otherDevice).startStudy({}, TODAY).catch((x) => x) // its cache is empty, so only the database can stop it
    expect(e.code).toBe('23505')
    expect(e.message).toMatch(/already running/)
  })
})

describe('workouts', () => {
  const w = { workout_date: TODAY, name: 'Push', kind: 'strength', status: 'completed' }
  const sets = [{ exercise_name: 'Bench', exercise_id: null, order_index: 0, set_number: 1, reps: 10, weight_kg: 60 }]
  it('saves workout and sets together; edit stores new sets before removing the old ones', async () => {
    const created = await api.saveWorkout(w, sets, undefined)
    expect(db('exercise_logs')).toHaveLength(1)
    await store.load('exercise_logs')
    await api.saveWorkout({ ...w, name: 'Push v2' }, [{ ...sets[0], reps: 5 }, { ...sets[0], set_number: 2, reps: 4 }], created)
    expect(db('workouts')[0].name).toBe('Push v2')
    expect(db('exercise_logs').map((s) => s.reps).sort()).toEqual([4, 5])
  })
  it('never leaves a half-saved workout: failing sets roll the workout back', async () => {
    await expect(api.saveWorkout(w, [{ ...sets[0], reps: -1 }], undefined)).rejects.toThrow(/Invalid insert payload/)
    expect(db('workouts')).toHaveLength(0)
  })
  it('a workout without sets is fine (cardio)', async () => {
    await api.saveWorkout({ ...w, kind: 'cardio', cardio_minutes: 30 }, [], undefined)
    expect(db('workouts')).toHaveLength(1)
    expect(db('exercise_logs')).toHaveLength(0)
  })
})

describe('study timer across devices', () => {
  it('a timer started on another device (not yet in this cache) gives a clear message and refreshes the cache', async () => {
    await store.load('study_sessions') // cache is empty ...
    await createApi(makeStore(createSupabaseAdapter(client))).startStudy({}, TODAY) // ... because "another device" writes straight to the database
    expect(store.peek('study_sessions')).toHaveLength(0)
    await expect(api.startStudy({}, TODAY)).rejects.toThrow(/already running.*another device/i)
    expect(store.peek('study_sessions')).toHaveLength(1) // the running timer is now visible
    expect(db('study_sessions')).toHaveLength(1)
  })
})

describe('nutrition', () => {
  it('logWater writes an entry AND raises the day total in health_logs; removeWaterLog takes exactly that amount back', async () => {
    await store.load('health_logs'); await store.load('water_logs')
    const a = await api.logWater(TODAY, 250, '09:00')
    const b = await api.logWater(TODAY, 500)
    expect(db('water_logs').map((w) => w.amount_ml)).toEqual([250, 500])
    expect(db('health_logs')[0].water_ml).toBe(750)
    expect(store.peek('health_logs')[0].water_ml).toBe(750) // the cache shows the new total without a reload
    const after = await api.removeWaterLog(b)
    expect(after.water_ml).toBe(250)
    expect(db('water_logs')).toHaveLength(1)
    expect(store.peek('water_logs').map((w) => w.id)).toEqual([a.id])
    expect(store.peek('health_logs')[0].water_ml).toBe(250)
  })
  it('refuses amounts the database would refuse, before calling it', async () => {
    for (const ml of [0, -250, 5001, 2.5, NaN]) await expect(api.logWater(TODAY, ml)).rejects.toThrow(/between 1 and 5000/)
    expect(db('water_logs')).toHaveLength(0)
  })
  it('water that was typed into Sleep & Health stays when an entry is removed', async () => {
    await api.saveHealth(TODAY, { water_ml: 1000 })
    const e = await api.logWater(TODAY, 250)
    expect(db('health_logs')[0].water_ml).toBe(1250)
    await api.removeWaterLog(e)
    expect(db('health_logs')[0].water_ml).toBe(1000)
  })
  it('targets: one row per user, empty goals are stored as null, and the water goal goes to user_settings', async () => {
    await store.insert('user_settings', { water_goal_ml: 3000 }).catch(() => {})
    await api.saveNutritionGoals({ calorie_goal: 1800, protein_goal_g: null }, 2500)
    await api.saveNutritionGoals({ calorie_goal: 2000, protein_goal_g: 80 }, 2500)
    expect(db('nutrition_settings')).toHaveLength(1)
    expect(db('nutrition_settings')[0]).toMatchObject({ calorie_goal: 2000, protein_goal_g: 80, carbs_goal_g: null })
    expect(db('user_settings').find((r) => r.user_id === A).water_goal_ml).toBe(2500)
  })
  it('favourites are saved on the same row as the targets, without erasing them', async () => {
    await api.saveNutritionGoals({ calorie_goal: 1800 })
    await api.saveFavoriteFoods(['starter:idli', 'custom:abc'])
    expect(db('nutrition_settings')).toHaveLength(1)
    expect(db('nutrition_settings')[0]).toMatchObject({ calorie_goal: 1800, favorite_foods: ['starter:idli', 'custom:abc'] })
  })
  it('editing a starter food saves ONE copy per user, however many times (or from how many devices) it is saved', async () => {
    await store.load('foods')
    const base = { name: 'Idli', kcal: 60, category: 'Tiffin' }
    const first = await api.saveFoodCopy('idli', base)
    const again = await api.saveFoodCopy('idli', { ...base, kcal: 65 })
    expect(again.id).toBe(first.id)
    expect(db('foods')).toHaveLength(1)
    expect(db('foods')[0]).toMatchObject({ base_key: 'idli', kcal: 65 })
    // another device that has not seen the copy yet: its insert collides on (user, base_key) and falls back to updating the existing one
    await adapter.remove('foods', first.id); await store.refetch('foods')
    const stale = makeStore(adapter); const staleApi = createApi(stale); await stale.load('foods') // this device sees no copy yet
    await api.saveFoodCopy('idli', { ...base, kcal: 70 }) // meanwhile the first device writes one
    const raced = await staleApi.saveFoodCopy('idli', { ...base, kcal: 75 })
    expect(db('foods')).toHaveLength(1)
    expect(raced.kcal).toBe(75)
  })
  it('a logged entry keeps its nutrition when the food it came from is deleted', async () => {
    const [food] = await store.insert('foods', [{ name: 'Mom sambar', kcal: 70 }])
    const [entry] = await store.insert('food_logs', [{ log_date: TODAY, meal_type: 'lunch', name: 'Mom sambar', food_id: food.id, kcal: 140, quantity: 2 }])
    await api.deleteFood(food)
    expect(db('foods')).toHaveLength(0)
    expect(db('food_logs')[0]).toMatchObject({ id: entry.id, kcal: 140 })
  })
})

describe('health, water, jobs, goals, focus', () => {
  it('saveHealth is one row per day; addWater accumulates and never goes below zero', async () => {
    await store.load('health_logs')
    await api.saveHealth(TODAY, { steps: 100 })
    await api.saveHealth(TODAY, { steps: 5000 })
    expect(db('health_logs')).toHaveLength(1)
    await api.addWater(TODAY, 250); await api.addWater(TODAY, 500)
    expect(db('health_logs')[0].water_ml).toBe(750)
    await api.addWater(TODAY, -5000)
    expect(db('health_logs')[0].water_ml).toBe(0)
    await api.addWater('2026-11-03', 100) // a new day creates its own row
    expect(db('health_logs')).toHaveLength(2)
  })
  it('moving an application to Applied stamps the date once and records history', async () => {
    const [a] = await store.insert('job_applications', [{ company: 'Acme', job_title: 'Dev' }])
    await api.setApplicationStatus(a, 'applied', TODAY)
    await api.setApplicationStatus(db('job_applications')[0], 'interview', '2026-11-09')
    await api.setApplicationStatus(db('job_applications')[0], 'applied', '2026-11-15')
    expect(db('job_applications')[0].applied_date).toBe(TODAY)
    expect(db('application_history').map((h) => h.to_status)).toEqual(['interested', 'applied', 'interview', 'applied'])
  })
  it('goal status stamps and clears completed_at; milestones toggle', async () => {
    const [g] = await store.insert('goals', [{ title: 'Ship', period: 'monthly' }])
    const done = await api.setGoalStatus(g, 'completed')
    expect(done.completed_at).toBeTruthy()
    expect((await api.setGoalStatus(done, 'active')).completed_at).toBeNull()
    const [m] = await store.insert('milestones', [{ goal_id: g.id, title: 'Design' }])
    const on = await api.toggleMilestone(m)
    expect(on).toMatchObject({ done: true }); expect(on.completed_at).toBeTruthy()
    expect(await api.toggleMilestone(on)).toMatchObject({ done: false, completed_at: null })
  })
  it('focus blocks: sub-minute accidents are dropped, runaway seconds capped, label trimmed', async () => {
    const base = { plannedMinutes: 25, completed: true, date: TODAY }
    expect(await api.recordFocus({ ...base, actualSeconds: 10, completed: false })).toBeNull()
    await api.recordFocus({ ...base, actualSeconds: 99999, label: 'x'.repeat(300) })
    expect(db('focus_sessions')).toHaveLength(1)
    expect(db('focus_sessions')[0]).toMatchObject({ actual_seconds: 1505, completed: true })
    expect(db('focus_sessions')[0].label).toHaveLength(120)
    await api.recordFocus({ ...base, actualSeconds: 10 }) // a completed block is kept even if short
    expect(db('focus_sessions')).toHaveLength(2)
  })
})

describe('recurring transactions', () => {
  const RULE = { type: 'expense', amount_paise: 2500000, category: 'Bills', payment_method: 'UPI', note: 'Rent', frequency: 'monthly', anchor_day: 1, next_date: '2026-11-01' }
  /** A second device: same database, its own cache. */
  const device = () => { const s = makeStore(adapter); return { store: s, api: createApi(s) } }
  const posted = () => db('transactions').map((t) => t.txn_date).sort()

  it('posts each occurrence once, dated on the day it fell due, and advances the rule', async () => {
    await store.insert('recurring_rules', { ...RULE, next_date: '2026-09-01' })
    expect(await api.postDueRecurring(TODAY)).toBe(3)
    expect(posted()).toEqual(['2026-09-01', '2026-10-01', '2026-11-01'])
    expect(db('transactions')[0]).toMatchObject({ type: 'expense', amount_paise: 2500000, category: 'Bills', payment_method: 'UPI', note: 'Rent', recurring_rule_id: db('recurring_rules')[0].id, recurring_date: '2026-09-01' })
    expect(db('recurring_rules')[0]).toMatchObject({ next_date: '2026-12-01', active: true })
    expect(await api.postDueRecurring(TODAY)).toBe(0)
    expect(db('transactions')).toHaveLength(3)
  })
  it('two devices open at the same moment post it once', async () => {
    await store.insert('recurring_rules', RULE)
    const a = device(), b = device()
    const counts = await Promise.all([a.api.postDueRecurring(TODAY), b.api.postDueRecurring(TODAY)])
    expect(counts.reduce((x, y) => x + y, 0)).toBe(1)
    expect(posted()).toEqual(['2026-11-01'])
    expect(db('recurring_rules')[0].next_date).toBe('2026-12-01')
  })
  it('a device with an old copy of the rule cannot post it twice', async () => {
    await store.insert('recurring_rules', RULE)
    const stale = device()
    await stale.store.load('recurring_rules')
    await api.postDueRecurring(TODAY)
    expect(stale.store.peek('recurring_rules')[0].next_date).toBe('2026-11-01') // still believes it is due
    expect(await stale.api.postDueRecurring(TODAY)).toBe(0)
    expect(posted()).toEqual(['2026-11-01'])
  })
  it('the unique index alone stops a double post, even if the re-read returned old data', async () => {
    const [r] = await store.insert('recurring_rules', [RULE])
    const racing = device()
    await racing.store.load('recurring_rules')
    racing.store.refetch = async () => {} // both devices read before either wrote: the re-read can't save this one
    await api.postDueRecurring(TODAY)
    expect(await racing.api.postDueRecurring(TODAY)).toBe(0)
    expect(posted()).toEqual(['2026-11-01'])
    expect(db('recurring_rules').find((x) => x.id === r.id).next_date).toBe('2026-12-01')
  })
  it('a run that died after posting but before advancing repeats safely', async () => {
    const [r] = await store.insert('recurring_rules', [{ ...RULE, next_date: '2026-10-01' }])
    await store.insert('transactions', { type: 'expense', amount_paise: 2500000, txn_date: '2026-10-01', recurring_rule_id: r.id, recurring_date: '2026-10-01' })
    expect(await api.postDueRecurring(TODAY)).toBe(1) // only November; October already exists
    expect(posted()).toEqual(['2026-10-01', '2026-11-01'])
    expect(db('recurring_rules')[0].next_date).toBe('2026-12-01')
  })
  it('a failed write leaves the rule due, so the next run finishes the job', async () => {
    await store.insert('recurring_rules', { ...RULE, next_date: '2026-10-01' })
    const insert = store.insert
    let calls = 0
    store.insert = async (...a) => { if (++calls === 2) throw Object.assign(new Error('offline'), { isNetwork: true }); return insert(...a) }
    await expect(api.postDueRecurring(TODAY)).rejects.toThrow('offline')
    store.insert = insert
    expect(db('recurring_rules')[0].next_date).toBe('2026-10-01')
    expect(await api.postDueRecurring(TODAY)).toBe(1)
    expect(posted()).toEqual(['2026-10-01', '2026-11-01'])
  })
  it('deleting a posted transaction does not bring it back', async () => {
    await store.insert('recurring_rules', RULE)
    await api.postDueRecurring(TODAY)
    await store.remove('transactions', db('transactions')[0].id)
    expect(await api.postDueRecurring(TODAY)).toBe(0)
    expect(db('transactions')).toEqual([])
  })
  it('a device waking from sleep re-reads its rules, so it cannot bring back a transaction deleted meanwhile', async () => {
    await store.insert('recurring_rules', RULE)
    const asleep = device()
    await asleep.store.load('recurring_rules')
    await api.postDueRecurring(TODAY)
    await store.remove('transactions', db('transactions')[0].id)
    expect(await asleep.api.postDueRecurring(TODAY)).toBe(0)
    expect(db('transactions')).toEqual([])
  })
  it('moving a posted transaction to another day does not free its occurrence', async () => {
    const [r] = await store.insert('recurring_rules', [RULE])
    await api.postDueRecurring(TODAY)
    await store.update('transactions', db('transactions')[0].id, { txn_date: '2026-11-02' })
    await store.update('recurring_rules', r.id, { next_date: '2026-11-01' }) // e.g. a stale edit form writes the old date back
    expect(await api.postDueRecurring(TODAY)).toBe(0)
    expect(posted()).toEqual(['2026-11-02'])
    expect(db('recurring_rules')[0].next_date).toBe('2026-12-01')
  })
  it('a rule another device just deleted is skipped; the other rules still post', async () => {
    await store.insert('recurring_rules', [RULE, { ...RULE, note: 'Netflix' }])
    const insert = store.insert
    store.insert = async (t, row) => { if (row.note === 'Rent') throw Object.assign(new Error('gone'), { code: '23503' }); return insert(t, row) }
    expect(await api.postDueRecurring(TODAY)).toBe(1)
    store.insert = insert
    expect(db('transactions').map((t) => t.note)).toEqual(['Netflix'])
  })
  it('paused rules wait; resuming skips what fell due during the pause', async () => {
    const [r] = await store.insert('recurring_rules', [{ ...RULE, next_date: '2026-10-01' }])
    const paused = await api.toggleRecurringRule(r, TODAY)
    expect(paused.active).toBe(false)
    expect(await api.postDueRecurring(TODAY)).toBe(0)
    expect(await api.toggleRecurringRule(paused, TODAY)).toMatchObject({ active: true, next_date: '2026-12-01' })
    expect(await api.postDueRecurring(TODAY)).toBe(0)
    expect(db('transactions')).toEqual([])
  })
  it('a rule stops at its end date and switches off', async () => {
    await store.insert('recurring_rules', { ...RULE, next_date: '2026-09-01', end_date: '2026-10-15' })
    expect(await api.postDueRecurring(TODAY)).toBe(2)
    expect(db('recurring_rules')[0]).toMatchObject({ next_date: '2026-11-01', active: false })
  })
  it('deleting a rule keeps the transactions it posted, and stops new ones', async () => {
    const [r] = await store.insert('recurring_rules', [RULE])
    await api.postDueRecurring(TODAY)
    await store.remove('recurring_rules', r.id)
    expect(db('transactions')).toHaveLength(1)
    expect(db('transactions')[0]).toMatchObject({ recurring_rule_id: null, recurring_date: '2026-11-01' })
    expect(await api.postDueRecurring('2026-12-01')).toBe(0)
  })
  it('editing a posted transaction or duplicating it never touches the link', async () => {
    await store.insert('recurring_rules', RULE)
    await api.postDueRecurring(TODAY)
    const [t] = db('transactions')
    await store.update('transactions', t.id, { amount_paise: 2600000 })
    expect(db('transactions')[0]).toMatchObject({ amount_paise: 2600000, recurring_date: '2026-11-01' })
    await store.insert('transactions', { type: t.type, amount_paise: t.amount_paise, txn_date: t.txn_date }) // what Duplicate sends
    expect(db('transactions')).toHaveLength(2)
  })
})

describe('defaults, reminders, notifications, finance', () => {
  it('seedDefaults adds topics and exercises once and marks the account seeded', async () => {
    await api.seedDefaults()
    const topics = db('learning_topics').length, ex = db('exercises').length
    expect(topics).toBeGreaterThan(10); expect(ex).toBeGreaterThan(10)
    expect(db('user_settings')[0].defaults_seeded).toBe(true)
    await api.seedDefaults() // idempotent
    expect(db('learning_topics')).toHaveLength(topics); expect(db('exercises')).toHaveLength(ex)
    expect(db('user_settings')).toHaveLength(1)
  })
  it('due reminders become one notification each (deduped), honour preferences, and always advance', async () => {
    await store.insert('reminders', [
      { kind: 'task', title: 'Pay rent', remind_date: TODAY, remind_time: '09:00' },
      { kind: 'bill', title: 'Bill (muted)', remind_date: TODAY, remind_time: '09:00' },
      { kind: 'habit', title: 'Daily', remind_date: '2026-11-01', remind_time: '09:00', repeat: 'daily' },
      { kind: 'task', title: 'Later', remind_date: TODAY, remind_time: '18:00' },
    ])
    const n = await api.fireDueReminders(TODAY, '10:00', { bill: false })
    expect(n).toBe(2)
    expect(db('notifications').map((x) => x.title).sort()).toEqual(['Daily', 'Pay rent'])
    expect(db('notifications').find((x) => x.title === 'Pay rent')).toMatchObject({ link: '/planner', dedupe_key: expect.stringMatching(/^reminder:.+:2026-11-02$/) })
    const byTitle = Object.fromEntries(db('reminders').map((r) => [r.title, r]))
    expect(byTitle['Pay rent']).toMatchObject({ active: false, last_fired_on: TODAY })
    expect(byTitle['Bill (muted)'].active).toBe(false) // muted but still advanced
    expect(byTitle.Daily).toMatchObject({ active: true, remind_date: '2026-11-03' })
    expect(byTitle.Later.active).toBe(true)
    expect(await api.fireDueReminders(TODAY, '10:00', { bill: false })).toBe(0) // nothing left to fire
  })
  it('a notification the other device already created (same dedupe key) is tolerated', async () => {
    const [r] = await store.insert('reminders', [{ kind: 'task', title: 'Pay rent', remind_date: TODAY, remind_time: '09:00' }])
    await store.insert('notifications', [{ title: 'Pay rent', kind: 'task', dedupe_key: `reminder:${r.id}:${TODAY}` }])
    expect(await api.fireDueReminders(TODAY, '10:00', {})).toBe(0)
    expect(db('reminders')[0].active).toBe(false)
  })
  it('reminders toggle (resuming re-arms them); notifications read / read-all / clear-read', async () => {
    const [r] = await store.insert('reminders', [{ title: 'x', remind_date: TODAY, remind_time: '09:00', active: false, last_fired_on: TODAY }])
    expect(await api.toggleReminder(r)).toMatchObject({ active: true, last_fired_on: null })
    expect(await api.toggleReminder(db('reminders')[0])).toMatchObject({ active: false })
    await store.insert('notifications', [{ title: 'a' }, { title: 'b' }, { title: 'c' }])
    const [a] = store.peek('notifications')
    const read = await api.markNotificationRead(a)
    expect(read.read_at).toBeTruthy()
    expect(await api.markNotificationRead(read)).toBe(read) // already read: no write
    expect(await api.markAllRead()).toBe(2)
    expect(await api.clearReadNotifications()).toBe(3)
    expect(db('notifications')).toHaveLength(0)
    expect(await api.clearReadNotifications()).toBe(0)
  })
  it('month budget is one overall row per month; savings funds add up and reject bad amounts', async () => {
    await store.load('budgets')
    await api.setMonthBudget('2026-11-01', 3000000); await api.setMonthBudget('2026-11-01', 2500000)
    expect(db('budgets')).toHaveLength(1)
    expect(db('budgets')[0]).toMatchObject({ category: '', amount_paise: 2500000 })
    const [g] = await store.insert('savings_goals', [{ name: 'Fund', target_paise: 1000000, saved_paise: 10000 }])
    await api.addSavingsFunds(g, 25000); await api.addSavingsFunds(g, 5000)
    expect(db('savings_goals')[0].saved_paise).toBe(40000)
    for (const bad of [0, -5, 12.5, NaN]) await expect(api.addSavingsFunds(g, bad)).rejects.toThrow('Enter an amount greater than 0.')
  })
})
