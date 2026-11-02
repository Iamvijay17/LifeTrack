import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { dailyScore, normalizeWeights, averageScore, explainScore, DEFAULT_WEIGHTS } from '@lifetrack/core/score'
import { nextRemindDate, dueReminders, afterFire } from '@lifetrack/core/reminders'
import { focusMinutes, dailyFocus, nextBreak, fmtClock, remainingSeconds, completedCount } from '@lifetrack/core/focus'
import { goalPercent, isOverdue } from '@lifetrack/core/goals'
import { buildReport } from '@lifetrack/core/report'
import { parseBlocks } from '@/lib/markdown'
import { searchAll } from '@/components/layout/GlobalSearch'
import { parseTags } from '@/features/notes/NoteDialog'
import { STATUS_LABEL, funnel } from '@lifetrack/core/jobs'

const D = '2026-11-02' // a Monday
const settings = { daily_study_target_minutes: 60, water_goal_ml: 2000, steps_goal: 10000, workout_plan: {}, timezone: 'Asia/Kolkata', score_weights: DEFAULT_WEIGHTS }
const base = { date: D, settings }

describe('daily score', () => {
  it('has no score when nothing is planned or logged (never invents a number)', () => {
    const r = dailyScore({ ...base, settings: { ...settings, daily_study_target_minutes: 0 } })
    expect(r.score).toBeNull()
  })
  it('re-normalises weights over applicable categories only', () => {
    // only learning is applicable (study target met) => 100, not 25
    const r = dailyScore({ ...base, sessions: [{ session_date: D, status: 'completed', duration_seconds: 3600 }] })
    expect(r.score).toBe(100)
    expect(r.categories.find((c) => c.key === 'learning').effectiveWeight).toBe(100)
    expect(r.categories.find((c) => c.key === 'fitness').applicable).toBe(false)
  })
  it('weights categories as configured', () => {
    const tasks = [{ due_date: D, status: 'done', category: 'Job Search' }]
    const habits = [{ id: 'h', frequency: 'daily', start_date: '2026-01-01', days_of_week: [], archived_at: null }]
    // learning 0% (weight 25), career 100% (25)  => 50
    expect(dailyScore({ ...base, tasks, habits: [] }).score).toBe(50)
    // double the career weight => (0*25 + 1*50)/75 = 67
    expect(dailyScore({ ...base, tasks, settings: { ...settings, score_weights: { ...DEFAULT_WEIGHTS, career: 50 } } }).score).toBe(67)
    expect(habits.length).toBe(1)
  })
  it('does not penalise a planned rest day or a skipped workout', () => {
    const plan = { ...settings, daily_study_target_minutes: 0, workout_plan: { 1: 'rest' } }
    expect(dailyScore({ ...base, settings: plan }).categories.find((c) => c.key === 'fitness').applicable).toBe(false)
    const planned = { ...plan, workout_plan: { 1: 'push' } }
    expect(dailyScore({ ...base, settings: planned }).categories.find((c) => c.key === 'fitness').fraction).toBe(0)
    const skipped = dailyScore({ ...base, settings: planned, workouts: [{ workout_date: D, status: 'rest' }] })
    expect(skipped.categories.find((c) => c.key === 'fitness').applicable).toBe(false)
  })
  it('treats unlogged sleep as unknown, not zero', () => {
    const r = dailyScore({ ...base, settings: { ...settings, daily_study_target_minutes: 0 } })
    expect(r.categories.find((c) => c.key === 'health').applicable).toBe(false)
    const logged = dailyScore({ ...base, settings: { ...settings, daily_study_target_minutes: 0 }, health: { sleep_minutes: 450, water_ml: 2000, steps: 0 } })
    expect(logged.categories.find((c) => c.key === 'health').fraction).toBe(1)
  })
  it('credits applications sent and ignores cancelled/skipped tasks', () => {
    const r = dailyScore({ ...base, settings: { ...settings, daily_study_target_minutes: 0 }, applications: [{ applied_date: D }], tasks: [{ due_date: D, status: 'cancelled', category: 'Job Search' }] })
    expect(r.categories.find((c) => c.key === 'career').fraction).toBe(1)
  })
  it('sanitises weights and explains the result', () => {
    expect(normalizeWeights({ learning: -5, career: 'x' })).toEqual(DEFAULT_WEIGHTS)
    expect(normalizeWeights({ learning: 10 }).learning).toBe(10)
    const r = dailyScore({ ...base, sessions: [{ session_date: D, status: 'completed', duration_seconds: 1800 }] })
    expect(explainScore(r)).toMatch(/Learning 50% × 100% = 50/)
    expect(explainScore({ score: null, categories: [] })).toMatch(/no score/)
    expect(averageScore([{ score: 50 }, { score: null }, { score: 100 }])).toEqual({ avg: 75, days: 3, scored: 2 })
  })
})

describe('reminders', () => {
  it('computes repeats, clamping month ends', () => {
    expect(nextRemindDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextRemindDate('2026-03-31', 'monthly')).toBe('2026-04-30')
    expect(nextRemindDate('2026-11-02', 'weekly')).toBe('2026-11-09')
    expect(nextRemindDate('2026-11-02', 'none')).toBeNull()
  })
  it('fires once per day, only after its time, and skips inactive ones', () => {
    const r = (o) => ({ id: 'r', active: true, last_fired_on: null, remind_date: D, remind_time: '09:00:00', repeat: 'none', ...o })
    expect(dueReminders([r()], D, '08:59')).toHaveLength(0)
    expect(dueReminders([r()], D, '09:00')).toHaveLength(1)
    expect(dueReminders([r({ remind_date: '2026-11-01' })], D, '00:01')).toHaveLength(1)
    expect(dueReminders([r({ last_fired_on: D })], D, '12:00')).toHaveLength(0)
    expect(dueReminders([r({ active: false })], D, '12:00')).toHaveLength(0)
    expect(dueReminders([r({ remind_date: '2026-11-03' })], D, '12:00')).toHaveLength(0)
  })
  it('deactivates one-offs and moves repeats past today', () => {
    expect(afterFire({ repeat: 'none', remind_date: D }, D)).toEqual({ last_fired_on: D, active: false })
    expect(afterFire({ repeat: 'daily', remind_date: '2026-10-28' }, D)).toEqual({ last_fired_on: D, remind_date: '2026-11-03' })
  })
})

describe('focus', () => {
  const s = (o) => ({ kind: 'focus', session_date: D, actual_seconds: 1500, completed: true, ...o })
  it('sums only focus blocks (breaks never count) incl. stopped-early ones', () => {
    expect(focusMinutes([s(), s({ actual_seconds: 600, completed: false }), s({ kind: 'short_break' })])).toBe(35)
    expect(completedCount([s(), s({ completed: false })])).toBe(1)
  })
  it('builds a per-day series and schedules long breaks', () => {
    expect(dailyFocus([s()], '2026-11-01', '2026-11-03').map((d) => d.minutes)).toEqual([0, 25, 0])
    expect(nextBreak(3)).toBe('short_break'); expect(nextBreak(4)).toBe('long_break'); expect(nextBreak(8, 4)).toBe('long_break')
  })
  it('formats the clock and never goes negative', () => {
    expect(fmtClock(1500)).toBe('25:00'); expect(fmtClock(65)).toBe('01:05')
    expect(remainingSeconds(10_000, 20_000)).toBe(0); expect(remainingSeconds(10_500, 10_000)).toBe(1)
  })
})

describe('goals', () => {
  it('prefers milestones, then study time, then manual progress', () => {
    const g = { id: 'g', status: 'active', target_minutes: 0, manual_progress: 40 }
    expect(goalPercent(g, [], []).percent).toBe(40)
    expect(goalPercent(g, [{ goal_id: 'g', done: true }, { goal_id: 'g', done: false }, { goal_id: 'x', done: false }], []).percent).toBe(50)
    const study = { ...g, target_minutes: 120 }
    expect(goalPercent(study, [], [{ goal_id: 'g', status: 'completed', duration_seconds: 3600 }]).percent).toBe(50)
    expect(goalPercent({ ...g, status: 'completed' }, [], []).percent).toBe(100)
  })
  it('flags overdue only for active goals', () => {
    expect(isOverdue({ status: 'active', due_date: '2026-11-01' }, D)).toBe(true)
    expect(isOverdue({ status: 'completed', due_date: '2026-11-01' }, D)).toBe(false)
    expect(isOverdue({ status: 'active', due_date: null }, D)).toBe(false)
  })
})

describe('jobs: Wishlist / Offer', () => {
  it('labels the first column Wishlist and counts offers', () => {
    expect(STATUS_LABEL.interested).toBe('Wishlist'); expect(STATUS_LABEL.offer).toBe('Offer')
    const apps = [{ id: 'a', status: 'offer', applied_date: D }]
    expect(funnel(apps, [], [], D, D)).toMatchObject({ applied: 1, interviews: 1, offers: 1 })
  })
})

describe('report', () => {
  const empty = { tasks: [], habits: [], habit_logs: [], study_sessions: [], focus_sessions: [], workouts: [], health_logs: [], transactions: [], goals: [], milestones: [], job_applications: [], application_history: [], interview_events: [] }
  const ctx = { today: D, settings, weekStartsOn: 1 }
  it('is empty — not zero-filled with fake scores — when the user has no data', () => {
    const r = buildReport(empty, '2026-10-26', '2026-11-01', ctx)
    expect(r.summary.productivityScore).toBeNull(); expect(r.summary.scoredDays).toBe(0); expect(r.summary.sleepAvgHours).toBeNull()
  })
  it('does not score days before the first record or after today', () => {
    const data = { ...empty, study_sessions: [{ session_date: '2026-10-29', status: 'completed', duration_seconds: 3600 }] }
    const r = buildReport(data, '2026-10-26', '2026-11-08', ctx)
    expect(r.daily).toHaveLength(8) // 26 Oct .. 2 Nov (today)
    expect(r.daily.filter((d) => d.score != null).map((d) => d.date)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(r.daily.find((d) => d.date === '2026-10-29').score).toBe(100)
    expect(r.daily.find((d) => d.date === '2026-10-30').score).toBe(0)
    expect(r.summary.studyHours).toBe(1)
  })
  it('summarises money, sleep and applications for the range', () => {
    const data = { ...empty,
      transactions: [{ type: 'expense', amount_paise: 50000, txn_date: D }, { type: 'income', amount_paise: 100000, txn_date: D }, { type: 'expense', amount_paise: 999, txn_date: '2026-09-01' }],
      health_logs: [{ log_date: D, sleep_minutes: 420, water_ml: 1000, steps: 0 }, { log_date: '2026-11-01', sleep_minutes: 360, water_ml: 0, steps: 0 }],
      job_applications: [{ id: 'a', status: 'applied', applied_date: D }] }
    const r = buildReport(data, '2026-11-01', '2026-11-07', ctx).summary
    expect(r.expensePaise).toBe(50000); expect(r.incomePaise).toBe(100000)
    expect(r.sleepAvgHours).toBeCloseTo(6.5); expect(r.applications).toBe(1)
  })
})

describe('markdown', () => {
  it('parses blocks and checklists', () => {
    const b = parseBlocks('# Title\n\nhello **world**\n\n- a\n- [x] done\n- [ ] todo\n\n> quote\n\n```\ncode\n```')
    expect(b.map((x) => x.type)).toEqual(['h', 'p', 'ul', 'quote', 'code'])
    expect(b[2].items).toEqual([{ text: 'a' }, { text: 'done', checked: true }, { text: 'todo', checked: false }])
  })
})

describe('search & tags', () => {
  it('finds across modules and pages, case-insensitively', () => {
    const data = { tasks: [{ id: 't', title: 'Read React docs', due_date: D }], notes: [{ id: 'n', title: 'Ideas', body: 'react hooks', category: 'Learning', tags: [] }], goals: [{ id: 'g', title: 'Ship', notes: '' }], job_applications: [], habits: [], transactions: [] }
    const groups = searchAll('REACT', data)
    expect(groups.map((g) => g.title)).toEqual(['Tasks', 'Notes'])
    expect(searchAll('focus', data)[0].items[0].to).toBe('/focus')
    expect(searchAll('   ', data)).toEqual([])
  })
  it('normalises tags', () => {
    expect(parseTags('#React, react , Interview,,')).toEqual(['react', 'interview'])
  })
})
