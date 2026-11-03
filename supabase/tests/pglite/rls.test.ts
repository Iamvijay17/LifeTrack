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
