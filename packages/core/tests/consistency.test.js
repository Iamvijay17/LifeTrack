import { describe, expect, it } from 'vitest'
import { streaks, isScheduled, completion, isDueToday } from '../src/streaks'
import { buildHabitStats } from '../src/web/habits'
import {
  dayKind,
  explainStreak,
  kindCounts,
  missedDays,
  monthMap,
  personalRecords,
  recoverable,
  recoveryHistory,
  weeklyConsistency,
} from '../src/consistency'

const TODAY = '2026-11-12' // Thursday
const daily = {
  id: 'h1',
  frequency: 'daily',
  days_of_week: [],
  rest_days: [],
  weekly_target: 3,
  start_date: '2026-11-01',
  archived_at: null,
}
const log = (d, status = 'done', extra = {}) => ({ habit_id: 'h1', log_date: d, status, ...extra })
const days = (...ds) => ds.map((d) => log(`2026-11-${d}`))

describe('planned rest days', () => {
  it('are never expected, so a missing Sunday does not break the streak', () => {
    // 1 Nov 2026 is a Sunday. Done every day 2..12 except nothing missing; rest on Sunday 8th.
    const habit = { ...daily, rest_days: [0] }
    const logs = days('01', '02', '03', '04', '05', '06', '07', '09', '10', '11', '12')
    expect(isScheduled(habit, '2026-11-08')).toBe(false)
    expect(streaks(habit, logs, TODAY).current).toBe(11)
    // the same history without the rest day setting DOES break at the 8th
    expect(streaks(daily, logs, TODAY).current).toBe(4)
  })
  it('still count a check-in made on a rest day', () => {
    const habit = { ...daily, rest_days: [0] }
    expect(streaks(habit, [...days('08', '09', '10', '11', '12')], TODAY).current).toBe(5)
  })
})

describe('pauses', () => {
  const paused = { ...daily, pauses: [{ start_date: '2026-11-05', end_date: '2026-11-09' }] }
  it('make paused days neutral for streaks and completion', () => {
    const logs = days('01', '02', '03', '04', '10', '11', '12')
    expect(streaks(paused, logs, TODAY).current).toBe(7)
    expect(completion(paused, logs, '2026-11-01', TODAY, TODAY).rate).toBe(1)
  })
  it('an open-ended pause covers every later day and the habit is not due', () => {
    const open = { ...daily, pauses: [{ start_date: '2026-11-05', end_date: null }] }
    expect(isDueToday(open, [], TODAY)).toBe(false)
    expect(dayKind(open, new Map(), '2026-11-10', TODAY)).toBe('paused')
  })
  it('a fully paused week does not break a weekly habit', () => {
    const weekly = {
      ...daily,
      frequency: 'weekly',
      weekly_target: 2,
      start_date: '2026-10-19',
      pauses: [{ start_date: '2026-10-26', end_date: '2026-11-01' }],
    }
    const logs = ['2026-10-19', '2026-10-20', '2026-11-02', '2026-11-03', '2026-11-09', '2026-11-10'].map((d) => log(d))
    expect(streaks(weekly, logs, TODAY).current).toBe(3)
  })
  it('never modifies the stored habit or logs', () => {
    const habits = [Object.freeze({ ...daily })]
    const logs = [Object.freeze(log('2026-11-02'))]
    const stats = buildHabitStats(habits, logs, TODAY, 1, [{ habit_id: 'h1', start_date: '2026-11-05', end_date: null }])
    expect(stats[0].habit.pauses).toHaveLength(1)
    expect(habits[0].pauses).toBeUndefined()
  })
})

describe('dayKind', () => {
  const map = new Map([
    ['2026-11-02', log('2026-11-02')],
    ['2026-11-03', log('2026-11-03', 'done', { recovered_at: '2026-11-04T08:00:00Z' })],
    ['2026-11-04', log('2026-11-04', 'skipped')],
  ])
  it('tells the days apart', () => {
    const h = { ...daily, rest_days: [0] }
    expect(dayKind(h, map, '2026-10-31', TODAY)).toBe('before')
    expect(dayKind(h, map, '2026-11-02', TODAY)).toBe('done')
    expect(dayKind(h, map, '2026-11-03', TODAY)).toBe('recovered')
    expect(dayKind(h, map, '2026-11-04', TODAY)).toBe('skipped')
    expect(dayKind(h, map, '2026-11-08', TODAY)).toBe('planned-rest')
    expect(dayKind(h, map, '2026-11-09', TODAY)).toBe('missed')
    expect(dayKind(h, map, TODAY, TODAY)).toBe('pending')
    expect(dayKind(h, map, '2026-11-13', TODAY)).toBe('upcoming')
  })
  it('monthMap lays out the month with the right leading blanks (Monday start)', () => {
    const m = monthMap(daily, [], '2026-11', TODAY, 1)
    expect(m.days).toHaveLength(30)
    expect(m.lead).toBe(6) // 1 Nov 2026 is a Sunday
    expect(monthMap(daily, [], '2026-11', TODAY, 0).lead).toBe(0)
  })
})

describe('weeklyConsistency', () => {
  it('uses the real schedule: rest days are left out and listed', () => {
    const habit = { ...daily, rest_days: [0] }
    const w = weeklyConsistency(habit, days('09', '10', '11'), TODAY, 1) // Mon 9th .. Sun 15th, today Thu
    expect(w.done).toBe(3)
    expect(w.expected).toBe(4) // Mon-Thu, the Thursday still open
    expect(w.rate).toBe(0.75)
    expect(w.neutral).toContain('1 planned rest')
  })
  it('weekly habits are judged against the target', () => {
    const habit = { ...daily, frequency: 'weekly', weekly_target: 4 }
    expect(weeklyConsistency(habit, days('09', '10'), TODAY, 1).rate).toBe(0.5)
  })
})

describe('recovery', () => {
  it('lists missed scheduled days inside the window, excluding rest, pauses, skips and today', () => {
    const habit = { ...daily, rest_days: [0], pauses: [{ start_date: '2026-11-10', end_date: '2026-11-10' }] }
    const logs = [log('2026-11-07', 'skipped')]
    expect(missedDays(habit, logs, TODAY)).toEqual(['2026-11-05', '2026-11-06', '2026-11-09', '2026-11-11'])
  })
  it('does not offer recovery for weekly or archived habits', () => {
    expect(missedDays({ ...daily, frequency: 'weekly' }, [], TODAY)).toEqual([])
    expect(missedDays({ ...daily, archived_at: 'x' }, [], TODAY)).toEqual([])
  })
  it('recoverable groups by habit and history lists made-up days newest first', () => {
    const stats = buildHabitStats([daily], [], TODAY)
    expect(recoverable(stats, TODAY)[0].dates.length).toBe(7)
    const logs = [
      log('2026-11-03', 'done', { id: 'a', recovered_at: '2026-11-05T10:00:00Z' }),
      log('2026-11-04', 'done', { id: 'b', recovered_at: '2026-11-06T10:00:00Z' }),
      log('2026-11-05'),
    ]
    const h = recoveryHistory([daily], logs)
    expect(h.map((r) => r.id)).toEqual(['b', 'a'])
    expect(h[0].daysLate).toBe(2)
  })
})

describe('records and counts', () => {
  it('computes personal records from the logs', () => {
    const r = personalRecords(
      daily,
      [...days('02', '03', '04', '09'), log('2026-11-05', 'done', { recovered_at: '2026-11-06T00:00:00Z' })],
      TODAY,
    )
    expect(r.totalDone).toBe(5)
    expect(r.longestStreak).toBe(4)
    expect(r.bestWeek).toEqual({ start: '2026-11-02', count: 4 })
    expect(r.bestMonth).toEqual({ month: '2026-11', count: 5 })
    expect(r.recovered).toBe(1)
    expect(r.firstDone).toBe('2026-11-02')
  })
  it('kindCounts partitions the range', () => {
    const c = kindCounts(daily, days('01', '02'), '2026-11-01', '2026-11-14', TODAY)
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(14)
    expect(c.upcoming).toBe(2)
    expect(c.missed).toBe(9)
  })
  it('explains the streak in words', () => {
    const e = explainStreak({ ...daily, rest_days: [0] }, days('10', '11', '12'), TODAY)
    expect(e.current).toBe(3)
    expect(e.lines.join(' ')).toMatch(/Planned rest days/)
    expect(e.lines.join(' ')).toMatch(/never edited/)
  })
})
