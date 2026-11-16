import { describe, expect, it } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import { checkPlacement, dismissKey, importanceScore, isSlipped, planRecovery, projectLoads, recoveryConfig, rescheduleKey, sameSlot, slipCounts } from '../src/recovery'

const TZ = 'Asia/Kolkata'
const TODAY = '2026-11-10' // a Tuesday
const NOW = zonedToMs(TODAY, '10:00', TZ)
const o = { today: TODAY, tz: TZ, nowMs: NOW }
const iso = (d, t, tz = TZ) => new Date(zonedToMs(d, t, tz)).toISOString()
let n = 0
const task = (x) => ({ id: `t${++n}`, title: `Task ${n}`, status: 'pending', priority: 'medium', created_at: `2026-11-0${(n % 9) + 1}T00:00:00Z`, due_date: '2026-11-08', start_time: null, end_time: null, series_id: null, ...x })
const event = (x) => ({ id: `e${++n}`, title: 'Meeting', starts_at: iso(TODAY, '12:00'), ends_at: iso(TODAY, '13:00'), timezone: TZ, all_day: false, rrule: null, category: 'personal', priority: 'medium', alert_minutes: [], ...x })
const plan = (d, extra = {}) => planRecovery({ tasks: [], ...d }, { ...o, ...extra })

describe('what counts as slipped', () => {
  it('flags open tasks dated before today and timed ones whose end has passed', () => {
    const c = { today: TODAY, tz: TZ, nowMs: NOW }
    expect(isSlipped(task({}), c)).toBe(true)
    expect(isSlipped(task({ status: 'in_progress' }), c)).toBe(true)
    expect(isSlipped(task({ due_date: TODAY, start_time: '08:00', end_time: '09:00' }), c)).toBe(true)
    expect(isSlipped(task({ due_date: TODAY, start_time: '11:00', end_time: '12:00' }), c)).toBe(false)
    expect(isSlipped(task({ due_date: TODAY }), c)).toBe(false) // date only: still has the whole day
    expect(isSlipped(task({ status: 'done' }), c)).toBe(false)
    expect(isSlipped(task({ status: 'skipped' }), c)).toBe(false)
    expect(isSlipped(task({ due_date: null }), c)).toBe(false)
  })
  it('uses the user\'s midnight, not the server\'s', () => {
    // 23:30 on the 9th in Kolkata is 18:00 UTC on the 9th; 00:30 on the 10th Kolkata is still the 9th in UTC
    const justAfterMidnight = zonedToMs(TODAY, '00:30', TZ)
    const p = planRecovery({ tasks: [task({ due_date: '2026-11-09' })] }, { today: TODAY, tz: TZ, nowMs: justAfterMidnight })
    expect(p.suggestions).toHaveLength(1)
    expect(p.suggestions[0].daysOverdue).toBe(1)
    expect(p.suggestions[0].to).toMatchObject({ date: TODAY, start: '09:00' }) // today's window is still ahead
  })
})

describe('ranking', () => {
  it('orders by priority first, then lateness, then past slips', () => {
    const urgent = task({ priority: 'urgent', due_date: '2026-11-09' })
    const lateLow = task({ priority: 'low', due_date: '2026-10-01' })
    const med = task({ priority: 'medium', due_date: '2026-11-09' })
    const p = plan({ tasks: [lateLow, med, urgent] })
    expect(p.suggestions.map((s) => s.taskId)).toEqual([urgent.id, med.id, lateLow.id])
  })
  it('explains the score and lets slips and in-progress work push a task up', () => {
    const t = task({ priority: 'high', status: 'in_progress', due_date: '2026-11-07' })
    const s = importanceScore(t, { today: TODAY, slips: 2 })
    expect(s.daysOverdue).toBe(3)
    expect(s.reasons).toEqual(['High priority', '3 days overdue', 'Already moved 2 times', 'In progress'])
    expect(s.score).toBeGreaterThan(importanceScore({ ...t, status: 'pending' }, { today: TODAY, slips: 0 }).score)
  })
})

describe('free slots', () => {
  it('starts after now today, in 15-minute steps, inside working hours', () => {
    const p = plan({ tasks: [task({})] })
    expect(p.suggestions[0].to).toEqual({ date: TODAY, start: '10:15', end: '11:15' })
  })
  it('never lands on a fixed event, an interview or a timed task, and respects the other suggestions', () => {
    const d = {
      tasks: [task({ title: 'A', priority: 'high' }), task({ title: 'B' }), task({ id: 'timed', due_date: TODAY, start_time: '14:00', end_time: '15:00' })],
      events: [event({ starts_at: iso(TODAY, '10:30'), ends_at: iso(TODAY, '12:00') })],
      interviews: [{ id: 'iv', status: 'scheduled', scheduled_at: iso(TODAY, '12:00'), application_id: 'a' }],
      applications: [{ id: 'a', company: 'Acme' }],
    }
    const p = plan(d)
    const [a, b] = p.suggestions
    expect(a.to).toEqual({ date: TODAY, start: '13:00', end: '14:00' }) // event until 12:00, interview 12–13
    expect(b.to).toEqual({ date: TODAY, start: '15:00', end: '16:00' }) // timed task at 14:00 and A before it
    expect(a.to.end <= b.to.start || b.to.end <= a.to.start).toBe(true)
  })
  it('moves on to the next day when today has no time left', () => {
    const late = zonedToMs(TODAY, '17:30', TZ)
    const p = planRecovery({ tasks: [task({})] }, { today: TODAY, tz: TZ, nowMs: late })
    expect(p.suggestions[0].to).toEqual({ date: '2026-11-11', start: '09:00', end: '10:00' })
  })
  it('reports when nothing fits, instead of inventing a slot', () => {
    const p = planRecovery({ tasks: [task({})], events: [event({ starts_at: iso(TODAY, '00:00'), ends_at: iso('2026-11-11', '00:00') })] }, { ...o, prefs: { recovery_horizon_days: 1 } })
    expect(p.suggestions[0].to).toBeNull()
    expect(p.suggestions[0].reasons.at(-1)).toMatch(/No free time/)
  })
  it('keeps the duration of a timed task and falls back to the default for a dated one', () => {
    const timed = task({ due_date: '2026-11-09', start_time: '09:00', end_time: '10:30' })
    const p = plan({ tasks: [timed, task({})] }, { prefs: { default_duration: 45 } })
    const byId = Object.fromEntries(p.suggestions.map((s) => [s.taskId, s]))
    expect(byId[timed.id].durationMin).toBe(90)
    expect(p.suggestions.find((s) => s.taskId !== timed.id).durationMin).toBe(45)
  })
  it('skips weekends when asked', () => {
    const friEvening = zonedToMs('2026-11-13', '17:45', TZ)
    const p = planRecovery({ tasks: [task({})] }, { today: '2026-11-13', tz: TZ, nowMs: friEvening, prefs: { recovery_skip_weekends: true } })
    expect(p.suggestions[0].to.date).toBe('2026-11-16') // Monday
  })
  it('offers alternatives that are free too, one per day', () => {
    const p = plan({ tasks: [task({})] })
    const alt = p.suggestions[0].alternatives
    expect(alt.length).toBeGreaterThan(1)
    expect(new Set(alt.map((a) => a.date)).size).toBe(alt.length)
    expect(alt[0].date).toBe(TODAY) // the next free time on the same day first
  })
})

describe('fixed things are preserved', () => {
  it('expands recurring events (with a cancelled occurrence) and never suggests over them', () => {
    const series = event({ id: 'daily', starts_at: iso('2026-11-01', '09:00'), ends_at: iso('2026-11-01', '18:00'), rrule: { freq: 'daily', interval: 1 } })
    const exceptions = [{ id: 'x', event_id: 'daily', occurrence_date: '2026-11-11', status: 'cancelled' }]
    const p = plan({ tasks: [task({})], events: [series], exceptions })
    expect(p.suggestions[0].to).toEqual({ date: '2026-11-11', start: '09:00', end: '10:00' }) // today is blocked by the series; the 11th was cancelled
  })
  it('never modifies habits or events (the plan is read-only) and habits only add load', () => {
    const habit = { id: 'h', name: 'Read', frequency: 'daily', start_date: '2026-10-01', archived_at: null, days_of_week: [] }
    const before = JSON.stringify([habit])
    const p = plan({ tasks: [task({})], habits: [habit] })
    expect(JSON.stringify([habit])).toBe(before)
    expect(p.days[0].habitMin).toBe(15)
  })
  it('does not count a habit that is already logged', () => {
    const habit = { id: 'h', name: 'Read', frequency: 'daily', start_date: '2026-10-01', archived_at: null, days_of_week: [] }
    const p = plan({ habits: [habit], habitLogs: [{ habit_id: 'h', log_date: TODAY, status: 'done' }] })
    expect(p.days[0].habitMin).toBe(0)
    expect(p.days[1].habitMin).toBe(15)
  })
})

describe('overloaded days', () => {
  const heavy = () => Array.from({ length: 6 }, (_, i) => task({ title: `Chore ${i}`, due_date: '2026-11-12', priority: i < 1 ? 'high' : 'low' })) // 6 × 60 min
  it('detects a day over capacity and lifts the least important flexible tasks to a day with room', () => {
    const p = plan({ tasks: heavy(), events: [event({ starts_at: iso('2026-11-12', '09:00'), ends_at: iso('2026-11-12', '13:00') })] })
    const day = p.days.find((x) => x.date === '2026-11-12')
    expect(day.level).toBe('over')
    expect(p.overloaded).toBe(1)
    const moves = p.suggestions.filter((s) => s.kind === 'rebalance')
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((s) => s.priority === 'low' && s.to.date > '2026-11-12')).toBe(true)
    expect(p.daysAfter.find((x) => x.date === '2026-11-12').load).toBeLessThanOrEqual(day.capacity)
  })
  it('does not move urgent, high, started, timed or repeating tasks off a busy day', () => {
    const keep = [task({ due_date: '2026-11-12', priority: 'urgent' }), task({ due_date: '2026-11-12', priority: 'high' }), task({ due_date: '2026-11-12', status: 'in_progress' }), task({ due_date: '2026-11-12', series_id: 's' })]
    const many = Array.from({ length: 6 }, () => task({ due_date: '2026-11-12', priority: 'urgent' }))
    const p = plan({ tasks: [...keep, ...many] })
    expect(p.suggestions.filter((s) => s.kind === 'rebalance')).toHaveLength(0)
  })
  it('keeps recovered work off days that are already full when there is room elsewhere', () => {
    const full = Array.from({ length: 8 }, () => task({ due_date: TODAY, priority: 'urgent' })) // 8 h today
    const p = plan({ tasks: [...full, task({ priority: 'low' })] })
    const s = p.suggestions.find((x) => x.kind === 'recover')
    expect(s.to.date).toBe('2026-11-11')
  })
  it('projects loads for a chosen subset of changes', () => {
    const p = plan({ tasks: [task({})] })
    const after = projectLoads(p.days, [p.suggestions[0]])
    expect(after[0].load).toBe(p.days[0].load + 60)
    expect(projectLoads(p.days, [])[0].load).toBe(p.days[0].load)
  })
})

describe('history: rejection, repeats and duplicates', () => {
  it('hides a rejected suggestion until the quiet period ends, and shows it again if the task changed', () => {
    const t = task({})
    const dismissed = { id: 'h1', task_id: t.id, action: 'dismissed', from_date: t.due_date, from_start: null, hide_until: '2026-11-12', undone_at: null }
    expect(plan({ tasks: [t], reschedules: [dismissed] }).suggestions).toHaveLength(0)
    expect(plan({ tasks: [t], reschedules: [dismissed] }).hiddenCount).toBe(1)
    expect(planRecovery({ tasks: [t], reschedules: [dismissed] }, { today: '2026-11-13', tz: TZ, nowMs: zonedToMs('2026-11-13', '10:00', TZ) }).suggestions).toHaveLength(1)
    expect(plan({ tasks: [{ ...t, due_date: '2026-11-07' }], reschedules: [dismissed] }).suggestions).toHaveLength(1)
    expect(plan({ tasks: [t], reschedules: [{ ...dismissed, undone_at: '2026-11-10T00:00:00Z' }] }).suggestions).toHaveLength(1)
  })
  it('counts earlier moves as slips, ignoring undone ones', () => {
    const rows = [
      { task_id: 'a', action: 'rescheduled', undone_at: null },
      { task_id: 'a', action: 'rescheduled', undone_at: null },
      { task_id: 'a', action: 'rescheduled', undone_at: 'x' },
      { task_id: 'a', action: 'dismissed', undone_at: null },
    ]
    expect(slipCounts(rows).get('a')).toBe(2)
  })
  it('builds one key per move and per rejection', () => {
    const from = { date: '2026-11-08', start: null, end: null }
    expect(rescheduleKey('t', from, { date: TODAY, start: '10:15' })).toBe('rs:t:2026-11-08:-:2026-11-10:10:15')
    expect(dismissKey('t', from, '2026-11-13')).toBe('dismiss:t:2026-11-08:-:2026-11-13')
  })
  it('recognises when a task is still where the suggestion found it', () => {
    const t = task({ due_date: '2026-11-08', start_time: '09:00:00', end_time: '10:00:00' })
    expect(sameSlot(t, { date: '2026-11-08', start: '09:00', end: '10:00' })).toBe(true)
    expect(sameSlot({ ...t, due_date: '2026-11-09' }, { date: '2026-11-08', start: '09:00', end: '10:00' })).toBe(false)
    expect(sameSlot(null, { date: 'x' })).toBe(false)
  })
})

describe('checkPlacement', () => {
  const base = () => ({ tasks: [task({ id: 'mv' }), task({ id: 'other', due_date: TODAY, start_time: '14:00', end_time: '15:00' })], events: [event()] })
  const check = (d, p, opts) => checkPlacement(d, o, { taskId: 'mv', ...p }, opts)
  const codes = (r) => r.errors.map((e) => e.code)
  it('accepts a free slot', () => expect(check(base(), { date: TODAY, start: '16:00', end: '17:00' }).ok).toBe(true))
  it('rejects overlaps with events and timed tasks, naming them', () => {
    const r = check(base(), { date: TODAY, start: '12:30', end: '13:30' })
    expect(codes(r)).toEqual(['overlap'])
    expect(r.errors[0].message).toMatch(/Meeting/)
    expect(codes(check(base(), { date: TODAY, start: '14:30', end: '15:30' }))).toEqual(['overlap'])
    expect(check(base(), { date: TODAY, start: '13:00', end: '14:00' }).ok).toBe(true) // touching is fine
  })
  it('rejects the past, bad times and finished or missing tasks', () => {
    expect(codes(check(base(), { date: TODAY, start: '09:00', end: '10:00' }))).toContain('past')
    expect(codes(check(base(), { date: '2026-11-09', start: '16:00', end: '17:00' }))).toContain('past')
    expect(codes(check(base(), { date: TODAY, start: '17:00', end: '16:00' }))).toEqual(['bad_time'])
    expect(codes(check(base(), { date: 'nope', start: '17:00', end: '18:00' }))).toEqual(['bad_time'])
    expect(codes(checkPlacement(base(), o, { taskId: 'ghost', date: TODAY, start: '16:00', end: '17:00' }))).toEqual(['missing'])
    const done = { tasks: [task({ id: 'mv', status: 'done' })] }
    expect(codes(check(done, { date: TODAY, start: '16:00', end: '17:00' }))).toEqual(['closed'])
  })
  it('rejects overlaps inside the same batch, and a task conflicting with itself is fine', () => {
    const accepted = [{ taskId: 'x', date: TODAY, start: '16:00', end: '17:00' }]
    expect(codes(check(base(), { date: TODAY, start: '16:30', end: '17:30' }, { accepted }))).toEqual(['overlap_batch'])
    const timedSelf = { tasks: [task({ id: 'mv', due_date: TODAY, start_time: '16:00', end_time: '17:00' })] }
    expect(check(timedSelf, { date: TODAY, start: '16:15', end: '17:15' }).ok).toBe(true)
  })
  it('warns, but allows, outside working hours or on a day that would overflow', () => {
    expect(check(base(), { date: TODAY, start: '19:00', end: '20:00' }).warnings.map((w) => w.code)).toEqual(['outside_hours'])
    const busy = { tasks: [task({ id: 'mv' }), ...Array.from({ length: 8 }, () => task({ due_date: '2026-11-11' }))] }
    const r = check(busy, { date: '2026-11-11', start: '09:00', end: '10:00' })
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.code)).toContain('overloaded')
  })
  it('refuses to put a repeating task on a day that already has its occurrence', () => {
    const d = { tasks: [task({ id: 'mv', series_id: 's' }), task({ id: 'sib', series_id: 's', due_date: '2026-11-12' })] }
    expect(codes(check(d, { date: '2026-11-12', start: '10:00', end: '11:00' }))).toEqual(['series'])
  })
  it('refuses a wall-clock time that does not exist when the clocks change', () => {
    // US spring forward: 2026-03-08 02:30 does not exist in New York
    const ny = { today: '2026-03-07', tz: 'America/New_York', nowMs: zonedToMs('2026-03-07', '10:00', 'America/New_York') }
    const d = { tasks: [task({ id: 'mv', due_date: '2026-03-01' })] }
    expect(checkPlacement(d, ny, { taskId: 'mv', date: '2026-03-08', start: '02:30', end: '03:30' }).errors.map((e) => e.code)).toContain('dst')
    expect(checkPlacement(d, ny, { taskId: 'mv', date: '2026-03-08', start: '03:30', end: '04:30' }).ok).toBe(true)
  })
  it('does not offer a slot that does not exist on a clock-change day', () => {
    const ny = { today: '2026-03-08', tz: 'America/New_York', nowMs: zonedToMs('2026-03-08', '00:10', 'America/New_York'), prefs: { recovery_work_start: '02:00', recovery_work_end: '05:00' } }
    const p = planRecovery({ tasks: [task({ due_date: '2026-03-01' })] }, ny)
    expect(p.suggestions[0].to).toEqual({ date: '2026-03-08', start: '03:00', end: '04:00' }) // 02:00–02:45 never happen
  })
})

describe('settings', () => {
  it('reads and clamps calendar_prefs', () => {
    const c = recoveryConfig({ recovery_work_start: '08:00', recovery_work_end: '20:00', recovery_capacity_hours: 6, recovery_horizon_days: 99, default_duration: 5 })
    expect(c).toMatchObject({ workStart: 480, workEnd: 1200, capacityMinutes: 360, horizonDays: 30, defaultDuration: 15 })
    expect(recoveryConfig({ recovery_work_start: '18:00', recovery_work_end: '09:00' })).toMatchObject({ workStart: 540, workEnd: 1080 })
    expect(recoveryConfig(undefined).horizonDays).toBe(7)
  })
})
