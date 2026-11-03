import { describe, expect, it } from 'vitest'
import { dashboardData } from '../src/dashboard'
import { analyticsRange, resolveRange } from '../src/analytics'
import { financeMonth } from '../src/finance'
import { goalsSummary } from '../src/goals'
import { jobsOverview } from '../src/jobs'
import { GOLDEN, NOW_MS, SETTINGS, TABLES, TODAY, toInput } from './fixtures/dataset'

describe('golden dataset (the numbers every platform must show)', () => {
  const dash = dashboardData(toInput(TABLES), { settings: SETTINGS, today: TODAY, nowMs: NOW_MS })
  it('dashboard', () => {
    const g = GOLDEN.dashboard
    expect(dash).toMatchObject({ openToday: g.openToday, doneTodayTasks: g.doneTodayTasks, studyMin: g.studyMin, timerRunning: g.timerRunning, spentToday: g.spentToday, weekApps: g.weekApps, habitsDue: g.habitsDue, habitsDone: g.habitsDone, gym: g.gym })
    expect(dash.topTasks.map((t) => t.id)).toEqual(g.topTaskIds)
    expect(dash.month).toMatchObject(g.month)
    expect(dash.activeGoals.map((x) => x.p.percent)).toEqual(g.goalPercents)
    expect(dash.weekScores).toHaveLength(g.weekScoresLength)
    expect(dash.weekScores.filter((x) => x.score == null)).toHaveLength(g.futureDaysWithoutScore)
  })
  it('analytics over the month', () => {
    const { from, to, upto } = resolveRange('custom', { from: '2026-10-01', to: '2026-11-30' }, TODAY, 1)
    const a = analyticsRange(toInput(TABLES), { from, to, upto, today: TODAY, weekStartsOn: 1, workoutPlan: SETTINGS.workout_plan })
    const g = GOLDEN.analyticsMonth
    expect(a).toMatchObject({ studyMinutes: g.studyMinutes, studySessionCount: g.studySessionCount, problems: g.problems, sleepAvg: g.sleepAvg })
    expect(a.sum.expense).toBe(g.expense)
    expect(a.jobs).toMatchObject({ applied: g.jobsApplied, interviews: g.jobsInterviews })
    expect(a.done).toHaveLength(g.workouts)
  })
  it('finance, goals and jobs agree with the same data', () => {
    expect(financeMonth({ transactions: TABLES.transactions, budgets: [], defaultBudget: SETTINGS.monthly_budget_paise, month: '2026-11-01', today: TODAY }).summary).toMatchObject({ income: 5000000, expense: 25050, savings: 100000 })
    expect(goalsSummary(TABLES.goals, TABLES.milestones, TABLES.study_sessions, TODAY)).toMatchObject({ active: 2, overdue: 0, avgProgress: 25 })
    const j = jobsOverview(TABLES.job_applications, TABLES.application_history, TABLES.interview_events, TODAY, 1, NOW_MS)
    expect(j).toMatchObject({ thisWeek: 1, active: 2, total: 2 })
    expect(j.upcoming).toHaveLength(1)
  })
  it('is deterministic: same input twice gives identical output', () => {
    const again = dashboardData(toInput(TABLES), { settings: SETTINGS, today: TODAY, nowMs: NOW_MS })
    expect(JSON.stringify(again)).toBe(JSON.stringify(dash))
  })
})
