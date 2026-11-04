import '@testing-library/jest-dom/vitest'
import { pickDate } from './pickers'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderHook, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildAnalytics } from '@/domain/analytics'
import { buildReport } from '@/domain/report'
import { useDateRange } from '@/hooks/useDateRange'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { reportToCsv, reportFilename, DAILY_COLUMNS } from '@/features/reports/reportCsv'
import { LearningSection } from '@/features/analytics/LearningSection'
import { FitnessSection } from '@/features/analytics/FitnessSection'
import { HabitsSection } from '@/features/analytics/HabitsSection'
import { FinanceSection } from '@/features/analytics/FinanceSection'
import { HealthSection } from '@/features/analytics/HealthSection'
import { JobsSection } from '@/features/analytics/JobsSection'
import { ReportSummary } from '@/features/reports/ReportSummary'
import { DailyActivityTable } from '@/features/reports/DailyActivityTable'
import { formatMoney } from '@/lib/money'

vi.mock('recharts', async (orig) => {
  const R = await orig()
  return { ...R, ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div> } // jsdom has no layout
})

const TODAY = '2026-11-02' // Monday
const empty = {
  study_sessions: [],
  goals: [],
  milestones: [],
  job_applications: [],
  application_history: [],
  interview_events: [],
  workouts: [],
  health_logs: [],
  transactions: [],
  habits: [],
  habit_logs: [],
  tasks: [],
  focus_sessions: [],
}
const ctx = { from: '2026-10-26', to: '2026-11-01', today: TODAY, weekStartsOn: 1, plan: {}, tz: 'Asia/Kolkata' }
const money = (p) => formatMoney(p, 'INR')

describe('buildAnalytics', () => {
  it('an empty account gives empty results, never invented numbers', () => {
    const a = buildAnalytics(empty, ctx)
    expect(a.learning).toMatchObject({ minutes: 0, sessionCount: 0, problems: 0, goals: [] })
    expect(a.jobs.funnel.conversion).toBeNull()
    expect(a.jobs.salary).toEqual([])
    expect(a.fitness).toMatchObject({ workouts: 0, plannedDays: 0, consistency: null, weightChange: null })
    expect(a.health).toMatchObject({ sleepAvg: null, waterAvg: null, stepsAvg: null })
    expect(a.health.sleepSeries.every((d) => d.hours === undefined)).toBe(true)
    expect(a.finance).toMatchObject({ income: 0, expense: 0, savings: 0, savingsRate: null, categories: [] })
    expect(a.habits).toMatchObject({ rate: null, longestStreak: 0, active: 0, ranked: [] })
  })

  it('learning: only COMPLETED sessions inside the range count; goals use real progress (milestones / manual / study)', () => {
    const data = {
      ...empty,
      study_sessions: [
        { id: '1', session_date: '2026-10-28', status: 'completed', duration_seconds: 5400, problems_solved: 3, goal_id: 'g1' },
        { id: '2', session_date: '2026-10-28', status: 'running', duration_seconds: null },
        { id: '3', session_date: '2026-10-01', status: 'completed', duration_seconds: 3600, problems_solved: 9 },
      ],
      goals: [
        { id: 'g1', title: 'React', status: 'active', target_minutes: 180, manual_progress: 0 },
        { id: 'g2', title: 'Ship', status: 'active', target_minutes: 0, manual_progress: 40 },
        { id: 'g3', title: 'Old', status: 'archived', target_minutes: 0, manual_progress: 0 },
        { id: 'g4', title: 'Plan', status: 'active', target_minutes: 0, manual_progress: 0 },
      ],
      milestones: [
        { goal_id: 'g4', done: true },
        { goal_id: 'g4', done: false },
      ],
    }
    const l = buildAnalytics(data, ctx).learning
    expect(l).toMatchObject({ minutes: 90, sessionCount: 1, problems: 3 })
    expect(l.goals.map((x) => [x.goal.id, x.progress.percent])).toEqual([
      ['g1', 50 + 0 * 1],
      ['g2', 40],
      ['g4', 50],
    ]) // archived goal hidden; study 90/180min = 50%
    expect(l.chart.reduce((a, d) => a + d.value, 0)).toBeCloseTo(1.5)
  })

  it('jobs: applications and funnel for the range; package points fall back to the created date', () => {
    const data = {
      ...empty,
      job_applications: [
        {
          id: 'a',
          company: 'Acme',
          status: 'interview',
          applied_date: '2026-10-28',
          salary_paise: 150000000,
          created_at: '2026-10-20T00:00:00Z',
        },
        { id: 'b', company: 'Globex', status: 'applied', applied_date: null, salary_paise: 200000000, created_at: '2026-10-30T00:00:00Z' },
        {
          id: 'c',
          company: 'Old',
          status: 'rejected',
          applied_date: '2026-09-01',
          salary_paise: 100000000,
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    }
    const j = buildAnalytics(data, ctx).jobs
    expect(j.applied).toBe(1)
    expect(j.funnel).toMatchObject({ applied: 1, interviews: 1 })
    expect(j.salary.map((p) => p.company)).toEqual(['Acme', 'Globex'])
    expect(j.salary[0].lpa).toBe(15)
  })

  it('fitness: plan consistency counts planned days up to TODAY only; weight change is last minus first in range', () => {
    const plan = { 1: 'r', 3: 'r', 5: 'r' } // Mon, Wed, Fri
    const data = {
      ...empty,
      workouts: [
        { status: 'completed', workout_date: '2026-10-26', duration_minutes: 60 },
        { status: 'completed', workout_date: '2026-10-28', duration_minutes: 45 },
        { status: 'skipped', workout_date: '2026-10-30' },
      ],
      health_logs: [
        { log_date: '2026-10-27', weight_kg: '81' },
        { log_date: '2026-10-31', weight_kg: '80.2' },
        { log_date: '2026-10-29', weight_kg: null },
      ],
    }
    const f = buildAnalytics(data, { ...ctx, plan }).fitness
    expect(f).toMatchObject({ workouts: 2, plannedDays: 3, hitDays: 2, minutes: 105 })
    expect(f.consistency).toBeCloseTo(2 / 3)
    expect(f.weightChange).toBeCloseTo(-0.8)
    const future = buildAnalytics(data, { ...ctx, from: '2026-10-26', to: '2026-11-08', plan }).fitness
    expect(future.plannedDays).toBe(4) // Mon 26, Wed 28, Fri 30 and Mon 2 Nov — days after today are never counted
  })
  it('fitness: a rest-only plan has no planned days (consistency null, not 0%)', () => {
    expect(buildAnalytics(empty, { ...ctx, plan: { 1: 'rest' } }).fitness).toMatchObject({ plannedDays: 0, consistency: null })
  })

  it('health: averages ignore days without that metric (zero water/steps = not logged)', () => {
    const data = {
      ...empty,
      health_logs: [
        { log_date: '2026-10-27', sleep_minutes: 420, water_ml: 2000, steps: 0 },
        { log_date: '2026-10-28', sleep_minutes: 480, water_ml: 0, steps: 8000 },
        { log_date: '2026-10-29', sleep_minutes: null, water_ml: 1000, steps: 4000 },
      ],
    }
    const h = buildAnalytics(data, ctx).health
    expect(h.sleepAvg).toBe(450)
    expect(h.waterAvg).toBe(1500)
    expect(h.stepsAvg).toBe(6000)
    expect(h.sleepSeries.filter((d) => d.hours != null).map((d) => d.hours)).toEqual([7, 8])
  })

  it('finance: sums by type in range, savings rate only with income, categories sorted by spend', () => {
    const data = {
      ...empty,
      transactions: [
        { type: 'income', amount_paise: 100000, txn_date: '2026-10-27', category: 'Salary' },
        { type: 'expense', amount_paise: 30000, txn_date: '2026-10-28', category: 'Food' },
        { type: 'expense', amount_paise: 50000, txn_date: '2026-10-29', category: 'Bills' },
        { type: 'savings', amount_paise: 20000, txn_date: '2026-10-30', category: 'Goal' },
        { type: 'expense', amount_paise: 999, txn_date: '2026-09-01', category: 'Food' },
      ],
    }
    const f = buildAnalytics(data, ctx).finance
    expect(f).toMatchObject({ income: 100000, expense: 80000, savings: 20000, savingsRate: 20 })
    expect(f.categories.map((c) => c.category)).toEqual(['Bills', 'Food'])
    expect(
      buildAnalytics({ ...empty, transactions: [{ type: 'expense', amount_paise: 5, txn_date: '2026-10-28', category: 'x' }] }, ctx).finance
        .savingsRate,
    ).toBeNull()
  })

  it('habits: overall rate, longest streak across all history, ranking by consistency', () => {
    const h = (id, name) => ({
      id,
      name,
      frequency: 'daily',
      days_of_week: [],
      weekly_target: 3,
      start_date: '2026-10-20',
      archived_at: null,
    })
    const logs = (id, dates) => dates.map((d) => ({ habit_id: id, log_date: d, status: 'done' }))
    const data = {
      ...empty,
      habits: [h('a', 'Read'), h('b', 'Gym'), { ...h('c', 'Old'), archived_at: '2026-10-22T10:00:00Z' }],
      habit_logs: [
        ...logs('a', ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']),
        ...logs('b', ['2026-10-26']),
      ],
    }
    const r = buildAnalytics(data, ctx).habits
    expect(r.active).toBe(2)
    expect(r.ranked[0].habit.name).toBe('Read')
    expect(r.ranked[0].rate).toBe(1)
    expect(r.ranked.map((x) => x.habit.name)).not.toContain('Old') // archived before the range: nothing expected, so not ranked
    expect(r.rate).toBeGreaterThan(0.4)
    expect(r.rate).toBeLessThan(1)
    expect(r.longestStreak).toBeGreaterThanOrEqual(7)
  })
})

describe('archived habits (completion stops at the archive date)', () => {
  const base = { id: 'a', name: 'Run', frequency: 'daily', days_of_week: [], weekly_target: 3, start_date: '2026-10-20', archived_at: null }
  const done = (d) => ({ habit_id: 'a', log_date: d, status: 'done' })
  it('days after archiving are not counted as missed', async () => {
    const { completion } = await import('@/domain/streaks')
    const logs = ['2026-10-26', '2026-10-27', '2026-10-28'].map(done)
    const active = completion(base, logs, '2026-10-26', '2026-11-01', TODAY)
    const archived = completion({ ...base, archived_at: '2026-10-28T09:00:00Z' }, logs, '2026-10-26', '2026-11-01', TODAY)
    expect(active).toMatchObject({ done: 3, expected: 7 })
    expect(archived).toMatchObject({ done: 3, expected: 3, rate: 1 })
  })
  it('history before archiving still counts, and a habit archived before the range has nothing expected', async () => {
    const { completion } = await import('@/domain/streaks')
    expect(completion({ ...base, archived_at: '2026-10-22T09:00:00Z' }, [], '2026-10-20', '2026-10-31', TODAY)).toMatchObject({
      expected: 3,
    }) // 20, 21, 22
    expect(completion({ ...base, archived_at: '2026-10-22T09:00:00Z' }, [], '2026-10-26', '2026-11-01', TODAY)).toEqual({
      done: 0,
      expected: 0,
      rate: null,
    })
  })
  it('weekly habits stop at the archive date too', async () => {
    const { completion } = await import('@/domain/streaks')
    const weekly = { ...base, frequency: 'weekly', start_date: '2026-10-05' }
    const archived = completion({ ...weekly, archived_at: '2026-10-12T09:00:00Z' }, [], '2026-10-05', '2026-11-01', TODAY)
    expect(archived.expected).toBe(6) // two weeks (Oct 5, Oct 12) x 3 per week; later weeks are not expected
  })
})

describe('useDateRange / DateRangePicker', () => {
  it('presets cover the week / month / year around today', () => {
    const { result } = renderHook(() => useDateRange(TODAY, 1, 'week'))
    expect([result.current.from, result.current.to]).toEqual(['2026-11-02', '2026-11-08'])
    act(() => result.current.setPreset('month'))
    expect([result.current.from, result.current.to]).toEqual(['2026-11-01', '2026-11-30'])
    act(() => result.current.setPreset('year'))
    expect([result.current.from, result.current.to]).toEqual(['2026-01-01', '2026-12-31'])
  })
  it('week start preference is honoured', () => {
    expect(renderHook(() => useDateRange('2026-11-04', 0, 'week')).result.current.from).toBe('2026-11-01') // Sunday
  })
  it('custom defaults to the last 30 days and a backwards range is swapped, never empty', () => {
    const { result } = renderHook(() => useDateRange(TODAY, 1, 'custom'))
    expect([result.current.from, result.current.to]).toEqual(['2026-10-04', TODAY])
    act(() => result.current.setCustom({ from: '2026-11-10', to: '2026-11-01' }))
    expect([result.current.from, result.current.to]).toEqual(['2026-11-01', '2026-11-10'])
  })
  it('the picker switches presets, shows date inputs only for Custom, ignores cleared dates', async () => {
    const user = userEvent.setup()
    const Host = () => {
      const r = useDateRange(TODAY, 1, 'month')
      return (
        <>
          <DateRangePicker range={r} labels={{ week: 'This week', month: 'This month', year: 'This year', custom: 'Custom' }} />
          <output data-testid="r">
            {r.from}→{r.to}
          </output>
        </>
      )
    }
    render(<Host />)
    expect(screen.queryByLabelText('From')).toBeNull()
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'This week' }))
    expect(screen.getByTestId('r')).toHaveTextContent('2026-11-02→2026-11-08')
    await user.click(screen.getByRole('tab', { name: 'Custom' }))
    await pickDate(user, screen.getByLabelText('From'), '2026-10-10')
    expect(screen.getByTestId('r')).toHaveTextContent('2026-10-10→2026-11-02')
    await pickDate(user, screen.getByLabelText('From'), '')
    expect(screen.getByTestId('r')).toHaveTextContent('2026-10-10→2026-11-02') // cleared input is ignored
  })
  it('default labels', () => {
    render(<DateRangePicker range={{ preset: 'month', setPreset() {}, custom: { from: '', to: '' }, setCustom() {} }} />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Week', 'Month', 'Year', 'Custom'])
  })
})

describe('report CSV', () => {
  const report = buildReport(
    {
      ...empty,
      tasks: [{ due_date: '2026-10-28', status: 'done', category: 'Personal', title: 't' }],
      study_sessions: [{ session_date: '2026-10-28', status: 'completed', duration_seconds: 3600 }],
    },
    '2026-10-27',
    '2026-10-29',
    {
      today: TODAY,
      settings: { daily_study_target_minutes: 60, water_goal_ml: 0, steps_goal: 0, timezone: 'Asia/Kolkata', workout_plan: {} },
      weekStartsOn: 1,
    },
  )
  it('is a summary table, a blank line, then one row per day', () => {
    const lines = reportToCsv(report, money).split('\r\n')
    expect(lines[0]).toBe('Metric,Value')
    expect(lines).toContain('Study hours,1')
    expect(lines).toContain('')
    const header = lines.indexOf(
      'Date,Daily score,Tasks done,Tasks planned,Study (min),Focus (min),Workout,Habits done,Sleep (h),Spent (paise)',
    )
    expect(header).toBeGreaterThan(0)
    expect(lines.slice(header + 1)).toHaveLength(3)
    expect(lines[header + 2]).toMatch(/^2026-10-28,\d+,1,1,60,/)
  })
  it('names the file after the range and has a column for every daily field', () => {
    expect(reportFilename('2026-10-27', '2026-10-29')).toBe('lifetrack-report-2026-10-27_to_2026-10-29.csv')
    expect(DAILY_COLUMNS).toHaveLength(10)
  })
})

describe('sections', () => {
  const a = buildAnalytics(
    { ...empty, goals: [{ id: 'g', title: 'Ship v1', status: 'active', target_minutes: 0, manual_progress: 40 }] },
    ctx,
  )
  it('learning goals show real progress, not "no target"', () => {
    render(<LearningSection learning={a.learning} />)
    expect(screen.getByText('Ship v1')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.queryByText('no target')).toBeNull()
  })
  it('empty states say so instead of showing zeros as charts', () => {
    render(
      <>
        <HabitsSection habits={a.habits} />
        <FinanceSection finance={a.finance} money={money} />
        <JobsSection jobs={a.jobs} />
        <HealthSection health={a.health} />
        <FitnessSection fitness={a.fitness} />
      </>,
    )
    expect(screen.getByText('No habit activity in this range.')).toBeInTheDocument()
    expect(screen.getAllByText('No expenses in this range.').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('no applications')).toBeInTheDocument()
    expect(screen.getByText('no planned days')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5)
  })
  it('signed weight change and savings rate', () => {
    const f = {
      workouts: 3,
      plannedDays: 3,
      hitDays: 2,
      consistency: 2 / 3,
      minutes: 100,
      weights: [],
      weightChange: 1.25,
      unit: 'day',
      chart: [],
    }
    render(
      <>
        <FitnessSection fitness={f} />
        <FinanceSection
          finance={{
            income: 100,
            expense: 50,
            savings: 25,
            savingsRate: 25,
            unit: 'day',
            chart: [],
            categories: [{ category: 'Food', paise: 50, share: 1 }],
          }}
          money={money}
        />
      </>,
    )
    expect(screen.getByText('+1.3 kg')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByText('25% of income')).toBeInTheDocument()
    expect(screen.getByText(/100%/)).toBeInTheDocument()
  })
  it('report summary prints dashes for missing values and pluralises scored days', () => {
    const s = {
      productivityScore: null,
      scoredDays: 1,
      studyHours: 2,
      focusHours: 1,
      workouts: 0,
      fitnessConsistency: null,
      habitRate: null,
      sleepAvgHours: null,
      expensePaise: 50000,
      incomePaise: 100000,
      goalsActive: 2,
      goalAvgProgress: null,
      applications: 3,
      interviews: 1,
      offers: 0,
    }
    render(<ReportSummary s={s} money={money} />)
    expect(screen.getByText('1 scored day')).toBeInTheDocument()
    expect(screen.getByText('₹500')).toBeInTheDocument()
    expect(screen.getByText('Income ₹1,000')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })
  it('daily table lists the newest day first and handles an empty range', () => {
    const daily = [
      {
        date: '2026-10-27',
        score: 40,
        tasksDone: 1,
        tasksPlanned: 2,
        studyMinutes: 30,
        focusMinutes: 0,
        workout: true,
        habitsDone: 1,
        sleepHours: null,
        spentPaise: 12000,
      },
      {
        date: '2026-10-28',
        score: null,
        tasksDone: 0,
        tasksPlanned: 0,
        studyMinutes: 0,
        focusMinutes: 0,
        workout: false,
        habitsDone: 0,
        sleepHours: 7.5,
        spentPaise: 0,
      },
    ]
    const { rerender } = render(<DailyActivityTable daily={daily} money={money} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Wed, 28 Oct')
    expect(rows[1]).toHaveTextContent('Tue, 27 Oct')
    expect(rows[1]).toHaveTextContent('1/2')
    expect(rows[1]).toHaveTextContent('✓')
    expect(rows[0]).toHaveTextContent('7.5')
    rerender(<DailyActivityTable daily={[]} money={money} />)
    expect(screen.getByText('No days in this range yet.')).toBeInTheDocument()
  })
})
