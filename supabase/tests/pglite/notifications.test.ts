import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// What 0013_notification_center.sql adds, checked against the real migrated schema. The RLS suite (rls.test.ts) covers isolation between users.
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string, V: string
beforeAll(async () => { ctx = await createDb(); U = await ctx.newUser('notify@example.com'); V = await ctx.newUser('other@example.com') })
afterAll(async () => { await ctx.db.close() })

const as = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U, fn)

describe('reminders', () => {
  it('an old-style reminder keeps working and gets a normal priority and an empty note', async () => {
    const r = await as((q) => q(`insert into reminders(title, remind_date) values ('Pay rent','2026-11-11') returning priority, body, repeat, remind_time`))
    expect(r.rows[0]).toMatchObject({ priority: 'normal', body: '', repeat: 'none' })
  })
  it('accepts every priority and the new repeats, and still refuses anything else', async () => {
    for (const p of ['low', 'normal', 'high', 'urgent']) expect(await ctx.fails(as((q) => q(`insert into reminders(title, remind_date, priority) values ('t','2026-11-11','${p}')`)))).toBeNull()
    for (const rep of ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly']) expect(await ctx.fails(as((q) => q(`insert into reminders(title, remind_date, repeat) values ('t','2026-11-11','${rep}')`)))).toBeNull()
    expect(await ctx.fails(as((q) => q(`insert into reminders(title, remind_date, priority) values ('t','2026-11-11','critical')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into reminders(title, remind_date, repeat) values ('t','2026-11-11','hourly')`)))).toMatch(/check constraint/)
  })
  it('limits the note to 500 characters', async () => {
    expect(await ctx.fails(as((q) => q(`insert into reminders(title, remind_date, body) values ('t','2026-11-11','${'x'.repeat(500)}')`)))).toBeNull()
    expect(await ctx.fails(as((q) => q(`insert into reminders(title, remind_date, body) values ('t','2026-11-11','${'x'.repeat(501)}')`)))).toMatch(/check constraint/)
  })
})

describe('notifications', () => {
  it('an old-style notification is unchanged: normal priority, not due, not snoozed, not dismissed', async () => {
    const r = await as((q) => q(`insert into notifications(title) values ('Hello') returning kind, priority, due_at, snoozed_until, dismissed_at, read_at`))
    expect(r.rows[0]).toMatchObject({ kind: 'custom', priority: 'normal', due_at: null, snoozed_until: null, dismissed_at: null, read_at: null })
  })
  it('accepts the new kinds (job, goal) next to the old ones, and refuses others', async () => {
    for (const k of ['task', 'study', 'workout', 'habit', 'bill', 'custom', 'system', 'event', 'job', 'goal'])
      expect(await ctx.fails(as((q) => q(`insert into notifications(title, kind) values ('t','${k}')`)))).toBeNull()
    expect(await ctx.fails(as((q) => q(`insert into notifications(title, kind) values ('t','spam')`)))).toMatch(/check constraint/)
  })
  it('validates the priority', async () => {
    expect(await ctx.fails(as((q) => q(`insert into notifications(title, priority) values ('t','urgent')`)))).toBeNull()
    expect(await ctx.fails(as((q) => q(`insert into notifications(title, priority) values ('t','meh')`)))).toMatch(/check constraint/)
  })
  it('stores snooze, dismissal and due time, and the person can change them on their own rows', async () => {
    const r = await as((q) => q(`insert into notifications(title, due_at) values ('t','2026-11-11T03:30:00Z') returning id`))
    const id = r.rows[0].id
    const u = await as((q) => q(`update notifications set snoozed_until='2026-11-11T10:00:00Z', read_at=null where id='${id}' returning snoozed_until, due_at`))
    expect(new Date(u.rows[0].snoozed_until).toISOString()).toBe('2026-11-11T10:00:00.000Z')
    expect(new Date(u.rows[0].due_at).toISOString()).toBe('2026-11-11T03:30:00.000Z')
    const d = await as((q) => q(`update notifications set dismissed_at=now(), snoozed_until=null where id='${id}' returning dismissed_at, snoozed_until`))
    expect(d.rows[0].dismissed_at).not.toBeNull()
    expect(d.rows[0].snoozed_until).toBeNull()
  })
  it('the dedupe key still makes a repeated notification impossible, per person', async () => {
    const ins = (u: string) => ctx.asUser(u, (q) => q(`insert into notifications(title, dedupe_key) values ('t','src:tasks-today:2026-11-11')`))
    await ins(U)
    expect(await ctx.fails(ins(U))).toMatch(/duplicate key|unique/)
    expect(await ctx.fails(ins(V))).toBeNull() // someone else may use the same key
  })
  it('another person cannot see or change them', async () => {
    const r = await as((q) => q(`insert into notifications(title) values ('private') returning id`))
    const id = r.rows[0].id
    const seen = await ctx.asUser(V, (q) => q(`select id from notifications where id='${id}'`))
    expect(seen.rows).toHaveLength(0)
    const changed = await ctx.asUser(V, (q) => q(`update notifications set dismissed_at=now() where id='${id}' returning id`))
    expect(changed.rows).toHaveLength(0)
  })
  it('uses the partial indexes the inbox and the snooze timer rely on', async () => {
    const r = await ctx.q(`select indexname from pg_indexes where tablename = 'notifications'`)
    const names = r.rows.map((x: any) => x.indexname)
    expect(names).toEqual(expect.arrayContaining(['notifications_inbox_idx', 'notifications_snoozed_idx', 'notifications_dedupe_uq']))
  })
})

describe('notification_settings', () => {
  it('defaults to an empty object and holds the settings a person saves', async () => {
    const r = await as((q) => q(`select notification_settings from user_settings where user_id = '${U}'`)) // created with the account
    expect(r.rows[0].notification_settings).toEqual({})
    const u = await as((q) => q(`update user_settings set notification_settings = '{"quiet":{"enabled":true,"from":"22:00","to":"07:00"},"desktop":true}' returning notification_settings`))
    expect(u.rows[0].notification_settings).toMatchObject({ desktop: true, quiet: { enabled: true } })
  })
  it('must be an object, not a list or a number', async () => {
    expect(await ctx.fails(as((q) => q(`update user_settings set notification_settings = '[1]'`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`update user_settings set notification_settings = '5'`)))).toMatch(/check constraint/)
  })
})
