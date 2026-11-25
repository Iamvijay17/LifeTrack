import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './helpers'

// 0022_global_search.sql against the real migrated schema: matching, filters, sorting, paging, escaping, isolation and module locks.

let ctx: Awaited<ReturnType<typeof createDb>>
let A: string
let B: string
beforeAll(async () => {
  ctx = await createDb()
  A = await ctx.newUser('search-a@example.com')
  B = await ctx.newUser('search-b@example.com')
  const q = ctx.q
  await q(`insert into tasks(user_id, title, notes, category, priority, status, due_date) values
    ($1,'Read the React docs','chapter on hooks','Learning','high','pending','2026-11-02'),
    ($1,'Buy milk','','Personal','low','done','2026-10-01'),
    ($1,'Reactor safety review','learning notes about react','Job Search','medium','pending','2026-12-05'),
    ($1,'100% done_ish','literal wildcard characters','Personal','low','pending','2026-11-10'),
    ($2,'Secret react plan','not for A','Personal','high','pending','2026-11-02')`, [A, B])
  await q(`insert into notes(user_id, title, body, category, tags) values ($1,'React hooks','useEffect is tricky','Learning','{react,hooks}')`, [A])
  await q(`insert into transactions(user_id, type, amount_paise, category, txn_date, note) values ($1,'expense',25000,'Food','2026-11-03','React meetup snacks')`, [A])
  await q(`insert into learning_topics(user_id, group_name, name, created_at) values ($1,'Frontend','React','2026-11-05 09:00+00')`, [A])
  await q(`insert into calendar_events(user_id, title, starts_at, ends_at, category, priority, timezone) values ($1,'React workshop','2026-11-20 10:00+00','2026-11-20 11:00+00','learning','urgent','UTC')`, [A])
  const topic = (await q(`select id from learning_topics where user_id = $1`, [A])).rows[0].id
  await q(`insert into study_sessions(user_id, topic_id, session_date, status, duration_seconds, notes) values ($1,$2,'2026-11-04','completed',1800,'practised hooks')`, [A, topic])
})
afterAll(async () => { await ctx.db.close() })

type Hit = { kind: string; id: string; title: string; snippet: string; rank: number; day: string | null; status: string | null }
const search = async (user: string, args: Record<string, unknown> = {}) => {
  const a = { p_terms: [], p_modules: null, p_from: null, p_to: null, p_status: null, p_category: null, p_priority: null, p_sort: 'relevance', p_limit: 20, p_offset: 0, ...args }
  const r = await ctx.asUser(user, (q) =>
    q(`select public.global_search($1::text[], $2::text[], $3::date, $4::date, $5::text[], $6::text[], $7::text[], $8, $9, $10) as r`,
      [a.p_terms, a.p_modules, a.p_from, a.p_to, a.p_status, a.p_category, a.p_priority, a.p_sort, a.p_limit, a.p_offset]))
  return r.rows[0].r as { total: number; rows: Hit[] }
}

describe('global_search', () => {
  it('finds rows across modules, best title match first', async () => {
    const r = await search(A, { p_terms: ['react'] })
    const kinds = r.rows.map((x) => x.kind).sort()
    expect(kinds).toEqual(['event', 'note', 'study', 'task', 'task', 'topic', 'transaction'])
    expect(r.total).toBe(r.rows.length)
    // "React" (the topic) is an exact title match and leads; the word-start match ("Read the React docs") beats the prefix-less "contains".
    expect(r.rows[0]).toMatchObject({ kind: 'topic', title: 'React', rank: 100 })
    const ranks = r.rows.map((x) => x.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
  })
  it('requires every term, in the title or the text, in any order', async () => {
    const r = await search(A, { p_terms: ['hooks', 'react'] })
    // the study session counts too: titled after its topic (React), with "hooks" in its notes
    expect(r.rows.map((x) => x.title).sort()).toEqual(['React', 'React hooks', 'Read the React docs'])
    expect((await search(A, { p_terms: ['react', 'nonexistentterm'] })).total).toBe(0)
  })
  it('treats % _ and \\ as plain text, not wildcards', async () => {
    expect((await search(A, { p_terms: ['%'] })).rows.map((x) => x.title)).toEqual(['100% done_ish'])
    expect((await search(A, { p_terms: ['done_ish'] })).total).toBe(1)
    expect((await search(A, { p_terms: ['d_ne'] })).total).toBe(0)
    expect((await search(A, { p_terms: ['\\'] })).total).toBe(0)
  })
  it('names a study session after its topic and shows a snippet of its notes', async () => {
    const r = await search(A, { p_terms: ['hooks'], p_modules: ['learning'] })
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ kind: 'study', title: 'React', snippet: 'practised hooks' })
  })
  it('filters by module, date range, status, category and priority', async () => {
    expect((await search(A, { p_terms: ['react'], p_modules: ['finance'] })).rows.map((x) => x.kind)).toEqual(['transaction'])
    const range = await search(A, { p_terms: ['react'], p_from: '2026-11-03', p_to: '2026-11-30' })
    // the topic has no date of its own: it counts from the day it was created
    expect(range.rows.map((x) => x.kind).sort()).toEqual(['event', 'note', 'study', 'topic', 'transaction'])
    expect((await search(A, { p_terms: ['react'], p_status: ['done'] })).total).toBe(0)
    expect((await search(A, { p_status: ['done'] })).rows.map((x) => x.title)).toEqual(['Buy milk'])
    expect((await search(A, { p_terms: ['react'], p_category: ['Learning'] })).rows.map((x) => x.kind).sort()).toEqual(['note', 'task'])
    expect((await search(A, { p_terms: ['react'], p_priority: ['urgent'] })).rows.map((x) => x.kind)).toEqual(['event'])
  })
  it('swaps a reversed date range instead of failing', async () => {
    expect((await search(A, { p_terms: ['react'], p_from: '2026-11-30', p_to: '2026-11-03' })).total).toBe(5)
  })
  it('browses by filters alone (no text), newest first', async () => {
    const r = await search(A, { p_modules: ['planner'] })
    expect(r.rows.map((x) => x.day)).toEqual(['2026-12-05', '2026-11-10', '2026-11-02', '2026-10-01'])
  })
  it('sorts newest and oldest by the record date', async () => {
    const newest = await search(A, { p_terms: ['react'], p_sort: 'newest' })
    const oldest = await search(A, { p_terms: ['react'], p_sort: 'oldest' })
    const days = (r: { rows: Hit[] }) => r.rows.map((x) => x.day)
    expect(days(newest)).toEqual([...days(newest)].sort().reverse().map((d) => d))
    expect(days(oldest)).toEqual([...days(oldest)].sort())
    expect(oldest.rows[0].id).not.toBe(newest.rows[0].id)
  })
  it('pages without gaps or repeats, and reports the total', async () => {
    const all = await search(A, { p_terms: ['react'], p_limit: 50 })
    const p1 = await search(A, { p_terms: ['react'], p_limit: 3, p_offset: 0 })
    const p2 = await search(A, { p_terms: ['react'], p_limit: 3, p_offset: 3 })
    const p3 = await search(A, { p_terms: ['react'], p_limit: 3, p_offset: 6 })
    expect([p1.total, p2.total, p3.total]).toEqual([all.total, all.total, all.total])
    expect([...p1.rows, ...p2.rows, ...p3.rows].map((x) => x.id)).toEqual(all.rows.map((x) => x.id))
    const past = await search(A, { p_terms: ['react'], p_offset: 100 })
    expect(past).toEqual({ total: all.total, rows: [] })
  })
  it('clamps an absurd page size and ignores junk sort values', async () => {
    expect((await search(A, { p_terms: ['react'], p_limit: 100000, p_sort: 'drop table' })).total).toBe(7)
  })
  it('only ever returns the signed-in person\'s own rows', async () => {
    const b = await search(B, { p_terms: ['react'] })
    expect(b.rows.map((x) => x.title)).toEqual(['Secret react plan'])
    expect((await search(A, { p_terms: ['secret'] })).total).toBe(0)
    // Even the id of the other person's row never surfaces for A.
    expect(JSON.stringify(await search(A, { p_terms: ['react'] }))).not.toContain(b.rows[0].id)
  })
  it('refuses a signed-out caller and the anonymous role', async () => {
    expect(await ctx.fails(ctx.asAnon((q) => q(`select public.global_search('{react}')`)))).toMatch(/permission denied/i)
  })
  it('follows the module locks: a locked session finds nothing from the locked module', async () => {
    const user = await ctx.newUser('search-lock@example.com')
    const phone = await ctx.newSession(user)
    const laptop = await ctx.newSession(user)
    await ctx.q(`insert into transactions(user_id, type, amount_paise, category, txn_date, note) values ($1,'expense',100,'Food','2026-11-03','locked lunch')`, [user])
    await ctx.q(`insert into tasks(user_id, title) values ($1,'locked task')`, [user])
    await ctx.asUser(user, (q) => q(`select set_pin('2486')`), phone)
    await ctx.asUser(user, (q) => q(`select set_lock_modules('modules', array['finance'])`), phone)
    const as = (session: string) => ctx.asUser(user, async (q) => (await q(`select public.global_search('{locked}') as r`)).rows[0].r as { total: number; rows: Hit[] }, session)
    expect((await as(phone)).rows.map((x) => x.kind).sort()).toEqual(['task', 'transaction'])
    expect((await as(laptop)).rows.map((x) => x.kind)).toEqual(['task'])
  })
})
