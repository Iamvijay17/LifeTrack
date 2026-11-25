import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// What 0020_life_map.sql adds, against the real migrated schema. Cross-user isolation is covered by rls.test.ts (through the fixtures).
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
beforeAll(async () => { ctx = await createDb(); U = await ctx.newUser('map@example.com') })
afterAll(async () => { await ctx.db.close() })
const as = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U, fn)
const one = async (sql: string) => (await as((q) => q(sql))).rows[0].id as string
const count = async (table: string) => (await as((q) => q(`select count(*)::int n from ${table}`))).rows[0].n as number

describe('life_map_links', () => {
  const A = 'goal:11111111-1111-4111-8111-111111111111'
  const B = 'habit:22222222-2222-4222-8222-222222222222'
  it('connects two keys once, in one direction', async () => {
    await as((q) => q(`insert into life_map_links(from_key, to_key) values ('${B}','${A}')`))
    expect(await ctx.fails(as((q) => q(`insert into life_map_links(from_key, to_key) values ('${B}','${A}')`)))).toMatch(/duplicate key|unique/)
  })
  it('refuses a link to itself and a malformed key', async () => {
    expect(await ctx.fails(as((q) => q(`insert into life_map_links(from_key, to_key) values ('${A}','${A}')`)))).toMatch(/life_map_links_distinct_ck/)
    expect(await ctx.fails(as((q) => q(`insert into life_map_links(from_key, to_key) values ('robot:1','${A}')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into life_map_links(from_key, to_key, label) values ('${A}','${B}', '${'x'.repeat(61)}')`)))).toMatch(/check constraint/)
  })
})

describe('life_map_positions', () => {
  it('keeps one place per node and bounds the coordinates', async () => {
    const k = 'task:33333333-3333-4333-8333-333333333333'
    await as((q) => q(`insert into life_map_positions(node_key, x, y) values ('${k}', 1, 2)`))
    expect(await ctx.fails(as((q) => q(`insert into life_map_positions(node_key, x, y) values ('${k}', 5, 6)`)))).toMatch(/duplicate key|unique/)
    expect(await ctx.fails(as((q) => q(`insert into life_map_positions(node_key, x, y) values ('goal:44444444-4444-4444-8444-444444444444', 1e9, 0)`)))).toMatch(/check constraint/)
  })
})

describe('life_map_nodes', () => {
  it('only allows a project or an area, in a known category', async () => {
    expect(await ctx.fails(as((q) => q(`insert into life_map_nodes(kind, title) values ('goal','x')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into life_map_nodes(kind, title, category) values ('area','x','Sport')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into life_map_nodes(kind, title, color) values ('area','x','red')`)))).toMatch(/check constraint/)
  })
})

describe('clean-up when a record is deleted', () => {
  it('removes the links and the saved place of a deleted goal, habit, task, milestone and custom node, and nothing else', async () => {
    const goal = await one(`insert into goals(title) values ('G') returning id`)
    const habit = await one(`insert into habits(name) values ('H') returning id`)
    const task = await one(`insert into tasks(title) values ('T') returning id`)
    const ms = await one(`insert into milestones(goal_id, title) values ('${goal}','M') returning id`)
    const proj = await one(`insert into life_map_nodes(kind, title) values ('project','P') returning id`)
    const area = await one(`insert into life_map_nodes(kind, title) values ('area','Ar') returning id`)
    const keep = 'goal:99999999-9999-4999-8999-999999999999'
    const keys = { goal: `goal:${goal}`, habit: `habit:${habit}`, task: `task:${task}`, ms: `milestone:${ms}`, proj: `project:${proj}`, area: `area:${area}` }
    const before = await count('life_map_links')
    for (const [i, k] of Object.values(keys).entries()) {
      await as((q) => q(`insert into life_map_links(from_key, to_key) values ('${k}','${keep}')`))
      await as((q) => q(`insert into life_map_positions(node_key, x, y) values ('${k}', ${i}, ${i})`))
    }
    expect(await count('life_map_links')).toBe(before + 6)
    for (const [table, id] of [['tasks', task], ['habits', habit], ['life_map_nodes', proj], ['life_map_nodes', area], ['milestones', ms], ['goals', goal]]) {
      await as((q) => q(`delete from ${table} where id = '${id}'`))
    }
    expect(await count('life_map_links')).toBe(before)
    const left = (await as((q) => q(`select node_key from life_map_positions where node_key = any($1)`, [Object.values(keys)]))).rows
    expect(left).toEqual([])
  })
  it('does not touch another user\'s map', async () => {
    const other = await ctx.newUser('other-map@example.com')
    const g = await ctx.asUser(other, (q) => q(`insert into goals(title) values ('theirs') returning id`))
    const key = `goal:${g.rows[0].id}`
    await ctx.asUser(other, (q) => q(`insert into life_map_links(from_key, to_key) values ('habit:22222222-2222-4222-8222-222222222222','${key}')`))
    const mine = await one(`insert into goals(title) values ('mine') returning id`)
    await as((q) => q(`delete from goals where id = '${mine}'`))
    expect((await ctx.asUser(other, (q) => q(`select count(*)::int n from life_map_links where to_key = '${key}'`))).rows[0].n).toBe(1)
  })
})
