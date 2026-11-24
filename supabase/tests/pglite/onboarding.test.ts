import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// What 0024_onboarding.sql adds, checked against the real migrated schema. The RLS suite (rls.test.ts) covers isolation between users.
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
beforeAll(async () => { ctx = await createDb(); U = await ctx.newUser('welcome@example.com') })
afterAll(async () => { await ctx.db.close() })
const as = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U, fn)

describe('onboarding_state', () => {
  it('defaults to an empty object for every account, and holds progress a person saves', async () => {
    const r = await as((q) => q(`select onboarding_state from user_settings where user_id = '${U}'`))
    expect(r.rows[0].onboarding_state).toEqual({})
    const u = await as((q) => q(`update user_settings set onboarding_state = '{"status":"in_progress","step":3,"tours":{"finance":"done"}}' returning onboarding_state`))
    expect(u.rows[0].onboarding_state).toMatchObject({ status: 'in_progress', step: 3, tours: { finance: 'done' } })
  })
  it('must be an object, not a list or a number', async () => {
    expect(await ctx.fails(as((q) => q(`update user_settings set onboarding_state = '[1]'`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`update user_settings set onboarding_state = '5'`)))).toMatch(/check constraint/)
  })
})
