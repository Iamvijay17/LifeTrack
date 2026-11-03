import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// RLS through the REAL HTTP API (Kong -> GoTrue/PostgREST -> Postgres), the way the apps reach the database, with real JWTs.
// Needs a running stack:  supabase start  then  SUPABASE_URL=… SUPABASE_ANON_KEY=… pnpm --filter @lifetrack/db-tests exec vitest run api
// Only the PUBLIC anon key is ever used here; this file must never receive a service-role key.
const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_ANON_KEY
const required = !!process.env.REQUIRE_BACKEND // CI sets this so a missing stack fails instead of skipping

/** True when PostgREST refused the request or let it through while affecting no rows (both are RLS doing its job). */
const blocked = (r: { error: unknown; data: unknown }) => !!r.error || (Array.isArray(r.data) && r.data.length === 0)

describe.skipIf(!(URL && KEY) && !required)('RLS over the real API', () => {
  const client = (): SupabaseClient => createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const stamp = Date.now()
  let a: SupabaseClient, b: SupabaseClient, anon: SupabaseClient
  let aId: string, bId: string

  async function signUp(label: string) {
    const c = client()
    const { data, error } = await c.auth.signUp({ email: `rls-${label}-${stamp}@example.test`, password: 'Password123!' })
    if (error) throw error
    if (!data.session) throw new Error('No session after sign-up: disable email confirmation in supabase/config.toml')
    return { c, id: data.user!.id }
  }
  beforeAll(async () => {
    expect(URL && KEY, 'SUPABASE_URL and SUPABASE_ANON_KEY must be set').toBeTruthy()
    ;({ c: a, id: aId } = await signUp('a')); ;({ c: b, id: bId } = await signUp('b')); anon = client()
  }, 60_000)
  afterAll(async () => { await a?.rpc('delete_my_account'); await b?.rpc('delete_my_account') })

  it('sign-up creates the profile and settings rows for each user (and only theirs)', async () => {
    expect((await a.from('profiles').select('id')).data).toEqual([{ id: aId }])
    expect((await b.from('user_settings').select('user_id')).data).toEqual([{ user_id: bId }])
  })

  it("B cannot read, change or delete A's task; A still has it", async () => {
    const { data: task, error } = await a.from('tasks').insert({ title: 'A secret' }).select().single()
    expect(error).toBeNull()
    expect(task!.user_id).toBe(aId) // stamped from the JWT, not the client
    expect((await b.from('tasks').select('*').eq('id', task!.id)).data).toEqual([])
    expect((await b.from('tasks').update({ title: 'pwned' }).eq('id', task!.id).select()).data).toEqual([])
    expect((await b.from('tasks').delete().eq('id', task!.id).select()).data).toEqual([])
    expect((await a.from('tasks').select('title').eq('id', task!.id).single()).data).toEqual({ title: 'A secret' })
  })

  it('B cannot create rows owned by A, nor hand a row over', async () => {
    const spoof = await b.from('tasks').insert({ title: 'spoof', user_id: aId }).select()
    expect(spoof.error).toBeTruthy()
    const mine = (await b.from('tasks').insert({ title: 'mine' }).select().single()).data!
    const give = await b.from('tasks').update({ user_id: aId }).eq('id', mine.id).select()
    expect(blocked(give)).toBe(true)
    expect((await a.from('tasks').select('id').eq('id', mine.id)).data).toEqual([])
  })

  it("a child row cannot point at someone else's parent (migration 0005)", async () => {
    const habit = (await a.from('habits').insert({ name: 'A habit' }).select().single()).data!
    const r = await b.from('habit_logs').insert({ habit_id: habit.id, log_date: '2026-11-02', status: 'done' }).select()
    expect(r.error?.message).toMatch(/does not belong to this user/)
  })

  it('anonymous requests (anon key, no session) see and write nothing', async () => {
    const read = await anon.from('tasks').select('*')
    expect(blocked(read)).toBe(true)
    expect((await anon.from('tasks').insert({ title: 'x' }).select()).error).toBeTruthy()
    expect((await anon.rpc('add_water', { p_date: '2026-11-02', p_ml: 1 })).error).toBeTruthy()
  })

  it('concurrent savings deposits over HTTP all count (migration 0006)', async () => {
    const goal = (await a.from('savings_goals').insert({ name: 'Fund', target_paise: 100000000 }).select().single()).data!
    const results = await Promise.all(Array.from({ length: 15 }, () => a.rpc('add_savings', { p_goal: goal.id, p_paise: 1000 })))
    expect(results.map((r) => r.error)).toEqual(Array(15).fill(null))
    expect((await a.from('savings_goals').select('saved_paise').eq('id', goal.id).single()).data!.saved_paise).toBe(15000)
    expect((await b.rpc('add_savings', { p_goal: goal.id, p_paise: 1 })).error?.message).toMatch(/not found/i)
  })

  it('concurrent water additions over HTTP all count, in one row per day', async () => {
    await Promise.all(Array.from({ length: 15 }, () => a.rpc('add_water', { p_date: '2026-11-02', p_ml: 100 })))
    const rows = (await a.from('health_logs').select('water_ml').eq('log_date', '2026-11-02')).data!
    expect(rows).toEqual([{ water_ml: 1500 }])
  })

  it('push tokens: written through functions only, visible only to their owner', async () => {
    expect((await a.rpc('register_push_token', { p_token: `ExponentPushToken[api-${stamp}]`, p_platform: 'android', p_device_name: 'CI' })).error).toBeNull()
    expect((await a.from('device_push_tokens').select('token')).data).toHaveLength(1)
    expect((await b.from('device_push_tokens').select('token')).data).toEqual([])
    expect((await a.from('device_push_tokens').insert({ token: 'ExponentPushToken[direct]', platform: 'ios' })).error).toBeTruthy()
  })
})
