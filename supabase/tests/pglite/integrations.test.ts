import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// What 0026_integrations.sql guarantees, against the real migrated schema: tokens are unreachable from any client, and a person can read but never
// write their own integration rows (so a page cannot claim to be connected).
let ctx: Awaited<ReturnType<typeof createDb>>
let A: string
let B: string
beforeAll(async () => {
  ctx = await createDb()
  A = await ctx.newUser('a@example.com')
  B = await ctx.newUser('b@example.com')
  await ctx.db.query(`insert into integrations (user_id, provider, status, scopes) values ('${A}', 'google_drive', 'connected', '{drive.file}')`)
  await ctx.db.query(`insert into integrations (user_id, provider, status) values ('${B}', 'google_drive', 'connected')`)
  await ctx.db.query(`insert into integration_tokens (user_id, provider, refresh_token) values ('${A}', 'google_drive', 'secret-refresh')`)
  await ctx.db.query(`insert into integration_events (user_id, provider, kind, message) values ('${A}', 'google_drive', 'connected', 'Connected')`)
})
afterAll(async () => { await ctx.db.close() })
const asA = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(A, fn)

describe('integrations', () => {
  it('a person reads only their own integration rows and events', async () => {
    const r = await asA((q) => q(`select user_id from integrations`))
    expect(r.rows.map((x: any) => x.user_id)).toEqual([A])
    const e = await asA((q) => q(`select message from integration_events`))
    expect(e.rows).toHaveLength(1)
  })
  it('cannot write them: only the server can mark something connected', async () => {
    expect(await ctx.fails(asA((q) => q(`insert into integrations (provider, status) values ('google_calendar', 'connected')`)))).toMatch(/permission denied|row-level/)
    expect(await ctx.fails(asA((q) => q(`update integrations set status = 'connected' where user_id = '${A}'`)))).toMatch(/permission denied|row-level/)
    expect(await ctx.fails(asA((q) => q(`delete from integration_events`)))).toMatch(/permission denied|row-level/)
  })
  it('tokens cannot be read or written from a client at all', async () => {
    expect(await ctx.fails(asA((q) => q(`select refresh_token from integration_tokens`)))).toMatch(/permission denied/)
    expect(await ctx.fails(asA((q) => q(`insert into integration_tokens (user_id, provider, refresh_token) values ('${A}', 'google_calendar', 'x')`)))).toMatch(/permission denied/)
  })
  it('rejects unknown providers and non-object settings', async () => {
    expect(await ctx.fails(ctx.db.query(`insert into integrations (user_id, provider) values ('${B}', 'dropbox')`))).toMatch(/check constraint/)
    expect(await ctx.fails(ctx.db.query(`update integrations set settings = '[1]' where user_id = '${B}'`))).toMatch(/check constraint/)
  })
})
