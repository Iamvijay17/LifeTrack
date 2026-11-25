import { describe, expect, it } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import { notificationSettings } from '../src/notifications'
import { dueCandidates, sourceCandidates, sourceTables } from '../src/notificationSources'

const TZ = 'Asia/Kolkata'
const D = '2026-11-11' // a Wednesday
const at = (day, time) => zonedToMs(day, time, TZ)
const settings = notificationSettings({})
const task = (o) => ({ id: 't', title: 'x', status: 'pending', priority: 'medium', due_date: D, created_at: '2026-11-01T00:00:00Z', ...o })
const habit = (o) => ({ id: 'h1', name: 'Read', frequency: 'daily', start_date: '2026-01-01', days_of_week: [], weekly_target: 3, archived_at: null, ...o })
const run = (d, { nowMs = at(D, '09:00'), prefs = {}, s = settings, user = {} } = {}) => sourceCandidates(d, { nowMs, tz: TZ, settings: s, prefs, user })
const byKey = (list) => Object.fromEntries(list.map((c) => [c.key, c]))

describe('sourceCandidates', () => {
  it('has nothing to say about an empty day, and nothing at all when smart notifications are off', () => {
    expect(run({})).toEqual([])
    expect(run({ tasks: [task()] }, { s: notificationSettings({ smart: false }) })).toEqual([])
  })

  it('tasks due today are one digest at the morning time, with the most urgent priority', () => {
    const c = byKey(run({ tasks: [task({ id: 'a', title: 'File taxes', priority: 'high' }), task({ id: 'b', title: 'Call plumber', priority: 'low' }), task({ id: 'c', status: 'done' }), task({ id: 'd', due_date: '2026-11-12' })] }))
    const t = c[`src:tasks-today:${D}`]
    expect(t).toMatchObject({ kind: 'task', priority: 'high', title: '2 tasks due today', link: '/planner', dueMs: at(D, '08:00'), expiresMs: at('2026-11-12', '00:00') })
    expect(t.body).toBe('File taxes · Call plumber')
    const one = byKey(run({ tasks: [task({ title: 'File taxes' })] }))[`src:tasks-today:${D}`]
    expect(one.title).toBe('Due today: File taxes')
    expect(one.priority).toBe('normal') // a medium task is a normal notification
  })

  it('overdue tasks are their own high-priority digest', () => {
    const c = byKey(run({ tasks: [task({ id: 'a', title: 'Old one', due_date: '2026-11-01' }), task({ id: 'b', title: 'Older', due_date: '2026-10-20', status: 'in_progress' }), task({ id: 'c', due_date: '2026-10-01', status: 'done' })] }))
    expect(c[`src:tasks-overdue:${D}`]).toMatchObject({ title: '2 overdue tasks', priority: 'high', body: 'Old one · Older' })
    expect(byKey(run({ tasks: [task({ due_date: '2026-11-01' })] }))[`src:tasks-overdue:${D}`].title).toBe('1 overdue task')
  })

  it('habits still to do arrive in the evening and only while some are left', () => {
    const habits = [habit(), habit({ id: 'h2', name: 'Meditate' })]
    const c = byKey(run({ habits, habitLogs: [] }))
    expect(c[`src:habits:${D}`]).toMatchObject({ kind: 'habit', title: '2 habits left today', body: 'Read · Meditate', dueMs: at(D, '20:00') })
    const half = byKey(run({ habits, habitLogs: [{ habit_id: 'h1', log_date: D, status: 'done' }] }))
    expect(half[`src:habits:${D}`].title).toBe('1 habit left today')
    expect(run({ habits, habitLogs: [{ habit_id: 'h1', log_date: D, status: 'done' }, { habit_id: 'h2', log_date: D, status: 'done' }] })).toEqual([])
    expect(run({ habits: [habit({ archived_at: '2026-10-01T00:00:00Z' })], habitLogs: [] })).toEqual([])
  })

  it('the planned workout is a morning nudge unless it is already done', () => {
    const d = { routines: [{ id: 'r1', name: 'Push day' }], workouts: [] }
    const user = { workout_plan: { 3: 'r1' } } // Wednesday
    expect(byKey(run(d, { user }))[`src:workout:${D}`]).toMatchObject({ kind: 'workout', title: 'Today’s workout: Push day', link: '/fitness' })
    expect(run({ ...d, workouts: [{ id: 'w', workout_date: D, status: 'completed', name: 'Push day' }] }, { user })).toEqual([])
    expect(run({ ...d, workouts: [{ id: 'w', workout_date: D, status: 'rest' }] }, { user })).toEqual([])
    expect(run(d, { user: { workout_plan: { 3: 'rest' } } })).toEqual([])
  })

  it('an interview gets a heads-up the chosen time before, in the person’s timezone', () => {
    const start = at(D, '15:30')
    const d = { applications: [{ id: 'a1', company: 'Acme', status: 'interview' }], interviews: [{ id: 'i1', application_id: 'a1', round_name: 'Round 2', status: 'scheduled', scheduled_at: new Date(start).toISOString() }] }
    const c = byKey(run(d, { nowMs: at(D, '09:00') }))[`src:interview:i1:60`]
    expect(c).toMatchObject({ kind: 'job', priority: 'high', title: 'Interview: Acme · Round 2', body: 'Starts today at 3:30 PM', dueMs: start - 3_600_000, expiresMs: start })
    expect(dueCandidates([c], start - 3_600_001)).toEqual([]) // not yet
    expect(dueCandidates([c], start - 3_600_000)).toHaveLength(1)
    expect(dueCandidates([c], start)).toEqual([]) // it has begun: too late to be a heads-up
    expect(byKey(run(d, { s: notificationSettings({ lead_minutes: 15 }) }))[`src:interview:i1:15`].dueMs).toBe(start - 900_000)
    expect(run({ ...d, interviews: [{ ...d.interviews[0], status: 'cancelled' }] })).toEqual([])
    expect(run({ ...d, interviews: [{ ...d.interviews[0], scheduled_at: new Date(at('2026-11-14', '10:00')).toISOString() }] })).toEqual([]) // days away
    expect(byKey(run({ ...d, interviews: [{ ...d.interviews[0], scheduled_at: new Date(at('2026-11-12', '10:00')).toISOString() }] }, { nowMs: at(D, '20:00') }))['src:interview:i1:60'].body).toBe('Starts tomorrow at 10:00 AM')
  })

  it('job follow-ups due today are a digest and closed applications are left out', () => {
    const apps = [
      { id: 'a1', company: 'Acme', status: 'applied', followup_date: D },
      { id: 'a2', company: 'Globex', status: 'applied', followup_date: D },
      { id: 'a3', company: 'Initech', status: 'rejected', followup_date: D },
    ]
    const c = byKey(run({ applications: apps }))[`src:followups:${D}`]
    expect(c).toMatchObject({ kind: 'job', title: '2 job follow-ups due today', body: 'Follow up with Acme · Follow up with Globex' })
    expect(byKey(run({ applications: [apps[0]] }))[`src:followups:${D}`].title).toBe('Follow up with Acme')
  })

  it('bills: due today (morning, high), due tomorrow (evening), income is not a bill', () => {
    const rules = [
      { id: 'r1', active: true, next_date: D, type: 'expense', note: 'Rent', category: 'Bills', amount_paise: 1500000, frequency: 'monthly' },
      { id: 'r2', active: true, next_date: D, type: 'income', note: 'Salary', category: 'Salary', amount_paise: 9000000, frequency: 'monthly' },
      { id: 'r3', active: true, next_date: '2026-11-12', type: 'expense', note: 'Netflix', category: 'Subscriptions', amount_paise: 64900, frequency: 'monthly' },
      { id: 'r4', active: false, next_date: '2026-11-12', type: 'expense', note: 'Paused', category: 'Bills', amount_paise: 100, frequency: 'monthly' },
    ]
    const c = byKey(run({ recurringRules: rules }, { user: { currency: 'INR' } }))
    expect(c[`src:bills-today:${D}`]).toMatchObject({ kind: 'bill', priority: 'high', title: 'Rent is due today', body: '₹15,000', dueMs: at(D, '08:00') })
    expect(c['src:bills-tomorrow:2026-11-12']).toMatchObject({ kind: 'bill', priority: 'normal', title: 'Netflix is due tomorrow', body: '₹649', dueMs: at(D, '20:00') })
    expect(Object.keys(c)).toHaveLength(2)
  })

  it('a budget warning at 80% and an overspend alert, each once per month and level', () => {
    const tx = (paise) => [{ id: 'x', txn_date: '2026-11-03', type: 'expense', category: 'Food', amount_paise: paise }]
    const user = { monthly_budget_paise: 1000000, currency: 'INR' }
    const warn = run({ transactions: tx(850000) }, { user })
    expect(warn).toHaveLength(1)
    expect(warn[0]).toMatchObject({ key: 'src:budget:2026-11:warning', kind: 'bill', priority: 'normal', title: '85% of this month’s budget used', body: '₹1,500 left this month', dueMs: 0, expiresMs: at('2026-12-01', '00:00') })
    const over = run({ transactions: tx(1200000) }, { user })
    expect(over[0]).toMatchObject({ key: 'src:budget:2026-11:danger', priority: 'high', title: 'Over budget by ₹2,000' })
    expect(run({ transactions: tx(500000) }, { user })).toEqual([])
    expect(run({ transactions: tx(1200000) })).toEqual([]) // no budget set: nothing to measure against
    expect(run({ transactions: tx(1200000), budgets: [{ month: '2026-11', category: '', amount_paise: 5000000 }] }, { user })).toEqual([]) // this month has its own, larger budget
  })

  it('topics to revise today', () => {
    const topics = [{ id: 't1', name: 'Graphs', archived: false, revision_dates: [D] }, { id: 't2', name: 'DP', archived: false, revision_dates: [D] }, { id: 't3', name: 'Old', archived: true, revision_dates: [D] }]
    expect(byKey(run({ topics }))[`src:revision:${D}`]).toMatchObject({ kind: 'study', title: '2 topics to revise today', body: 'Graphs · DP' })
    expect(byKey(run({ topics: [topics[0]] }))[`src:revision:${D}`].title).toBe('Revise Graphs')
  })

  it('goals and milestones due today or tomorrow, for active goals only', () => {
    const goals = [
      { id: 'g1', title: 'Ship v2', status: 'active', due_date: D },
      { id: 'g2', title: 'Done already', status: 'completed', due_date: D },
      { id: 'g3', title: 'Far away', status: 'active', due_date: '2026-12-31' },
    ]
    const milestones = [{ id: 'm1', goal_id: 'g1', title: 'Write docs', done: false, due_date: '2026-11-12' }, { id: 'm2', goal_id: 'g2', title: 'Hidden', done: false, due_date: D }, { id: 'm3', goal_id: 'g1', title: 'Finished', done: true, due_date: D }]
    const c = byKey(run({ goals, milestones }))[`src:goals:${D}`]
    expect(c).toMatchObject({ kind: 'goal', priority: 'high', title: '2 goal deadlines coming up', body: 'Ship v2 (today) · Write docs (tomorrow)' })
    expect(byKey(run({ goals: [goals[0]], milestones: [] }))[`src:goals:${D}`].title).toBe('Ship v2 is due today')
  })

  it('a category that is switched off contributes nothing, and nothing leaks into other digests', () => {
    const d = { tasks: [task()], habits: [habit()], habitLogs: [], recurringRules: [{ id: 'r', active: true, next_date: D, type: 'expense', note: 'Rent', category: 'Bills', amount_paise: 100, frequency: 'monthly' }] }
    const keys = (prefs) => run(d, { prefs }).map((c) => c.kind).sort()
    expect(keys({})).toEqual(['bill', 'habit', 'task'])
    expect(keys({ task: false })).toEqual(['bill', 'habit'])
    expect(keys({ task: false, habit: false, bill: false })).toEqual([])
  })

  it('every key is stable for the same day so two devices raise the same notification', () => {
    const d = { tasks: [task()], habits: [habit()], habitLogs: [] }
    expect(run(d, { nowMs: at(D, '09:00') }).map((c) => c.key)).toEqual(run(d, { nowMs: at(D, '21:30') }).map((c) => c.key))
    expect(new Set(run(d).map((c) => c.key)).size).toBe(run(d).length)
    expect(run(d, { nowMs: at('2026-11-12', '09:00') }).map((c) => c.key).every((k) => k.endsWith('2026-11-12'))).toBe(true)
  })

  it('honours the morning and evening times, in the person’s timezone', () => {
    const s = notificationSettings({ morning: '07:30', evening: '21:15' })
    const c = byKey(run({ tasks: [task()], habits: [habit()], habitLogs: [] }, { s }))
    expect(c[`src:tasks-today:${D}`].dueMs).toBe(at(D, '07:30'))
    expect(c[`src:habits:${D}`].dueMs).toBe(at(D, '21:15'))
    // the same wall-clock time is a different instant elsewhere
    const la = sourceCandidates({ tasks: [task()] }, { nowMs: Date.parse('2026-11-11T17:30:00Z'), tz: 'America/Los_Angeles', settings, prefs: {}, user: {} })
    expect(la[0].dueMs).toBe(zonedToMs(D, '08:00', 'America/Los_Angeles'))
  })
})

describe('dueCandidates and sourceTables', () => {
  const c = (o) => ({ key: 'k', kind: 'task', title: 'T', body: '', priority: 'normal', link: '/planner', dueMs: 1000, expiresMs: 5000, ...o })
  it('is due from its time until it expires', () => {
    expect([999, 1000, 4999, 5000].map((now) => dueCandidates([c()], now).length)).toEqual([0, 1, 1, 0])
  })
  it('loads only the tables for categories that are on', () => {
    expect(sourceTables({}, settings)).toEqual(expect.arrayContaining(['tasks', 'habits', 'habit_logs', 'recurring_rules', 'goals']))
    expect(sourceTables({ task: false, habit: false, workout: false, job: false, bill: false, study: false }, settings)).toEqual(['goals', 'milestones'])
    expect(sourceTables({}, notificationSettings({ smart: false }))).toEqual([])
    expect(new Set(sourceTables({}, settings)).size).toBe(sourceTables({}, settings).length)
  })
})
