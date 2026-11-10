import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './helpers'

// Constraints added by 0011_calendar.sql, checked against the real migrated schema. The RLS suite (rls.test.ts) covers isolation between users.
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
beforeAll(async () => { ctx = await createDb(); U = await ctx.newUser('cal@example.com') })
afterAll(async () => { await ctx.db.close() })

const as = <T>(fn: (q: any) => Promise<T>) => ctx.asUser(U, fn)
const eventSql = `insert into calendar_events(title, starts_at, ends_at`
const ev = (extraCols = '', extraVals = '') =>
  as((q) => q(`${eventSql}${extraCols}) values ('Standup','2026-11-05T04:00:00Z','2026-11-05T04:30:00Z'${extraVals}) returning id`))

describe('tasks keep working and gain scheduling fields', () => {
  it('a plain task is unchanged: no time, no alerts', async () => {
    const r = await as((q) => q(`insert into tasks(title, due_date) values ('Plain','2026-11-05') returning start_time, end_time, alert_minutes, location, color`))
    expect(r.rows[0]).toMatchObject({ start_time: null, end_time: null, alert_minutes: [], location: '', color: null })
  })
  it('accepts urgent priority, the new categories and yearly repeat (the old constraints were really replaced)', async () => {
    for (const col of [`priority) values ('t','urgent'`, `category) values ('t','Routine'`, `category) values ('t','Custom'`])
      expect(await ctx.fails(as((q) => q(`insert into tasks(title, ${col})`)))).toBeNull()
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, due_date, recurrence) values ('t','2026-11-05','yearly')`)))).toBeNull()
  })
  it('still rejects values outside the widened sets', async () => {
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, priority) values ('t','critical')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, category) values ('t','Hobby')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, recurrence) values ('t','hourly')`)))).toMatch(/check constraint/)
  })
  it('a timed task needs both ends, in order, and a date', async () => {
    const ok = `insert into tasks(title, due_date, start_time, end_time) values ('t','2026-11-05'`
    expect(await ctx.fails(as((q) => q(`${ok},'09:00','10:00')`)))).toBeNull()
    expect(await ctx.fails(as((q) => q(`${ok},'10:00','09:00')`)))).toMatch(/tasks_time_range_ck/)
    expect(await ctx.fails(as((q) => q(`${ok},'10:00','10:00')`)))).toMatch(/tasks_time_range_ck/)
    expect(await ctx.fails(as((q) => q(`${ok},'10:00',null)`)))).toMatch(/tasks_time_range_ck/)
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, start_time, end_time) values ('t','09:00','10:00')`)))).toMatch(/tasks_time_range_ck/) // no date
  })
  it('alert offsets are bounded and colours are hex', async () => {
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, alert_minutes) values ('t','{10,60}')`)))).toBeNull()
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, alert_minutes) values ('t','{-5}')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, alert_minutes) values ('t','{1,2,3,4,5,6}')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into tasks(title, color) values ('t','red')`)))).toMatch(/check constraint/)
  })
})

describe('calendar_events', () => {
  it('stores a one-off event with sensible defaults', async () => {
    const r = await as((q) => q(`${eventSql}) values ('Standup','2026-11-05T04:00:00Z','2026-11-05T04:30:00Z') returning category, priority, all_day, timezone, rrule, alert_minutes`))
    expect(r.rows[0]).toMatchObject({ category: 'personal', priority: 'medium', all_day: false, timezone: 'Asia/Kolkata', rrule: null, alert_minutes: [] })
  })
  it('an event must end after it starts', async () => {
    expect(await ctx.fails(as((q) => q(`${eventSql}) values ('x','2026-11-05T05:00:00Z','2026-11-05T04:00:00Z')`)))).toMatch(/calendar_events_range_ck/)
    expect(await ctx.fails(as((q) => q(`${eventSql}) values ('x','2026-11-05T05:00:00Z','2026-11-05T05:00:00Z')`)))).toMatch(/calendar_events_range_ck/)
  })
  it('validates the recurrence rule shape', async () => {
    const withRule = (json: string) => as((q) => q(`${eventSql}, rrule) values ('x','2026-11-05T04:00:00Z','2026-11-05T05:00:00Z','${json}')`))
    expect(await ctx.fails(withRule('{"freq":"weekly","interval":2,"byWeekday":[1,3],"until":"2027-01-01"}'))).toBeNull()
    expect(await ctx.fails(withRule('{"freq":"daily","count":10}'))).toBeNull()
    expect(await ctx.fails(withRule('{"freq":"hourly"}'))).toMatch(/calendar_events_rrule_ck/)
    expect(await ctx.fails(withRule('{"interval":2}'))).toMatch(/calendar_events_rrule_ck/)
    expect(await ctx.fails(withRule('{"freq":"daily","interval":"lots"}'))).toMatch(/calendar_events_rrule_ck/)
    expect(await ctx.fails(withRule('{"freq":"daily","until":"soon"}'))).toMatch(/calendar_events_rrule_ck/)
    expect(await ctx.fails(withRule('[1,2]'))).toMatch(/calendar_events_rrule_ck/)
  })
  it('limits categories, priorities, colours and alerts', async () => {
    const one = (cols: string, vals: string) => as((q) => q(`${eventSql}, ${cols}) values ('x','2026-11-05T04:00:00Z','2026-11-05T05:00:00Z', ${vals})`))
    expect(await ctx.fails(one('category, category_label', `'custom','Reading club'`))).toBeNull()
    expect(await ctx.fails(one('category', `'work'`))).toMatch(/check constraint/)
    expect(await ctx.fails(one('priority', `'urgent'`))).toBeNull()
    expect(await ctx.fails(one('color', `'#FF8800'`))).toBeNull()
    expect(await ctx.fails(one('color', `'orange'`))).toMatch(/check constraint/)
    expect(await ctx.fails(one('alert_minutes', `'{0,10,1440}'`))).toBeNull()
    expect(await ctx.fails(one('alert_minutes', `'{50000}'`))).toMatch(/calendar_events_alerts_ck/)
  })
  it('deleting a linked goal keeps the event and clears the link', async () => {
    const goal = (await as((q) => q(`insert into goals(title) values ('Ship v1') returning id`))).rows[0].id
    const e = (await ev(', goal_id', `, '${goal}'`)).rows[0].id
    await as((q) => q(`delete from goals where id = $1`, [goal]))
    expect((await as((q) => q(`select goal_id from calendar_events where id = $1`, [e]))).rows[0].goal_id).toBeNull()
  })
  it('updated_at moves on every change (optimistic-concurrency token)', async () => {
    const e = (await ev()).rows[0].id
    const before = (await as((q) => q(`select updated_at from calendar_events where id = $1`, [e]))).rows[0].updated_at
    await new Promise((r) => setTimeout(r, 15))
    await as((q) => q(`update calendar_events set title = 'Renamed' where id = $1`, [e]))
    expect((await as((q) => q(`select updated_at from calendar_events where id = $1`, [e]))).rows[0].updated_at.getTime()).toBeGreaterThan(before.getTime())
  })
})

describe('calendar_event_exceptions', () => {
  const exc = (event: string, date: string, cols = '', vals = '') =>
    as((q) => q(`insert into calendar_event_exceptions(event_id, occurrence_date${cols}) values ('${event}','${date}'${vals}) returning id`))
  it('there is at most one override per occurrence', async () => {
    const e = (await ev(', rrule', `, '{"freq":"daily"}'`)).rows[0].id
    expect(await ctx.fails(exc(e, '2026-11-06'))).toBeNull()
    expect(await ctx.fails(exc(e, '2026-11-06'))).toMatch(/calendar_exceptions_occurrence_uq|duplicate key/)
    expect(await ctx.fails(exc(e, '2026-11-07'))).toBeNull()
  })
  it('a moved occurrence needs both ends, in order', async () => {
    const e = (await ev(', rrule', `, '{"freq":"daily"}'`)).rows[0].id
    expect(await ctx.fails(exc(e, '2026-11-06', ', starts_at, ends_at', `, '2026-11-06T06:00:00Z', '2026-11-06T07:00:00Z'`))).toBeNull()
    expect(await ctx.fails(exc(e, '2026-11-07', ', starts_at', `, '2026-11-07T06:00:00Z'`))).toMatch(/calendar_exceptions_range_ck/)
    expect(await ctx.fails(exc(e, '2026-11-08', ', starts_at, ends_at', `, '2026-11-08T08:00:00Z', '2026-11-08T07:00:00Z'`))).toMatch(/calendar_exceptions_range_ck/)
  })
  it('deleting the series deletes its overrides', async () => {
    const e = (await ev(', rrule', `, '{"freq":"daily"}'`)).rows[0].id
    await exc(e, '2026-11-06'); await exc(e, '2026-11-07')
    await as((q) => q(`delete from calendar_events where id = $1`, [e]))
    expect((await as((q) => q(`select 1 from calendar_event_exceptions where event_id = $1`, [e]))).rows).toHaveLength(0)
  })
})

describe('notifications and settings', () => {
  it("notifications accept the new 'event' kind and dedupe_key still prevents duplicates", async () => {
    const ins = () => as((q) => q(`insert into notifications(kind, title, dedupe_key) values ('event','Standup in 10 min','cal:event:abc:2026-11-05:10')`))
    expect(await ctx.fails(ins())).toBeNull()
    expect(await ctx.fails(ins())).toMatch(/notifications_dedupe_uq|duplicate key/)
  })
  it('calendar_prefs defaults to an empty object', async () => {
    expect((await as((q) => q(`select calendar_prefs from user_settings`))).rows[0].calendar_prefs).toEqual({})
  })
})
