import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './helpers'

// Constraints of 0016_task_reschedules.sql against the real migrated schema. Isolation between users is covered by rls.test.ts (through the fixtures).
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
let task: string
beforeAll(async () => {
  ctx = await createDb()
  U = await ctx.newUser('recover@example.com')
  task = ((await ctx.asUser(U, (q: any) => q(`insert into tasks(title, due_date) values ('Late','2026-11-02') returning id`))) as any).rows[0].id
})
afterAll(async () => { await ctx.db.close() })
const as = (fn: (q: any) => Promise<any>): Promise<any> => ctx.asUser(U, fn)
const moved = (cols = '', vals = '') =>
  as((q) => q(`insert into task_reschedules(task_id, action, from_date, to_date, to_start, to_end${cols}) values ('${task}','rescheduled','2026-11-02','2026-11-04','09:00','10:00'${vals}) returning id`))

describe('task_reschedules', () => {
  it('records a move with sensible defaults', async () => {
    const r = await as((q) => q(`insert into task_reschedules(task_id, action, from_date, to_date, to_start, to_end) values ('${task}','rescheduled','2026-11-02','2026-11-04','09:00','10:00') returning source, undone_at, title`))
    expect(r.rows[0]).toMatchObject({ source: 'recovery', undone_at: null, title: '' })
  })
  it('a move needs a destination with a time, and the end after the start', async () => {
    expect(await ctx.fails(as((q) => q(`insert into task_reschedules(task_id, action, from_date) values ('${task}','rescheduled','2026-11-02')`)))).toMatch(/task_reschedules_shape_ck/)
    expect(await ctx.fails(as((q) => q(`insert into task_reschedules(task_id, action, from_date, to_date, to_start, to_end) values ('${task}','rescheduled','2026-11-02','2026-11-04','10:00','09:00')`)))).toMatch(/task_reschedules_to_time_ck/)
    expect(await ctx.fails(as((q) => q(`insert into task_reschedules(task_id, action, from_date, to_date, to_start) values ('${task}','rescheduled','2026-11-02','2026-11-04','09:00')`)))).toMatch(/task_reschedules_to_time_ck/)
  })
  it('a rejection has no destination but needs a quiet period', async () => {
    expect(await ctx.fails(as((q) => q(`insert into task_reschedules(task_id, action, from_date, hide_until) values ('${task}','dismissed','2026-11-02','2026-11-05')`)))).toBeNull()
    expect(await ctx.fails(as((q) => q(`insert into task_reschedules(task_id, action, from_date) values ('${task}','dismissed','2026-11-02')`)))).toMatch(/task_reschedules_shape_ck/)
    expect(await ctx.fails(as((q) => q(`insert into task_reschedules(task_id, action, from_date, to_date, hide_until) values ('${task}','dismissed','2026-11-02','2026-11-04','2026-11-05')`)))).toMatch(/task_reschedules_shape_ck/)
  })
  it('only known actions and sources', async () => {
    expect(await ctx.fails(moved(', source', ", 'robot'"))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into task_reschedules(task_id, action, from_date) values ('${task}','deleted','2026-11-02')`)))).toMatch(/check constraint/)
  })
  it('the same move can be recorded once while it stands, and again after an undo (the duplicate guard)', async () => {
    const insert = () => as((q) => q(`insert into task_reschedules(task_id, action, from_date, to_date, to_start, to_end, dedupe_key) values ('${task}','rescheduled','2026-11-02','2026-11-06','09:00','10:00','rs:k1') returning id`))
    const first = await insert()
    expect(await ctx.fails(insert())).toMatch(/unique|duplicate/)
    await as((q) => q(`update task_reschedules set undone_at = now() where id = '${first.rows[0].id}'`))
    expect(await ctx.fails(insert())).toBeNull()
  })
  it('history goes when the task goes', async () => {
    const t = (await as((q) => q(`insert into tasks(title) values ('Temp') returning id`))).rows[0].id
    await as((q) => q(`insert into task_reschedules(task_id, action, from_date, to_date, to_start, to_end) values ('${t}','rescheduled','2026-11-02','2026-11-04','09:00','10:00')`))
    await as((q) => q(`delete from tasks where id = '${t}'`))
    expect((await as((q) => q(`select 1 from task_reschedules where task_id = '${t}'`))).rows).toHaveLength(0)
  })
  it("refuses a task that belongs to someone else", async () => {
    const other = await ctx.newUser('other@example.com')
    const theirs = ((await ctx.asUser(other, (q: any) => q(`insert into tasks(title) values ('Theirs') returning id`))) as any).rows[0].id
    expect(await ctx.fails(as((q) => q(`insert into task_reschedules(task_id, action, from_date, to_date, to_start, to_end) values ('${theirs}','rescheduled','2026-11-02','2026-11-04','09:00','10:00')`)))).not.toBeNull()
  })
})
