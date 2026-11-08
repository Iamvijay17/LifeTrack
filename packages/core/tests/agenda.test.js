import { describe, it, expect } from 'vitest'
import { todayAgenda, nextTimed } from '../src/agenda'

const D = '2026-11-04' // a Wednesday (weekday 3)
const tz = 'Asia/Kolkata'
const opts = { today: D, tz, workoutPlan: { 3: 'r1' } }
const task = (o) => ({ id: o.id ?? 't', title: 'x', status: 'pending', priority: 'medium', due_date: D, created_at: '2026-11-01T00:00:00Z', ...o })
const habit = (o) => ({ id: 'h1', name: 'Read', frequency: 'daily', start_date: '2026-01-01', days_of_week: [], weekly_target: 3, archived_at: null, ...o })

describe('todayAgenda', () => {
  it('is empty for an empty day', () => {
    expect(todayAgenda({}, { today: D, tz })).toMatchObject({ timed: [], anytime: [], done: [], total: 0, doneCount: 0 })
  })

  it('merges every kind, timed items on a rail by time, the rest under anytime', () => {
    const a = todayAgenda(
      {
        tasks: [task({ id: 'low', title: 'Low', priority: 'low' }), task({ id: 'hi', title: 'High', priority: 'high' }), task({ id: 'other', due_date: '2026-11-05' })],
        habits: [habit()],
        habitLogs: [],
        routines: [{ id: 'r1', name: 'Push day' }],
        applications: [{ id: 'a1', company: 'Google', status: 'interview', followup_date: D }],
        interviews: [{ id: 'i1', application_id: 'a1', round_name: 'Round 2', status: 'scheduled', scheduled_at: '2026-11-04T06:00:00Z' }], // 11:30 IST
        reminders: [{ id: 'r', title: 'Call bank', active: true, remind_date: D, remind_time: '18:00:00' }, { id: 'r2', title: 'Old', active: false, remind_date: D, remind_time: '09:00' }],
        topics: [{ id: 'tp', name: 'Graphs', archived: false, revision_dates: [D] }],
        recurringRules: [{ id: 'rr', active: true, next_date: D, note: 'Rent', category: 'Bills', amount_paise: 2000000, type: 'expense' }],
      },
      opts,
    )
    expect(a.timed.map((i) => [i.time, i.title])).toEqual([['11:30', 'Google · Round 2'], ['18:00', 'Call bank']])
    expect(a.anytime.map((i) => i.kind)).toEqual(['task', 'task', 'habit', 'workout', 'revision', 'followup', 'bill'])
    expect(a.anytime.filter((i) => i.kind === 'task').map((i) => i.title)).toEqual(['High', 'Low'])
    expect(a.anytime.find((i) => i.kind === 'workout').title).toBe('Push day')
    expect(a.total).toBe(9)
  })

  it('sinks finished items and counts them', () => {
    const a = todayAgenda(
      {
        tasks: [task({ id: 'd', status: 'done' }), task({ id: 'p' })],
        habits: [habit()],
        habitLogs: [{ habit_id: 'h1', log_date: D, status: 'done' }],
        workouts: [{ id: 'w', workout_date: D, status: 'completed', name: 'Legs' }],
        interviews: [{ id: 'i', application_id: 'x', status: 'completed', scheduled_at: '2026-11-04T06:00:00Z' }],
      },
      opts,
    )
    expect(a.anytime.map((i) => i.id)).toEqual(['p'])
    expect(a.done.map((i) => i.kind).sort()).toEqual(['habit', 'interview', 'task', 'workout'])
    expect(a).toMatchObject({ total: 5, doneCount: 4 })
  })

  it('leaves out what is not on the plan: skipped habits, rest days, cancelled work, closed applications', () => {
    const a = todayAgenda(
      {
        tasks: [task({ status: 'cancelled' }), task({ id: 's', status: 'skipped' })],
        habits: [habit(), habit({ id: 'old', archived_at: '2026-10-01T00:00:00Z' }), habit({ id: 'wk', frequency: 'custom', days_of_week: [1] })],
        habitLogs: [{ habit_id: 'h1', log_date: D, status: 'skipped' }],
        workouts: [{ id: 'w', workout_date: D, status: 'rest', name: 'Rest day' }],
        applications: [{ id: 'a', company: 'X', status: 'rejected', followup_date: D }],
        interviews: [{ id: 'i', application_id: 'a', status: 'cancelled', scheduled_at: '2026-11-04T06:00:00Z' }],
        recurringRules: [{ id: 'p', active: false, next_date: D }, { id: 'f', active: true, next_date: '2026-11-05' }],
      },
      opts,
    )
    expect(a.total).toBe(0)
  })

  it('shows no workout on a rest day in the plan', () => {
    expect(todayAgenda({}, { ...opts, workoutPlan: { 3: 'rest' } }).total).toBe(0)
  })

  it('places an interview on the user local day, not the UTC day', () => {
    // 20:30 UTC on the 3rd is 02:00 IST on the 4th
    const a = todayAgenda({ interviews: [{ id: 'i', application_id: 'x', status: 'scheduled', scheduled_at: '2026-11-03T20:30:00Z' }] }, opts)
    expect(a.timed.map((i) => i.time)).toEqual(['02:00'])
  })

  it('treats a reminder without a time as anytime', () => {
    const a = todayAgenda({ reminders: [{ id: 'r', title: 'Water plants', active: true, remind_date: D, remind_time: null }] }, { today: D, tz })
    expect(a.timed).toEqual([])
    expect(a.anytime).toHaveLength(1)
  })

  it('finds the next timed item', () => {
    const a = { timed: [{ time: '09:00' }, { time: '15:30' }] }
    expect(nextTimed(a, '10:00').time).toBe('15:30')
    expect(nextTimed(a, '16:00')).toBeNull()
  })
})
