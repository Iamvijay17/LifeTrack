import { describe, it, expect } from 'vitest'
import { greetingFor, todayHeadlines, weekScoreSeries, dashboardGoals, recentActivity } from '@/domain/dashboard'
import { gymStatus } from '@/domain/fitness'

const T = '2026-03-11' // a Wednesday
const WEEK = '2026-03-09'
const task = (o) => ({ id: o.title, status: 'pending', priority: 'medium', created_at: '2026-03-01T00:00:00Z', due_date: T, ...o })

describe('greetingFor', () => {
  it.each([
    [0, 'Still up'],
    [4, 'Still up'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [21, 'Good evening'],
    [22, 'Good night'],
    [23, 'Good night'],
  ])('hour %i → %s', (h, text) => expect(greetingFor(h)).toBe(text))
})

describe('gymStatus', () => {
  it('prefers a completed workout over everything', () => {
    expect(gymStatus([{ status: 'skipped' }, { status: 'completed' }], 'rest')).toBe('Done')
  })
  it('rest day when logged or planned', () => {
    expect(gymStatus([{ status: 'rest' }], 'push')).toBe('Rest day')
    expect(gymStatus([], 'rest')).toBe('Rest day')
  })
  it('skipped, planned, not planned', () => {
    expect(gymStatus([{ status: 'skipped' }], 'push')).toBe('Skipped')
    expect(gymStatus([], 'push')).toBe('Planned')
    expect(gymStatus([], undefined)).toBe('Not planned')
  })
})

describe('todayHeadlines', () => {
  const base = {
    tasks: [],
    sessions: [],
    healthLogs: [],
    transactions: [],
    applications: [],
    workouts: [],
    habitStats: [],
    plan: {},
    today: T,
    weekStart: WEEK,
  }
  it('counts only today for tasks, spending, study and workouts', () => {
    const h = todayHeadlines({
      ...base,
      tasks: [
        task({ title: 'a' }),
        task({ title: 'b', status: 'done' }),
        task({ title: 'c', due_date: '2026-03-10' }),
        task({ title: 'd', priority: 'high' }),
        task({ title: 'e' }),
        task({ title: 'f' }),
      ],
      sessions: [
        { session_date: T, status: 'completed', duration_seconds: 1800 },
        { session_date: '2026-03-10', status: 'completed', duration_seconds: 3600 },
        { session_date: T, status: 'running', duration_seconds: 0 },
      ],
      transactions: [
        { type: 'expense', txn_date: T, amount_paise: 5000 },
        { type: 'expense', txn_date: T, amount_paise: 2500 },
        { type: 'income', txn_date: T, amount_paise: 99999 },
        { type: 'expense', txn_date: '2026-03-10', amount_paise: 7777 },
      ],
      workouts: [{ workout_date: T, status: 'completed', name: 'Push' }],
      healthLogs: [{ log_date: T, sleep_hours: 7 }],
    })
    expect(h.priorities).toHaveLength(3)
    expect(h.priorities[0].title).toBe('d')
    expect(h.openTasks).toBe(4)
    expect(h.doneTasks).toBe(1)
    expect(h.hasTasksToday).toBe(true)
    expect(h.studyMinutes).toBe(30)
    expect(h.studyRunning).toBe(true)
    expect(h.spentToday).toBe(7500)
    expect(h.gym).toBe('Done')
    expect(h.workoutName).toBe('Push')
    expect(h.health.sleep_hours).toBe(7)
  })
  it('habits: only due-or-logged, non-archived habits count', () => {
    const s = (o) => ({ habit: { archived_at: null }, due: false, today: null, ...o })
    const h = todayHeadlines({
      ...base,
      habitStats: [
        s({ due: true, today: { status: 'done' } }),
        s({ due: true }),
        s({ due: true, today: { status: 'missed' } }),
        s({ today: { status: 'done' } }),
        s({}),
        s({ due: true, habit: { archived_at: '2026-01-01T00:00:00Z' } }),
      ],
    })
    expect(h.habitsDue).toBe(4)
    expect(h.habitsDone).toBe(2)
  })
  it('applications this week and empty-day defaults', () => {
    const h = todayHeadlines({
      ...base,
      applications: [{ applied_date: '2026-03-10' }, { applied_date: '2026-03-01' }, { applied_date: null }],
    })
    expect(h.appliedThisWeek).toBe(1)
    expect(h.hasTasksToday).toBe(false)
    expect(h.gym).toBe('Not planned')
    expect(h.workoutName).toBeUndefined()
  })
})

describe('weekScoreSeries', () => {
  it('7 days Mon→Sun, future days are null and are never scored', () => {
    const asked = []
    const out = weekScoreSeries(
      (d) => {
        asked.push(d)
        return { score: 50 }
      },
      WEEK,
      T,
    )
    expect(out.map((x) => x.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(out.map((x) => x.score)).toEqual([50, 50, 50, null, null, null, null])
    expect(asked).toEqual(['2026-03-09', '2026-03-10', '2026-03-11'])
  })
})

describe('dashboardGoals', () => {
  const g = (id, due, status = 'active') => ({ id, title: id, status, due_date: due, manual_progress: 10 })
  it('active only, soonest first, no-date last, limited', () => {
    const out = dashboardGoals(
      [g('c', null), g('b', '2026-05-01'), g('x', '2026-01-01', 'completed'), g('a', '2026-04-01'), g('d', '2026-06-01')],
      [],
      [],
      3,
    )
    expect(out.map((r) => r.goal.id)).toEqual(['a', 'b', 'd'])
  })
  it('defaults to 4 and carries real progress', () => {
    const goals = ['a', 'b', 'c', 'd', 'e'].map((id, i) => g(id, `2026-0${i + 1}-01`))
    const ms = [
      { goal_id: 'a', done: true, position: 0, created_at: '1' },
      { goal_id: 'a', done: false, position: 1, created_at: '2' },
    ]
    const out = dashboardGoals(goals, ms, [])
    expect(out).toHaveLength(4)
    expect(out[0].progress.percent).toBe(50)
  })
})

describe('recentActivity', () => {
  const data = {
    tasks: [
      { title: 'T1', status: 'done', completed_at: '2026-03-11T09:00:00Z' },
      { title: 'T2', status: 'done', completed_at: null },
      { title: 'T3', status: 'pending', completed_at: '2026-03-11T10:00:00Z' },
    ],
    sessions: [
      { status: 'completed', ended_at: '2026-03-11T08:00:00Z', duration_seconds: 3600, problems_solved: 3 },
      { status: 'running', ended_at: '2026-03-11T08:30:00Z', duration_seconds: 0 },
    ],
    workouts: [
      { status: 'completed', created_at: '2026-03-11T07:00:00Z', name: 'Push' },
      { status: 'skipped', created_at: '2026-03-11T07:30:00Z', name: 'Legs' },
    ],
    transactions: [
      { type: 'expense', created_at: '2026-03-11T06:00:00Z', amount_paise: 10000, category: 'Food' },
      { type: 'income', created_at: '2026-03-11T05:00:00Z', amount_paise: 20000, category: 'Salary' },
      { type: 'savings', created_at: '2026-03-11T04:00:00Z', amount_paise: 30000, category: 'SIP' },
    ],
    history: [
      { application_id: 'a1', changed_at: '2026-03-11T11:00:00Z', from_status: 'Applied', to_status: 'Interview' },
      { application_id: 'a1', changed_at: '2026-03-11T03:00:00Z', from_status: null, to_status: 'Applied' },
      { application_id: 'gone', changed_at: '2026-03-11T12:00:00Z', from_status: null, to_status: 'Applied' },
    ],
    applications: [{ id: 'a1', company: 'Acme' }],
    habitLogs: [
      { habit_id: 'h1', status: 'done', updated_at: '2026-03-11T02:00:00Z', created_at: '2026-03-10T00:00:00Z' },
      { habit_id: 'h1', status: 'missed', updated_at: '2026-03-11T13:00:00Z' },
      { habit_id: 'zz', status: 'done', updated_at: '2026-03-11T14:00:00Z' },
    ],
    habits: [{ id: 'h1', name: 'Read' }],
    currency: 'INR',
  }
  it('builds one item per real event with the right kind and text', () => {
    const out = recentActivity(data, 50)
    expect(out.map((x) => x.kind).sort()).toEqual(['habit', 'job', 'job', 'money', 'money', 'money', 'study', 'task', 'workout'])
    expect(out.find((x) => x.kind === 'task').text).toBe('Completed “T1”')
    expect(out.find((x) => x.kind === 'study').text).toContain('3 problems')
    expect(out.find((x) => x.kind === 'workout').text).toBe('Workout: Push')
    expect(out.filter((x) => x.kind === 'job').map((x) => x.text)).toEqual(['Acme: Applied → Interview', 'Acme: added as Applied'])
    expect(out.find((x) => x.kind === 'habit').text).toBe('Checked in: Read')
    const money = out.filter((x) => x.kind === 'money').map((x) => x.text)
    expect(money[0]).toMatch(/^Spent .*Food$/)
    expect(money[1]).toMatch(/^Income .*Salary$/)
    expect(money[2]).toMatch(/^Saved .*SIP$/)
  })
  it('newest first and limited', () => {
    const out = recentActivity(data, 3)
    expect(out.map((x) => x.at)).toEqual(['2026-03-11T11:00:00Z', '2026-03-11T09:00:00Z', '2026-03-11T08:00:00Z'])
  })
  it('study without problems omits the suffix', () => {
    const out = recentActivity({ ...data, tasks: [], sessions: [{ status: 'completed', ended_at: 'x', duration_seconds: 600 }] }, 50)
    expect(out.find((x) => x.kind === 'study').text).not.toContain('problems')
  })
  it('falls back to created_at for habit logs without updated_at', () => {
    const out = recentActivity({ ...data, habitLogs: [{ habit_id: 'h1', status: 'done', created_at: '2026-03-11T15:00:00Z' }] }, 50)
    expect(out[0]).toMatchObject({ kind: 'habit', at: '2026-03-11T15:00:00Z' })
  })
})
