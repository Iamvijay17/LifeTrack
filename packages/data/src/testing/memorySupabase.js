// In-memory fake of the supabase-js query builder with the Postgres/PostgREST behaviour the app relies on:
// row ownership (RLS), defaults, unique constraints (incl. partial), strictly-increasing timestamps, the 1000-row response cap,
// atomic multi-row writes, the application-status history trigger, cascades and RLS-filtered realtime events.
// TEST DOUBLE ONLY. The real thing is exercised by the SQL/RLS suites and (in CI) a local Supabase stack.
import { DEFAULTS, UNIQUES } from '@lifetrack/constants/schema'
import { getUserId } from '../session'

export const MAX_ROWS = 1000
const err = (code, message) => ({ code, message })
const clone = (v) => (v == null ? v : structuredClone(v))
const CASCADE = { habits: [['habit_logs', 'habit_id']], job_applications: [['application_history', 'application_id'], ['interview_events', 'application_id']], workouts: [['exercise_logs', 'workout_id']], goals: [['milestones', 'goal_id']] }
const NOW_COLUMNS = { application_history: ['changed_at'], study_sessions: ['started_at'], focus_sessions: ['started_at'] }
const owner = (table, row) => (table === 'profiles' ? row.id : row.user_id)

export function createMemorySupabase({ currentUser = getUserId } = {}) {
  const tables = {}
  const rows = (t) => (tables[t] ??= [])
  const channels = new Set()
  let tick = 0
  const nowIso = () => new Date(Date.UTC(2026, 0, 1) + ++tick * 1000).toISOString()
  // Realtime: each binding is { filter: { event, table, filter: 'user_id=eq.<uid>' }, cb }. RLS decides who is told; payloads look like Supabase's.
  const emit = (table, uidOfRow, eventType, row) => {
    const payload = { eventType, schema: 'public', table, new: eventType === 'DELETE' ? {} : clone(row), old: eventType === 'INSERT' ? {} : { id: row?.id } }
    for (const ch of channels) {
      if (!ch.active || ch.uid !== uidOfRow) continue
      for (const b of ch.bindings) {
        const f = b.filter ?? {}
        if ((f.table && f.table !== table) || (f.event && f.event !== '*' && f.event !== eventType)) continue
        if (f.filter && eventType !== 'DELETE' && f.filter !== `user_id=eq.${uidOfRow}`) continue
        b.cb(payload)
      }
    }
  }

  const violatesUnique = (table, row, selfId) => {
    for (const u of UNIQUES[table] ?? []) {
      if (u.when && !u.when(row)) continue
      if (rows(table).some((o) => o.id !== selfId && (!u.when || u.when(o)) && u.cols.every((c) => o[c] === row[c]))) return true
    }
    return false
  }
  const build = (table, input, uid) => {
    const now = nowIso()
    const nowDefaults = Object.fromEntries((NOW_COLUMNS[table] ?? []).map((c) => [c, now]))
    return { id: crypto.randomUUID(), created_at: now, updated_at: now, ...nowDefaults, ...clone(DEFAULTS[table] ?? {}), ...clone(input), user_id: input.user_id ?? uid }
  }
  const history = (row, old, uid) => { // public.log_application_status()
    if (!old || old.status !== row.status) rows('application_history').push({ id: crypto.randomUUID(), user_id: uid, application_id: row.id, from_status: old?.status ?? null, to_status: row.status, note: '', changed_at: nowIso(), created_at: nowIso() })
  }

  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.sort = []; this.returning = false; this.one = false; this.from = 0; this.to = null }
    select() { if (this.op === 'select') this.op = 'select'; else this.returning = true; return this }
    insert(payload) { this.op = 'insert'; this.payload = Array.isArray(payload) ? payload : [payload]; return this }
    update(patch) { this.op = 'update'; this.patch = patch; return this }
    upsert(payload, opts = {}) { this.op = 'upsert'; this.payload = Array.isArray(payload) ? payload : [payload]; this.opts = opts; return this }
    delete() { this.op = 'delete'; return this }
    eq(col, val) { this.filters.push((r) => r[col] === val); return this }
    in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this }
    order(col, { ascending = true } = {}) { this.sort.push({ col, ascending }); return this }
    range(from, to) { this.from = from; this.to = to; return this }
    single() { this.one = true; return this }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject) }

    run() {
      const uid = currentUser()
      const t = this.table
      if (!uid) return { data: null, error: err('42501', 'permission denied for table ' + t) } // anon role has no privileges
      const mine = () => rows(t).filter((r) => owner(t, r) === uid && this.filters.every((f) => f(r)))
      let out = []
      if (this.op === 'insert') {
        const staged = []
        for (const input of this.payload) {
          if (input.user_id && input.user_id !== uid) return { data: null, error: err('42501', 'new row violates row-level security policy for table "' + t + '"') }
          const row = build(t, input, uid)
          if (violatesUnique(t, row, null) || staged.some((s) => (UNIQUES[t] ?? []).some((u) => (!u.when || (u.when(s) && u.when(row))) && u.cols.every((c) => s[c] === row[c])))) return { data: null, error: err('23505', 'duplicate key value violates unique constraint') }
          staged.push(row)
        }
        for (const row of staged) { rows(t).push(row); if (t === 'job_applications') history(row, null, uid) }
        out = staged
        staged.forEach((row) => emit(t, uid, 'INSERT', row)); if (t === 'job_applications') emit('application_history', uid, 'INSERT', {})
      } else if (this.op === 'update') {
        if (this.patch.user_id && this.patch.user_id !== uid) return { data: null, error: err('42501', 'new row violates row-level security policy for table "' + t + '"') }
        const targets = mine()
        const staged = targets.map((r) => ({ ...r, ...clone(this.patch), updated_at: nowIso() }))
        for (const s of staged) if (violatesUnique(t, s, s.id)) return { data: null, error: err('23505', 'duplicate key value violates unique constraint') }
        staged.forEach((s, i) => { const idx = rows(t).findIndex((r) => r.id === s.id); if (t === 'job_applications') history(s, rows(t)[idx], uid); rows(t)[idx] = s })
        out = staged
        staged.forEach((row) => emit(t, uid, 'UPDATE', row)); if (staged.length && t === 'job_applications') emit('application_history', uid, 'INSERT', {})
      } else if (this.op === 'upsert') {
        const cols = (this.opts.onConflict ?? 'id').split(',')
        const result = []
        for (const input of this.payload) {
          if (input.user_id && input.user_id !== uid) return { data: null, error: err('42501', 'new row violates row-level security policy for table "' + t + '"') }
          const cand = { user_id: uid, ...input }
          const idx = rows(t).findIndex((r) => owner(t, r) === uid && cols.every((c) => r[c] === cand[c]))
          if (idx >= 0) {
            if (this.opts.ignoreDuplicates) continue
            const next = { ...rows(t)[idx], ...clone(input), id: rows(t)[idx].id, created_at: rows(t)[idx].created_at, user_id: uid, updated_at: nowIso() }
            if (violatesUnique(t, next, next.id)) return { data: null, error: err('23505', 'duplicate key value violates unique constraint') }
            rows(t)[idx] = next; result.push(next); emit(t, uid, 'UPDATE', next)
          } else {
            const row = build(t, cand, uid)
            if (violatesUnique(t, row, null)) return { data: null, error: err('23505', 'duplicate key value violates unique constraint') }
            rows(t).push(row); result.push(row); emit(t, uid, 'INSERT', row)
          }
        }
        out = result
      } else if (this.op === 'delete') {
        const targets = mine()
        const ids = new Set(targets.map((r) => r.id))
        tables[t] = rows(t).filter((r) => !ids.has(r.id))
        for (const [child, col] of CASCADE[t] ?? []) tables[child] = rows(child).filter((r) => !ids.has(r[col]))
        out = targets
        targets.forEach((row) => emit(t, uid, 'DELETE', row))
      } else {
        out = mine()
        for (const { col, ascending } of [...this.sort].reverse()) out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1))
        const upper = this.to == null ? MAX_ROWS - 1 : Math.min(this.to, this.from + MAX_ROWS - 1) // PostgREST never returns more than its max-rows
        out = out.slice(this.from, upper + 1)
        return this.finish(out.map(clone))
      }
      if (!this.returning) return { data: null, error: null }
      return this.finish(out.map(clone))
    }
    finish(data) {
      if (this.one) return data.length === 1 ? { data: data[0], error: null } : { data: null, error: err('PGRST116', 'JSON object requested, multiple (or no) rows returned') }
      return { data, error: null }
    }
  }

  return {
    tables,
    from: (t) => new Query(t),
    /** The database functions the app calls (add_water, add_savings, replace_exercise_logs). Single-threaded here, so trivially atomic. */
    rpc: async (fn, args) => {
      const uid = currentUser()
      if (!uid) return { data: null, error: err('42501', 'permission denied for function ' + fn) }
      const own = (t) => rows(t).filter((r) => r.user_id === uid)
      if (fn === 'add_water') {
        const cur = own('health_logs').find((r) => r.log_date === args.p_date)
        const clamp = (n) => Math.max(0, Math.min(20000, n))
        return cur
          ? new Query('health_logs').update({ water_ml: clamp(cur.water_ml + args.p_ml) }).eq('id', cur.id).select().single()
          : new Query('health_logs').insert({ log_date: args.p_date, water_ml: clamp(args.p_ml) }).select().single()
      }
      if (fn === 'add_savings') {
        if (!Number.isInteger(args.p_paise) || args.p_paise <= 0) return { data: null, error: err('P0001', 'Enter an amount greater than 0.') }
        const cur = own('savings_goals').find((r) => r.id === args.p_goal)
        if (!cur) return { data: null, error: err('P0001', 'Savings goal not found.') }
        return new Query('savings_goals').update({ saved_paise: cur.saved_paise + args.p_paise }).eq('id', cur.id).select().single()
      }
      if (fn === 'replace_exercise_logs') {
        if (!own('workouts').some((w) => w.id === args.p_workout)) return { data: null, error: err('P0002', 'workout not found') }
        tables.exercise_logs = rows('exercise_logs').filter((r) => r.workout_id !== args.p_workout)
        const fresh = args.p_sets.map((x) => build('exercise_logs', { ...x, workout_id: args.p_workout }, uid))
        fresh.forEach((r) => rows('exercise_logs').push(r))
        return { data: clone(fresh), error: null }
      }
      return { data: null, error: err('42883', `function ${fn} does not exist`) }
    },
    channel: () => {
      const ch = { bindings: [], active: false, uid: currentUser(), on(_type, filter, cb) { ch.bindings.push({ filter, cb }); return ch }, subscribe(status) { ch.active = true; channels.add(ch); Promise.resolve().then(() => status?.('SUBSCRIBED')); return ch } }
      return ch
    },
    removeChannel: (ch) => { ch.active = false; channels.delete(ch) },
    /** direct read for assertions, bypassing ownership */
    dump: (t) => clone(rows(t)),
  }
}
