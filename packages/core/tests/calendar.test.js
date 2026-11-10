import { describe, expect, it } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import {
  agendaSections,
  alertSchedule,
  alertText,
  applyPreview,
  buildCalendarItems,
  categoryOfTask,
  conflictsWith,
  dueAlerts,
  filterItems,
  itemsOnDate,
  layoutSegments,
  overdueItems,
  planMove,
  planResize,
  planSchedule,
  segmentOn,
  snapMinutes,
  splitDay,
  unscheduledTasks,
} from '../src/calendar'

const TZ = 'Asia/Kolkata'
const TODAY = '2026-11-10' // a Tuesday
const NOW = zonedToMs(TODAY, '10:00', TZ)
const iso = (d, t, tz = TZ) => new Date(zonedToMs(d, t, tz)).toISOString()
const ctx = { tz: TZ, today: TODAY, nowMs: NOW }
const build = (d, from = '2026-11-01', to = '2026-11-30') => buildCalendarItems(d, { from, to, ...ctx })

const task = (o = {}) => ({ id: 't1', title: 'Write report', notes: '', category: 'Learning', priority: 'high', status: 'pending', due_date: TODAY, start_time: null, end_time: null, color: null, location: '', alert_minutes: [], recurrence: 'none', created_at: '2026-11-01T00:00:00Z', ...o })
const event = (o = {}) => ({ id: 'e1', title: 'Standup', description: '', location: '', category: 'personal', category_label: '', priority: 'medium', color: null, all_day: false, timezone: TZ, rrule: null, alert_minutes: [], starts_at: iso(TODAY, '09:00'), ends_at: iso(TODAY, '09:30'), ...o })

describe('buildCalendarItems', () => {
  it('a task is shown from its own row: no copy, same id, with its category and colour', () => {
    const [i] = build({ tasks: [task()] })
    expect(i).toMatchObject({ kind: 'task', id: 't1', key: 'task:t1', title: 'Write report', category: 'learning', color: '#8B5CF6', untimed: true, date: TODAY, completable: true, movable: true, resizable: false })
    expect(i.row).toEqual(task())
  })
  it('a task with a time sits on the grid and can be resized', () => {
    const [i] = build({ tasks: [task({ start_time: '14:00:00', end_time: '15:30:00' })] })
    expect(i).toMatchObject({ untimed: false, startMin: 840, endMin: 930, resizable: true })
    expect(i.endMs - i.startMs).toBe(90 * 60000)
  })
  it('skipped and cancelled tasks, and tasks with no date, are not on the calendar', () => {
    expect(build({ tasks: [task({ status: 'cancelled' }), task({ id: 't2', status: 'skipped' }), task({ id: 't3', due_date: null })] })).toHaveLength(0)
  })
  it('flags overdue: a past open task, and a timed task whose slot has ended today; never a finished one', () => {
    const items = build({ tasks: [task({ id: 'a', due_date: '2026-11-08' }), task({ id: 'b', start_time: '08:00', end_time: '09:00' }), task({ id: 'c', start_time: '11:00', end_time: '12:00' }), task({ id: 'd', due_date: '2026-11-08', status: 'done' })] })
    const by = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(by.a.overdue).toBe(true)
    expect(by.b.overdue).toBe(true)
    expect(by.c.overdue).toBe(false)
    expect(by.d.overdue).toBe(false)
    expect(by.d.done).toBe(true)
  })
  it('only tasks inside the window are built', () => {
    expect(build({ tasks: [task({ due_date: '2026-10-31' }), task({ id: 'x', due_date: '2026-12-01' })] })).toHaveLength(0)
  })
  it('categories: tasks map to calendar categories, unknown ones to personal', () => {
    expect(categoryOfTask({ category: 'Job Search' })).toBe('jobs')
    expect(categoryOfTask({ category: 'Gym' })).toBe('fitness')
    expect(categoryOfTask({ category: 'Routine' })).toBe('routine')
    expect(categoryOfTask({ category: 'Nonsense' })).toBe('personal')
  })
  it('recurring events expand into occurrences that carry their series and date', () => {
    const items = build({ events: [event({ rrule: { freq: 'daily' } })] }, '2026-11-09', '2026-11-12')
    expect(items.map((i) => i.occurrenceDate)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']) // the series starts on the 10th
    expect(new Set(items.map((i) => i.key)).size).toBe(3)
    expect(items[0]).toMatchObject({ kind: 'event', id: 'e1', recurring: true, movable: true, resizable: true, editable: true })
  })
  it('interviews, reminders and deadlines come from their own tables and are not duplicated as tasks', () => {
    const items = build({
      applications: [{ id: 'a1', company: 'Acme', status: 'interview', followup_date: '2026-11-12' }],
      interviews: [{ id: 'iv1', application_id: 'a1', round_name: 'Technical', scheduled_at: iso('2026-11-11', '16:00'), status: 'scheduled', notes: '', link: 'https://meet' }, { id: 'iv2', application_id: 'a1', scheduled_at: iso('2026-11-11', '12:00'), status: 'cancelled' }],
      reminders: [{ id: 'r1', kind: 'bill', title: 'Pay rent', remind_date: '2026-11-13', remind_time: '09:30:00', repeat: 'monthly', active: true }, { id: 'r2', kind: 'custom', title: 'Done', remind_date: '2026-11-13', remind_time: '10:00', repeat: 'none', active: false }],
      goals: [{ id: 'g1', title: 'Ship v1', category: 'Career', status: 'active', due_date: '2026-11-20' }, { id: 'g2', title: 'Old', category: 'Career', status: 'completed', due_date: '2026-11-20' }],
      milestones: [{ id: 'm1', goal_id: 'g1', title: 'Design', done: false, due_date: '2026-11-15' }, { id: 'm2', goal_id: 'g1', title: 'Done one', done: true, due_date: '2026-11-15' }],
      recurringRules: [{ id: 'b1', active: true, next_date: '2026-11-18', note: 'Rent', category: 'Bills', type: 'expense' }],
      topics: [{ id: 'tp1', name: 'React', archived: false, revision_dates: ['2026-11-14', '2027-01-01'] }],
    })
    const kinds = Object.fromEntries(items.map((i) => [i.key, i]))
    expect(Object.keys(kinds).sort()).toEqual(['bill:b1', 'followup:a1', 'goal:g1', 'interview:iv1', 'milestone:m1', 'reminder:r1', 'revision:tp1:2026-11-14'])
    expect(kinds['interview:iv1']).toMatchObject({ kind: 'interview', title: 'Interview · Acme · Technical', category: 'jobs', startMin: 960, endMin: 1020, movable: true, location: 'https://meet' })
    expect(kinds['reminder:r1']).toMatchObject({ point: true, startMin: 570, recurring: true, category: 'finance', movable: true })
    expect(kinds['goal:g1']).toMatchObject({ kind: 'deadline', allDay: true, movable: false, href: '/goals', category: 'jobs' })
    expect(kinds['bill:b1']).toMatchObject({ allDay: true, title: 'Rent', href: '/finance' })
  })
  it('sorts by day, then all-day lane first, then start time', () => {
    const items = build({ tasks: [task({ id: 'late', start_time: '15:00', end_time: '16:00' }), task({ id: 'lane' }), task({ id: 'early', start_time: '08:00', end_time: '09:00' })] })
    expect(items.map((i) => i.id)).toEqual(['lane', 'early', 'late'])
  })
})

describe('filtering and search', () => {
  const items = build({
    tasks: [task({ id: 'a', title: 'Gym session', category: 'Gym', priority: 'low' }), task({ id: 'b', title: 'Pay tax', category: 'Finance', priority: 'urgent', status: 'done' }), task({ id: 'c', title: 'Read book', category: 'Personal', priority: 'medium', due_date: '2026-11-05' })],
    events: [event({ title: 'Doctor visit', description: 'Annual checkup', location: 'City Clinic', category: 'health', priority: 'high' })],
  })
  const ids = (f) => filterItems(items, f).map((i) => i.title).sort()
  it('searches title, notes and location, case-insensitively', () => {
    expect(ids({ query: 'GYM' })).toEqual(['Gym session'])
    expect(ids({ query: 'checkup' })).toEqual(['Doctor visit'])
    expect(ids({ query: 'clinic' })).toEqual(['Doctor visit'])
    expect(ids({ query: 'nothing matches this' })).toEqual([])
  })
  it('searches by category name too', () => {
    expect(ids({ query: 'finance' })).toEqual(['Pay tax'])
  })
  it('hides categories', () => {
    expect(ids({ hiddenCategories: ['fitness', 'health'] })).toEqual(['Pay tax', 'Read book'])
  })
  it('filters by priority and by completion status', () => {
    expect(ids({ priorities: ['urgent', 'high'] })).toEqual(['Doctor visit', 'Pay tax'])
    expect(ids({ status: 'done' })).toEqual(['Pay tax'])
    expect(ids({ status: 'open' })).toEqual(['Doctor visit', 'Gym session', 'Read book'])
    expect(ids({ status: 'overdue' })).toEqual(['Read book'])
  })
  it('combines filters', () => {
    expect(ids({ query: 'o', status: 'open', hiddenCategories: ['health'], priorities: ['low', 'medium'] })).toEqual(['Gym session', 'Read book'])
  })
})

describe('day layout', () => {
  it('splits a day into the all-day lane and the hour grid', () => {
    const items = build({ tasks: [task({ id: 'lane' }), task({ id: 'timed', start_time: '09:00', end_time: '10:00' })], events: [event({ all_day: true, starts_at: iso(TODAY, '00:00'), ends_at: iso('2026-11-11', '00:00') })] })
    const { lane, timed } = splitDay(items, TODAY)
    expect(lane.map((i) => i.kind).sort()).toEqual(['event', 'task'])
    expect(timed.map((t) => t.item.id)).toEqual(['timed'])
  })
  it('an overnight event is clipped to each day', () => {
    const [i] = build({ events: [event({ starts_at: iso(TODAY, '22:00'), ends_at: iso('2026-11-11', '01:00') })] })
    expect(segmentOn(i, TODAY)).toEqual({ startMin: 1320, endMin: 1440 })
    expect(segmentOn(i, '2026-11-11')).toEqual({ startMin: 0, endMin: 60 })
    expect(itemsOnDate([i], '2026-11-11')).toHaveLength(1)
    expect(itemsOnDate([i], '2026-11-12')).toHaveLength(0)
  })
  it('overlapping items share the width; separate items keep full width', () => {
    const l = layoutSegments([
      { key: 'a', startMin: 540, endMin: 600 },
      { key: 'b', startMin: 570, endMin: 660 },
      { key: 'c', startMin: 590, endMin: 620 },
      { key: 'd', startMin: 900, endMin: 960 },
    ])
    expect(l.get('a')).toMatchObject({ col: 0, cols: 3 })
    expect(l.get('b')).toMatchObject({ col: 1, cols: 3 })
    expect(l.get('c')).toMatchObject({ col: 2, cols: 3 })
    expect(l.get('d')).toEqual({ col: 0, cols: 1, span: 1 })
  })
  it('an item reuses a column once its neighbour has ended, and widens into free columns', () => {
    const l = layoutSegments([
      { key: 'long', startMin: 540, endMin: 720 },
      { key: 'short1', startMin: 540, endMin: 600 },
      { key: 'short2', startMin: 610, endMin: 660 },
    ])
    expect(l.get('long')).toMatchObject({ col: 0, cols: 2 })
    expect(l.get('short1')).toMatchObject({ col: 1, cols: 2 })
    expect(l.get('short2')).toMatchObject({ col: 1, cols: 2 }) // reuses the column short1 vacated
    const widen = layoutSegments([{ key: 'a', startMin: 540, endMin: 700 }, { key: 'b', startMin: 540, endMin: 560 }, { key: 'c', startMin: 600, endMin: 620 }])
    expect(widen.get('b').span).toBe(1)
  })
  it('very short items still reserve room, so a 5-minute item does not hide behind its neighbour', () => {
    const l = layoutSegments([{ key: 'a', startMin: 540, endMin: 545 }, { key: 'b', startMin: 550, endMin: 600 }])
    expect(l.get('a').cols).toBe(2)
  })
  it('conflictsWith lists real overlaps only', () => {
    const items = build({ events: [event({ id: 'x', starts_at: iso(TODAY, '09:00'), ends_at: iso(TODAY, '10:00') }), event({ id: 'y', starts_at: iso(TODAY, '09:30'), ends_at: iso(TODAY, '10:30') }), event({ id: 'z', starts_at: iso(TODAY, '10:00'), ends_at: iso(TODAY, '11:00') })] })
    const x = items.find((i) => i.id === 'x')
    expect(conflictsWith(x, items).map((i) => i.id)).toEqual(['y']) // z starts exactly when x ends
  })
})

describe('dragging and resizing', () => {
  const items = build({
    tasks: [task({ id: 'lane' }), task({ id: 'timed', start_time: '09:00', end_time: '10:30' })],
    events: [event({ id: 'ev', starts_at: iso(TODAY, '13:00'), ends_at: iso(TODAY, '14:00') }), event({ id: 'allday', all_day: true, starts_at: iso(TODAY, '00:00'), ends_at: iso('2026-11-12', '00:00') })],
    interviews: [{ id: 'iv', application_id: 'a', scheduled_at: iso(TODAY, '16:00'), status: 'scheduled' }],
    reminders: [{ id: 'r', kind: 'custom', title: 'Call', remind_date: TODAY, remind_time: '18:00', repeat: 'none', active: true }],
    goals: [{ id: 'g', title: 'G', category: 'Career', status: 'active', due_date: TODAY }],
  })
  const get = (id) => items.find((i) => i.id === id)
  const opts = { tz: TZ }

  it('snaps to 15 minutes', () => {
    expect([7, 8, 22, 23, 600].map((m) => snapMinutes(m))).toEqual([0, 15, 15, 30, 600])
  })
  it('moving a timed task to a new day and time keeps its length and writes only task columns', () => {
    const { change, preview } = planMove(get('timed'), { date: '2026-11-12', startMin: 14 * 60 + 5 }, opts)
    expect(change).toEqual({ table: 'tasks', id: 'timed', patch: { due_date: '2026-11-12', start_time: '14:00', end_time: '15:30' } })
    expect(preview).toMatchObject({ date: '2026-11-12', startMin: 840, endMin: 930, untimed: false })
  })
  it('a task cannot be dropped so late that it would run past midnight', () => {
    const { change } = planMove(get('timed'), { date: TODAY, startMin: 1430 }, opts)
    expect(change.patch).toEqual({ due_date: TODAY, start_time: '22:29', end_time: '23:59' })
  })
  it('dropping a task on a month cell changes the date and keeps its time of day', () => {
    expect(planMove(get('timed'), { date: '2026-11-20', startMin: 'keep' }, opts).change.patch).toEqual({ due_date: '2026-11-20', start_time: '09:00', end_time: '10:30' })
    expect(planMove(get('lane'), { date: '2026-11-20', startMin: 'keep' }, opts).change.patch).toEqual({ due_date: '2026-11-20', start_time: null, end_time: null })
  })
  it('dropping a timed task on the all-day lane clears its time; dropping an untimed task on the grid gives it one', () => {
    expect(planMove(get('timed'), { date: TODAY, startMin: null }, opts).change.patch).toEqual({ due_date: TODAY, start_time: null, end_time: null })
    expect(planMove(get('lane'), { date: TODAY, startMin: 600 }, opts).change.patch).toEqual({ due_date: TODAY, start_time: '10:00', end_time: '11:00' })
    expect(planMove(get('lane'), { date: TODAY, startMin: 600 }, { tz: TZ, defaultDuration: 30 }).change.patch.end_time).toBe('10:30')
  })
  it('moving an event keeps its length and sends instants, not wall-clock text', () => {
    const { change } = planMove(get('ev'), { date: '2026-11-11', startMin: 10 * 60 }, opts)
    expect(change).toMatchObject({ table: 'calendar_events', occurrenceDate: TODAY, values: { all_day: false, starts_at: iso('2026-11-11', '10:00'), ends_at: iso('2026-11-11', '11:00') } })
  })
  it('moving a multi-day all-day event by days keeps its span', () => {
    const { change } = planMove(get('allday'), { date: '2026-11-15', startMin: 'keep' }, opts)
    expect(change.values).toEqual({ all_day: true, starts_at: iso('2026-11-15', '00:00'), ends_at: iso('2026-11-17', '00:00') })
  })
  it('dragging an all-day event onto the grid makes it a timed event; the reverse makes it all-day', () => {
    const down = planMove(get('allday'), { date: TODAY, startMin: 9 * 60 }, opts).change.values
    expect(down).toEqual({ all_day: false, starts_at: iso(TODAY, '09:00'), ends_at: iso(TODAY, '10:00') })
    const up = planMove(get('ev'), { date: TODAY, startMin: null }, opts).change.values
    expect(up).toEqual({ all_day: true, starts_at: iso(TODAY, '00:00'), ends_at: iso('2026-11-11', '00:00') })
  })
  it('interviews and reminders reschedule through their own columns', () => {
    expect(planMove(get('iv'), { date: '2026-11-12', startMin: 11 * 60 }, opts).change).toEqual({ table: 'interview_events', id: 'iv', patch: { scheduled_at: iso('2026-11-12', '11:00') } })
    expect(planMove(get('r'), { date: '2026-11-12', startMin: 'keep' }, opts).change).toEqual({ table: 'reminders', id: 'r', patch: { remind_date: '2026-11-12', remind_time: '18:00', last_fired_on: null } })
  })
  it('deadlines and finished tasks cannot be moved', () => {
    expect(planMove(get('g'), { date: '2026-11-12', startMin: 'keep' }, opts)).toBeNull()
    const done = build({ tasks: [task({ status: 'done' })] })[0]
    expect(planMove(done, { date: '2026-11-12', startMin: 'keep' }, opts)).toBeNull()
  })
  it('resizing the end of a task changes end_time only; it keeps at least 15 minutes', () => {
    expect(planResize(get('timed'), 'end', { date: TODAY, minutes: 12 * 60 + 7 }, opts).change.patch).toEqual({ start_time: '09:00', end_time: '12:00' })
    expect(planResize(get('timed'), 'end', { date: TODAY, minutes: 9 * 60 + 5 }, opts).change.patch).toEqual({ start_time: '09:00', end_time: '09:15' })
    expect(planResize(get('timed'), 'start', { date: TODAY, minutes: 8 * 60 }, opts).change.patch).toEqual({ start_time: '08:00', end_time: '10:30' })
    expect(planResize(get('timed'), 'start', { date: TODAY, minutes: 11 * 60 }, opts).change.patch).toEqual({ start_time: '10:15', end_time: '10:30' })
  })
  it('resizing an event past midnight extends it into the next day', () => {
    const { change, preview } = planResize(get('ev'), 'end', { date: TODAY, minutes: 1440 }, opts)
    expect(change.values.ends_at).toBe(iso('2026-11-11', '00:00'))
    expect(preview).toMatchObject({ date: TODAY, endDate: TODAY, endMin: 1440 })
  })
  it('only timed tasks and events resize', () => {
    for (const id of ['lane', 'allday', 'iv', 'r', 'g']) expect(planResize(get(id), 'end', { date: TODAY, minutes: 700 }, opts), id).toBeNull()
  })
  it('an unscheduled task dropped on the grid or a day becomes a scheduled task', () => {
    const t = task({ id: 'u', due_date: null })
    expect(planSchedule(t, { date: TODAY, startMin: 660 }, opts).change).toEqual({ table: 'tasks', id: 'u', patch: { due_date: TODAY, start_time: '11:00', end_time: '12:00' } })
    expect(planSchedule(t, { date: '2026-11-14', startMin: 'keep' }, opts).change.patch).toEqual({ due_date: '2026-11-14', start_time: null, end_time: null })
  })
  it('applyPreview overlays the planned change and marks the item pending', () => {
    const { preview } = planMove(get('ev'), { date: '2026-11-11', startMin: 600 }, opts)
    const shown = applyPreview(get('ev'), preview)
    expect(shown).toMatchObject({ date: '2026-11-11', startMin: 600, pending: true, title: 'Standup' })
    expect(applyPreview(get('ev'), null)).toBe(get('ev'))
  })
  it('moving across a daylight-saving change lands on the right wall-clock time', () => {
    const NY = { tz: 'America/New_York' }
    const ny = buildCalendarItems({ events: [event({ id: 'n', timezone: 'America/New_York', starts_at: iso('2026-03-06', '09:00', 'America/New_York'), ends_at: iso('2026-03-06', '10:00', 'America/New_York') })] }, { from: '2026-03-01', to: '2026-03-31', tz: 'America/New_York', today: '2026-03-01', nowMs: 0 })
    const { change } = planMove(ny[0], { date: '2026-03-09', startMin: 9 * 60 }, NY)
    expect(change.values.starts_at).toBe('2026-03-09T13:00:00.000Z') // EDT, one hour earlier in UTC than the 6th
  })
})

describe('agenda', () => {
  const data = {
    tasks: [
      task({ id: 'od', title: 'Overdue one', due_date: '2026-11-05' }),
      task({ id: 'td', title: 'Today task', due_date: TODAY }),
      task({ id: 'tm', title: 'Tomorrow task', due_date: '2026-11-11' }),
      task({ id: 'dn', title: 'Finished', due_date: '2026-11-09', status: 'done' }),
      task({ id: 'nd', title: 'No date', due_date: null, priority: 'urgent' }),
      task({ id: 'far', title: 'Far away', due_date: '2027-03-01' }),
      task({ id: 'rec', title: 'Weekly review', due_date: '2026-11-16', recurrence: 'weekly' }),
    ],
    events: [event({ id: 'e', title: 'Team sync', rrule: { freq: 'weekly', byWeekday: [4] }, starts_at: iso('2026-11-12', '10:00'), ends_at: iso('2026-11-12', '10:30') })],
  }
  const items = buildCalendarItems(data, { from: '2026-10-27', to: '2026-12-10', ...ctx })
  const a = agendaSections(items, { today: TODAY, days: 30, overdue: overdueItems(data, ctx), tasks: data.tasks })

  it('lists overdue tasks wherever their date is', () => {
    expect(a.overdue.map((i) => i.title)).toEqual(['Overdue one'])
    expect(overdueItems({ tasks: [task({ id: 'old', due_date: '2025-01-01' })] }, ctx)).toHaveLength(1)
  })
  it("today's schedule, grouped upcoming days in order, and pending tasks without a date", () => {
    expect(a.today.map((i) => i.title)).toEqual(['Today task'])
    expect(a.upcoming.map((g) => g.date)).toEqual(['2026-11-11', '2026-11-12', '2026-11-16', '2026-11-19', '2026-11-26', '2026-12-03', '2026-12-10'].filter((d) => d <= '2026-12-10'))
    expect(a.upcoming[0].items.map((i) => i.title)).toEqual(['Tomorrow task'])
    expect(a.pending.map((t) => t.title)).toEqual(['No date'])
  })
  it('does not list far-future items in the window', () => {
    expect(a.upcoming.flatMap((g) => g.items).some((i) => i.title === 'Far away')).toBe(false)
  })
  it('upcoming recurring activities list each series once, at its next occurrence', () => {
    expect(a.recurring.map((i) => [i.title, i.date])).toEqual([['Team sync', '2026-11-12'], ['Weekly review', '2026-11-16']])
  })
  it('completed items are kept apart, newest first', () => {
    expect(a.completed.map((i) => i.title)).toEqual(['Finished'])
    expect(a.upcoming.flatMap((g) => g.items).concat(a.today).some((i) => i.done)).toBe(false)
  })
  it('unscheduledTasks: open tasks without a date, most important first', () => {
    expect(unscheduledTasks([task({ id: '1', due_date: null, priority: 'low' }), task({ id: '2', due_date: null, priority: 'urgent' }), task({ id: '3', due_date: null, status: 'done' }), task({ id: '4' })]).map((t) => t.id)).toEqual(['2', '1'])
  })
})

describe('alerts', () => {
  const items = build({
    tasks: [task({ id: 'ta', title: 'Submit form', due_date: '2026-11-11', alert_minutes: [1440] }), task({ id: 'tb', title: 'Finished', due_date: '2026-11-11', status: 'done', alert_minutes: [10] })],
    events: [event({ id: 'ea', title: 'Standup', starts_at: iso(TODAY, '10:30'), ends_at: iso(TODAY, '11:00'), alert_minutes: [10, 60] }), event({ id: 'eb', title: 'Daily', rrule: { freq: 'daily' }, starts_at: iso(TODAY, '18:00'), ends_at: iso(TODAY, '18:30'), alert_minutes: [15] })],
  }, '2026-11-10', '2026-11-12')
  const schedule = alertSchedule(items, { tz: TZ })

  it('one alert per item and offset; done items and items without alerts make none', () => {
    expect(schedule.map((s) => s.key).sort()).toEqual([
      'cal:event:ea:2026-11-10:10',
      'cal:event:ea:2026-11-10:60',
      'cal:event:eb:2026-11-10:15',
      'cal:event:eb:2026-11-11:15',
      'cal:event:eb:2026-11-12:15',
      'cal:task:ta:2026-11-11:1440',
    ])
  })
  it('the key names the occurrence, so each repeat of a daily event alerts on its own', () => {
    expect(new Set(schedule.filter((s) => s.item.id === 'eb').map((s) => s.key)).size).toBe(3)
  })
  it('an all-day task is alerted relative to 09:00 local', () => {
    const a = schedule.find((s) => s.item.id === 'ta')
    expect(a.startMs).toBe(zonedToMs('2026-11-11', '09:00', TZ))
    expect(a.fireAtMs).toBe(zonedToMs('2026-11-10', '09:00', TZ))
  })
  it('due alerts: time has come, not too long ago, and the item has not long since started', () => {
    const at = (t) => dueAlerts(schedule, zonedToMs(TODAY, t, TZ)).map((s) => s.key)
    expect(at('10:19')).not.toContain('cal:event:ea:2026-11-10:10') // fires at 10:20
    expect(at('10:21')).toContain('cal:event:ea:2026-11-10:10')
    expect(at('10:21')).not.toContain('cal:event:ea:2026-11-10:60') // was due at 09:30, 51 minutes ago: past the catch-up window
    expect(at('09:35')).toContain('cal:event:ea:2026-11-10:60')
  })
  it('a tab that was asleep does not replay old alerts', () => {
    expect(dueAlerts(schedule, zonedToMs(TODAY, '10:45', TZ))).toEqual([])
  })
  it('alert text reads naturally', () => {
    const s = schedule.find((x) => x.key === 'cal:event:ea:2026-11-10:10')
    expect(alertText(s, s.fireAtMs)).toBe('Standup starts in 10 minutes')
    expect(alertText(s, s.startMs)).toBe('Standup starts now')
    const t = schedule.find((x) => x.item.id === 'ta')
    expect(alertText(t, t.fireAtMs)).toBe('Submit form is due in 1 day')
  })
})
