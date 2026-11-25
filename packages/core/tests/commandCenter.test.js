import { describe, expect, it } from 'vitest'
import {
  COMMAND_KEYS,
  COMMAND_NEEDING_DATA,
  COMMAND_WIDGETS,
  WIDGET_SIZES,
  commandOrder,
  isCustomized,
  layoutOf,
  moveWidget,
  widgetSize,
  withOrder,
  withSize,
  withVisibility,
} from '../src/commandCenter'
import { explainLifeScore, lifeScore, scoreTrend, summarizeScores } from '../src/lifeScore'
import { SCORE_CATEGORIES, dailyScore } from '../src/score'
import {
  financeSnapshot,
  fitnessSnapshot,
  habitsSnapshot,
  jobsSnapshot,
  learningSnapshot,
  sleepSnapshot,
  taskSummary,
  upcomingInterviewCount,
} from '../src/snapshots'
import { recentActivity } from '../src/web/dashboard'

const TODAY = '2026-11-10' // a Tuesday
const task = (o) => ({ id: Math.random().toString(36), title: 't', category: 'Personal', status: 'pending', due_date: TODAY, priority: 'medium', created_at: '2026-11-01T00:00:00Z', ...o })

describe('layout: sizes, order and visibility', () => {
  it('has a default size inside its own allowed sizes for every widget, and unique keys', () => {
    expect(new Set(COMMAND_KEYS).size).toBe(COMMAND_KEYS.length)
    for (const w of COMMAND_WIDGETS) expect(w.sizes).toContain(w.size)
  })
  it('falls back to the default size for nothing saved, an unknown size, or a size the widget is not built for', () => {
    expect(widgetSize({}, 'score')).toBe('sm')
    expect(widgetSize({ sizes: { score: 'lg' } }, 'score')).toBe('lg')
    expect(widgetSize({ sizes: { score: 'huge' } }, 'score')).toBe('sm')
    expect(widgetSize({ sizes: { today: 'sm' } }, 'today')).toBe('lg') // Today is built for medium and up
    expect(widgetSize({ sizes: { stats: 'sm' } }, 'stats')).toBe('full')
  })
  it('withSize ignores sizes a widget cannot take and keeps other widgets sizes', () => {
    const a = withSize({ sizes: { score: 'lg' } }, 'goals', 'md')
    expect(a.sizes).toEqual({ score: 'lg', goals: 'md' })
    expect(withSize(a, 'today', 'sm')).toBe(a)
    expect(withSize(a, 'nope', 'md')).toBe(a)
  })
  it('keeps the saved order, appends widgets the user has not placed, and drops unknown keys', () => {
    const order = commandOrder({ order: ['quick', 'gone', 'today', 'quick'] })
    expect(order.slice(0, 2)).toEqual(['quick', 'today'])
    expect(order).toHaveLength(COMMAND_KEYS.length)
    expect(new Set(order).size).toBe(order.length)
  })
  it('withOrder drops keys that are not widgets (so mobile-only or old keys cannot pile up)', () => {
    expect(withOrder({}, ['score', 'zzz']).order).toEqual(['score'])
  })
  it('moveWidget moves one step and stops at either end', () => {
    expect(moveWidget(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveWidget(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    const same = ['a', 'b']
    expect(moveWidget(same, 'a', -1)).toBe(same)
    expect(moveWidget(same, 'b', 1)).toBe(same)
    expect(moveWidget(same, 'z', 1)).toBe(same)
  })
  it('layoutOf hides widgets, honours sizes and never leaves a hole in a row', () => {
    const rows = (items) => {
      let sum = 0
      for (const { span } of items) {
        sum += span
        if (sum > 12) return false
        if (sum === 12) sum = 0
      }
      return sum === 0
    }
    expect(rows(layoutOf({}))).toBe(true)
    const prefs = withVisibility(withSize({ sizes: {} }, 'goals', 'full'), 'activity', false)
    const out = layoutOf(prefs)
    expect(out.find((x) => x.key === 'activity')).toBeUndefined()
    expect(out.find((x) => x.key === 'goals')).toMatchObject({ size: 'full', span: 12 })
    expect(rows(out)).toBe(true)
  })
  it('a lone small widget is stretched to the full row, but keeps the size the user picked', () => {
    expect(layoutOf({}, (k) => k === 'goals')).toEqual([{ key: 'goals', size: 'sm', span: 12 }])
  })
  it('a brand-new account is not shown the module widgets (their empty states) above the getting-started guide', () => {
    for (const key of ['learning', 'jobs', 'fitness', 'sleep', 'habits', 'today', 'score', 'weekly']) expect(COMMAND_NEEDING_DATA).toContain(key)
    for (const key of COMMAND_NEEDING_DATA) expect(COMMAND_KEYS).toContain(key)
    expect(COMMAND_NEEDING_DATA).not.toContain('getting_started')
  })
  it('layoutOf lets the caller hide widgets that have nothing to show yet', () => {
    expect(layoutOf({}, (k) => k !== 'today').map((x) => x.key)).not.toContain('today')
  })
  it('sizes map to the 4 / 6 / 8 / 12 column spans', () => {
    expect(WIDGET_SIZES.map((s) => s.span)).toEqual([4, 6, 8, 12])
  })
  it('isCustomized is false for the default and for an order that matches it, true once anything changed', () => {
    expect(isCustomized({})).toBe(false)
    expect(isCustomized(undefined)).toBe(false)
    expect(isCustomized({ order: COMMAND_KEYS.slice(0, 3) })).toBe(false)
    expect(isCustomized({ order: ['quick'] })).toBe(true)
    expect(isCustomized({ sizes: {} })).toBe(false)
    expect(isCustomized({ sizes: { goals: 'md' } })).toBe(true)
    expect(isCustomized({ activity: false })).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------- Life Score
describe('Life Score', () => {
  const settings = { daily_study_target_minutes: 60, score_weights: { learning: 50, career: 0, fitness: 0, habits: 50, health: 0 }, week_starts_on: 1 }
  const study = (date, minutes) => ({ id: date, session_date: date, status: 'completed', duration_seconds: minutes * 60, problems_solved: 0, started_at: `${date}T05:00:00Z`, ended_at: `${date}T06:00:00Z` })
  const habit = { id: 'h1', name: 'Read', frequency: 'daily', start_date: '2026-11-08', archived_at: null, days_of_week: [] }
  const hlog = (date) => ({ id: date, habit_id: 'h1', log_date: date, status: 'done' })
  const base = {
    tasks: [],
    habits: [habit],
    habitLogs: [hlog('2026-11-10'), hlog('2026-11-08')],
    sessions: [study('2026-11-10', 60), study('2026-11-09', 30), study('2026-11-08', 60)],
    workouts: [],
    applications: [],
    interviews: [],
    settings,
    tz: 'Asia/Kolkata',
  }
  const scoreFor = (date) => dailyScore({ ...base, date, health: null })

  it('summarizeScores: category points add up to the score, and unscored days are left out, not counted as zero', () => {
    const days = ['2026-11-10', '2026-11-09', '2026-11-08'].map(scoreFor)
    const s = summarizeScores(days)
    expect(s.scoredDays).toBe(3)
    expect(Math.round(s.categories.reduce((a, c) => a + c.points, 0))).toBe(s.score)
    // 11-10: learning 100% habits 100% -> 100. 11-09: learning 50%, habit missed -> 25. 11-08: 100 -> mean 75
    expect(s.score).toBe(75)
    const none = summarizeScores([{ score: null, categories: [] }, ...days])
    expect(none.score).toBe(75)
    expect(none.days).toBe(4)
    expect(none.scoredDays).toBe(3)
  })
  it('a category the user does not track never lowers the score', () => {
    const s = summarizeScores([scoreFor('2026-11-10')])
    const career = s.categories.find((c) => c.key === 'career')
    expect(career).toMatchObject({ applicableDays: 0, fraction: null, points: 0 })
    expect(s.score).toBe(100)
  })
  it('returns null when nothing was planned or recorded', () => {
    const empty = summarizeScores([{ score: null, categories: [] }])
    expect(empty.score).toBeNull()
    expect(explainLifeScore(empty)).toMatch(/no Life Score yet/)
    expect(summarizeScores([]).score).toBeNull()
  })
  it('lifeScore compares the period with the one before it', () => {
    const r = lifeScore(scoreFor, TODAY, 3)
    expect(r.score).toBe(75)
    expect(r.previous).toBeNull() // nothing at all in the three days before: no comparison rather than a fake drop
    expect(r.change).toBeNull()
    const fake = (score) => ({
      score,
      categories: SCORE_CATEGORIES.map((c) => ({ key: c.key, applicable: c.key === 'learning', fraction: score / 100, effectiveWeight: c.key === 'learning' ? 100 : 0 })),
    })
    const r2 = lifeScore((d) => fake(d >= '2026-11-08' ? 80 : 60), TODAY, 3)
    expect(r2.score).toBe(80)
    expect(r2.previous).toBe(60)
    expect(r2.change).toBe(20)
  })
  it('explainLifeScore names each category and says which ones did not count', () => {
    const text = explainLifeScore(summarizeScores([scoreFor('2026-11-10')]))
    expect(text).toMatch(/Learning 50\.0/)
    expect(text).toMatch(/= 100/)
    expect(text).toMatch(/Career.*not lower the score/)
  })

  describe('scoreTrend', () => {
    it('daily: 14 buckets ending today, a day with no score is null (a gap) not zero', () => {
      const t = scoreTrend(scoreFor, TODAY, 'daily')
      expect(t).toHaveLength(14)
      expect(t.at(-1)).toMatchObject({ from: TODAY, to: TODAY, score: 100, partial: false })
      expect(t[0].score).toBeNull()
    })
    it('weekly: the current week only covers the days so far and is flagged partial', () => {
      const t = scoreTrend(scoreFor, TODAY, 'weekly', 1)
      expect(t).toHaveLength(8)
      const cur = t.at(-1)
      expect(cur.from).toBe('2026-11-09') // Monday
      expect(cur.to).toBe(TODAY)
      expect(cur.partial).toBe(true)
      expect(cur.days).toBe(2)
      expect(t.at(-2).to).toBe('2026-11-08')
      expect(t.at(-2).partial).toBe(false)
      expect(t.at(-2)).toMatchObject({ scoredDays: 1, score: 100 }) // only Sunday 11-08 had anything
    })
    it('weekly respects a Sunday week start', () => {
      expect(scoreTrend(scoreFor, TODAY, 'weekly', 0).at(-1).from).toBe('2026-11-08')
    })
    it('monthly: 6 months, current one partial, month lengths respected', () => {
      const t = scoreTrend(scoreFor, TODAY, 'monthly')
      expect(t.map((b) => b.from)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01'])
      expect(t[3].to).toBe('2026-09-30')
      expect(t[5]).toMatchObject({ to: TODAY, partial: true, scoredDays: 3 })
      expect(t[5].score).toBe(75)
    })
    it('an unknown range falls back to daily', () => {
      expect(scoreTrend(scoreFor, TODAY, 'nope')).toHaveLength(14)
    })
  })
})

// --------------------------------------------------------------------------------------------------- snapshots
describe('taskSummary', () => {
  it('counts today, pending and every overdue open task, ignoring skipped / cancelled', () => {
    const tasks = [
      task({ status: 'done' }),
      task({ status: 'pending' }),
      task({ status: 'in_progress' }),
      task({ status: 'skipped' }),
      task({ status: 'cancelled' }),
      task({ due_date: '2026-11-01', status: 'pending' }),
      task({ due_date: '2026-11-02', status: 'done' }),
      task({ due_date: '2026-11-12' }),
      task({ due_date: null }),
    ]
    expect(taskSummary(tasks, TODAY)).toEqual({ total: 3, done: 1, pending: 2, overdue: 1 })
  })
  it('an empty list is all zeros', () => {
    expect(taskSummary([], TODAY)).toEqual({ total: 0, done: 0, pending: 0, overdue: 0 })
  })
})

describe('learningSnapshot', () => {
  const s = (o) => ({ id: Math.random().toString(36), status: 'completed', duration_seconds: 3600, session_date: TODAY, goal_id: null, topic_id: null, ...o })
  it('totals hours, today against the target, active study goals and recently studied topics', () => {
    const goals = [
      { id: 'g1', title: 'AWS course', status: 'active', category: 'Learning', target_minutes: 600, topic_id: null, due_date: '2026-12-01' },
      { id: 'g2', title: 'Finished', status: 'completed', category: 'Learning', target_minutes: 10 },
      { id: 'g3', title: 'Run 5k', status: 'active', category: 'Fitness', target_minutes: 0 },
    ]
    const topics = [
      { id: 't1', name: 'React', group_name: 'Frontend', archived: false },
      { id: 't2', name: 'Go', group_name: 'Backend', archived: false },
      { id: 't3', name: 'Old', group_name: 'Backend', archived: true },
    ]
    const sessions = [
      s({ goal_id: 'g1', topic_id: 't1', duration_seconds: 1800 }),
      s({ session_date: '2026-11-08', topic_id: 't1', duration_seconds: 3600 }),
      s({ session_date: '2026-08-01', topic_id: 't2', duration_seconds: 7200 }), // long ago: counts to the total but is not a skill "being learned"
      s({ status: 'discarded', duration_seconds: 9999 }),
    ]
    const r = learningSnapshot({ sessions, goals, topics, today: TODAY, targetMinutes: 60 })
    expect(r.totalMinutes).toBe(30 + 60 + 120)
    expect(r.todayMinutes).toBe(30)
    expect(r.todayPercent).toBe(50)
    expect(r.courses).toEqual([{ id: 'g1', title: 'AWS course', percent: 5, due: '2026-12-01' }])
    expect(r.skills).toEqual([{ id: 't1', name: 'React', group: 'Frontend', minutes: 90 }])
    expect(r.hasData).toBe(true)
  })
  it('no target means no percent, and no data means hasData is false', () => {
    const r = learningSnapshot({ today: TODAY, targetMinutes: 0 })
    expect(r.todayPercent).toBeNull()
    expect(r.hasData).toBe(false)
    expect(r.totalMinutes).toBe(0)
  })
})

describe('jobsSnapshot', () => {
  const NOW = Date.parse('2026-11-10T06:00:00Z')
  const apps = [
    { id: 'a1', company: 'Acme', job_title: 'Dev', status: 'interview', applied_date: '2026-11-09' },
    { id: 'a2', company: 'Beta', job_title: 'SRE', status: 'applied', applied_date: '2026-11-02' },
    { id: 'a3', company: 'Gamma', job_title: 'QA', status: 'rejected', applied_date: '2026-10-01' },
    { id: 'a4', company: 'Delta', job_title: 'PM', status: 'offer', applied_date: null },
  ]
  const ev = (o) => ({ id: Math.random().toString(36), application_id: 'a1', status: 'scheduled', scheduled_at: '2026-11-11T05:00:00Z', ...o })
  it('counts totals, in-progress, interviews still ahead and the next one', () => {
    const interviews = [ev({ id: 'e1' }), ev({ id: 'e2', scheduled_at: '2026-11-10T09:00:00Z', application_id: 'a2' }), ev({ scheduled_at: '2026-11-01T05:00:00Z' }), ev({ status: 'cancelled' }), ev({ status: 'completed' }), ev({ application_id: 'gone' })]
    const r = jobsSnapshot({ applications: apps, interviews, history: [], today: TODAY, nowMs: NOW })
    expect(r.total).toBe(4)
    expect(r.inProgress).toBe(2) // interview + applied; rejected and offer are closed
    expect(r.offers).toBe(1)
    expect(r.appliedThisWeek).toBe(1) // Mon 9 Nov onwards
    expect(r.interviewsScheduled).toBe(2)
    expect(r.nextInterview.id).toBe('e2')
    expect(upcomingInterviewCount(interviews, apps, NOW)).toBe(2)
  })
  it('lists the latest status changes newest first and skips ones whose application is gone', () => {
    const history = [
      { id: 'h1', application_id: 'a1', from_status: 'applied', to_status: 'interview', changed_at: '2026-11-09T10:00:00Z' },
      { id: 'h2', application_id: 'a2', from_status: null, to_status: 'applied', changed_at: '2026-11-02T10:00:00Z' },
      { id: 'h3', application_id: 'zz', from_status: null, to_status: 'applied', changed_at: '2026-11-10T10:00:00Z' },
    ]
    const r = jobsSnapshot({ applications: apps, interviews: [], history, today: TODAY, nowMs: NOW, limit: 2 })
    expect(r.recent.map((x) => x.id)).toEqual(['h1', 'h2'])
    expect(r.recent[0]).toMatchObject({ company: 'Acme', from: 'applied', to: 'interview' })
  })
  it('empty', () => {
    expect(jobsSnapshot({ today: TODAY })).toMatchObject({ total: 0, inProgress: 0, interviewsScheduled: 0, nextInterview: null, recent: [] })
  })
})

describe('fitnessSnapshot', () => {
  const w = (o) => ({ id: Math.random().toString(36), status: 'completed', name: 'Push', workout_date: TODAY, duration_minutes: 45, ...o })
  // Mon, Wed, Fri planned.
  const settings = { workout_plan: { 1: 'r1', 3: 'r1', 5: 'r1', 0: 'rest' }, steps_goal: 8000 }
  it('counts the week, scores the plan, and reports state and steps', () => {
    const workouts = [w({ workout_date: '2026-11-09' }), w({ workout_date: TODAY, name: 'Legs' }), w({ workout_date: '2026-11-02' })]
    const r = fitnessSnapshot({ workouts, health: { steps: 4000 }, settings, today: TODAY, caloriesEaten: 1850.4 })
    expect(r.today).toBe('Done')
    expect(r.todayName).toBe('Legs')
    expect(r.weekCount).toBe(2)
    expect(r.weekMinutes).toBe(90)
    expect(r.planned).toBe(3)
    expect(r.plannedDone).toBe(1) // Monday; today (Tuesday) was unplanned
    expect(r.goalPercent).toBe(33)
    expect(r.steps).toBe(4000)
    expect(r.stepsPercent).toBe(50)
    expect(r.calories).toBe(1850)
    expect(r.week).toHaveLength(7)
  })
  it('with no plan there is no goal percent, and untracked steps / calories are null, not zero', () => {
    const r = fitnessSnapshot({ workouts: [], health: null, settings: {}, today: TODAY })
    expect(r.goalPercent).toBeNull()
    expect(r.steps).toBeNull()
    expect(r.stepsPercent).toBeNull()
    expect(r.calories).toBeNull()
    expect(r.today).toBe('Not planned')
  })
  it('cardio minutes count as steps for the day', () => {
    const r = fitnessSnapshot({ workouts: [w({ kind: 'cardio', cardio_minutes: 30, cardio_distance_km: 3 })], health: null, settings, today: TODAY })
    expect(r.steps).toBeGreaterThan(0)
  })
})

describe('sleepSnapshot', () => {
  const log = (date, minutes, extra = {}) => ({ id: date, log_date: date, sleep_minutes: minutes, ...extra })
  it('uses the latest recorded night, however long ago, and measures it against the goal', () => {
    const r = sleepSnapshot({ healthLogs: [log('2026-11-07', 420), log('2026-11-01', 300)], settings: {}, today: TODAY })
    expect(r.lastMinutes).toBe(420)
    expect(r.lastDate).toBe('2026-11-07')
    expect(r.daysAgo).toBe(3)
    expect(r.goal).toBe(450)
    expect(r.goalPercent).toBe(93)
  })
  it('a custom goal is used and the percent is capped at 100', () => {
    const r = sleepSnapshot({ healthLogs: [log(TODAY, 600)], settings: { habit_prefs: { sleep_goal_minutes: 480 } }, today: TODAY })
    expect(r.goal).toBe(480)
    expect(r.goalPercent).toBe(100)
  })
  it('averages only the nights that were logged in the last seven days; a missing night is not a short night', () => {
    const r = sleepSnapshot({ healthLogs: [log(TODAY, 480), log('2026-11-08', 360), log('2026-11-03', 60), { id: 'w', log_date: '2026-11-09', sleep_minutes: null, water_ml: 500 }], settings: {}, today: TODAY })
    expect(r.nightsLogged).toBe(2)
    expect(r.avgMinutes).toBe(420)
    expect(r.nightsMetGoal).toBe(1)
    expect(r.week).toHaveLength(7)
    expect(r.week.find((w) => w.d === '2026-11-09').minutes).toBeNull()
  })
  it('consistency needs three timed nights', () => {
    const timed = (d) => log(d, 450, { bedtime: '23:00', wake_time: '06:30' })
    expect(sleepSnapshot({ healthLogs: [timed('2026-11-08'), timed('2026-11-09')], settings: {}, today: TODAY }).consistency.label).toBeNull()
    const r = sleepSnapshot({ healthLogs: [timed('2026-11-08'), timed('2026-11-09'), timed(TODAY)], settings: {}, today: TODAY })
    expect(r.consistency.label).toBe('Very regular')
  })
  it('nothing recorded', () => {
    expect(sleepSnapshot({ today: TODAY })).toMatchObject({ lastMinutes: null, goalPercent: null, avgMinutes: null, nightsLogged: 0 })
  })
})

describe('financeSnapshot', () => {
  const tx = (o) => ({ id: Math.random().toString(36), type: 'expense', amount_paise: 10000, category: 'Food', txn_date: TODAY, created_at: `${TODAY}T05:00:00Z`, ...o })
  it('summarises this month only, with the budget left and the newest transactions first', () => {
    const transactions = [
      tx({ type: 'income', amount_paise: 500000, category: 'Salary', txn_date: '2026-11-01' }),
      tx({ amount_paise: 20000 }),
      tx({ amount_paise: 30000, txn_date: '2026-11-05' }),
      tx({ amount_paise: 99999, txn_date: '2026-10-30' }),
    ]
    const r = financeSnapshot({ transactions, budgets: [], settings: { monthly_budget_paise: 100000 }, today: TODAY, limit: 2 })
    expect(r.sum.income).toBe(500000)
    expect(r.sum.expense).toBe(50000)
    expect(r.sum.remaining).toBe(50000)
    expect(r.hasBudget).toBe(true)
    expect(r.recent).toHaveLength(2)
    expect(r.recent[0].amount_paise).toBe(20000)
  })
  it('a month budget override wins, and with no budget remaining is null rather than the whole income', () => {
    const o = financeSnapshot({ transactions: [tx()], budgets: [{ month: '2026-11-01', category: '', amount_paise: 50000 }], settings: { monthly_budget_paise: 1 }, today: TODAY })
    expect(o.sum.budget).toBe(50000)
    const n = financeSnapshot({ transactions: [tx()], settings: {}, today: TODAY })
    expect(n.hasBudget).toBe(false)
    expect(n.sum.remaining).toBeNull()
  })
  it('empty', () => {
    expect(financeSnapshot({ today: TODAY })).toMatchObject({ hasData: false, recent: [] })
  })
})

describe('habitsSnapshot', () => {
  const habit = (id, name, o = {}) => ({ id, name, color: '#8B5CF6', frequency: 'daily', start_date: '2026-11-01', archived_at: null, days_of_week: [], weekly_target: 3, ...o })
  const log = (habit_id, log_date, status = 'done') => ({ id: habit_id + log_date, habit_id, log_date, status })
  it('splits today into done and pending, ranks active streaks and ignores archived habits', () => {
    const habits = [habit('a', 'Read'), habit('b', 'Meditate'), habit('c', 'Old', { archived_at: '2026-11-05T00:00:00Z' })]
    const habitLogs = [log('a', TODAY), log('a', '2026-11-09'), log('a', '2026-11-08'), log('b', '2026-11-09')]
    const r = habitsSnapshot({ habits, habitLogs, today: TODAY, agenda: { doneCount: 3, total: 4 } })
    expect(r.total).toBe(2)
    expect(r.due).toBe(2)
    expect(r.done).toBe(1)
    expect(r.percent).toBe(50)
    expect(r.pending.map((p) => p.name)).toEqual(['Meditate'])
    expect(r.streaks[0]).toMatchObject({ name: 'Read', current: 3 })
    expect(r.routine).toEqual({ done: 3, total: 4, percent: 75 })
  })
  it('a skipped habit is removed from the plan; no habits due means percent is null', () => {
    const r = habitsSnapshot({ habits: [habit('a', 'Read')], habitLogs: [log('a', TODAY, 'skipped')], today: TODAY })
    expect(r.pending).toEqual([])
    expect(r.percent).toBeNull()
    expect(r.routine).toBeNull()
  })
})

describe('recentActivity: sleep entries', () => {
  it('lists a recorded night but not a day that only has water', () => {
    const items = recentActivity({
      tasks: [],
      sessions: [],
      workouts: [],
      transactions: [],
      history: [],
      applications: [],
      habitLogs: [],
      habits: [],
      healthLogs: [
        { id: '1', sleep_minutes: 450, created_at: '2026-11-10T01:00:00Z' },
        { id: '2', sleep_minutes: null, water_ml: 500, created_at: '2026-11-09T01:00:00Z' },
      ],
      currency: 'INR',
    })
    expect(items).toEqual([{ at: '2026-11-10T01:00:00Z', kind: 'sleep', text: 'Logged sleep · 7h 30m' }])
  })
})
