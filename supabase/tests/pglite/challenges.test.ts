import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// What 0023_challenges.sql adds, against the real migrated schema. Cross-user isolation for the three tables is covered by rls.test.ts (fixtures).
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
let C: string
beforeAll(async () => {
  ctx = await createDb()
  U = await ctx.newUser('chal@example.com')
  C = (await as((q) => q(`insert into challenges(title, start_date, end_date) values ('Read','2020-01-01','2020-01-31') returning id`))).rows[0].id
})
afterAll(async () => { await ctx.db.close() })
const as = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U, fn)
const checkin = (day: string, extra = '') => as((q) => q(`insert into challenge_checkins(challenge_id, checkin_date${extra ? ', ' + extra.split('=')[0] : ''}) values ('${C}','${day}'${extra ? ', ' + extra.split('=')[1] : ''}) returning id`))

describe('challenges', () => {
  it('fills in the defaults and the owner', async () => {
    const r = (await as((q) => q(`select * from challenges where id = '${C}'`))).rows[0]
    expect(r).toMatchObject({ kind: 'daily', target: 1, status: 'active', pauses: [], milestones: [], user_id: U, color: '#8B5CF6' })
  })
  it.each([
    ['an end before the start', `insert into challenges(title,start_date,end_date) values ('x','2020-02-02','2020-02-01')`],
    ['a run longer than two years', `insert into challenges(title,start_date,end_date) values ('x','2020-01-01','2022-06-01')`],
    ['an unknown kind', `insert into challenges(title,start_date,end_date,kind) values ('x','2020-01-01','2020-01-05','monthly')`],
    ['a weekly target above 7', `insert into challenges(title,start_date,end_date,kind,target) values ('x','2020-01-01','2020-02-05','weekly',8)`],
    ['a zero target', `insert into challenges(title,start_date,end_date,target) values ('x','2020-01-01','2020-01-05',0)`],
    ['a blank name', `insert into challenges(title,start_date,end_date) values ('','2020-01-01','2020-01-05')`],
    ['an unknown status', `insert into challenges(title,start_date,end_date,status) values ('x','2020-01-01','2020-01-05','done')`],
    ['a bad colour', `insert into challenges(title,start_date,end_date,color) values ('x','2020-01-01','2020-01-05','red')`],
    ['milestones that are not a list', `insert into challenges(title,start_date,end_date,milestones) values ('x','2020-01-01','2020-01-05','{}')`],
  ])('refuses %s', async (_name, sql) => {
    expect(await ctx.fails(as((q) => q(sql)))).toMatch(/check constraint/)
  })
  it('keeps a habit link on daily and weekly challenges only', async () => {
    const h = (await as((q) => q(`insert into habits(name) values ('Read') returning id`))).rows[0].id
    await as((q) => q(`insert into challenges(title,start_date,end_date,habit_id) values ('ok','2020-01-01','2020-01-05','${h}')`))
    expect(await ctx.fails(as((q) => q(`insert into challenges(title,start_date,end_date,kind,habit_id) values ('no','2020-01-01','2020-01-05','total','${h}')`)))).toMatch(/challenges_habit_ck/)
  })
  it('lets a habit be deleted without losing the challenge', async () => {
    const h = (await as((q) => q(`insert into habits(name) values ('Temp') returning id`))).rows[0].id
    const c = (await as((q) => q(`insert into challenges(title,start_date,end_date,habit_id) values ('linked','2020-01-01','2020-01-05','${h}') returning id`))).rows[0].id
    await as((q) => q(`delete from habits where id = '${h}'`))
    expect((await as((q) => q(`select habit_id from challenges where id = '${c}'`))).rows[0].habit_id).toBeNull()
  })
})

describe('challenge_checkins', () => {
  it('allows one check-in per day and refuses a duplicate', async () => {
    await checkin('2020-01-05')
    expect(await ctx.fails(checkin('2020-01-05'))).toMatch(/duplicate key|unique/)
    await checkin('2020-01-06')
  })
  it('refuses days outside the challenge dates', async () => {
    expect(await ctx.fails(checkin('2019-12-31'))).toMatch(/outside the challenge dates/)
    expect(await ctx.fails(checkin('2020-02-01'))).toMatch(/outside the challenge dates/)
  })
  it('refuses a day that has not started in the person’s own timezone', async () => {
    const far = (await as((q) => q(`insert into challenges(title,start_date,end_date) values ('Now', current_date - 3, current_date + 5) returning id`))).rows[0].id
    const put = (day: string) => as((q) => q(`insert into challenge_checkins(challenge_id, checkin_date) values ('${far}', ${day})`))
    // The two zones are 25 hours apart, so right now they never agree on the date unless the clock is in the one-hour overlap: compare to what Postgres itself says.
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      await ctx.db.query(`update user_settings set timezone = $1 where user_id = $2`, [tz, U])
      const today = (await ctx.db.query<{ d: string }>(`select (now() at time zone $1)::date::text d`, [tz])).rows[0].d
      await as((q) => q(`delete from challenge_checkins where challenge_id = '${far}'`))
      await put(`'${today}'::date`) // the person's today is fine
      expect(await ctx.fails(put(`'${today}'::date + 1`))).toMatch(/not started yet/) // their tomorrow is not
    }
    // Between them the zones disagree about today by a whole day, which is exactly what a UTC-only check would get wrong.
    const k = (await ctx.db.query<{ a: string; b: string }>(`select (now() at time zone 'Pacific/Kiritimati')::date::text a, (now() at time zone 'Pacific/Pago_Pago')::date::text b`)).rows[0]
    expect(k.a).not.toBe(k.b)
  })
  it('falls back to a safe zone when the stored one is unknown', async () => {
    const far = (await as((q) => q(`insert into challenges(title,start_date,end_date) values ('Zone', current_date - 3, current_date + 5) returning id`))).rows[0].id
    await ctx.db.query(`update user_settings set timezone = 'Not/AZone' where user_id = $1`, [U])
    await as((q) => q(`insert into challenge_checkins(challenge_id, checkin_date) values ('${far}', current_date - 1)`))
    await ctx.db.query(`update user_settings set timezone = 'Asia/Kolkata' where user_id = $1`, [U])
  })
  it('lets an amount, note or evidence be edited without re-checking the date', async () => {
    const r = await as((q) => q(`update challenge_checkins set amount = 5, note = 'more' where challenge_id = '${C}' and checkin_date = '2020-01-05' returning amount`))
    expect(r.rows[0].amount).toBe(5)
  })
  it('limits amount, note and evidence', async () => {
    expect(await ctx.fails(checkin('2020-01-07', 'amount=0'))).toMatch(/check constraint/)
    expect(await ctx.fails(checkin('2020-01-07', `note=${"'" + 'x'.repeat(501) + "'"}`))).toMatch(/check constraint/)
  })
  it('accepts http(s) evidence only, at most five links', async () => {
    const ok = await checkin('2020-01-08', `evidence='[{"label":"photo","url":"https://example.com/a.jpg"}]'::jsonb`)
    expect(ok.rows).toHaveLength(1)
    expect(await ctx.fails(checkin('2020-01-09', `evidence='[{"url":"javascript:alert(1)"}]'::jsonb`))).toMatch(/check constraint/)
    expect(await ctx.fails(checkin('2020-01-09', `evidence='[{"url":"ftp://x.com/a"}]'::jsonb`))).toMatch(/check constraint/)
    const six = JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ url: `https://e.com/${i}` })))
    expect(await ctx.fails(checkin('2020-01-09', `evidence='${six}'::jsonb`))).toMatch(/check constraint/)
  })
  it('is removed with its challenge', async () => {
    const c = (await as((q) => q(`insert into challenges(title,start_date,end_date) values ('Gone','2020-03-01','2020-03-10') returning id`))).rows[0].id
    await as((q) => q(`insert into challenge_checkins(challenge_id, checkin_date) values ('${c}','2020-03-02')`))
    await as((q) => q(`delete from challenges where id = '${c}'`))
    expect((await as((q) => q(`select count(*)::int n from challenge_checkins where challenge_id = '${c}'`))).rows[0].n).toBe(0)
  })
})

describe('isolation', () => {
  it('another user cannot check in to, see, or link to someone else’s challenge', async () => {
    const other = await ctx.newUser('other-chal@example.com')
    const asOther = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(other, fn)
    expect((await asOther((q) => q(`select count(*)::int n from challenges`))).rows[0].n).toBe(0)
    expect(await ctx.fails(asOther((q) => q(`insert into challenge_checkins(challenge_id, checkin_date) values ('${C}','2020-01-10')`)))).toBeTruthy()
    const h = (await as((q) => q(`insert into habits(name) values ('Mine') returning id`))).rows[0].id
    expect(await ctx.fails(asOther((q) => q(`insert into challenges(title,start_date,end_date,habit_id) values ('steal','2020-01-01','2020-01-05','${h}')`)))).toMatch(/does not belong/)
  })
})
