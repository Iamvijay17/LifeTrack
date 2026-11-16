import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// What 0018_consistency.sql adds, against the real migrated schema. Cross-user isolation for habit_pauses is covered by rls.test.ts.
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
let H: string
beforeAll(async () => {
  ctx = await createDb()
  U = await ctx.newUser('rest@example.com')
  H = (await ctx.asUser(U, (q) => q(`insert into habits(name) values ('Read') returning id`))).rows[0].id
})
afterAll(async () => { await ctx.db.close() })
const as = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U, fn)

describe('habits.rest_days', () => {
  it('defaults to none and holds weekdays 0..6', async () => {
    expect((await as((q) => q(`select rest_days from habits where id = '${H}'`))).rows[0].rest_days).toEqual([])
    const r = await as((q) => q(`update habits set rest_days = '{0,6}' where id = '${H}' returning rest_days`))
    expect(r.rows[0].rest_days).toEqual([0, 6])
  })
  it('refuses a weekday outside 0..6', async () => {
    expect(await ctx.fails(as((q) => q(`update habits set rest_days = '{7}' where id = '${H}'`)))).toMatch(/check constraint/)
  })
})

describe('habit_pauses', () => {
  it('allows many closed pauses but only one open one per habit', async () => {
    await as((q) => q(`insert into habit_pauses(habit_id, start_date, end_date) values ('${H}','2026-10-01','2026-10-05'), ('${H}','2026-10-10','2026-10-12')`))
    await as((q) => q(`insert into habit_pauses(habit_id, start_date) values ('${H}','2026-11-01')`))
    expect(await ctx.fails(as((q) => q(`insert into habit_pauses(habit_id, start_date) values ('${H}','2026-11-05')`)))).toMatch(/duplicate key|unique/)
  })
  it('rejects an end before the start', async () => {
    expect(await ctx.fails(as((q) => q(`insert into habit_pauses(habit_id, start_date, end_date) values ('${H}','2026-09-05','2026-09-01')`)))).toMatch(/check constraint/)
  })
  it('is removed with its habit and never touches check-ins', async () => {
    await as((q) => q(`insert into habit_logs(habit_id, log_date) values ('${H}','2026-10-02')`))
    expect((await as((q) => q(`select count(*)::int n from habit_logs where habit_id = '${H}'`))).rows[0].n).toBe(1)
    await as((q) => q(`delete from habits where id = '${H}'`))
    expect((await as((q) => q(`select count(*)::int n from habit_pauses`))).rows[0].n).toBe(0)
  })
})

describe('habit_logs.recovered_at', () => {
  it('is null unless a day was made up', async () => {
    const h = (await as((q) => q(`insert into habits(name) values ('Run') returning id`))).rows[0].id
    const r = await as((q) => q(`insert into habit_logs(habit_id, log_date) values ('${h}','2026-11-02') returning recovered_at`))
    expect(r.rows[0].recovered_at).toBeNull()
  })
})
