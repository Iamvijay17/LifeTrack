import { describe, expect, it } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import { dailyProgress } from '../src/progress'
import { todayAgenda } from '../src/agenda'
import { completion, withPauses } from '../src/streaks'
import { buildAnalytics } from '../src/web/analytics'
import { notificationSettings } from '../src/notifications'
import { sourceCandidates } from '../src/notificationSources'
import { nextDueDate, nextOccurrence } from '../src/recurrence'

const TZ = 'Asia/Kolkata'
const D = '2026-11-11'
const habit = (o) => ({ id: 'h1', name: 'Read', frequency: 'daily', start_date: '2026-01-01', days_of_week: [], weekly_target: 3, archived_at: null, ...o })
const habits = [habit(), habit({ id: 'h2', name: 'Run' })]
const logs = [{ habit_id: 'h1', log_date: D, status: 'done' }]
const pauses = [{ habit_id: 'h2', start_date: '2026-11-09', end_date: null }]

describe('habit pauses outside the Habits page', () => {
  it('withPauses attaches each habit its own windows and leaves unpaused rows untouched', () => {
    const out = withPauses(habits, pauses)
    expect(out[0]).toBe(habits[0])
    expect(out[1].pauses).toEqual([{ start_date: '2026-11-09', end_date: null }])
    expect(habits[1].pauses).toBeUndefined() // the stored row is not modified
    expect(withPauses(habits, undefined)).toBe(habits)
  })
  it('a paused habit does not lower daily progress', () => {
    expect(dailyProgress({ date: D, habits, habitLogs: logs }).percent).toBe(50) // without pauses the paused habit reads as missed
    const p = dailyProgress({ date: D, habits: withPauses(habits, pauses), habitLogs: logs })
    expect(p.items.find((i) => i.key === 'habits')).toMatchObject({ done: 1, total: 1 })
    expect(p.percent).toBe(100)
  })
  it('the Today agenda leaves a paused habit out', () => {
    const a = todayAgenda({ habits: withPauses(habits, pauses), habitLogs: [] }, { today: D, tz: TZ })
    expect([...a.anytime, ...a.done].map((i) => i.id)).toEqual(['h1'])
  })
  it('the evening "habits left" nudge does not count a paused habit', () => {
    const run = (d) => sourceCandidates(d, { nowMs: zonedToMs(D, '09:00', TZ), tz: TZ, settings: notificationSettings({}), prefs: {}, user: {} })
    const left = (d) => run(d).find((c) => c.key === `src:habits:${D}`)
    expect(left({ habits, habitLogs: [] }).title).toBe('2 habits left today')
    expect(left({ habits, habitLogs: [], habitPauses: pauses }).title).toBe('1 habit left today')
    expect(left({ habits, habitLogs: logs, habitPauses: pauses })).toBeUndefined()
  })
  it('Analytics counts paused days as neutral when habit_pauses is given, and works without it', () => {
    const empty = { study_sessions: [], goals: [], milestones: [], job_applications: [], application_history: [], interview_events: [], workouts: [], health_logs: [], transactions: [] }
    const data = { ...empty, habits: [habit({ id: 'h2', name: 'Run', start_date: '2026-11-01' })], habit_logs: [] }
    const range = { from: '2026-11-01', to: '2026-11-30', today: D, weekStartsOn: 1, tz: TZ }
    const without = buildAnalytics(data, range).habits
    const withP = buildAnalytics({ ...data, habit_pauses: pauses }, range).habits
    expect(without.ranked[0]).toMatchObject({ done: 0, expected: 10 }) // Nov 1..10 (today is still pending)
    expect(withP.ranked[0]).toMatchObject({ done: 0, expected: 8 }) // paused from Nov 9
  })
})

describe('time zones', () => {
  it('the archive day of a habit is read in the given zone', () => {
    // 20:00 UTC on Nov 1 is already Nov 2 in India.
    const h = habit({ start_date: '2026-10-30', archived_at: '2026-11-01T20:00:00Z' })
    expect(completion(h, [], '2026-10-30', D, D, 1, 'UTC').expected).toBe(3)
    expect(completion(h, [], '2026-10-30', D, D, 1, TZ).expected).toBe(4)
  })
  it('an application without an applied date falls on its local creation day in Analytics', () => {
    const empty = { study_sessions: [], goals: [], milestones: [], application_history: [], interview_events: [], workouts: [], health_logs: [], transactions: [], habits: [], habit_logs: [] }
    const app = { id: 'a', company: 'Acme', status: 'applied', applied_date: null, created_at: '2026-10-31T20:00:00Z', salary_paise: 1200000000 }
    const a = buildAnalytics({ ...empty, job_applications: [app] }, { from: '2026-11-01', to: '2026-11-30', today: D, weekStartsOn: 1, tz: TZ })
    expect(a.jobs.salary.map((s) => s.date)).toEqual(['2026-11-01'])
  })
})

describe('monthly and yearly tasks keep their day', () => {
  it('a series on the 31st goes back to the 31st after a short month', () => {
    expect(nextDueDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
    expect(nextDueDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    expect(nextDueDate('2026-04-30', 'monthly', 31)).toBe('2026-05-31')
    expect(nextDueDate('2026-02-28', 'monthly', 30)).toBe('2026-03-30')
    expect(nextDueDate('2026-02-28', 'monthly')).toBe('2026-03-28') // no anchor known: as before
  })
  it('a moved occurrence (not cut short by the month) keeps its own day', () => {
    expect(nextDueDate('2026-03-20', 'monthly', 15)).toBe('2026-04-20')
    expect(nextDueDate('2026-03-20', 'monthly', 31)).toBe('2026-04-20')
  })
  it('29 February comes back in a leap year', () => {
    expect(nextDueDate('2028-02-29', 'yearly', 29)).toBe('2029-02-28')
    expect(nextDueDate('2031-02-28', 'yearly', 29)).toBe('2032-02-29')
    expect(nextOccurrence({ recurrence: 'monthly', due_date: '2026-02-28' }, 31)).toBe('2026-03-31')
  })
})
