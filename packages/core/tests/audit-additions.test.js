import { describe, expect, it } from 'vitest'
import { dueLabel, upcomingItems } from '../src/upcoming'
import { exerciseProgress, personalRecords, recordText } from '../src/records'
import { averageEnergy, DEFAULT_SLEEP_GOAL_MINUTES, sleepConsistency, sleepGoalOf } from '../src/sleep'
import { budgetAlert, budgetForMonth, summarize } from '../src/finance'
import { dashboardData, gettingStartedSteps, isBrandNew } from '../src/dashboard'
import { dailyScore } from '../src/score'

const TODAY = '2026-11-02'
const NOW = Date.parse('2026-11-02T06:30:00Z') // 12:00 in Asia/Kolkata
const tz = 'Asia/Kolkata'
const opts = { today: TODAY, tz, nowMs: NOW }
const task = (o) => ({ id: o.id ?? 't', title: 'T', status: 'pending', due_date: TODAY, ...o })

describe('upcomingItems', () => {
  it('is empty when nothing is due', () => {
    expect(upcomingItems({}, opts)).toEqual({ items: [], more: 0 })
  })
  it("leaves today's tasks to the priorities list and collapses overdue tasks into one row", () => {
    const { items } = upcomingItems({ tasks: [task({ id: 'today' }), task({ id: 'a', due_date: '2026-10-30' }), task({ id: 'b', due_date: '2026-10-31' }), task({ id: 'soon', due_date: '2026-11-03' })] }, opts)
    expect(items.map((x) => x.kind)).toEqual(['overdue', 'task'])
    expect(items[0]).toMatchObject({ title: '2 overdue tasks', overdue: true, date: '2026-10-30' })
  })
  it('ignores finished work, and everything past the window', () => {
    const tasks = [task({ id: 'done', status: 'done', due_date: '2026-11-03' }), task({ id: 'later', due_date: '2026-11-20' }), task({ id: 'none', due_date: null })]
    expect(upcomingItems({ tasks }, opts).items).toEqual([])
  })
  it('merges interviews, follow-ups, goals, milestones and reminders in date order', () => {
    const { items } = upcomingItems(
      {
        interviews: [
          { id: 'i1', application_id: 'a1', status: 'scheduled', round_name: 'HR', scheduled_at: '2026-11-03T09:30:00Z' },
          { id: 'old', application_id: 'a1', status: 'scheduled', round_name: 'Past', scheduled_at: '2026-11-01T09:30:00Z' },
          { id: 'x', application_id: 'a1', status: 'cancelled', round_name: 'No', scheduled_at: '2026-11-03T09:30:00Z' },
        ],
        applications: [
          { id: 'a1', company: 'Acme', status: 'interview', followup_date: '2026-11-01' },
          { id: 'a2', company: 'Closed', status: 'rejected', followup_date: '2026-11-03' },
        ],
        goals: [
          { id: 'g1', title: 'Goal', status: 'active', due_date: '2026-11-05' },
          { id: 'g2', title: 'Finished', status: 'completed', due_date: '2026-11-05' },
        ],
        milestones: [
          { id: 'm1', goal_id: 'g1', title: 'Step', done: false, due_date: '2026-11-04' },
          { id: 'm2', goal_id: 'g2', title: 'Other goal', done: false, due_date: '2026-11-04' },
        ],
        reminders: [
          { id: 'r1', title: 'Bill', active: true, remind_date: '2026-11-06', remind_time: '09:00:00' },
          { id: 'r2', title: 'Off', active: false, remind_date: '2026-11-06', remind_time: '09:00:00' },
        ],
      },
      opts,
    )
    expect(items.map((x) => x.id)).toEqual(['followup-a1', 'i1', 'm1', 'g1', 'r1'])
    expect(items[1]).toMatchObject({ title: 'Acme · HR', date: '2026-11-03', time: '15:00', refId: 'a1' })
    expect(items[4]).toMatchObject({ time: '09:00' })
  })
  it('reports how many rows did not fit', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => task({ id: `t${i}`, due_date: '2026-11-03' }))
    expect(upcomingItems({ tasks }, opts)).toMatchObject({ more: 4 })
    expect(upcomingItems({ tasks }, opts).items).toHaveLength(8)
  })
  it('labels due dates in plain words', () => {
    const fmt = (d) => `<${d}>`
    expect(dueLabel({ date: TODAY }, TODAY, fmt)).toBe('Today')
    expect(dueLabel({ date: '2026-11-03', time: '15:00' }, TODAY, fmt)).toBe('Tomorrow, 15:00')
    expect(dueLabel({ date: '2026-11-05' }, TODAY, fmt)).toBe('<2026-11-05>')
    expect(dueLabel({ date: '2026-11-01', overdue: true, kind: 'followup' }, TODAY, fmt)).toBe('Overdue · <2026-11-01>')
    expect(dueLabel({ date: '2026-11-01', overdue: true, kind: 'overdue' }, TODAY, fmt)).toBe('Overdue')
  })
})

describe('personal records', () => {
  const workouts = [
    { id: 'w1', status: 'completed', workout_date: '2026-10-01' },
    { id: 'w2', status: 'completed', workout_date: '2026-10-08' },
    { id: 'w3', status: 'skipped', workout_date: '2026-10-09' },
  ]
  const set = (workout_id, exercise_name, reps, weight_kg) => ({ workout_id, exercise_name, reps, weight_kg })
  const logs = [set('w1', 'Bench', 8, 60), set('w1', 'Bench', 5, 70), set('w2', 'Bench', 6, 70), set('w2', 'Pull-up', 10, 0), set('w1', 'Pull-up', 12, 0), set('w3', 'Bench', 1, 200), set('w2', 'Squat', 0, 100)]
  it('takes the heaviest set, then the most reps at that weight, and only from completed workouts', () => {
    const recs = personalRecords(logs, workouts)
    expect(recs.find((r) => r.name === 'Bench')).toMatchObject({ weight: 70, reps: 6, date: '2026-10-08', sessions: 2, last: '2026-10-08' })
    expect(recs.find((r) => r.name === 'Pull-up')).toMatchObject({ weight: 0, reps: 12, date: '2026-10-01' })
  })
  it('ignores sets with no reps and returns newest records first', () => {
    expect(personalRecords(logs, workouts).map((r) => r.name)).toEqual(['Bench', 'Pull-up'])
    expect(personalRecords([], workouts)).toEqual([])
  })
  it('charts one point per training day', () => {
    expect(exerciseProgress(logs, workouts, 'Bench')).toEqual([
      { date: '2026-10-01', weight: 70, reps: 8, volume: 830 },
      { date: '2026-10-08', weight: 70, reps: 6, volume: 420 },
    ])
    expect(exerciseProgress(logs, workouts, 'Nope')).toEqual([])
  })
  it('describes a record', () => {
    expect(recordText({ weight: 70, reps: 6 })).toBe('70 kg × 6')
    expect(recordText({ weight: 0, reps: 12 })).toBe('12 reps')
  })
})

describe('sleep goal and consistency', () => {
  it('falls back to the default for a missing or out-of-range goal', () => {
    expect(sleepGoalOf({})).toBe(DEFAULT_SLEEP_GOAL_MINUTES)
    expect(sleepGoalOf(undefined)).toBe(DEFAULT_SLEEP_GOAL_MINUTES)
    expect(sleepGoalOf({ habit_prefs: { sleep_goal_minutes: 5 } })).toBe(DEFAULT_SLEEP_GOAL_MINUTES)
    expect(sleepGoalOf({ habit_prefs: { sleep_goal_minutes: 480 } })).toBe(480)
  })
  it('the daily score measures sleep against the goal', () => {
    const base = { date: TODAY, tasks: [], habits: [], habitLogs: [], sessions: [], workouts: [], applications: [], interviews: [], tz, health: { sleep_minutes: 240, water_ml: 0 } }
    const sleep = (settings) => dailyScore({ ...base, settings }).categories.find((c) => c.key === 'health').items.find((i) => i.label === 'Sleep').fraction
    expect(sleep({})).toBeCloseTo(240 / 450)
    expect(sleep({ habit_prefs: { sleep_goal_minutes: 480 } })).toBeCloseTo(0.5)
  })
  it('needs three nights, because one or two nights say nothing about consistency', () => {
    const logs = [{ bedtime: '23:00', wake_time: '07:00', sleep_minutes: 480 }]
    expect(sleepConsistency(logs)).toMatchObject({ nights: 1, label: null, spreadMinutes: null, nightsMetGoal: 1 })
  })
  it('treats bedtimes either side of midnight as close together', () => {
    const logs = ['23:30', '00:00', '00:30'].map((bedtime) => ({ bedtime, wake_time: '07:00', sleep_minutes: 420 }))
    const r = sleepConsistency(logs, { goalMinutes: 450 })
    expect(r.avgBedtime).toBe('00:00')
    expect(r.avgWake).toBe('07:00')
    expect(r.spreadMinutes).toBeLessThan(30)
    expect(r.label).toBe('Very regular')
    expect(r.nightsMetGoal).toBe(0)
  })
  it('calls scattered bedtimes irregular', () => {
    const logs = ['21:00', '02:00', '23:30'].map((bedtime) => ({ bedtime, wake_time: '07:00', sleep_minutes: 420 }))
    expect(sleepConsistency(logs).label).toBe('Irregular')
  })
  it('averages energy only over days that have one', () => {
    expect(averageEnergy([{ energy_level: 2 }, { energy_level: null }, { energy_level: 5 }])).toBe(3.5)
    expect(averageEnergy([{ energy_level: null }])).toBeNull()
  })
})

describe('budgets', () => {
  const tx = (amount) => [{ type: 'expense', amount_paise: amount, txn_date: '2026-11-02' }]
  it("prefers the month's own budget over the default", () => {
    const budgets = [
      { month: '2026-11-01', category: '', amount_paise: 500 },
      { month: '2026-11-01', category: 'Food', amount_paise: 100 },
    ]
    expect(budgetForMonth(budgets, '2026-11-01', 900)).toBe(500)
    expect(budgetForMonth(budgets, '2026-12-01', 900)).toBe(900)
    expect(budgetForMonth(undefined, '2026-12-01', 900)).toBe(900)
  })
  it('alerts from 80% and when over, not before and not without a budget', () => {
    const alert = (spent, budget) => budgetAlert(summarize(tx(spent), '2026-11', budget))
    expect(alert(100, 0)).toBeNull()
    expect(alert(79, 100)).toBeNull()
    expect(alert(80, 100)).toMatchObject({ level: 'warning', percent: 80, left: 20 })
    expect(alert(100, 100)).toMatchObject({ level: 'warning', percent: 100, left: 0 })
    expect(alert(130, 100)).toMatchObject({ level: 'danger', percent: 130, overBy: 30 })
  })
  it('the dashboard uses the same budget as the Finance screen', () => {
    const empty = { tasks: [], studySessions: [], workouts: [], healthLogs: [], transactions: [], applications: [], history: [], interviews: [], goals: [], milestones: [], habits: [], habitLogs: [] }
    const settings = { timezone: tz, currency: 'INR', week_starts_on: 1, monthly_budget_paise: 1000, score_weights: {} }
    const r = dashboardData({ ...empty, budgets: [{ month: '2026-11-01', category: '', amount_paise: 6000 }] }, { settings, today: TODAY, nowMs: NOW })
    expect(r.month.budget).toBe(6000)
    expect(dashboardData(empty, { settings, today: TODAY, nowMs: NOW }).month.budget).toBe(1000)
  })
})

describe('getting started', () => {
  it('counts an account as new only while every table is empty', () => {
    expect(isBrandNew([], [], undefined)).toBe(true)
    expect(isBrandNew([], [{ id: 'running-timer' }])).toBe(false)
  })
  it('ticks steps off from real data', () => {
    expect(gettingStartedSteps({})).toMatchObject({ done: 0, total: 5, complete: false })
    const all = { tasks: [1], habits: [1], goals: [1], transactions: [1], healthLogs: [1] }
    expect(gettingStartedSteps(all)).toMatchObject({ done: 5, complete: true })
    expect(gettingStartedSteps({ tasks: [1] }).steps.find((s) => s.key === 'task').done).toBe(true)
  })
})
