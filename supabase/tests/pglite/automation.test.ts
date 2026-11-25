import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './helpers'

// Constraints, isolation and the duplicate-run lock of 0019_automation.sql against the real migrated schema.
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
let V: string
let wf: string
const graph = JSON.stringify({ nodes: [{ id: 't' }], edges: [] })
beforeAll(async () => {
  ctx = await createDb()
  U = await ctx.newUser('auto-a@example.com')
  V = await ctx.newUser('auto-b@example.com')
  wf = ((await ctx.asUser(U, (q: any) => q(`insert into automation_workflows(name, graph) values ('Mine', '${graph}') returning id`))) as any).rows[0].id
})
afterAll(async () => { await ctx.db.close() })
const as = (fn: (q: any) => Promise<any>): Promise<any> => ctx.asUser(U, fn)
const run = (key: string, extra = '') => as((q) => q(`insert into automation_executions(workflow_id, dedupe_key${extra ? ', ' + extra.split('=')[0] : ''}) values ('${wf}', '${key}'${extra ? ", '" + extra.split('=')[1] + "'" : ''}) returning id`))

describe('automation_workflows', () => {
  it('starts switched off with sensible defaults', async () => {
    const r = await as((q) => q(`select enabled, max_runs_per_day, activated_at, description, template_key from automation_workflows where id = '${wf}'`))
    expect(r.rows[0]).toMatchObject({ enabled: false, max_runs_per_day: 50, activated_at: null, description: '', template_key: null })
  })
  it('needs a name and a graph with node and edge lists, within size limits', async () => {
    expect(await ctx.fails(as((q) => q(`insert into automation_workflows(name) values ('')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into automation_workflows(name, graph) values ('x', '[]')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into automation_workflows(name, graph) values ('x', '{"nodes":{},"edges":[]}')`)))).toMatch(/check constraint/)
    const many = JSON.stringify({ nodes: Array.from({ length: 31 }, (_, i) => ({ id: i })), edges: [] })
    expect(await ctx.fails(as((q) => q(`insert into automation_workflows(name, graph) values ('x', '${many}')`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into automation_workflows(name, max_runs_per_day) values ('x', 0)`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into automation_workflows(name, max_runs_per_day) values ('x', 201)`)))).toMatch(/check constraint/)
  })
})

describe('automation_executions', () => {
  it('records a run with a lifecycle of known statuses only', async () => {
    const r = await run('k-lifecycle')
    for (const s of ['running', 'completed', 'failed', 'skipped', 'pending']) {
      expect(await ctx.fails(as((q) => q(`update automation_executions set status = '${s}' where id = '${r.rows[0].id}'`)))).toBeNull()
    }
    expect(await ctx.fails(as((q) => q(`update automation_executions set status = 'exploded' where id = '${r.rows[0].id}'`)))).toMatch(/check constraint/)
  })
  it('the same occurrence can start one run only (the duplicate-run lock)', async () => {
    await run('k-once')
    expect(await ctx.fails(run('k-once'))).toMatch(/unique|duplicate/)
    expect(await ctx.fails(run('k-other'))).toBeNull()
  })
  it('a run keeps its history when the workflow is deleted, and its name says what it was', async () => {
    const w = ((await as((q) => q(`insert into automation_workflows(name, graph) values ('Short lived', '${graph}') returning id`)))).rows[0].id
    await as((q) => q(`insert into automation_executions(workflow_id, workflow_name, dedupe_key) values ('${w}', 'Short lived', 'k-del')`))
    await as((q) => q(`delete from automation_workflows where id = '${w}'`))
    const r = await as((q) => q(`select workflow_id, workflow_name from automation_executions where dedupe_key = 'k-del'`))
    expect(r.rows[0]).toEqual({ workflow_id: null, workflow_name: 'Short lived' })
  })
  it('the attempt counter and the steps log are bounded and typed', async () => {
    expect(await ctx.fails(run('k-attempt', 'attempt=11'))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`insert into automation_executions(steps) values ('{}')`)))).toMatch(/check constraint/)
  })
  it('refuses a workflow that belongs to someone else', async () => {
    const theirs = ((await ctx.asUser(V, (q: any) => q(`insert into automation_workflows(name, graph) values ('Theirs', '${graph}') returning id`))) as any).rows[0].id
    expect(await ctx.fails(as((q) => q(`insert into automation_executions(workflow_id, dedupe_key) values ('${theirs}', 'k-steal')`)))).not.toBeNull()
  })
})

describe('isolation', () => {
  it('people see and change only their own workflows and runs', async () => {
    const seen = await ctx.asUser(V, (q: any) => q(`select (select count(*) from automation_workflows) as w, (select count(*) from automation_executions) as e`))
    // V owns one workflow (made above) and none of U's: U's workflow and runs are invisible
    expect((seen as any).rows[0]).toMatchObject({ w: 1, e: 0 })
    const changed = await ctx.asUser(V, (q: any) => q(`update automation_workflows set enabled = true where id = '${wf}'`))
    expect((changed as any).affectedRows).toBe(0)
    const removed = await ctx.asUser(V, (q: any) => q(`delete from automation_executions`))
    expect((removed as any).affectedRows).toBe(0)
    expect(await ctx.fails(ctx.asUser(V, (q: any) => q(`insert into automation_workflows(user_id, name) values ('${U}', 'forged')`)))).not.toBeNull()
  })
  it('the signed-out role sees nothing and the settings column defaults to an empty object', async () => {
    expect(await ctx.fails(ctx.asAnon((q: any) => q(`select 1 from automation_workflows`)))).not.toBeNull()
    await ctx.asUser(U, (q: any) => q(`insert into user_settings(user_id) values ('${U}') on conflict do nothing`))
    const r = await ctx.asUser(U, (q: any) => q(`select automation_prefs from user_settings`))
    expect((r as any).rows[0].automation_prefs).toEqual({})
    expect(await ctx.fails(ctx.asUser(U, (q: any) => q(`update user_settings set automation_prefs = '[]'`)))).toMatch(/check constraint/)
  })
})
