// Behaviour every data adapter must have, so the UI/store can rely on it identically on web (local fake backend) and in production.
// Run it against: the web local adapter, supabaseAdapter-over-fake-client (always) and supabaseAdapter-over-a-real-stack (CI).
// Test-runner functions are injected so the suite works from any package without duplicate-vitest problems.
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const uuid = () => crypto.randomUUID()
const task = (title, extra = {}) => ({ title, due_date: '2026-11-02', ...extra })
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
const failsWith = async (expect, p, code) => { let e; try { await p } catch (x) { e = x } expect(e, 'expected the call to fail').toBeTruthy(); if (code) expect(e.code).toBe(code); return e }

/**
 * @param t        { describe, it, expect, beforeEach }
 * @param label    adapter name for the report
 * @param setup    async () => ({ adapter, as(userId), reset() }) — as() switches the signed-in user; reset() gives a clean database
 */
export function adapterContract(t, label, setup) {
  const { describe, it, expect, beforeEach } = t
  let adapter, as
  beforeEach(async () => { const s = await setup(); adapter = s.adapter; as = s.as; await s.reset(); as(A) })

  describe(`adapter contract: ${label}`, () => {
    it('rpc add_water: creates the day, accumulates, never goes below zero, one row per day', async () => {
      const first = await adapter.rpc('add_water', { p_date: '2026-11-02', p_ml: 250 })
      expect(first).toMatchObject({ log_date: '2026-11-02', water_ml: 250, user_id: A })
      expect((await adapter.rpc('add_water', { p_date: '2026-11-02', p_ml: 500 })).water_ml).toBe(750)
      expect((await adapter.rpc('add_water', { p_date: '2026-11-02', p_ml: -5000 })).water_ml).toBe(0)
      expect((await adapter.list('health_logs')).filter((r) => r.log_date === '2026-11-02')).toHaveLength(1)
    })
    it('rpc add_water is per user', async () => {
      await adapter.rpc('add_water', { p_date: '2026-11-02', p_ml: 300 })
      as(B)
      expect((await adapter.rpc('add_water', { p_date: '2026-11-02', p_ml: 100 })).water_ml).toBe(100)
    })
    it('rpc add_savings: adds, rejects non-positive amounts, and cannot touch another user\'s goal', async () => {
      const [g] = await adapter.insert('savings_goals', [{ name: 'Fund', target_paise: 100000, saved_paise: 1000 }])
      expect((await adapter.rpc('add_savings', { p_goal: g.id, p_paise: 2500 })).saved_paise).toBe(3500)
      for (const bad of [0, -1]) await failsWith(expect, adapter.rpc('add_savings', { p_goal: g.id, p_paise: bad }))
      as(B)
      await failsWith(expect, adapter.rpc('add_savings', { p_goal: g.id, p_paise: 100 }))
      as(A)
      expect((await adapter.list('savings_goals'))[0].saved_paise).toBe(3500)
    })
    it('insert stamps id, owner and timestamps, applies column defaults, and returns the rows', async () => {
      const [row] = await adapter.insert('tasks', [task('Write report')])
      expect(isUuid(row.id)).toBe(true)
      expect(row.user_id).toBe(A)
      expect(row).toMatchObject({ title: 'Write report', status: 'pending', priority: 'medium', recurrence: 'none' })
      expect(row.created_at).toBeTruthy(); expect(row.updated_at).toBeTruthy()
    })
    it("insert can never create a row for another user (a client-supplied user_id is overridden or rejected)", async () => {
      let rows = null
      try { rows = await adapter.insert('tasks', [{ ...task('sneaky'), user_id: B }]) } catch { /* rejected is also acceptable */ }
      if (rows) expect(rows[0].user_id).toBe(A)
      as(B)
      expect(await adapter.list('tasks')).toEqual([])
    })
    it('list returns only the signed-in user\'s rows, oldest first', async () => {
      await adapter.insert('tasks', [task('a1')]); await adapter.insert('tasks', [task('a2')])
      as(B); await adapter.insert('tasks', [task('b1')])
      as(A)
      expect((await adapter.list('tasks')).map((r) => r.title)).toEqual(['a1', 'a2'])
      as(B)
      expect((await adapter.list('tasks')).map((r) => r.title)).toEqual(['b1'])
    })
    it('list returns EVERY row even beyond the 1000-row response cap, without gaps or duplicates', async () => {
      const inputs = Array.from({ length: 1205 }, (_, i) => task(`t${String(i).padStart(4, '0')}`))
      await adapter.insert('tasks', inputs)
      const rows = await adapter.list('tasks')
      expect(rows).toHaveLength(1205)
      expect(new Set(rows.map((r) => r.id)).size).toBe(1205)
      expect(rows.map((r) => r.title)).toEqual(inputs.map((i) => i.title))
    })
    it('update returns the changed row, bumps updated_at, and cannot change id or owner', async () => {
      const [row] = await adapter.insert('tasks', [task('old')])
      const next = await adapter.update('tasks', row.id, { title: 'new', user_id: B, id: uuid() })
      expect(next).toMatchObject({ id: row.id, user_id: A, title: 'new' })
      expect(next.updated_at >= row.updated_at).toBe(true)
      expect((await adapter.list('tasks')).map((r) => r.title)).toEqual(['new'])
    })
    it("update of a row you don't own fails and changes nothing", async () => {
      const [row] = await adapter.insert('tasks', [task('mine')])
      as(B)
      await failsWith(expect, adapter.update('tasks', row.id, { title: 'hijacked' }))
      as(A)
      expect((await adapter.list('tasks'))[0].title).toBe('mine')
    })
    it('update of a missing row fails with "not found"', async () => {
      await failsWith(expect, adapter.update('tasks', uuid(), { title: 'x' }), 'PGRST116')
    })
    it('remove and removeMany delete only your own rows', async () => {
      const rows = await adapter.insert('tasks', [task('a'), task('b'), task('c')])
      as(B); await adapter.remove('tasks', rows[0].id); await adapter.removeMany('tasks', [rows[1].id])
      as(A)
      expect(await adapter.list('tasks')).toHaveLength(3) // B could not delete A's rows
      await adapter.remove('tasks', rows[0].id); await adapter.removeMany('tasks', [rows[1].id, rows[2].id]); await adapter.removeMany('tasks', [])
      expect(await adapter.list('tasks')).toHaveLength(0)
      await adapter.remove('tasks', uuid()) // deleting something that is already gone is not an error
    })
    it('unique constraints: a duplicate is rejected with code 23505, whether by insert or update', async () => {
      const habit = uuid()
      await adapter.insert('habit_logs', [{ habit_id: habit, log_date: '2026-11-02' }])
      await failsWith(expect, adapter.insert('habit_logs', [{ habit_id: habit, log_date: '2026-11-02' }]), '23505')
      const [other] = await adapter.insert('habit_logs', [{ habit_id: habit, log_date: '2026-11-03' }])
      await failsWith(expect, adapter.update('habit_logs', other.id, { log_date: '2026-11-02' }), '23505')
    })
    it('partial unique constraints only apply where their condition holds (recurring task occurrence; one running study timer)', async () => {
      const series = uuid()
      await adapter.insert('tasks', [task('daily', { series_id: series })])
      await failsWith(expect, adapter.insert('tasks', [task('daily again', { series_id: series })]), '23505')
      await adapter.insert('tasks', [task('x'), task('y')]) // no series: any number allowed on the same date
      await adapter.insert('tasks', [task('daily', { series_id: series, due_date: '2026-11-03' })]) // another date is another occurrence
      await adapter.insert('study_sessions', [{ session_date: '2026-11-02', status: 'running', source: 'timer' }])
      await failsWith(expect, adapter.insert('study_sessions', [{ session_date: '2026-11-02', status: 'running', source: 'timer' }]), '23505')
      await adapter.insert('study_sessions', [{ session_date: '2026-11-02', status: 'completed', source: 'manual', duration_seconds: 60 }, { session_date: '2026-11-02', status: 'completed', source: 'manual', duration_seconds: 120 }])
    })
    it('a multi-row insert is all-or-nothing', async () => {
      const habit = uuid()
      await failsWith(expect, adapter.insert('habit_logs', [{ habit_id: habit, log_date: '2026-11-02' }, { habit_id: habit, log_date: '2026-11-02' }]), '23505')
      expect(await adapter.list('habit_logs')).toHaveLength(0)
    })
    it('upsert inserts when missing and updates in place on conflict (one row per key, same id)', async () => {
      const key = { onConflict: 'user_id,log_date' }
      const [a] = await adapter.upsert('health_logs', [{ log_date: '2026-11-02', water_ml: 250 }], key)
      const [b] = await adapter.upsert('health_logs', [{ log_date: '2026-11-02', water_ml: 750 }], key)
      expect(b.id).toBe(a.id)
      const rows = await adapter.list('health_logs')
      expect(rows).toHaveLength(1)
      expect(rows[0].water_ml).toBe(750)
      as(B)
      await adapter.upsert('health_logs', [{ log_date: '2026-11-02', water_ml: 1 }], key) // same key, different user: its own row
      expect(await adapter.list('health_logs')).toHaveLength(1)
    })
    it('upsert with ignoreDuplicates keeps the existing row untouched', async () => {
      const key = { onConflict: 'user_id,name', ignoreDuplicates: true }
      await adapter.upsert('exercises', [{ name: 'Bench', muscle_group: 'Chest' }], key)
      await adapter.upsert('exercises', [{ name: 'Bench', muscle_group: 'CHANGED' }, { name: 'Squat', muscle_group: 'Legs' }], key)
      const rows = await adapter.list('exercises')
      expect(rows.map((r) => [r.name, r.muscle_group])).toEqual([['Bench', 'Chest'], ['Squat', 'Legs']])
    })
    it('changing a job application status records history (database trigger)', async () => {
      const [app] = await adapter.insert('job_applications', [{ company: 'Acme', job_title: 'Dev' }])
      await adapter.update('job_applications', app.id, { status: 'applied' })
      await adapter.update('job_applications', app.id, { notes: 'not a status change' })
      const h = await adapter.list('application_history')
      expect(h.map((x) => [x.from_status, x.to_status])).toEqual([[null, 'interested'], ['interested', 'applied']])
    })
    it('deleting a parent removes its children (habit → logs)', async () => {
      const [habit] = await adapter.insert('habits', [{ name: 'Read' }])
      await adapter.insert('habit_logs', [{ habit_id: habit.id, log_date: '2026-11-02' }])
      await adapter.remove('habits', habit.id)
      expect(await adapter.list('habit_logs')).toHaveLength(0)
    })
    it('subscribe notifies about your own changes (table name only, never row data) and stops after unsubscribe', async () => {
      const seen = []
      const off = adapter.subscribe((table, ...rest) => { seen.push(table); expect(rest).toEqual([]) }, () => {})
      await new Promise((r) => setTimeout(r, 5))
      await adapter.insert('tasks', [task('mine')])
      await new Promise((r) => setTimeout(r, 20))
      expect(seen).toContain('tasks')
      off()
      const before = seen.length
      await adapter.insert('tasks', [task('after unsubscribe')])
      await new Promise((r) => setTimeout(r, 20))
      expect(seen.length).toBe(before)
    })
  })
}
export const CONTRACT_USERS = { A, B }
