import { describe, it, expect } from 'vitest'
import { dateStrInTz, addDays, startOfWeek, weekday, zonedToIso, fmtDuration, monthEnd, eachDay } from '@/lib/dates'
import { parseMoney, formatMoney, paiseToInput, lpaToPaise } from '@/lib/money'
import { sleepMinutes } from '@/domain/sleep'
import { streaks, completion, isDueToday, activeDayStreak, isScheduled } from '@/domain/streaks'
import { dailyProgress } from '@/domain/progress'
import { goalProgress, countedMinutes, problemsSolved } from '@/domain/learning'
import { summarize, categoryBreakdown } from '@/domain/finance'
import { funnel } from '@/domain/jobs'
import { nextOccurrence, nextDueDate } from '@/domain/recurrence'

describe('dates (Asia/Kolkata)', () => {
  it('uses IST for the calendar day, not UTC', () => {
    // 2026-03-10 20:00 UTC == 2026-03-11 01:30 IST
    expect(dateStrInTz(new Date('2026-03-10T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-03-11')
    expect(dateStrInTz(new Date('2026-03-10T20:00:00Z'), 'UTC')).toBe('2026-03-10')
  })
  it('date arithmetic is timezone independent', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(weekday('2026-11-01')).toBe(0)
    expect(startOfWeek('2026-11-01', 1)).toBe('2026-10-26')
    expect(startOfWeek('2026-11-01', 0)).toBe('2026-11-01')
    expect(monthEnd('2026-02-10')).toBe('2026-02-28')
    expect(eachDay('2026-01-30', '2026-02-02')).toHaveLength(4)
  })
  it('converts IST wall-clock to UTC', () => {
    expect(zonedToIso('2026-03-11', '09:00', 'Asia/Kolkata')).toBe('2026-03-11T03:30:00.000Z')
  })
  it('formats durations', () => {
    expect(fmtDuration(125)).toBe('2h 5m'); expect(fmtDuration(60)).toBe('1h'); expect(fmtDuration(45)).toBe('45m')
  })
})

describe('money (integer paise)', () => {
  it('parses without float error', () => {
    expect(parseMoney('0.1')).toBe(10)
    expect(parseMoney('1,250.50')).toBe(125050)
    expect(parseMoney('19.99')).toBe(1999)
    expect(parseMoney('1.005')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
    expect(0.1 + 0.2).not.toBe(0.3) // why we use paise
    expect(parseMoney('0.1') + parseMoney('0.2')).toBe(30)
  })
  it('round-trips and formats', () => {
    expect(paiseToInput(125050)).toBe('1250.50'); expect(paiseToInput(5000)).toBe('50')
    expect(formatMoney(125050)).toContain('1,250.50'); expect(formatMoney(100000)).toContain('1,000')
    expect(lpaToPaise('12.5')).toBe(125000000)
  })
})

describe('sleep duration', () => {
  it('handles overnight and same-day sleep', () => {
    expect(sleepMinutes('23:30', '06:30')).toBe(420)
    expect(sleepMinutes('00:30', '07:00')).toBe(390)
    expect(sleepMinutes('13:00', '14:30')).toBe(90)
    expect(sleepMinutes('22:00', '22:00')).toBeNull()
    expect(sleepMinutes('', '06:00')).toBeNull()
  })
})

const habit = (o = {}) => ({ id: 'h', frequency: 'daily', days_of_week: [], weekly_target: 3, start_date: '2026-01-01', archived_at: null, ...o })
const log = (d, status = 'done') => ({ habit_id: 'h', log_date: d, status })

describe('habit streaks', () => {
  it('counts consecutive done days; pending today does not break', () => {
    const logs = ['2026-01-08', '2026-01-09', '2026-01-10'].map((d) => log(d))
    expect(streaks(habit(), logs, '2026-01-11').current).toBe(3)
    expect(streaks(habit(), [...logs, log('2026-01-11')], '2026-01-11').current).toBe(4)
  })
  it('a missed day breaks the current streak but keeps the longest', () => {
    const logs = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'].map((d) => log(d))
    const s = streaks(habit(), logs, '2026-01-05')
    expect(s.current).toBe(1); expect(s.longest).toBe(3)
  })
  it('skipped / rest days are neutral', () => {
    const logs = [log('2026-01-01'), log('2026-01-02', 'rest'), log('2026-01-03', 'skipped'), log('2026-01-04')]
    expect(streaks(habit(), logs, '2026-01-04').current).toBe(2)
  })
  it('custom schedules ignore unscheduled days', () => {
    // Mon/Wed/Fri. 2026-01-05 is a Monday.
    const h = habit({ frequency: 'custom', days_of_week: [1, 3, 5], start_date: '2026-01-05' })
    const logs = ['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-12'].map((d) => log(d))
    expect(isScheduled(h, '2026-01-06')).toBe(false)
    expect(streaks(h, logs, '2026-01-12').current).toBe(4)
  })
  it('weekly habits count weeks that hit the target', () => {
    const h = habit({ frequency: 'weekly', weekly_target: 2, start_date: '2026-01-05' })
    const logs = ['2026-01-05', '2026-01-07', '2026-01-12', '2026-01-13', '2026-01-19'].map((d) => log(d))
    const s = streaks(h, logs, '2026-01-20') // current week has 1/2 so far: not broken yet
    expect(s.current).toBe(2); expect(s.unit).toBe('wk')
  })
  it('editing a habit does not erase history (logs stay countable)', () => {
    const logs = ['2026-01-01', '2026-01-02'].map((d) => log(d))
    const edited = habit({ name: 'renamed', frequency: 'custom', days_of_week: [4, 5] }) // Thu/Fri; Jan 1 2026 is a Thursday
    expect(streaks(edited, logs, '2026-01-02').longest).toBeGreaterThanOrEqual(2)
  })
  it('completion excludes skipped days and pending today', () => {
    const logs = [log('2026-01-01'), log('2026-01-02', 'rest'), log('2026-01-04')]
    const c = completion(habit(), logs, '2026-01-01', '2026-01-05', '2026-01-05')
    expect(c).toMatchObject({ done: 2, expected: 3 }) // Jan1 done, Jan2 skip, Jan3 miss, Jan4 done, Jan5 pending
  })
  it('isDueToday', () => {
    expect(isDueToday(habit(), [], '2026-01-05')).toBe(true)
    expect(isDueToday(habit(), [log('2026-01-05')], '2026-01-05')).toBe(false)
  })
  it('active day streak', () => {
    expect(activeDayStreak(['2026-01-03', '2026-01-04'], '2026-01-05')).toBe(2)
    expect(activeDayStreak(['2026-01-03', '2026-01-04', '2026-01-05'], '2026-01-05')).toBe(3)
    expect(activeDayStreak(['2026-01-01'], '2026-01-05')).toBe(0)
  })
})

describe('daily progress', () => {
  const base = { date: '2026-01-05', settings: { daily_study_target_minutes: 0, water_goal_ml: 0, steps_goal: 0, workout_plan: {} } }
  it('is null when nothing is planned (no fabricated number)', () => {
    expect(dailyProgress(base).percent).toBeNull()
  })
  it('counts only planned, non-cancelled tasks', () => {
    const tasks = [
      { due_date: '2026-01-05', status: 'done' }, { due_date: '2026-01-05', status: 'pending' },
      { due_date: '2026-01-05', status: 'cancelled' }, { due_date: '2026-01-05', status: 'skipped' }, { due_date: '2026-01-06', status: 'done' },
    ]
    const p = dailyProgress({ ...base, tasks })
    expect(p).toMatchObject({ done: 1, total: 2, percent: 50 })
  })
  it('skipped habits are removed from the plan', () => {
    const habits = [habit({ id: 'a' }), habit({ id: 'b' })]
    const habitLogs = [{ habit_id: 'a', log_date: '2026-01-05', status: 'done' }, { habit_id: 'b', log_date: '2026-01-05', status: 'skipped' }]
    expect(dailyProgress({ ...base, habits, habitLogs })).toMatchObject({ done: 1, total: 1, percent: 100 })
  })
  it('running timers never count as study time', () => {
    const sessions = [
      { session_date: '2026-01-05', status: 'running', duration_seconds: null },
      { session_date: '2026-01-05', status: 'completed', duration_seconds: 1800 },
      { session_date: '2026-01-05', status: 'discarded', duration_seconds: 3600 },
    ]
    const p = dailyProgress({ ...base, settings: { ...base.settings, daily_study_target_minutes: 60 }, sessions })
    expect(p.percent).toBe(50)
  })
  it('rest days and skipped workouts are not planned', () => {
    const settings = { ...base.settings, workout_plan: { 1: 'routine-1' } } // 2026-01-05 is Monday
    expect(dailyProgress({ ...base, settings }).total).toBe(1)
    expect(dailyProgress({ ...base, settings, workouts: [{ workout_date: '2026-01-05', status: 'rest' }] }).total).toBe(0)
    expect(dailyProgress({ ...base, settings: { ...settings, workout_plan: { 1: 'rest' } } }).total).toBe(0)
    expect(dailyProgress({ ...base, settings, workouts: [{ workout_date: '2026-01-05', status: 'completed' }] }).percent).toBe(100)
  })
  it('water and steps give partial credit', () => {
    const p = dailyProgress({ ...base, settings: { ...base.settings, water_goal_ml: 3000 }, health: { water_ml: 1500, steps: 0 } })
    expect(p.percent).toBe(50)
  })
})

describe('learning', () => {
  const sessions = [
    { goal_id: 'g', status: 'completed', duration_seconds: 3600, problems_solved: 3 },
    { goal_id: 'g', status: 'running', duration_seconds: null, problems_solved: 9 },
    { goal_id: 'g', status: 'discarded', duration_seconds: 7200, problems_solved: 5 },
  ]
  it('only completed sessions count', () => {
    expect(countedMinutes(sessions)).toBe(60)
    expect(problemsSolved(sessions)).toBe(3)
    expect(goalProgress({ id: 'g', target_minutes: 120 }, sessions)).toMatchObject({ done: 60, percent: 50 })
  })
  it('goal without a target has no percentage', () => {
    expect(goalProgress({ id: 'g', target_minutes: 0 }, sessions).percent).toBeNull()
  })
})

describe('finance', () => {
  const tx = [
    { type: 'income', amount_paise: 5000000, txn_date: '2026-01-01', category: 'Salary' },
    { type: 'expense', amount_paise: 123450, txn_date: '2026-01-02', category: 'Food' },
    { type: 'expense', amount_paise: 76550, txn_date: '2026-01-03', category: 'Travel' },
    { type: 'expense', amount_paise: 100000, txn_date: '2026-01-04', category: 'Food' },
    { type: 'savings', amount_paise: 1000000, txn_date: '2026-01-05', category: 'Investments' },
    { type: 'expense', amount_paise: 999999, txn_date: '2025-12-31', category: 'Other' },
  ]
  it('summarises a month exactly', () => {
    const s = summarize(tx, '2026-01', 1000000)
    expect(s).toMatchObject({ income: 5000000, expense: 300000, savings: 1000000, net: 3700000, remaining: 700000 })
    expect(s.budgetUsed).toBeCloseTo(0.3)
  })
  it('no budget -> no remaining', () => { expect(summarize(tx, '2026-01', 0).remaining).toBeNull() })
  it('category breakdown sorted and sums to 100%', () => {
    const b = categoryBreakdown(tx.filter((t) => t.txn_date.startsWith('2026-01')))
    expect(b[0]).toMatchObject({ category: 'Food', paise: 223450 })
    expect(b.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1)
  })
})

describe('job funnel', () => {
  const apps = [
    { id: '1', status: 'interview', applied_date: '2026-01-05' },
    { id: '2', status: 'rejected', applied_date: '2026-01-06' },
    { id: '3', status: 'applied', applied_date: '2026-01-07' },
    { id: '4', status: 'interested', applied_date: null },
  ]
  const history = [
    { application_id: '2', to_status: 'applied' }, { application_id: '2', to_status: 'interview' }, { application_id: '2', to_status: 'rejected' },
  ]
  it('uses history so a rejected application still counts as having reached interview', () => {
    const f = funnel(apps, history, [], '2026-01-01', '2026-01-31')
    expect(f).toMatchObject({ applied: 3, interviews: 2, rejections: 1 })
    expect(f.conversion).toBeCloseTo(2 / 3)
  })
  it('conversion is null with no applications', () => {
    expect(funnel([], [], [], '2026-01-01', '2026-01-31').conversion).toBeNull()
  })
})

describe('recurrence', () => {
  it('computes next due dates', () => {
    expect(nextDueDate('2026-01-30', 'daily')).toBe('2026-01-31')
    expect(nextDueDate('2026-01-02', 'weekdays')).toBe('2026-01-05') // Fri -> Mon
    expect(nextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextDueDate('2026-01-05', 'weekly')).toBe('2026-01-12')
  })
  it('respects end date and non-recurring', () => {
    expect(nextOccurrence({ recurrence: 'none', due_date: '2026-01-01' })).toBeNull()
    expect(nextOccurrence({ recurrence: 'daily', due_date: '2026-01-01', recurrence_until: '2026-01-01' })).toBeNull()
    expect(nextOccurrence({ recurrence: 'daily', due_date: '2026-01-01', recurrence_until: '2026-01-05' })).toBe('2026-01-02')
  })
})

import { parseBackup, summarizeBackup } from '@/services/backup'
import { toCsv } from '@/services/csv'
describe('backup + csv', () => {
  const ok = { app: 'lifetrack', version: 1, exported_at: 'x', tables: { tasks: [{ id: 'a', title: 't' }], habits: [] } }
  it('parses valid backups, including one with a BOM', () => {
    expect(parseBackup(JSON.stringify(ok)).tables.tasks).toHaveLength(1)
    expect(parseBackup('﻿' + JSON.stringify(ok)).app).toBe('lifetrack')
    expect(summarizeBackup(ok)).toEqual([{ table: 'tasks', count: 1 }])
  })
  it('rejects wrong / newer / malformed / unknown-table files', () => {
    expect(() => parseBackup('nope')).toThrow(/valid JSON/)
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/not a LifeTrack backup/)
    expect(() => parseBackup(JSON.stringify({ ...ok, version: 99 }))).toThrow(/newer version/)
    expect(() => parseBackup(JSON.stringify({ ...ok, tables: { evil: [{ id: '1' }] } }))).toThrow(/Unknown table/)
    expect(() => parseBackup(JSON.stringify({ ...ok, tables: { tasks: [{ title: 'no id' }] } }))).toThrow()
  })
  it('CSV escapes quotes/commas and neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ a: 'He said "hi", ok', b: '=SUM(A1)' }, { a: '-5', b: '@cmd' }], [{ header: 'A', value: (r) => r.a }, { header: 'B', value: (r) => r.b }])
    expect(csv).toContain('"He said ""hi"", ok",\'=SUM(A1)')
    expect(csv).toContain("-5,'@cmd") // plain numbers are untouched
  })
})
