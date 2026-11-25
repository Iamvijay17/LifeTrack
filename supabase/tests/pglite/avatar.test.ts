import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'

// What 0025_profile_avatar.sql adds, against the real migrated schema. Isolation between users is covered by rls.test.ts.
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
beforeAll(async () => { ctx = await createDb(); U = await ctx.newUser('photo@example.com') })
afterAll(async () => { await ctx.db.close() })
const as = <T>(fn: (q: Q) => Promise<T>) => ctx.asUser(U, fn)

describe('profiles.avatar', () => {
  it('starts empty and holds a small image data URL', async () => {
    const r = await as((q) => q(`select avatar from profiles where id = '${U}'`))
    expect(r.rows[0].avatar).toBeNull()
    const u = await as((q) => q(`update profiles set avatar = 'data:image/jpeg;base64,/9j/4AAQ' where id = '${U}' returning avatar`))
    expect(u.rows[0].avatar).toMatch(/^data:image\/jpeg/)
  })
  it('refuses anything that is not a small inline image', async () => {
    expect(await ctx.fails(as((q) => q(`update profiles set avatar = 'https://evil.example/x.png' where id = '${U}'`)))).toMatch(/check constraint/)
    expect(await ctx.fails(as((q) => q(`update profiles set avatar = 'data:text/html;base64,PHNjcmlwdD4=' where id = '${U}'`)))).toMatch(/check constraint/)
    const big = 'data:image/png;base64,' + 'A'.repeat(60001)
    expect(await ctx.fails(as((q) => q(`update profiles set avatar = '${big}' where id = '${U}'`)))).toMatch(/check constraint/)
  })
})
