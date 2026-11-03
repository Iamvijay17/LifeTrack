import { describe, expect, it } from 'vitest'
import { analyticsRange, pctText, resolveRange } from '../src/analytics'

const TODAY = '2026-11-02'
const empty = { studySessions: [], goals: [], applications: [], history: [], interviews: [], workouts: [], healthLogs: [], transactions: [], habits: [], habitLogs: [] }

describe('resolveRange', () => {
  it('presets, custom, swapped custom and no future', () => {
    expect(resolveRange('week', null, TODAY, 1)).toMatchObject({ from: '2026-11-02', to: '2026-11-08', upto: TODAY })
    expect(resolveRange('custom', { from: '2026-10-01', to: '2026-10-31' }, TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31', upto: '2026-10-31' })
    expect(resolveRange('custom', { from: '2026-10-31', to: '2026-10-01' }, TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
    expect(pctText(0.456)).toBe('46%')
    expect(pctText(null)).toBe('—')
  })
})
describe('analyticsRange', () => {
  const r0 = { from: '2026-10-01', to: '2026-10-31', upto: '2026-10-31', today: TODAY, weekStartsOn: 1, workoutPlan: { 1: 'rt', 3: 'rt', 0: 'rest' } }
  it('empty ranges stay empty — nothing invented', () => {
    const a = analyticsRange(empty, { ...r0, workoutPlan: {} })
    expect(a).toMatchObject({ studyMinutes: 0, problems: 0, sleepAvg: null, waterAvg: null, stepsAvg: null, habitRate: null, planConsistency: null, longestStreak: 0 })
    expect(a.sum).toEqual({ income: 0, expense: 0, savings: 0 })
    expect(a.categories).toEqual([])
    expect(a.jobs.conversion).toBeNull()
  })
  it('only counts records inside the range, per module', () => {
    const d = {
      ...empty,
      studySessions: [
        { id: 'in', status: 'completed', session_date: '2026-10-10', duration_seconds: 7200, problems_solved: 4, goal_id: null, topic_id: null },
        { id: 'run', status: 'running', session_date: '2026-10-11', duration_seconds: null },
        { id: 'out', status: 'completed', session_date: '2026-09-30', duration_seconds: 3600, problems_solved: 9 },
      ],
      transactions: [{ type: 'expense', category: 'Food', amount_paise: 30000, txn_date: '2026-10-05' }, { type: 'expense', category: 'Food', amount_paise: 20000, txn_date: '2026-11-01' }, { type: 'income', category: 'Salary', amount_paise: 100000, txn_date: '2026-10-01' }],
      healthLogs: [{ log_date: '2026-10-02', sleep_minutes: 420, water_ml: 2000, steps: 8000, weight_kg: '72' }, { log_date: '2026-10-03', sleep_minutes: 480, water_ml: 0, steps: 0, weight_kg: '71.5' }],
      workouts: [{ id: 'a', status: 'completed', workout_date: '2026-10-05' }, { id: 'b', status: 'rest', workout_date: '2026-10-07' }],
      applications: [{ id: 'j1', status: 'interview', applied_date: '2026-10-09', created_at: '2026-10-09T00:00:00Z', company: 'A' }, { id: 'j2', status: 'applied', applied_date: '2026-11-02', created_at: '2026-11-02T00:00:00Z', company: 'B' }],
      history: [{ application_id: 'j1', to_status: 'applied' }, { application_id: 'j1', from_status: 'applied', to_status: 'interview' }],
      goals: [{ id: 'g1', title: 'x', status: 'active', target_minutes: 600, topic_id: null }, { id: 'g2', title: 'gone', status: 'archived' }],
    }
    const a = analyticsRange(d, r0)
    expect(a.studyMinutes).toBe(120)
    expect(a.studySessionCount).toBe(1)
    expect(a.problems).toBe(4)
    expect(a.sum).toEqual({ income: 100000, expense: 30000, savings: 0 })
    expect(a.categories[0]).toMatchObject({ category: 'Food', paise: 30000, share: 1 })
    expect(a.sleepAvg).toBe(450)
    expect(a.waterAvg).toBe(2000) // zero-ml days are "not logged", not averaged in
    expect(a.stepsAvg).toBe(8000)
    expect(a.weights.map((w) => w.kg)).toEqual([72, 71.5])
    expect(a.done).toHaveLength(1)
    expect(a.jobs).toMatchObject({ applied: 1, interviews: 1, conversion: 1 })
    expect(a.goalRows).toHaveLength(1) // archived goals are hidden
    expect(a.salaryApps.map((x) => x.id)).toEqual(['j1'])
  })
  it('plan consistency counts planned workout days that have a completed workout, never future days', () => {
    const d = { ...empty, workouts: [{ id: 'a', status: 'completed', workout_date: '2026-11-02' }] }
    const a = analyticsRange(d, { from: '2026-11-02', to: '2026-11-08', upto: TODAY, today: TODAY, weekStartsOn: 1, workoutPlan: { 1: 'rt', 3: 'rt', 0: 'rest' } })
    expect(a.plannedDays).toEqual(['2026-11-02']) // Wed 4 Nov is in the future
    expect(a.planConsistency).toBe(1)
  })
})
