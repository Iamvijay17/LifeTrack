import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FIXTURES, OPTIONAL_LINKS } from './fixtures'
import { createDb, type Q } from './helpers'

let ctx: Awaited<ReturnType<typeof createDb>>
let A: string, B: string
let n = 0
const freshUsers = async () => { n++; A = await ctx.newUser(`a${n}@example.com`); B = await ctx.newUser(`b${n}@example.com`) }
beforeAll(async () => { ctx = await createDb() })
beforeEach(freshUsers)
afterAll(async () => { await ctx.db.close() })

/** Creates a row (and its parents, owned by the ACTING user) as `actor`, with the row's owner column set to `owner`. */
async function makeRow(table: string, actor: string, owner = actor, overrides: Record<string, string> = {}): Promise<string> {
  const fx = FIXTURES[table]
  const refs: Record<string, string> = { ...overrides }
  for (const [col, parent] of Object.entries(fx.parents ?? {})) if (!refs[col]) refs[col] = await makeRow(parent, actor, actor)
  return ctx.asUser(actor, (run: Q) => fx.insert!(run, owner, refs))
}
const normal = Object.entries(FIXTURES).filter(([, f]) => (f.kind ?? 'normal') === 'normal').map(([t]) => t)

describe.each(normal)('RLS: %s', (table) => {
  it("another user cannot see, change or delete the owner's row (and their own row is unaffected)", async () => {
    const aRow = await makeRow(table, A)
    const bRow = await makeRow(table, B) // proves the policy is not over-restrictive: a user can create their own rows
    const seenByB = (await ctx.asUser(B, (q) => q(`select id from ${table}`))).rows.map((r) => r.id)
    expect(seenByB).toContain(bRow)
    expect(seenByB).not.toContain(aRow)
    expect((await ctx.asUser(B, (q) => q(`update ${table} set user_id = user_id where id = $1`, [aRow]))).affectedRows).toBe(0)
    expect((await ctx.asUser(B, (q) => q(`delete from ${table} where id = $1`, [aRow]))).affectedRows).toBe(0)
    expect((await ctx.asUser(A, (q) => q(`select id from ${table} where id = $1`, [aRow]))).rows).toHaveLength(1)
  })
  it('a user cannot create a row owned by someone else, nor hand their own row to another user', async () => {
    expect(await ctx.fails(makeRow(table, B, A))).toMatch(/row-level security|violates|does not belong/i) // B inserting user_id = A
    const mine = await makeRow(table, A)
    expect(await ctx.fails(ctx.asUser(A, (q) => q(`update ${table} set user_id = $1 where id = $2`, [B, mine])))).toMatch(/row-level security|violates|does not belong/i)
    expect((await ctx.asUser(A, (q) => q(`select user_id from ${table} where id = $1`, [mine]))).rows[0].user_id).toBe(A)
  })
  it('the anonymous role has no access at all', async () => {
    for (const stmt of [`select 1 from ${table}`, `delete from ${table}`]) expect(await ctx.fails(ctx.asAnon((q) => q(stmt)))).toMatch(/permission denied/i)
    expect(await ctx.fails(ctx.asAnon((q) => q(`insert into ${table} default values`)))).toMatch(/permission denied/i)
  })
})

describe('RLS: singleton tables created at sign-up (profiles, user_settings)', () => {
  it.each([['profiles', 'id'], ['user_settings', 'user_id']])('%s: each user sees and edits only their own row', async (table, col) => {
    const seen = (await ctx.asUser(A, (q) => q(`select ${col} as owner from ${table}`))).rows.map((r) => r.owner)
    expect(seen).toEqual([A])
    const aRow = (await ctx.asUser(A, (q) => q(`select id from ${table}`))).rows[0].id
    expect((await ctx.asUser(B, (q) => q(`update ${table} set updated_at = now() where id = $1`, [aRow]))).affectedRows).toBe(0)
    expect((await ctx.asUser(B, (q) => q(`delete from ${table} where id = $1`, [aRow]))).affectedRows).toBe(0)
    expect((await ctx.asUser(A, (q) => q(`update ${table} set updated_at = now() where id = $1`, [aRow]))).affectedRows).toBe(1)
    expect(await ctx.fails(ctx.asUser(A, (q) => q(`update ${table} set ${col} = $1 where id = $2`, [B, aRow])))).toBeTruthy() // cannot give the row away
    expect(await ctx.fails(ctx.asUser(B, (q) => q(`insert into ${table}(${col}) values ($1)`, [A])))).toBeTruthy() // cannot create one for A
    expect(await ctx.fails(ctx.asAnon((q) => q(`select 1 from ${table}`)))).toMatch(/permission denied/i)
  })
})

describe('RLS: device_push_tokens (written only through functions)', () => {
  it('a user sees only their own tokens and cannot write the table directly', async () => {
    await ctx.asUser(A, (q) => q(`select register_push_token('ExponentPushToken[rls-test-a]','ios','A phone')`))
    expect((await ctx.asUser(B, (q) => q(`select 1 from device_push_tokens`))).rows).toHaveLength(0)
    expect((await ctx.asUser(A, (q) => q(`select 1 from device_push_tokens`))).rows).toHaveLength(1)
    for (const stmt of [`insert into device_push_tokens(token,platform) values ('ExpoPushToken[x]','ios')`, `update device_push_tokens set platform='android'`]) expect(await ctx.fails(ctx.asUser(A, (q) => q(stmt)))).toMatch(/permission denied|row-level/i)
    expect((await ctx.asUser(B, (q) => q(`delete from device_push_tokens`))).affectedRows).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Cross-table ownership: RLS does not check foreign keys, so a child must not be attachable to a parent owned by someone else.
// ---------------------------------------------------------------------------------------------------------------------------
describe('ownership of foreign keys', () => {
  const required = Object.entries(FIXTURES).flatMap(([child, f]) => Object.entries(f.parents ?? {}).map(([column, parent]) => ({ child, column, parent })))
  const all = [...required, ...OPTIONAL_LINKS]

  it.each(all.map((l) => [`${l.child}.${l.column} → ${l.parent}`, l] as const))('%s: B cannot attach their row to A\'s parent', async (_name, l) => {
    const aParent = await makeRow(l.parent, A)
    const message = await ctx.fails(makeRow(l.child, B, B, { [l.column]: aParent }))
    expect(message, `${l.child} accepted a ${l.parent} owned by another user`).toMatch(/does not belong to this user/)
  })

  it('the fixture map and the FK list cover every foreign key between user-owned tables in the catalog', async () => {
    const { rows } = await ctx.db.query<{ child: string; col: string; parent: string }>(`
      select c.conrelid::regclass::text as child, a.attname as col, c.confrelid::regclass::text as parent
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confrelid::regclass::text not in ('users','auth.users')`)
    const known = new Set(all.map((l) => `${l.child}.${l.column}→${l.parent}`))
    const missing = rows.map((r) => `${r.child}.${r.col}→${r.parent}`).filter((k) => !known.has(k))
    expect(missing, 'a foreign key between user-owned tables has no ownership test: add it to fixtures.ts').toEqual([])
  })
})

describe('recurring occurrences', () => {
  const rule = () => makeRow('recurring_rules', A)
  const post = (id: string | null, date: string | null, txn = '2026-11-01') => ctx.asUser(A, (q) => q(`insert into transactions(type, amount_paise, txn_date, recurring_rule_id, recurring_date) values ('expense',100,$1,$2,$3) returning id`, [txn, id, date]))

  it('the database lets only one device post an occurrence', async () => {
    const id = await rule()
    await post(id, '2026-11-01')
    expect(await ctx.fails(post(id, '2026-11-01'))).toMatch(/duplicate key|unique/i)
    await post(id, '2026-12-01') // the next occurrence is fine
    await post(await rule(), '2026-11-01') // so is the same day on another rule
    await post(null, null) // and transactions typed by hand are not limited
    await post(null, null)
    expect((await ctx.asUser(A, (q) => q(`select 1 from transactions where recurring_rule_id = $1`, [id]))).rows).toHaveLength(2)
  })
  it('moving a posted transaction to another day keeps the occurrence taken', async () => {
    const id = await rule()
    const tx = (await post(id, '2026-11-01')).rows[0].id
    await ctx.asUser(A, (q) => q(`update transactions set txn_date = '2026-11-05' where id = $1`, [tx]))
    expect(await ctx.fails(post(id, '2026-11-01'))).toMatch(/duplicate key|unique/i)
  })
  it('a link without its occurrence date is rejected: it would slip past the unique index', async () => {
    expect(await ctx.fails(post(await rule(), null))).toMatch(/transactions_recurring_ck/)
  })
  it('deleting a rule keeps the transactions it posted', async () => {
    const id = await rule()
    await post(id, '2026-11-01')
    await ctx.asUser(A, (q) => q(`delete from recurring_rules where id = $1`, [id]))
    const { rows } = await ctx.asUser(A, (q) => q(`select recurring_rule_id, recurring_date from transactions`))
    expect(rows).toHaveLength(1)
    expect(rows[0].recurring_rule_id).toBeNull()
  })
  it('a device posting for a rule deleted elsewhere is refused', async () => {
    const id = await rule()
    await ctx.asUser(A, (q) => q(`delete from recurring_rules where id = $1`, [id]))
    expect(await ctx.fails(post(id, '2026-11-01'))).toMatch(/does not belong to this user/)
  })
})

describe('nutrition: water functions and constraints', () => {
  const log = (user: string, ml: number, date = '2026-11-02') => ctx.asUser(user, (q) => q(`select log_water($1::date, $2::int, '09:30') as r`, [date, ml]))
  const total = async (user: string, date = '2026-11-02') => (await ctx.asUser(user, (q) => q(`select water_ml from health_logs where log_date = $1`, [date]))).rows[0]?.water_ml
  it('log_water adds the entry and the day total together; delete_water_log takes exactly that amount back', async () => {
    const a = (await log(A, 250)).rows[0].r
    const b = (await log(A, 500)).rows[0].r
    expect(a.entry.amount_ml).toBe(250)
    expect(b.health.water_ml).toBe(750)
    expect(await total(A)).toBe(750)
    const after = (await ctx.asUser(A, (q) => q(`select * from delete_water_log($1)`, [b.entry.id]))).rows[0]
    expect(after.water_ml).toBe(250)
    expect((await ctx.asUser(A, (q) => q(`select 1 from water_logs`))).rows).toHaveLength(1)
  })
  it('keeps water typed in Sleep & Health when an entry is removed', async () => {
    await ctx.asUser(A, (q) => q(`insert into health_logs(log_date, water_ml) values ('2026-11-02', 1000)`))
    const e = (await log(A, 250)).rows[0].r.entry
    expect(await total(A)).toBe(1250)
    await ctx.asUser(A, (q) => q(`select delete_water_log($1)`, [e.id]))
    expect(await total(A)).toBe(1000)
  })
  it('refuses amounts outside 1 to 5000 ml, and another user\'s entry', async () => {
    for (const ml of [0, -5, 5001]) expect(await ctx.fails(log(A, ml))).toMatch(/between 1 and 5000|check constraint/i)
    const e = (await log(A, 250)).rows[0].r.entry
    expect(await ctx.fails(ctx.asUser(B, (q) => q(`select delete_water_log($1)`, [e.id])))).toMatch(/not found/i)
    expect(await total(A)).toBe(250) // untouched
    expect(await total(B)).toBeUndefined()
  })
  it('the anonymous role cannot call them', async () => {
    expect(await ctx.fails(ctx.asAnon((q) => q(`select log_water('2026-11-02', 250, null)`)))).toMatch(/permission denied/i)
  })
  it('rejects nonsense nutrition and keeps one settings row and one edited copy per user', async () => {
    const ins = (sql: string) => ctx.asUser(A, (q) => q(sql))
    for (const sql of [
      `insert into food_logs(log_date, meal_type, name, kcal) values ('2026-11-02','brunch','x',1)`,
      `insert into food_logs(log_date, meal_type, name, kcal) values ('2026-11-02','lunch','x',-1)`,
      `insert into food_logs(log_date, meal_type, name, quantity) values ('2026-11-02','lunch','x',0)`,
      `insert into food_logs(log_date, meal_type, name) values ('2026-11-02','lunch','')`,
      `insert into foods(name, kcal) values ('x', 99999)`,
      `insert into foods(name, servings) values ('x', '{"a":1}'::jsonb)`,
      `insert into nutrition_settings(calorie_goal) values (100)`,
    ]) expect(await ctx.fails(ins(sql)), sql).toMatch(/violates check constraint/i)
    await ins(`insert into nutrition_settings(calorie_goal) values (2000)`)
    expect(await ctx.fails(ins(`insert into nutrition_settings(calorie_goal) values (2100)`))).toMatch(/duplicate key|unique/i)
    await ins(`insert into foods(name, base_key) values ('Idli', 'idli')`)
    expect(await ctx.fails(ins(`insert into foods(name, base_key) values ('Idli 2', 'idli')`))).toMatch(/duplicate key|unique/i)
    await ins(`insert into foods(name) values ('Mine')`)
    await ins(`insert into foods(name) values ('Mine')`) // custom foods may share a name
    await ctx.asUser(B, (q) => q(`insert into foods(name, base_key) values ('Idli', 'idli')`)) // another user may edit the same starter food
  })
  it('deleting a food keeps the entries logged with it', async () => {
    const food = await makeRow('foods', A)
    const entry = await makeRow('food_logs', A, A, { food_id: food })
    await ctx.asUser(A, (q) => q(`delete from foods where id = $1`, [food]))
    const row = (await ctx.asUser(A, (q) => q(`select food_id, name from food_logs where id = $1`, [entry]))).rows[0]
    expect(row).toEqual({ food_id: null, name: 'Idli' })
  })
})
