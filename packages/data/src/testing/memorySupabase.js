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
  const emit = (table, uidOfRow, eventType) => { for (const ch of channels) if (ch.active && ch.uid === uidOfRow) ch.handlers.forEach((h) => h({ table, eventType })) }

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
        staged.forEach(() => emit(t, uid, 'INSERT')); if (t === 'job_applications') emit('application_history', uid, 'INSERT')
      } else if (this.op === 'update') {
        if (this.patch.user_id && this.patch.user_id !== uid) return { data: null, error: err('42501', 'new row violates row-level security policy for table "' + t + '"') }
        const targets = mine()
        const staged = targets.map((r) => ({ ...r, ...clone(this.patch), updated_at: nowIso() }))
        for (const s of staged) if (violatesUnique(t, s, s.id)) return { data: null, error: err('23505', 'duplicate key value violates unique constraint') }
        staged.forEach((s, i) => { const idx = rows(t).findIndex((r) => r.id === s.id); if (t === 'job_applications') history(s, rows(t)[idx], uid); rows(t)[idx] = s })
        out = staged
        if (staged.length) { emit(t, uid, 'UPDATE'); if (t === 'job_applications') emit('application_history', uid, 'INSERT') }
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
            rows(t)[idx] = next; result.push(next); emit(t, uid, 'UPDATE')
          } else {
            const row = build(t, cand, uid)
            if (violatesUnique(t, row, null)) return { data: null, error: err('23505', 'duplicate key value violates unique constraint') }
            rows(t).push(row); result.push(row); emit(t, uid, 'INSERT')
          }
        }
        out = result
      } else if (this.op === 'delete') {
        const targets = mine()
        const ids = new Set(targets.map((r) => r.id))
        tables[t] = rows(t).filter((r) => !ids.has(r.id))
        for (const [child, col] of CASCADE[t] ?? []) tables[child] = rows(child).filter((r) => !ids.has(r[col]))
        out = targets
        if (targets.length) emit(t, uid, 'DELETE')
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
    channel: () => {
      const ch = { handlers: [], active: false, uid: currentUser(), on(_type, _filter, cb) { ch.handlers.push(cb); return ch }, subscribe(status) { ch.active = true; channels.add(ch); Promise.resolve().then(() => status?.('SUBSCRIBED')); return ch } }
      return ch
    },
    removeChannel: (ch) => { ch.active = false; channels.delete(ch) },
    /** direct read for assertions, bypassing ownership */
    dump: (t) => clone(rows(t)),
  }
}
