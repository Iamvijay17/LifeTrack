import { describe, expect, it } from 'vitest'
import { dashboardData, gymState, greetingFor, isWidgetOn, recentActivity, relTime, WIDGETS } from '../src/dashboard'

const TODAY = '2026-11-02' // Monday
const NOW = Date.parse('2026-11-02T06:30:00Z') // 12:00 in Asia/Kolkata
const settings = { timezone: 'Asia/Kolkata', currency: 'INR', week_starts_on: 1, daily_study_target_minutes: 60, water_goal_ml: 2000, steps_goal: 10000, monthly_budget_paise: 1000000, workout_plan: { 1: 'rt1' }, score_weights: { learning: 25, career: 25, fitness: 20, habits: 15, health: 15 } }
const empty = { tasks: [], studySessions: [], workouts: [], healthLogs: [], transactions: [], applications: [], history: [], interviews: [], goals: [], milestones: [], habits: [], habitLogs: [] }
const T = (o) => ({ id: o.id, title: o.id, status: 'pending', priority: 'medium', due_date: TODAY, created_at: '2026-11-01T00:00:00Z', ...o })

describe('dashboardData', () => {
  it('is empty-safe: nothing planned means no invented numbers', () => {
    const none = { ...settings, workout_plan: {}, daily_study_target_minutes: 0, water_goal_ml: 0, steps_goal: 0 } // no goals → nothing is "planned"
    const r = dashboardData(empty, { settings: none, today: TODAY, nowMs: NOW })
    expect(r.progress.percent).toBeNull()
    expect(r.openToday).toBe(0)
    expect(r.topTasks).toEqual([])
    expect(r.streak).toBe(0)
    expect(r.activity).toEqual([])
    expect(r.gym).toBe('Not planned')
    expect(r.habitsDue).toBe(0)
    expect(r.month).toMatchObject({ expense: 0, budget: 1000000 })
  })
  it('combines tasks, habits, study, health, money and jobs from one dataset', () => {
    const data = {
      ...empty,
      tasks: [T({ id: 'a', priority: 'high' }), T({ id: 'b' }), T({ id: 'c', status: 'done', completed_at: '2026-11-02T04:00:00Z' }), T({ id: 'd', priority: 'low' }), T({ id: 'e', priority: 'low' }), T({ id: 'later', due_date: '2026-11-09' })],
      habits: [{ id: 'h1', name: 'Read', frequency: 'daily', days_of_week: [], weekly_target: 3, start_date: '2026-10-20', archived_at: null }],
      habitLogs: [{ id: 'l1', habit_id: 'h1', log_date: TODAY, status: 'done', created_at: '2026-11-02T03:00:00Z' }],
      studySessions: [{ id: 's1', status: 'completed', session_date: TODAY, duration_seconds: 1800, problems_solved: 2, ended_at: '2026-11-02T05:00:00Z', created_at: '2026-11-02T04:30:00Z' }, { id: 's2', status: 'running', session_date: TODAY, started_at: '2026-11-02T06:00:00Z', created_at: '2026-11-02T06:00:00Z' }],
      healthLogs: [{ log_date: TODAY, sleep_minutes: 450, water_ml: 1000, steps: 5000 }],
      transactions: [{ id: 't1', type: 'expense', category: 'Food', amount_paise: 25050, txn_date: TODAY, created_at: '2026-11-02T05:30:00Z' }, { id: 't2', type: 'income', category: 'Salary', amount_paise: 5000000, txn_date: '2026-11-01', created_at: '2026-11-01T05:30:00Z' }],
      applications: [{ id: 'j1', company: 'Acme', status: 'applied', applied_date: TODAY, created_at: '2026-11-02T00:00:00Z' }],
      history: [{ application_id: 'j1', from_status: null, to_status: 'applied', changed_at: '2026-11-02T01:00:00Z' }],
      workouts: [{ id: 'w1', workout_date: TODAY, status: 'completed', name: 'Push', created_at: '2026-11-02T02:00:00Z' }],
      goals: [{ id: 'g1', title: 'Ship', status: 'active', due_date: '2026-12-01', target_minutes: 0, manual_progress: 40 }],
    }
    const r = dashboardData(data, { settings, today: TODAY, nowMs: NOW })
    expect(r.openToday).toBe(4)
    expect(r.doneTodayTasks).toBe(1)
    expect(r.topTasks.map((t) => t.id)).toEqual(['a', 'b', 'd']) // 3 most important open tasks
    expect(r.studyMin).toBe(30)
    expect(r.timerRunning).toBe(true)
    expect(r.spentToday).toBe(25050)
    expect(r.month).toMatchObject({ income: 5000000, expense: 25050, remaining: 974950 })
    expect(r.weekApps).toBe(1)
    expect(r.habitsDue).toBe(1)
    expect(r.habitsDone).toBe(1)
    expect(r.gym).toBe('Done')
    expect(r.activeGoals[0].p).toMatchObject({ percent: 40, source: 'manual' })
    expect(r.streak).toBeGreaterThanOrEqual(1)
    expect(r.progress.percent).toBeGreaterThan(0)
    expect(r.score.score).toBeGreaterThan(0)
    expect(r.weekScores).toHaveLength(7)
    expect(r.weekScores.filter((x) => x.score == null)).toHaveLength(6) // Tue–Sun are in the future
    expect(r.greeting).toBe('Good afternoon')
  })
  it('activity feed is newest first, capped at 8, and describes each kind', () => {
    const base = { tasks: [], sessions: [], workouts: [], transactions: [], history: [], applications: [{ id: 'j', company: 'Acme' }], habitLogs: [], habits: [{ id: 'h', name: 'Read' }], currency: 'INR' }
    const feed = recentActivity({ ...base, tasks: [T({ id: 'x', status: 'done', completed_at: '2026-11-02T05:00:00Z' })], history: [{ application_id: 'j', from_status: 'applied', to_status: 'interview', changed_at: '2026-11-02T06:00:00Z' }], habitLogs: [{ habit_id: 'h', status: 'done', created_at: '2026-11-02T04:00:00Z' }], transactions: [{ type: 'savings', amount_paise: 100000, category: 'Goal', created_at: '2026-11-02T03:00:00Z' }] })
    expect(feed.map((a) => a.kind)).toEqual(['job', 'task', 'habit', 'money'])
    expect(feed[0].text).toBe('Acme: applied → interview')
    expect(feed[3].text).toContain('Saved')
    expect(recentActivity({ ...base, tasks: Array.from({ length: 20 }, (_, i) => T({ id: 't' + i, status: 'done', completed_at: `2026-11-02T0${i % 9}:00:00Z` })) })).toHaveLength(8)
  })
})
describe('helpers', () => {
  it('greeting, relative time, gym state, widgets', () => {
    expect([2, 9, 14, 19, 23].map(greetingFor)).toEqual(['Still up', 'Good morning', 'Good afternoon', 'Good evening', 'Good night'])
    expect([20e3, 5 * 60e3, 3 * 3600e3, 2 * 86400e3].map((ms) => relTime(new Date(NOW - ms).toISOString(), NOW))).toEqual(['just now', '5m ago', '3h ago', '2d ago'])
    expect([gymState([{ status: 'rest' }], undefined), gymState([], 'rest'), gymState([{ status: 'skipped' }], 'x'), gymState([], 'rt'), gymState([], undefined)]).toEqual(['Rest day', 'Rest day', 'Skipped', 'Planned', 'Not planned'])
    expect(isWidgetOn({ score: false }, 'score')).toBe(false)
    expect(isWidgetOn({}, 'score')).toBe(true)
    expect(isWidgetOn(undefined, 'brand-new-widget')).toBe(true)
    expect(WIDGETS.map((w) => w.key)).toContain('activity')
  })
})

import { validateScoreWeights } from '../src/score'
describe('validateScoreWeights', () => {
  const ok = { learning: '25', career: 25, fitness: 20, habits: '15', health: 15 }
  it('returns numbers, rejects out-of-range / non-numeric / all-zero', () => {
    expect(validateScoreWeights(ok)).toEqual({ learning: 25, career: 25, fitness: 20, habits: 15, health: 15 })
    expect(() => validateScoreWeights({ ...ok, fitness: 101 })).toThrow(/Fitness|fitness/i)
    expect(() => validateScoreWeights({ ...ok, habits: 'abc' })).toThrow(/between 0 and 100/)
    expect(() => validateScoreWeights({ ...ok, health: -1 })).toThrow(/between 0 and 100/)
    expect(() => validateScoreWeights({ learning: 0, career: 0, fitness: 0, habits: 0, health: 0 })).toThrow('At least one weight must be above zero.')
    expect(validateScoreWeights({ ...ok, learning: 0 }).learning).toBe(0)
  })
})
