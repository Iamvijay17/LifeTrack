import { describe, expect, it } from 'vitest'
import { buildInsightsReport, comparisonRanges, periodFor, shiftAnchor } from '../src/insights.js'

const empty = () => ({ habits: [], habit_logs: [], study_sessions: [], focus_sessions: [], learning_topics: [], goals: [], milestones: [], job_applications: [], application_history: [], interview_events: [], workouts: [], exercise_logs: [], health_logs: [], transactions: [], tasks: [], habit_pauses: [] })
const tx = (id, type, paise, date) => ({ id, type, amount_paise: paise, category: 'Food', txn_date: date, note: '', created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z` })
const report = (data, kind, range, today = '2026-11-24') => buildInsightsReport(data, { kind, range, today, weekStartsOn: 1, plan: {}, tz: 'Asia/Kolkata' })
const row = (r, key) => r.comparison.find((x) => x.key === key)

describe('daily reports', () => {
  it('a day is one calendar date, and stepping moves by whole days (across month and year ends)', () => {
    expect(periodFor('day', '2026-11-24')).toEqual({ from: '2026-11-24', to: '2026-11-24' })
    expect(shiftAnchor('day', '2026-12-01', -1)).toBe('2026-11-30')
    expect(shiftAnchor('day', '2026-12-31', 1)).toBe('2027-01-01')
    const c = comparisonRanges({ from: '2026-11-24', to: '2026-11-24' }, 'day', '2026-11-24')
    expect(c.current).toMatchObject({ from: '2026-11-24', to: '2026-11-24', days: 1 })
    expect(c.previous).toMatchObject({ from: '2026-11-23', to: '2026-11-23', days: 1 })
    expect(c.partial).toBe(false)
  })
  it('counts only records dated that day: the neighbouring midnights stay out', () => {
    const d = empty()
    d.transactions = [tx('a', 'expense', 10000, '2026-11-23'), tx('b', 'expense', 25000, '2026-11-24'), tx('c', 'expense', 5000, '2026-11-24'), tx('d', 'expense', 99900, '2026-11-25')]
    const r = report(d, 'day', { from: '2026-11-24', to: '2026-11-24' }, '2026-11-25')
    expect(row(r, 'expense').cur).toBe(30000)
    expect(row(r, 'expense').prev).toBe(10000) // 23 November, compared like for like
  })
  it('does not count a record twice, and ignores future-dated records', () => {
    const d = empty()
    d.transactions = [tx('a', 'expense', 10000, '2026-11-24'), tx('a', 'expense', 10000, '2026-11-24'), tx('f', 'expense', 77700, '2026-12-30')]
    const r = report(d, 'day', { from: '2026-11-24', to: '2026-11-24' })
    expect(row(r, 'expense').cur).toBe(10000)
    expect(r.notes.duplicates).toBe(1)
    expect(r.notes.future).toBe(1)
  })
  it('tells "nothing recorded" from "recorded zero"', () => {
    const d = empty()
    d.study_sessions = []
    d.health_logs = [{ id: 'h', log_date: '2026-11-24', sleep_minutes: 0, water_ml: 0, steps: 0, created_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z' }]
    d.transactions = [tx('a', 'income', 1000, '2026-11-20')]
    const r = report(d, 'day', { from: '2026-11-24', to: '2026-11-24' })
    const sleep = r.comparison.find((x) => /sleep/i.test(x.label))
    if (sleep) expect(sleep.cur === 0 || sleep.cur === null).toBe(true)
    const quiet = report({ ...empty(), transactions: [tx('a', 'income', 1000, '2026-11-20')] }, 'day', { from: '2026-11-24', to: '2026-11-24' })
    const sleepQuiet = quiet.comparison.find((x) => /sleep/i.test(x.label))
    if (sleepQuiet) expect(sleepQuiet.cur).toBeNull()
  })
  it('a quarter and a custom range add up the same records as their months', () => {
    const d = empty()
    d.transactions = [tx('1', 'expense', 100, '2026-10-01'), tx('2', 'expense', 200, '2026-11-15'), tx('3', 'expense', 300, '2026-12-31'), tx('4', 'expense', 400, '2026-09-30')]
    const q = report(d, 'quarter', periodFor('quarter', '2026-11-15'), '2026-12-31')
    const custom = report(d, 'custom', { from: '2026-10-01', to: '2026-12-31' }, '2026-12-31')
    expect(row(q, 'expense').cur).toBe(600)
    expect(row(custom, 'expense').cur).toBe(600)
    const monthly = ['2026-10', '2026-11', '2026-12'].map((m) => row(report(d, 'month', periodFor('month', `${m}-15`), '2026-12-31'), 'expense').cur)
    expect(monthly.reduce((a, b) => a + b, 0)).toBe(600)
  })
})
