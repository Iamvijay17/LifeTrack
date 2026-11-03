import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasPostgres, startCluster } from './cluster'

// Concurrency needs several real connections, which the in-process PGlite used by the RLS suite cannot provide.
// CI sets REQUIRE_POSTGRES=1 so a runner without PostgreSQL fails loudly instead of silently skipping these tests.
describe.skipIf(!hasPostgres && !process.env.REQUIRE_POSTGRES)('atomic increments on a real PostgreSQL server', () => {
  let pgc: Awaited<ReturnType<typeof startCluster>>
  let user: string
  beforeAll(async () => { pgc = await startCluster(); user = await pgc.newUser('c@example.com') }, 60_000)
  afterAll(async () => { await pgc?.stop() })

  const N = 20
  const burst = async <T>(fn: (i: number) => Promise<T>) => Promise.all(Array.from({ length: N }, (_, i) => fn(i)))

  it('add_water: N concurrent additions from separate connections all count', async () => {
    const conns = await Promise.all(Array.from({ length: N }, () => pgc.session(user)))
    try {
      await burst((i) => conns[i].query(`select add_water('2026-11-02', 100)`))
      const { rows } = await pgc.admin.query(`select water_ml, count(*) over () as n from health_logs where user_id = $1 and log_date = '2026-11-02'`, [user])
      expect(rows).toEqual([{ water_ml: N * 100, n: '1' }]) // exactly one row for the day, nothing lost
    } finally { await Promise.all(conns.map((c) => c.end())) }
  })

  it('add_water: subtracting never goes below zero', async () => {
    const c = await pgc.session(user)
    try { expect((await c.query(`select (add_water('2026-11-03', -500)).water_ml as v`)).rows[0].v).toBe(0) } finally { await c.end() }
  })

  it('add_savings: N concurrent deposits all count', async () => {
    const goal = (await pgc.admin.query(`insert into savings_goals(user_id, name, target_paise) values ($1,'Fund',100000000) returning id`, [user])).rows[0].id
    const conns = await Promise.all(Array.from({ length: N }, () => pgc.session(user)))
    try {
      await burst((i) => conns[i].query(`select add_savings($1, 2500)`, [goal]))
      expect((await pgc.admin.query(`select saved_paise from savings_goals where id = $1`, [goal])).rows[0].saved_paise).toBe(String(N * 2500))
    } finally { await Promise.all(conns.map((c) => c.end())) }
  })

  it("a user cannot add to another user's savings goal or see their water total", async () => {
    const other = await pgc.newUser('d@example.com')
    const goal = (await pgc.admin.query(`insert into savings_goals(user_id, name, target_paise) values ($1,'Mine',1000) returning id`, [user])).rows[0].id
    const c = await pgc.session(other)
    try {
      await expect(c.query(`select add_savings($1, 100)`, [goal])).rejects.toThrow(/not found/i)
      const r = (await c.query(`select (add_water('2026-11-02', 50)).water_ml as v`)).rows[0].v
      expect(r).toBe(50) // their own, separate day-row — not 2050
    } finally { await c.end() }
    expect((await pgc.admin.query(`select saved_paise from savings_goals where id = $1`, [goal])).rows[0].saved_paise).toBe('0')
  })

  it('rejects non-positive deposits; water is clamped to the table limit instead of failing', async () => {
    const goal = (await pgc.admin.query(`insert into savings_goals(user_id, name, target_paise) values ($1,'G',1000) returning id`, [user])).rows[0].id
    const c = await pgc.session(user)
    try {
      await expect(c.query(`select add_savings($1, 0)`, [goal])).rejects.toThrow(/greater than 0/i)
      expect((await c.query(`select (add_water('2026-11-04', 99999)).water_ml as v`)).rows[0].v).toBe(20000)
    } finally { await c.end() }
  })

  it('the client calls these with named arguments (p_date, p_ml, p_goal, p_paise) and anonymous callers are refused', async () => {
    const goal = (await pgc.admin.query(`insert into savings_goals(user_id, name, target_paise) values ($1,'N',1000) returning id`, [user])).rows[0].id
    const c = await pgc.session(user)
    try {
      expect((await c.query(`select * from add_water(p_date => '2026-11-05', p_ml => 10)`)).rows[0].water_ml).toBe(10)
      expect((await c.query(`select * from add_savings(p_goal => $1, p_paise => 5)`, [goal])).rows[0].saved_paise).toBe('5')
    } finally { await c.end() }
    await pgc.admin.query('set role anon')
    try { await expect(pgc.admin.query(`select add_water('2026-11-05', 1)`)).rejects.toThrow(/permission denied/i) } finally { await pgc.admin.query('reset role') }
  })

  it('the old read-then-write pattern DOES lose updates (documents why the functions exist)', async () => {
    const goal = (await pgc.admin.query(`insert into savings_goals(user_id, name, target_paise) values ($1,'Racy',100000000) returning id`, [user])).rows[0].id
    const conns = await Promise.all(Array.from({ length: N }, () => pgc.session(user)))
    try {
      const reads = await Promise.all(conns.map((c) => c.query(`select saved_paise from savings_goals where id = $1`, [goal])))
      await Promise.all(conns.map((c, i) => c.query(`update savings_goals set saved_paise = $1 where id = $2`, [Number(reads[i].rows[0].saved_paise) + 2500, goal])))
      expect(Number((await pgc.admin.query(`select saved_paise from savings_goals where id = $1`, [goal])).rows[0].saved_paise)).toBe(2500) // 20 deposits, one survived
    } finally { await Promise.all(conns.map((c) => c.end())) }
  })
})
