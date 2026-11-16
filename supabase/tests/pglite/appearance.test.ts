import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// What 0017_appearance.sql adds, checked against the real migrated schema. The RLS suite (rls.test.ts) covers isolation between users.
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
beforeAll(async () => { ctx = await createDb(); U = await ctx.newUser('look@example.com') })
afterAll(async () => { await ctx.db.close() })
const as = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U, fn)

describe('appearance_prefs', () => {
  it('defaults to an empty object for every account, and holds the look a person saves', async () => {
    const r = await as((q) => q(`select appearance_prefs from user_settings where user_id = '${U}'`))
    expect(r.rows[0].appearance_prefs).toEqual({})
    const u = await as((q) => q(`update user_settings set appearance_prefs = '{"accent":"emerald","density":"compact","sidebar":{"pinned":["/habits"]}}' returning appearance_prefs`))
    expect(u.rows[0].appearance_prefs).toMatchObject({ accent: 'emerald', sidebar: { pinned: ['/habits'] } })
  })
  it('must be an object, not a list or a number', async () => {
    expect(await ctx.fails(as((q) => q(`update user_settings set appearance_prefs = '[1]'`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`update user_settings set appearance_prefs = '5'`)))).toMatch(/check constraint/)
  })
})
