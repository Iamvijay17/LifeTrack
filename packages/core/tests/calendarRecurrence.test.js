import { describe, expect, it } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import {
  countBefore,
  describeRule,
  exceptionOverrides,
  expandEvent,
  isOccurrenceDate,
  lastOccurrence,
  normalizeRule,
  occurrenceDates,
  presetOf,
  ruleBefore,
  ruleFrom,
  ruleFromPreset,
  shiftSeries,
} from '../src/calendarRecurrence'

const dates = (rule, start, from, to) => occurrenceDates(rule, start, from, to)

describe('occurrenceDates', () => {
  it('no rule means a single occurrence on the start date', () => {
    expect(dates(null, '2026-11-10', '2026-11-01', '2026-11-30')).toEqual(['2026-11-10'])
    expect(dates(null, '2026-11-10', '2026-11-11', '2026-11-30')).toEqual([])
  })
  it('daily, with an interval', () => {
    expect(dates({ freq: 'daily' }, '2026-11-10', '2026-11-10', '2026-11-13')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])
    expect(dates({ freq: 'daily', interval: 3 }, '2026-11-10', '2026-11-10', '2026-11-20')).toEqual(['2026-11-10', '2026-11-13', '2026-11-16', '2026-11-19'])
  })
  it('never lists a date before the start, even when asked about an earlier window', () => {
    expect(dates({ freq: 'daily' }, '2026-11-10', '2026-10-01', '2026-11-11')).toEqual(['2026-11-10', '2026-11-11'])
  })
  it('weekly on chosen weekdays (Mon, Wed, Fri)', () => {
    const rule = { freq: 'weekly', byWeekday: [1, 3, 5] }
    // 2026-11-09 is a Monday
    expect(dates(rule, '2026-11-09', '2026-11-09', '2026-11-22')).toEqual(['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20'])
  })
  it('every 2 weeks only lands on alternate weeks (weeks run Monday to Sunday)', () => {
    const rule = { freq: 'weekly', interval: 2, byWeekday: [2, 4] }
    expect(dates(rule, '2026-11-10', '2026-11-10', '2026-12-10')).toEqual(['2026-11-10', '2026-11-12', '2026-11-24', '2026-11-26', '2026-12-08', '2026-12-10'])
  })
  it('the start date is always the first occurrence, even if its weekday is not ticked', () => {
    // 2026-11-11 is a Wednesday, the rule says Mondays
    expect(dates({ freq: 'weekly', byWeekday: [1] }, '2026-11-11', '2026-11-11', '2026-11-24')).toEqual(['2026-11-11', '2026-11-16', '2026-11-23'])
  })
  it('weekdays preset skips weekends', () => {
    const rule = ruleFromPreset('weekdays', '2026-11-13')
    expect(dates(rule, '2026-11-13', '2026-11-13', '2026-11-18')).toEqual(['2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18'])
  })
  it('monthly clamps to the last day of short months and returns to the 31st', () => {
    expect(dates({ freq: 'monthly' }, '2027-01-31', '2027-01-01', '2027-05-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'])
    expect(dates({ freq: 'monthly' }, '2028-01-31', '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
  })
  it('monthly on the nth weekday: the second Tuesday, and the last Friday', () => {
    expect(dates({ freq: 'monthly', monthlyBy: 'weekday' }, '2026-11-10', '2026-11-01', '2027-02-28')).toEqual(['2026-11-10', '2026-12-08', '2027-01-12', '2027-02-09'])
    // 2026-10-30 is the last (5th) Friday of October
    expect(dates({ freq: 'monthly', monthlyBy: 'weekday' }, '2026-10-30', '2026-10-01', '2027-01-31')).toEqual(['2026-10-30', '2026-11-27', '2026-12-25', '2027-01-29'])
  })
  it('every 2 months and every 3 months cross the year end', () => {
    expect(dates({ freq: 'monthly', interval: 2 }, '2026-11-15', '2026-11-01', '2027-05-31')).toEqual(['2026-11-15', '2027-01-15', '2027-03-15', '2027-05-15'])
  })
  it('yearly keeps 29 Feb on 28 Feb in other years and returns in the next leap year', () => {
    expect(dates({ freq: 'yearly' }, '2028-02-29', '2028-01-01', '2032-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })
  it('until is inclusive and wins over later dates', () => {
    expect(dates({ freq: 'daily', until: '2026-11-12' }, '2026-11-10', '2026-11-01', '2026-12-31')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
  })
  it('count includes the first occurrence, including when the window starts later', () => {
    expect(dates({ freq: 'daily', count: 3 }, '2026-11-10', '2026-11-01', '2026-12-31')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
    expect(dates({ freq: 'weekly', byWeekday: [1, 3], count: 4 }, '2026-11-09', '2026-11-12', '2026-12-31')).toEqual(['2026-11-16', '2026-11-18'])
  })
  it('jumping to a far-away window gives the same answer as walking from the start', () => {
    for (const rule of [{ freq: 'daily', interval: 3 }, { freq: 'weekly', interval: 2, byWeekday: [1, 4] }, { freq: 'monthly', interval: 5 }, { freq: 'monthly', monthlyBy: 'weekday' }, { freq: 'yearly', interval: 2 }]) {
      const start = '2020-03-10'
      const all = occurrenceDates(rule, start, start, '2034-12-31')
      expect(dates(rule, start, '2031-06-01', '2034-12-31'), JSON.stringify(rule)).toEqual(all.filter((d) => d >= '2031-06-01'))
    }
  })
  it('a never-ending rule only ever computes the window asked for', () => {
    const t = Date.now()
    expect(dates({ freq: 'daily' }, '2000-01-01', '2036-01-01', '2036-01-31')).toHaveLength(31)
    expect(Date.now() - t).toBeLessThan(500)
  })
  it('a rule that ends before it starts produces nothing', () => {
    expect(dates({ freq: 'daily', until: '2026-11-01' }, '2026-11-10', '2026-01-01', '2026-12-31')).toEqual([])
  })
})

describe('rule helpers', () => {
  it('presets round-trip', () => {
    const start = '2026-11-10' // a Tuesday
    for (const p of ['daily', 'weekdays', 'weekly', 'monthly', 'yearly']) expect(presetOf(ruleFromPreset(p, start), start)).toBe(p)
    expect(presetOf(null, start)).toBe('none')
    expect(presetOf({ freq: 'daily', interval: 2 }, start)).toBe('custom')
    expect(presetOf({ freq: 'weekly', byWeekday: [1, 3] }, start)).toBe('custom')
    expect(presetOf({ freq: 'monthly', monthlyBy: 'weekday' }, start)).toBe('custom')
    expect(presetOf({ freq: 'daily', until: '2027-01-01' }, start)).toBe('daily') // how it ends does not make it custom
  })
  it('normalizeRule fills defaults', () => {
    expect(normalizeRule({ freq: 'weekly' }, '2026-11-10')).toEqual({ freq: 'weekly', interval: 1, until: null, count: null, byWeekday: [2] })
    expect(normalizeRule({ freq: 'monthly' }, '2026-11-10')).toMatchObject({ monthlyBy: 'date' })
  })
  it('describes rules in plain language', () => {
    expect(describeRule(null, '2026-11-10')).toBe('Does not repeat')
    expect(describeRule({ freq: 'daily' }, '2026-11-10')).toBe('Every day')
    expect(describeRule({ freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] }, '2026-11-10')).toBe('Every weekday')
    expect(describeRule({ freq: 'weekly', interval: 2, byWeekday: [1, 3] }, '2026-11-10')).toBe('Every 2 weeks on Mon, Wed')
    expect(describeRule({ freq: 'monthly', monthlyBy: 'weekday' }, '2026-11-10')).toBe('Every month on the second Tuesday')
    expect(describeRule({ freq: 'monthly' }, '2026-11-10', (d) => d)).toBe('Every month on day 10')
    expect(describeRule({ freq: 'yearly', until: '2030-01-01' }, '2026-11-10')).toBe('Every year until 2030-01-01')
    expect(describeRule({ freq: 'daily', count: 5 }, '2026-11-10')).toBe('Every day, 5 times')
  })
  it('isOccurrenceDate, countBefore and lastOccurrence', () => {
    const rule = { freq: 'weekly', byWeekday: [1], count: 4 }
    expect(isOccurrenceDate(rule, '2026-11-02', '2026-11-16')).toBe(true)
    expect(isOccurrenceDate(rule, '2026-11-02', '2026-11-17')).toBe(false)
    expect(isOccurrenceDate(rule, '2026-11-02', '2026-12-07')).toBe(false) // the fifth Monday is past the count
    expect(countBefore(rule, '2026-11-02', '2026-11-16')).toBe(2)
    expect(lastOccurrence(rule, '2026-11-02')).toBe('2026-11-23')
    expect(lastOccurrence({ freq: 'daily' }, '2026-11-02')).toBeNull()
  })
  it('splitting a series: the part before keeps only the dates before the cut, the part after the rest', () => {
    const start = '2026-11-02'
    const unbounded = { freq: 'weekly', byWeekday: [1] }
    expect(ruleBefore(unbounded, start, '2026-11-16')).toMatchObject({ until: '2026-11-15' })
    expect(ruleFrom(unbounded, start, '2026-11-16')).toEqual(unbounded)
    const counted = { freq: 'weekly', byWeekday: [1], count: 6 }
    expect(ruleBefore(counted, start, '2026-11-16')).toEqual({ freq: 'weekly', byWeekday: [1], count: 2 })
    expect(ruleFrom(counted, start, '2026-11-16')).toMatchObject({ count: 4 })
    // an earlier end date survives the cut
    expect(ruleBefore({ freq: 'daily', until: '2026-11-05' }, start, '2026-11-20')).toMatchObject({ until: '2026-11-05' })
  })
})

// ---------------------------------------------------------------------------------------------------------------- events
const IST = 'Asia/Kolkata'
const NY = 'America/New_York'
const ev = (o = {}) => ({
  id: 'e1',
  title: 'Standup',
  description: '',
  location: '',
  category: 'personal',
  category_label: '',
  priority: 'medium',
  color: null,
  all_day: false,
  timezone: IST,
  rrule: null,
  alert_minutes: [],
  starts_at: new Date(zonedToMs('2026-11-09', '09:00', IST)).toISOString(),
  ends_at: new Date(zonedToMs('2026-11-09', '09:30', IST)).toISOString(),
  ...o,
})
const day = (list) => list.map((o) => o.occurrenceDate)

describe('expandEvent', () => {
  it('a one-off event appears only in windows that contain it', () => {
    const e = ev()
    expect(expandEvent(e, [], '2026-11-09', '2026-11-09')).toHaveLength(1)
    expect(expandEvent(e, [], '2026-11-10', '2026-11-20')).toHaveLength(0)
    const [o] = expandEvent(e, [], '2026-11-01', '2026-11-30')
    expect(o).toMatchObject({ date: '2026-11-09', endDate: '2026-11-09', startMin: 540, endMin: 570, allDay: false, recurring: false })
  })
  it('expands a daily event into one occurrence per day, keeping the wall-clock time', () => {
    const e = ev({ rrule: { freq: 'daily' } })
    const list = expandEvent(e, [], '2026-11-09', '2026-11-12')
    expect(day(list)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'])
    expect(list.every((o) => o.startMin === 540 && o.endMin === 570 && o.recurring)).toBe(true)
  })
  it('a recurring 09:00 stays at 09:00 across a daylight-saving change', () => {
    const e = ev({ timezone: NY, rrule: { freq: 'daily' }, starts_at: new Date(zonedToMs('2026-03-06', '09:00', NY)).toISOString(), ends_at: new Date(zonedToMs('2026-03-06', '10:00', NY)).toISOString() })
    const list = expandEvent(e, [], '2026-03-06', '2026-03-10') // clocks go forward on 8 March
    expect(list.map((o) => o.startMin)).toEqual([540, 540, 540, 540, 540])
    expect(list.map((o) => o.startsAt)).toEqual(['2026-03-06T14:00:00.000Z', '2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z', '2026-03-10T13:00:00.000Z'])
    expect(list.every((o) => o.endMs - o.startMs === 3600000)).toBe(true)
  })
  it('a multi-day event shows on every day it touches, including when the window starts in the middle of it', () => {
    const e = ev({ all_day: true, starts_at: new Date(zonedToMs('2026-11-09', '00:00', IST)).toISOString(), ends_at: new Date(zonedToMs('2026-11-12', '00:00', IST)).toISOString() }) // 9, 10, 11
    expect(expandEvent(e, [], '2026-11-11', '2026-11-11')).toHaveLength(1)
    const [o] = expandEvent(e, [], '2026-11-01', '2026-11-30')
    expect(o).toMatchObject({ date: '2026-11-09', endDate: '2026-11-11', allDay: true })
  })
  it('a repeating multi-day event that began before the window still shows its tail in the window', () => {
    const e = ev({ all_day: true, rrule: { freq: 'weekly', byWeekday: [1] }, starts_at: new Date(zonedToMs('2026-11-09', '00:00', IST)).toISOString(), ends_at: new Date(zonedToMs('2026-11-12', '00:00', IST)).toISOString() })
    const list = expandEvent(e, [], '2026-11-17', '2026-11-17') // the 16th occurrence spans 16-18
    expect(day(list)).toEqual(['2026-11-16'])
  })
  it('an event that ends exactly at midnight ends at 24:00 of its own day, not 00:00 of the next', () => {
    const e = ev({ starts_at: new Date(zonedToMs('2026-11-09', '22:00', IST)).toISOString(), ends_at: new Date(zonedToMs('2026-11-10', '00:00', IST)).toISOString() })
    const [o] = expandEvent(e, [], '2026-11-09', '2026-11-10')
    expect(o).toMatchObject({ date: '2026-11-09', endDate: '2026-11-09', startMin: 1320, endMin: 1440 })
    expect(expandEvent(e, [], '2026-11-10', '2026-11-10')).toHaveLength(0)
  })
  it('an overnight event spans two days', () => {
    const e = ev({ starts_at: new Date(zonedToMs('2026-11-09', '22:00', IST)).toISOString(), ends_at: new Date(zonedToMs('2026-11-10', '01:00', IST)).toISOString() })
    expect(expandEvent(e, [], '2026-11-10', '2026-11-10')).toHaveLength(1)
    expect(expandEvent(e, [], '2026-11-10', '2026-11-10')[0]).toMatchObject({ date: '2026-11-09', endDate: '2026-11-10', endMin: 60 })
  })
  it('a cancelled occurrence disappears and the others are untouched', () => {
    const e = ev({ rrule: { freq: 'daily' } })
    const x = [{ event_id: 'e1', occurrence_date: '2026-11-10', status: 'cancelled' }]
    expect(day(expandEvent(e, x, '2026-11-09', '2026-11-11'))).toEqual(['2026-11-09', '2026-11-11'])
  })
  it('a modified occurrence takes its own title and time and leaves the series alone', () => {
    const e = ev({ rrule: { freq: 'daily' } })
    const moved = { event_id: 'e1', occurrence_date: '2026-11-10', status: 'modified', title: 'Standup (moved)', starts_at: new Date(zonedToMs('2026-11-10', '15:00', IST)).toISOString(), ends_at: new Date(zonedToMs('2026-11-10', '15:45', IST)).toISOString() }
    const list = expandEvent(e, [moved], '2026-11-09', '2026-11-11')
    expect(list.map((o) => [o.occurrenceDate, o.title, o.startMin, o.modified])).toEqual([
      ['2026-11-09', 'Standup', 540, false],
      ['2026-11-10', 'Standup (moved)', 900, true],
      ['2026-11-11', 'Standup', 540, false],
    ])
  })
  it('an occurrence moved to another day appears there, and not on its original day', () => {
    const e = ev({ rrule: { freq: 'weekly', byWeekday: [1] } }) // Mondays
    const moved = { event_id: 'e1', occurrence_date: '2026-11-16', status: 'modified', starts_at: new Date(zonedToMs('2026-11-20', '09:00', IST)).toISOString(), ends_at: new Date(zonedToMs('2026-11-20', '09:30', IST)).toISOString() }
    expect(expandEvent(e, [moved], '2026-11-16', '2026-11-16')).toHaveLength(0) // gone from Monday
    const onFriday = expandEvent(e, [moved], '2026-11-20', '2026-11-20')
    expect(onFriday).toHaveLength(1) // reached from outside the window, via the exception
    expect(onFriday[0]).toMatchObject({ occurrenceDate: '2026-11-16', date: '2026-11-20' })
  })
  it('an override left behind by a rule change (no such occurrence any more) is ignored', () => {
    const e = ev({ rrule: { freq: 'weekly', byWeekday: [1] } })
    const orphan = { event_id: 'e1', occurrence_date: '2026-11-18', status: 'modified', starts_at: new Date(zonedToMs('2026-11-18', '11:00', IST)).toISOString(), ends_at: new Date(zonedToMs('2026-11-18', '12:00', IST)).toISOString() } // a Wednesday
    expect(expandEvent(e, [orphan], '2026-11-18', '2026-11-18')).toHaveLength(0)
  })
  it('only uses exceptions that belong to this event', () => {
    const e = ev({ rrule: { freq: 'daily' } })
    expect(day(expandEvent(e, [{ event_id: 'other', occurrence_date: '2026-11-10', status: 'cancelled' }], '2026-11-09', '2026-11-11'))).toHaveLength(3)
  })
  it('an override with only a new title inherits everything else from the series', () => {
    const e = ev({ rrule: { freq: 'daily' }, location: 'Room 4', priority: 'high' })
    const [o] = expandEvent(e, [{ event_id: 'e1', occurrence_date: '2026-11-09', status: 'modified', title: 'Retro' }], '2026-11-09', '2026-11-09')
    expect(o).toMatchObject({ title: 'Retro', location: 'Room 4', priority: 'high', startMin: 540 })
  })
  it('stops at the end of a counted series', () => {
    expect(expandEvent(ev({ rrule: { freq: 'daily', count: 3 } }), [], '2026-11-01', '2026-12-31')).toHaveLength(3)
  })
})

describe('editing one occurrence versus the whole series', () => {
  it('shiftSeries moves the series by the same number of days and takes the new time of day', () => {
    const e = ev({ rrule: { freq: 'weekly', byWeekday: [1] } }) // starts Mon 9 Nov 09:00-09:30 IST
    // drag the 16 Nov occurrence to Tue 17 Nov 14:00-14:45
    const t = shiftSeries(e, '2026-11-16', zonedToMs('2026-11-17', '14:00', IST), zonedToMs('2026-11-17', '14:45', IST), false)
    expect(t).toEqual({ starts_at: new Date(zonedToMs('2026-11-10', '14:00', IST)).toISOString(), ends_at: new Date(zonedToMs('2026-11-10', '14:45', IST)).toISOString() })
  })
  it('exceptionOverrides stores only what differs, and null (inherit) for the rest', () => {
    const base = { title: 'Standup', description: '', location: '', category: 'personal', priority: 'medium', color: null, all_day: false, alert_minutes: [10], starts_at: 'A', ends_at: 'B' }
    expect(exceptionOverrides(base, { ...base, title: 'Retro' })).toEqual({ title: 'Retro', description: null, location: null, category: null, priority: null, color: null, all_day: null, alert_minutes: null, starts_at: null, ends_at: null })
    expect(exceptionOverrides(base, { ...base, starts_at: 'C', ends_at: 'D', alert_minutes: [] })).toMatchObject({ title: null, starts_at: 'C', ends_at: 'D', alert_minutes: [] })
  })
})
