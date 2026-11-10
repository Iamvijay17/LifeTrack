import { describe, expect, it } from 'vitest'
import { buildCalendarItems } from '@/domain/calendar'
import { zonedToMs } from '@/lib/dates'
import { blankValues, ruleFromValues, schema, toPayload, valuesFromItem } from '@/features/calendar/itemForm'

const TZ = 'Asia/Kolkata'
const prefs = { timezone: TZ, default_duration: 60, default_alert: null, time_format: '12h' }
const today = '2026-11-10'
const iso = (d, t, tz = TZ) => new Date(zonedToMs(d, t, tz)).toISOString()
const ok = (v) => schema.safeParse(v)
const errorsOf = (v) => Object.fromEntries(ok(v).error?.issues.map((i) => [i.path[0], i.message]) ?? [])
const valid = (o = {}) => ({
  ...blankValues({ kind: 'event', at: { date: today, startMin: 600, endMin: 660 }, prefs, today }),
  title: 'Standup',
  ...o,
})

describe('blankValues', () => {
  it('a clicked slot gives a timed event of the default length', () => {
    const v = blankValues({ kind: 'event', at: { date: '2026-11-12', startMin: 14 * 60 + 30 }, prefs, today })
    expect(v).toMatchObject({
      kind: 'event',
      all_day: false,
      start_date: '2026-11-12',
      start_time: '14:30',
      end_date: '2026-11-12',
      end_time: '15:30',
    })
    expect(
      blankValues({ kind: 'event', at: { date: today, startMin: 600 }, prefs: { ...prefs, default_duration: 30 }, today }).end_time,
    ).toBe('10:30')
  })
  it('a dragged-out range keeps both ends', () => {
    expect(blankValues({ kind: 'event', at: { date: today, startMin: 540, endMin: 645 }, prefs, today })).toMatchObject({
      start_time: '09:00',
      end_time: '10:45',
    })
  })
  it('only an explicit all-day request (the + on a month cell) starts an all-day event; New and Quick add start a timed one', () => {
    expect(blankValues({ kind: 'event', at: { date: '2026-11-20', allDay: true }, prefs, today }).all_day).toBe(true)
    expect(blankValues({ kind: 'event', at: { date: '2026-11-20', allDay: false }, prefs, today }).all_day).toBe(false)
    expect(blankValues({ kind: 'event', at: { date: '2026-11-20' }, prefs, today }).all_day).toBe(false)
    expect(blankValues({ kind: 'event', at: {}, prefs, today }).all_day).toBe(false)
  })
  it('a task starts untimed on its date, or timed when a slot was clicked', () => {
    expect(blankValues({ kind: 'task', at: { date: today }, prefs, today })).toMatchObject({
      kind: 'task',
      timed: false,
      start_date: today,
    })
    expect(blankValues({ kind: 'task', at: { date: today, startMin: 600 }, prefs, today })).toMatchObject({
      timed: true,
      start_time: '10:00',
      end_time: '11:00',
    })
  })
  it('the default alert from settings is pre-filled', () => {
    expect(
      blankValues({ kind: 'event', at: { date: today, startMin: 600 }, prefs: { ...prefs, default_alert: 15 }, today }).alerts,
    ).toEqual([15])
    expect(blankValues({ kind: 'event', at: {}, prefs, today }).alerts).toEqual([])
  })
})

describe('validation', () => {
  it('a valid event passes', () => expect(ok(valid()).success).toBe(true))
  it('needs a title', () => expect(errorsOf(valid({ title: '   ' })).title).toBe('Give it a title'))
  it('cannot end before it starts, on the same day or by date', () => {
    expect(errorsOf(valid({ start_time: '10:00', end_time: '09:00' })).end_time).toBe('End time must be after the start')
    expect(errorsOf(valid({ start_time: '10:00', end_time: '10:00' })).end_time).toBe('End time must be after the start')
    expect(errorsOf(valid({ end_date: '2026-11-09' })).end_date).toBe('It cannot end before it starts')
  })
  it('an event may end earlier in the day on a later date (overnight)', () => {
    expect(ok(valid({ start_time: '22:00', end_date: '2026-11-11', end_time: '01:00' })).success).toBe(true)
  })
  it('an all-day event needs no times', () => {
    expect(ok(valid({ all_day: true, start_time: '', end_time: '' })).success).toBe(true)
    expect(errorsOf(valid({ start_time: '', end_time: '' })).start_time).toBe('Pick a start time')
  })
  it('a custom weekly repeat needs at least one weekday; a custom interval is bounded', () => {
    expect(errorsOf(valid({ repeat: 'custom', r_freq: 'weekly', r_weekdays: [] })).r_weekdays).toBe('Choose at least one day')
    expect(ok(valid({ repeat: 'custom', r_freq: 'weekly', r_weekdays: [1, 3] })).success).toBe(true)
    expect(errorsOf(valid({ repeat: 'custom', r_interval: 0 })).r_interval).toBe('At least 1')
    expect(errorsOf(valid({ repeat: 'custom', r_interval: 100 })).r_interval).toBe('At most 100'.replace('100', '99'))
  })
  it('"ends on" needs a date that is not before the start', () => {
    expect(errorsOf(valid({ repeat: 'daily', ends: 'on', ends_on: '' })).ends_on).toBe('Pick an end date')
    expect(errorsOf(valid({ repeat: 'daily', ends: 'on', ends_on: '2026-11-01' })).ends_on).toBe('Must be on or after the start date')
    expect(ok(valid({ repeat: 'daily', ends: 'on', ends_on: '2026-12-01' })).success).toBe(true)
  })
  it('a task can have no date; a timed or repeating task needs one', () => {
    const task = { ...valid(), kind: 'task', start_date: '', timed: false }
    expect(ok(task).success).toBe(true)
    expect(errorsOf({ ...task, timed: true }).start_date).toBe('Pick a date')
    expect(errorsOf({ ...task, repeat: 'weekly' }).start_date).toBe('Repeating tasks need a date')
  })
  it('a task time range must be in order', () => {
    expect(errorsOf({ ...valid(), kind: 'task', timed: true, start_time: '11:00', end_time: '10:00' }).end_time).toBe(
      'End time must be after the start',
    )
  })
  it('a link needs a record', () => {
    expect(errorsOf(valid({ link_type: 'goal', link_id: '' })).link_id).toBe('Choose which one')
  })
  it('limits alerts to five', () => {
    expect(ok(valid({ alerts: [0, 5, 10, 15, 30, 60] })).success).toBe(false)
  })
})

describe('toPayload: what is saved', () => {
  it("an event becomes instants in the user's timezone and keeps that timezone", () => {
    const { kind, values } = toPayload(valid({ start_time: '09:00', end_time: '10:30' }), { tz: TZ })
    expect(kind).toBe('event')
    expect(values).toMatchObject({
      title: 'Standup',
      all_day: false,
      starts_at: '2026-11-10T03:30:00.000Z',
      ends_at: '2026-11-10T05:00:00.000Z',
      timezone: TZ,
      rrule: null,
      color: null,
    })
  })
  it('the same wall-clock time is a different instant in another timezone', () => {
    const { values } = toPayload(valid({ start_time: '09:00', end_time: '10:00' }), { tz: 'America/New_York' })
    expect(values.starts_at).toBe('2026-11-10T14:00:00.000Z')
  })
  it('an all-day event runs from local midnight to local midnight after its last day', () => {
    const { values } = toPayload(valid({ all_day: true, start_date: '2026-11-10', end_date: '2026-11-12' }), { tz: TZ })
    expect(values.starts_at).toBe(iso('2026-11-10', '00:00'))
    expect(values.ends_at).toBe(iso('2026-11-13', '00:00'))
  })
  it('turns repeat choices into a rule', () => {
    const pay = (o) => toPayload(valid(o), { tz: TZ }).values.rrule
    expect(pay({ repeat: 'none' })).toBeNull()
    expect(pay({ repeat: 'daily' })).toEqual({ freq: 'daily' })
    expect(pay({ repeat: 'weekdays' })).toEqual({ freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] })
    expect(pay({ repeat: 'weekly' })).toEqual({ freq: 'weekly', byWeekday: [2] }) // 10 Nov 2026 is a Tuesday
    expect(pay({ repeat: 'yearly', ends: 'on', ends_on: '2030-11-10' })).toEqual({ freq: 'yearly', until: '2030-11-10' })
    expect(pay({ repeat: 'custom', r_freq: 'weekly', r_interval: '2', r_weekdays: [5, 1] })).toEqual({
      freq: 'weekly',
      interval: 2,
      byWeekday: [1, 5],
    })
    expect(pay({ repeat: 'custom', r_freq: 'monthly', r_monthly: 'weekday', ends: 'after', ends_after: '6' })).toEqual({
      freq: 'monthly',
      interval: 1,
      monthlyBy: 'weekday',
      count: 6,
    })
  })
  it('a link sets exactly one column; the others are cleared', () => {
    const { values } = toPayload(valid({ link_type: 'application', link_id: 'app-1' }), { tz: TZ })
    expect(values).toMatchObject({ goal_id: null, topic_id: null, application_id: 'app-1', routine_id: null })
  })
  it('alerts are sorted, a custom category keeps its name, others drop it', () => {
    expect(toPayload(valid({ alerts: [60, 5] }), { tz: TZ }).values.alert_minutes).toEqual([5, 60])
    expect(toPayload(valid({ category: 'custom', category_label: '  Reading club ' }), { tz: TZ }).values).toMatchObject({
      category: 'custom',
      category_label: 'Reading club',
    })
    expect(toPayload(valid({ category: 'health', category_label: 'ignored' }), { tz: TZ }).values.category_label).toBe('')
  })
  it('a task is saved as a task: category mapped back, time optional, repeat limited to what tasks support', () => {
    const base = { ...valid(), kind: 'task', category: 'jobs', start_date: today, timed: true, start_time: '09:00', end_time: '09:45' }
    expect(toPayload(base, { tz: TZ })).toEqual({
      kind: 'task',
      values: {
        title: 'Standup',
        notes: '',
        category: 'Job Search',
        priority: 'medium',
        color: null,
        location: '',
        due_date: today,
        start_time: '09:00',
        end_time: '09:45',
        alert_minutes: [],
        recurrence: 'none',
        recurrence_until: null,
      },
    })
    expect(toPayload({ ...base, timed: false }, { tz: TZ }).values).toMatchObject({ start_time: null, end_time: null })
    expect(toPayload({ ...base, start_date: '', timed: true }, { tz: TZ }).values).toMatchObject({ due_date: null, start_time: null })
    expect(toPayload({ ...base, repeat: 'yearly', ends: 'on', ends_on: '2030-01-01' }, { tz: TZ }).values).toMatchObject({
      recurrence: 'yearly',
      recurrence_until: '2030-01-01',
    })
    expect(toPayload({ ...base, category: 'routine' }, { tz: TZ }).values.category).toBe('Routine')
  })
})

describe('valuesFromItem: editing what is already there', () => {
  const event = {
    id: 'e1',
    title: 'Review',
    description: 'Notes',
    location: 'Room 4',
    category: 'learning',
    category_label: '',
    priority: 'high',
    color: '#EF4444',
    all_day: false,
    timezone: TZ,
    starts_at: iso('2026-11-09', '09:00'),
    ends_at: iso('2026-11-09', '10:00'),
    rrule: { freq: 'weekly', interval: 2, byWeekday: [1, 3], until: '2027-01-31' },
    alert_minutes: [10, 60],
    goal_id: 'g1',
    topic_id: null,
    application_id: null,
    routine_id: null,
  }
  const item = () => buildCalendarItems({ events: [event] }, { from: '2026-11-09', to: '2026-11-09', tz: TZ, today, nowMs: 0 })[0]

  it('an occurrence of a repeating event loads its own date and the series rule', () => {
    const v = valuesFromItem(item())
    expect(v).toMatchObject({
      kind: 'event',
      title: 'Review',
      start_date: '2026-11-09',
      start_time: '09:00',
      end_time: '10:00',
      priority: 'high',
      color: '#EF4444',
      repeat: 'custom',
      r_freq: 'weekly',
      r_interval: 2,
      r_weekdays: [1, 3],
      ends: 'on',
      ends_on: '2027-01-31',
      alerts: [10, 60],
      link_type: 'goal',
      link_id: 'g1',
    })
    expect(ok(v).success).toBe(true)
  })
  it('loading and saving without changes gives back the same event', () => {
    const { values } = toPayload(valuesFromItem(item()), { tz: TZ })
    expect(values).toMatchObject({
      title: 'Review',
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      rrule: { freq: 'weekly', interval: 2, byWeekday: [1, 3], until: '2027-01-31' },
      alert_minutes: [10, 60],
      goal_id: 'g1',
      category: 'learning',
      priority: 'high',
      color: '#EF4444',
      location: 'Room 4',
      description: 'Notes',
    })
  })
  it('a task loads from its row, timed or not', () => {
    const row = {
      id: 't1',
      title: 'Report',
      notes: 'n',
      category: 'Gym',
      priority: 'urgent',
      status: 'pending',
      due_date: today,
      start_time: '07:00:00',
      end_time: '08:00:00',
      color: null,
      location: '',
      alert_minutes: [15],
      recurrence: 'weekly',
      recurrence_until: '2026-12-31',
    }
    const [it] = buildCalendarItems({ tasks: [row] }, { from: today, to: today, tz: TZ, today, nowMs: 0 })
    expect(valuesFromItem(it)).toMatchObject({
      kind: 'task',
      timed: true,
      start_time: '07:00',
      end_time: '08:00',
      category: 'fitness',
      priority: 'urgent',
      alerts: [15],
      repeat: 'weekly',
      ends: 'on',
      ends_on: '2026-12-31',
    })
    expect(valuesFromItem({ ...it, row: { ...row, start_time: null, end_time: null, due_date: null } })).toMatchObject({
      timed: false,
      start_date: '',
    })
  })
  it('ruleFromValues is the inverse of the loaded fields', () => {
    expect(ruleFromValues(valuesFromItem(item()), '2026-11-09')).toEqual({
      freq: 'weekly',
      interval: 2,
      byWeekday: [1, 3],
      until: '2027-01-31',
    })
  })
})
