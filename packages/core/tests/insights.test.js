import { describe, expect, it } from 'vitest'
import {
  buildInsightsReport,
  cleanInsightsData,
  compareValue,
  comparisonRanges,
  firstDates,
  monthlyHistory,
  periodFor,
  periodMetrics,
  shiftAnchor,
} from '../src/insights'

const TODAY = '2026-11-18' // Wednesday
const study = (id, date, min, extra = {}) => ({
  id,
  session_date: date,
  status: 'completed',
  duration_seconds: min * 60,
  problems_solved: 0,
  ...extra,
})
const tx = (id, date, type, amount, category = 'Food') => ({ id, txn_date: date, type, amount_paise: amount, category })
const workout = (id, date, min, extra = {}) => ({
  id,
  workout_date: date,
  status: 'completed',
  duration_minutes: min,
  kind: 'strength',
  ...extra,
})
const base = { start_date: '2026-09-01', frequency: 'daily', days_of_week: [], weekly_target: 3, archived_at: null }
const raw = (over = {}) => ({
  habits: [],
  habit_logs: [],
  habit_pauses: [],
  study_sessions: [],
  focus_sessions: [],
  learning_topics: [],
  goals: [],
  milestones: [],
  job_applications: [],
  application_history: [],
  interview_events: [],
  workouts: [],
  exercise_logs: [],
  health_logs: [],
  transactions: [],
  tasks: [],
  ...over,
})
const opts = (kind, range) => ({ kind, range, today: TODAY, weekStartsOn: 1, plan: {}, tz: 'Asia/Kolkata' })

describe('periods', () => {
  it('week, month, quarter and year contain the anchor', () => {
    expect(periodFor('week', '2026-11-18', 1)).toEqual({ from: '2026-11-16', to: '2026-11-22' })
    expect(periodFor('week', '2026-11-18', 0)).toEqual({ from: '2026-11-15', to: '2026-11-21' })
    expect(periodFor('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodFor('quarter', '2026-11-18')).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(periodFor('quarter', '2026-03-31')).toEqual({ from: '2026-01-01', to: '2026-03-31' })
    expect(periodFor('year', '2026-06-01')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(() => periodFor('decade', TODAY)).toThrow()
  })
  it('shifts across year boundaries', () => {
    expect(periodFor('quarter', shiftAnchor('quarter', '2026-01-15', -1))).toEqual({ from: '2025-10-01', to: '2025-12-31' })
    expect(periodFor('month', shiftAnchor('month', '2026-01-31', -1))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(shiftAnchor('week', '2026-11-16', -1)).toBe('2026-11-09')
  })
  it('compares a month in progress with the same number of days of the month before', () => {
    const c = comparisonRanges(periodFor('month', TODAY), 'month', TODAY)
    expect(c.current).toMatchObject({ from: '2026-11-01', to: '2026-11-30', upto: TODAY, days: 18 })
    expect(c.previous).toMatchObject({ from: '2026-10-01', to: '2026-10-31', upto: '2026-10-18', days: 18 })
    expect(c.partial).toBe(true)
  })
  it('a finished short month is compared with the whole of a longer one, capped at its own length', () => {
    const c = comparisonRanges({ from: '2026-03-01', to: '2026-03-31' }, 'month', TODAY)
    expect(c.previous).toMatchObject({ from: '2026-02-01', upto: '2026-02-28', days: 28 })
    expect(c.partial).toBe(false)
  })
  it('a custom range is compared with the range of equal length just before it', () => {
    const c = comparisonRanges({ from: '2026-11-10', to: '2026-11-14' }, 'custom', TODAY)
    expect(c.previous).toMatchObject({ from: '2026-11-05', to: '2026-11-09', days: 5 })
  })
  it('swapped and future ranges are safe', () => {
    expect(comparisonRanges({ from: '2026-11-14', to: '2026-11-10' }, 'custom', TODAY).current.from).toBe('2026-11-10')
    const f = comparisonRanges({ from: '2027-01-01', to: '2027-01-31' }, 'month', TODAY)
    expect(f.future).toBe(true)
    expect(f.current.days).toBe(0)
  })
})

describe('cleanInsightsData', () => {
  it('drops duplicates, orphans, future-dated and unfinished records, and says so', () => {
    const { data, notes } = cleanInsightsData(
      raw({
        habits: [{ id: 'h1', ...base }],
        habit_logs: [
          { id: 'l1', habit_id: 'h1', log_date: '2026-11-10', status: 'done', updated_at: '2026-11-10T01:00:00Z' },
          { id: 'l2', habit_id: 'h1', log_date: '2026-11-10', status: 'skipped', updated_at: '2026-11-10T02:00:00Z' }, // same habit and day
          { id: 'l3', habit_id: 'gone', log_date: '2026-11-10', status: 'done' }, // habit deleted
          { id: 'l4', habit_id: 'h1', log_date: '2026-11-30', status: 'done' }, // future
        ],
        study_sessions: [
          study('s1', '2026-11-10', 30),
          study('s1', '2026-11-10', 30),
          { id: 's2', session_date: '2026-11-10', status: 'running', duration_seconds: null },
          { id: 's3', session_date: '2026-11-11', status: 'discarded', duration_seconds: 600 },
        ],
        workouts: [workout('w1', '2026-11-10', 40)],
        exercise_logs: [
          { id: 'e1', workout_id: 'w1', exercise_name: 'Squat', reps: 5, weight_kg: 100 },
          { id: 'e2', workout_id: 'deleted', exercise_name: 'Squat', reps: 5, weight_kg: 100 },
        ],
        health_logs: [
          { id: 'a', log_date: '2026-11-10', sleep_minutes: 400, updated_at: '1' },
          { id: 'b', log_date: '2026-11-10', sleep_minutes: 420, updated_at: '2' },
        ],
      }),
      TODAY,
    )
    expect(data.habit_logs).toHaveLength(1)
    expect(data.habit_logs[0].status).toBe('skipped') // newest wins
    expect(data.study_sessions.map((s) => s.id)).toEqual(['s1'])
    expect(data.exercise_logs).toHaveLength(1)
    expect(data.health_logs).toEqual([expect.objectContaining({ sleep_minutes: 420 })])
    expect(notes).toMatchObject({ duplicates: 3, orphans: 2, future: 1, unfinished: 2 })
  })
  it('tolerates missing tables', () => {
    expect(cleanInsightsData({}, TODAY).data.habits).toEqual([])
  })
})

describe('availability: zero is not the same as unavailable', () => {
  const d = raw({ study_sessions: [study('s1', '2026-11-05', 60)], transactions: [tx('t1', '2026-11-05', 'expense', 50000)] })
  it('a period before the first record is null, one after it with nothing in it is a real zero', () => {
    const { data } = cleanInsightsData(d, TODAY)
    const before = periodMetrics(data, { from: '2026-10-01', to: '2026-10-31' }, { today: TODAY, tz: 'Asia/Kolkata' })
    expect(before.learning).toBeNull()
    expect(before.finance).toBeNull()
    expect(before.available.learning).toBe(false)
    const after = periodMetrics(data, { from: '2026-11-10', to: '2026-11-16' }, { today: TODAY, tz: 'Asia/Kolkata' })
    expect(after.learning.studyMinutes).toBe(0)
    expect(after.finance.expense).toBe(0)
    expect(after.finance.noSpendDays).toBe(7)
    expect(after.fitness).toBeNull() // never logged a workout
  })
  it('rates are null with no denominator', () => {
    const { data } = cleanInsightsData(d, TODAY)
    const m = periodMetrics(data, { from: '2026-11-10', to: '2026-11-16' }, { today: TODAY, tz: 'Asia/Kolkata' })
    expect(m.finance.savingsRate).toBeNull() // no income
    expect(m.learning.avgSessionMinutes).toBeNull()
    expect(m.learning.focusCompletion).toBeNull()
  })
  it('an entirely empty account reports no data anywhere', () => {
    const r = buildInsightsReport(raw(), opts('month', periodFor('month', TODAY)))
    expect(r.hasAnyData).toBe(false)
    expect(r.current.learning).toBeNull()
    expect(r.comparison.every((c) => c.verdict === 'unavailable')).toBe(true)
  })
  it('first dates', () => {
    const { data } = cleanInsightsData(d, TODAY)
    expect(firstDates(data, 'Asia/Kolkata')).toMatchObject({ learning: '2026-11-05', finance: '2026-11-05', fitness: null })
  })
})

describe('learning and career', () => {
  const { data } = cleanInsightsData(
    raw({
      learning_topics: [{ id: 'tp', name: 'DSA' }],
      study_sessions: [
        study('a', '2026-11-02', 60, { topic_id: 'tp', problems_solved: 3 }),
        study('b', '2026-11-02', 30, { topic_id: 'tp', problems_solved: 2 }),
        study('c', '2026-11-04', 30),
      ],
      focus_sessions: [
        { id: 'f1', session_date: '2026-11-02', kind: 'focus', actual_seconds: 1500, completed: true },
        { id: 'f2', session_date: '2026-11-03', kind: 'focus', actual_seconds: 600, completed: false },
        { id: 'f3', session_date: '2026-11-03', kind: 'short_break', actual_seconds: 300, completed: true },
      ],
      job_applications: [
        { id: 'j1', applied_date: '2026-11-03', status: 'applied' },
        { id: 'j2', applied_date: '2026-11-04', status: 'applied' },
      ],
      application_history: [],
      interview_events: [{ id: 'i1', application_id: 'j1' }],
      goals: [{ id: 'g1', title: 'Ship', status: 'active', target_minutes: 600, topic_id: 'tp' }],
    }),
    TODAY,
  )
  const m = periodMetrics(data, { from: '2026-11-01', to: '2026-11-07' }, { today: TODAY, tz: 'Asia/Kolkata' })
  it('counts only completed study, focus (never breaks), problems and active days', () => {
    expect(m.learning).toMatchObject({
      studyMinutes: 120,
      sessions: 3,
      avgSessionMinutes: 40,
      problems: 5,
      focusMinutes: 35,
      focusSessions: 2,
      focusCompletion: 0.5,
      activeDays: 3,
    })
    expect(m.learning.consistency).toBeCloseTo(3 / 7)
    expect(m.learning.topics).toEqual([
      { label: 'DSA', minutes: 90 },
      { label: 'General study', minutes: 30 },
    ])
  })
  it('career funnel and goals', () => {
    expect(m.career).toMatchObject({ applications: 2, interviews: 1, interviewRate: 0.5, goalsActive: 1 })
    expect(m.career.goals[0].percent).toBe(15) // 90 of 600 minutes
  })
})

describe('focus timer', () => {
  it('never used: unavailable, not 0 minutes', () => {
    const { data } = cleanInsightsData(raw({ study_sessions: [study('a', '2026-11-02', 30)] }), TODAY)
    const m = periodMetrics(data, { from: '2026-11-01', to: '2026-11-07' }, { today: TODAY, tz: 'Asia/Kolkata' })
    expect(m.learning.studyMinutes).toBe(30)
    expect(m.learning.focusMinutes).toBeNull()
    expect(m.learning.focusSessions).toBeNull()
  })
})

describe('fitness', () => {
  const plan = { 1: 'push', 3: 'pull', 5: 'legs' } // Mon Wed Fri
  const { data } = cleanInsightsData(
    raw({
      workouts: [
        workout('w1', '2026-11-02', 50), // Mon
        workout('w2', '2026-11-04', 40, { cardio_distance_km: '5.5' }), // Wed
        workout('w3', '2026-11-06', 0, { status: 'skipped' }),
        workout('w4', '2026-11-07', 30), // Sat (unplanned)
      ],
      exercise_logs: [
        { id: 'e1', workout_id: 'w1', exercise_name: 'Bench', reps: 10, weight_kg: '60' },
        { id: 'e2', workout_id: 'w1', exercise_name: 'Bench', reps: 8, weight_kg: '65' },
        { id: 'e3', workout_id: 'w3', exercise_name: 'Squat', reps: 5, weight_kg: '100' }, // skipped workout: not counted
      ],
      health_logs: [
        { id: 'h1', log_date: '2026-11-02', weight_kg: '80.0', sleep_minutes: 420 },
        { id: 'h2', log_date: '2026-11-06', weight_kg: '79.2', sleep_minutes: 360 },
      ],
    }),
    TODAY,
  )
  const m = periodMetrics(data, { from: '2026-11-02', to: '2026-11-08' }, { today: TODAY, plan, tz: 'Asia/Kolkata' })
  it('counts completed workouts, plan consistency, volume and weight change', () => {
    expect(m.fitness).toMatchObject({
      workouts: 3,
      activeDays: 3,
      minutes: 120,
      skipped: 1,
      plannedDays: 3,
      hitDays: 2,
      sets: 2,
      volumeKg: 1120,
      cardioKm: 5.5,
      weightChangeKg: -0.8,
    })
    expect(m.fitness.consistency).toBeCloseTo(2 / 3)
    expect(m.fitness.topExercises).toEqual([{ name: 'Bench', volume: 1120 }])
    expect(m.health).toMatchObject({ nightsLogged: 2, sleepAvgMinutes: 390 })
  })
  it('without a weekly plan consistency is unavailable, not 0%', () => {
    const none = periodMetrics(data, { from: '2026-11-02', to: '2026-11-08' }, { today: TODAY, plan: {}, tz: 'Asia/Kolkata' })
    expect(none.fitness.consistency).toBeNull()
  })
  it('never counts planned days that have not happened yet', () => {
    const w = periodMetrics(data, { from: '2026-11-16', to: '2026-11-22' }, { today: TODAY, plan, tz: 'Asia/Kolkata' }) // Mon..Sun, today is Wed
    expect(w.fitness.plannedDays).toBe(2) // Mon, Wed
    expect(w.days).toBe(3)
  })
})

describe('finance', () => {
  const { data } = cleanInsightsData(
    raw({
      transactions: [
        tx('1', '2026-11-02', 'income', 5000000, 'Salary'),
        tx('2', '2026-11-03', 'expense', 120000, 'Food'),
        tx('3', '2026-11-03', 'expense', 80000, 'Travel'),
        tx('4', '2026-11-05', 'expense', 300000, 'Food'),
        tx('5', '2026-11-06', 'savings', 1000000, 'Savings'),
      ],
    }),
    TODAY,
  )
  const m = periodMetrics(data, { from: '2026-11-01', to: '2026-11-10' }, { today: TODAY, tz: 'Asia/Kolkata' })
  it('sums by type, with savings rate against income', () => {
    expect(m.finance).toMatchObject({
      income: 5000000,
      expense: 500000,
      savings: 1000000,
      net: 4500000,
      savingsRate: 0.2,
      avgDailySpend: 50000,
      noSpendDays: 8,
      transactions: 5,
    })
    expect(m.finance.categories[0]).toMatchObject({ category: 'Food', paise: 420000 })
    expect(m.finance.biggest).toMatchObject({ paise: 300000, category: 'Food', date: '2026-11-05' })
  })
  it('daily rows add up to the totals', () => {
    expect(m.daily.reduce((a, r) => a + r.expense, 0)).toBe(m.finance.expense)
    expect(m.series.rows.reduce((a, r) => a + r.expense, 0)).toBe(m.finance.expense)
  })
})

describe('habits, routine and time', () => {
  const habits = [{ id: 'h1', name: 'Read', color: '#fff', ...base, start_date: '2026-11-01' }]
  const logs = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-06'].map((d, i) => ({
    id: `l${i}`,
    habit_id: 'h1',
    log_date: d,
    status: 'done',
  }))
  const { data } = cleanInsightsData(
    raw({
      habits,
      habit_logs: logs,
      tasks: [
        { id: 't1', due_date: '2026-11-03', status: 'done', completed_at: '2026-11-03T05:00:00Z' },
        { id: 't2', due_date: '2026-11-04', status: 'done', completed_at: '2026-11-06T05:00:00Z' }, // late
        { id: 't3', due_date: '2026-11-05', status: 'pending' },
        { id: 't4', due_date: '2026-11-05', status: 'cancelled' },
        { id: 't5', due_date: null, status: 'done' },
      ],
      study_sessions: [study('s1', '2026-11-02', 90)],
      workouts: [workout('w1', '2026-11-02', 30)],
    }),
    TODAY,
  )
  const m = periodMetrics(data, { from: '2026-11-01', to: '2026-11-07' }, { today: TODAY, tz: 'Asia/Kolkata' })
  it('habit completion over the days the habit was expected', () => {
    expect(m.habits).toMatchObject({ done: 4, expected: 7, active: 1 })
    expect(m.habits.rate).toBeCloseTo(4 / 7)
    expect(m.habits.perHabit[0]).toMatchObject({ name: 'Read', done: 4, expected: 7 })
    expect(m.habits.byWeekday.find((w) => w.label === 'Mon').done).toBe(1)
  })
  it('tasks: cancelled and undated tasks are not counted, late ones are done but not on time', () => {
    expect(m.tasks).toMatchObject({ planned: 3, done: 2, open: 1, onTimeRate: 0.5 })
    expect(m.tasks.rate).toBeCloseTo(2 / 3)
  })
  it('an open task due today is not yet a miss', () => {
    const { data: d2 } = cleanInsightsData(
      raw({
        tasks: [
          { id: 'a', due_date: TODAY, status: 'pending' },
          { id: 'b', due_date: TODAY, status: 'done' },
        ],
      }),
      TODAY,
    )
    expect(periodMetrics(d2, { from: TODAY, to: TODAY }, { today: TODAY, tz: 'Asia/Kolkata' }).tasks).toMatchObject({
      planned: 1,
      done: 1,
      rate: 1,
    })
  })
  it('time distribution shares add to 1 and match the minutes recorded', () => {
    expect(m.time.totalMinutes).toBe(120)
    expect(m.time.parts.map((p) => p.minutes)).toEqual([90, 0, 30])
    expect(m.time.parts.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1)
    expect(m.time.byWeekday.find((w) => w.label === 'Mon')).toMatchObject({ study: 90, workout: 30, total: 120 })
  })
  it('series uses day buckets for a week and gaps before a module started', () => {
    expect(m.series.unit).toBe('day')
    expect(m.series.rows).toHaveLength(7)
    const early = periodMetrics(data, { from: '2026-10-25', to: '2026-11-07' }, { today: TODAY, tz: 'Asia/Kolkata' })
    expect(early.series.rows[0].studyHours).toBeNull() // 25 Oct predates the first study session
    expect(early.series.rows.find((r) => r.key === '2026-11-02').studyHours).toBe(1.5)
  })
  it('longer ranges bucket by week then month', () => {
    const q = periodMetrics(data, periodFor('quarter', TODAY), { today: TODAY, tz: 'Asia/Kolkata' })
    expect(q.series.unit).toBe('week')
    const y = periodMetrics(data, periodFor('year', TODAY), { today: TODAY, tz: 'Asia/Kolkata' })
    expect(y.series.unit).toBe('month')
    expect(y.series.rows.at(-1).key).toBe('2026-11-01') // no future months
  })
})

describe('comparison', () => {
  it('better / worse depends on the metric; spending going up is worse', () => {
    expect(compareValue(10, 5, 'up', 'count')).toMatchObject({ diff: 5, pct: 1, verdict: 'better' })
    expect(compareValue(3, 5, 'up', 'count').verdict).toBe('worse')
    expect(compareValue(6, 5, 'down', 'money').verdict).toBe('worse')
    expect(compareValue(6, 5, null, 'money').verdict).toBe('changed')
    expect(compareValue(5, 5, 'up', 'count').verdict).toBe('same')
  })
  it('rates compare in percentage points and zero baselines have no percentage', () => {
    expect(compareValue(0.8, 0.6, 'up', 'rate')).toMatchObject({ pct: null, verdict: 'better' })
    expect(compareValue(0.8, 0.6, 'up', 'rate').diff).toBeCloseTo(0.2)
    expect(compareValue(4, 0, 'up', 'count')).toMatchObject({ pct: null, verdict: 'better' })
    expect(compareValue(0, 0, 'up', 'count').verdict).toBe('same')
  })
  it('null on either side is unavailable, never a change from or to zero', () => {
    expect(compareValue(4, null).verdict).toBe('unavailable')
    expect(compareValue(null, 0).verdict).toBe('unavailable')
  })
  it('month over month with equal-length windows', () => {
    const r = buildInsightsReport(
      raw({
        study_sessions: [study('o', '2026-10-05', 60), study('o2', '2026-10-25', 600), study('n', '2026-11-05', 120)],
        transactions: [tx('a', '2026-10-05', 'expense', 1000), tx('b', '2026-11-05', 'expense', 3000)],
      }),
      opts('month', periodFor('month', TODAY)),
    )
    const study_ = r.comparison.find((c) => c.key === 'studyMinutes')
    // 1-18 Oct holds only the 60 minutes; the 25 Oct session is outside the same-length window
    expect(study_).toMatchObject({ cur: 120, prev: 60, verdict: 'better' })
    expect(r.comparison.find((c) => c.key === 'expense')).toMatchObject({ cur: 3000, prev: 1000, verdict: 'worse' })
    expect(r.comparison.find((c) => c.key === 'workouts').verdict).toBe('unavailable')
  })
  it('a month with no earlier month of data compares as unavailable', () => {
    const r = buildInsightsReport(raw({ study_sessions: [study('n', '2026-11-05', 120)] }), opts('month', periodFor('month', TODAY)))
    expect(r.comparison.find((c) => c.key === 'studyMinutes')).toMatchObject({ cur: 120, prev: null, verdict: 'unavailable' })
  })
})

describe('monthly history', () => {
  it('lists the last N months, flags the running one and leaves months before the data null', () => {
    const { data } = cleanInsightsData(raw({ study_sessions: [study('a', '2026-09-10', 60), study('b', '2026-11-10', 30)] }), TODAY)
    const h = monthlyHistory(data, TODAY, 4, { today: TODAY, tz: 'Asia/Kolkata', first: firstDates(data, 'Asia/Kolkata') })
    expect(h.map((x) => x.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(h.map((x) => x.values.studyMinutes)).toEqual([null, 60, 0, 30])
    expect(h.map((x) => x.partial)).toEqual([false, false, false, true])
  })
})
