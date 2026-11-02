// DEV-ONLY adapter used when Supabase credentials are missing. Data lives in THIS browser only and is NOT
// synced across devices. It exists so the UI can be developed/tested without a cloud project, and it
// emulates the pieces of the database the app relies on (defaults, unique constraints, status-history trigger,
// cross-tab "realtime"). Production = Supabase.
import { getUserId } from './session'
import { DEFAULTS, UNIQUES } from './schema'
import { AppError } from './errors'

const key = () => `lifetrack-dev:db:${getUserId()}`
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(key())) ?? {}
  } catch {
    return {}
  }
}
const write = (db) => localStorage.setItem(key(), JSON.stringify(db))
const uuid = () =>
  crypto.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 3) | 8).toString(16)
  })
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)))

// Created lazily so importing this module has no side effects (lets bundlers drop it from production builds).
let bc
const channel = () => {
  if (bc === undefined) {
    bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lifetrack-dev') : null
    bc?.addEventListener('message', (e) => {
      if (e.data.uid === getUserId()) localListeners.forEach((cb) => cb(e.data.table))
    })
  }
  return bc
}
const localListeners = new Set()
const notify = (table) => {
  channel()?.postMessage({ table, uid: getUserId() }) // other tabs
  queueMicrotask(() => localListeners.forEach((cb) => cb(table))) // this tab (Supabase Realtime also echoes your own changes)
}

const dup = () => new AppError('That record already exists.', { code: '23505' })

function violatesUnique(table, rows, row, selfId) {
  for (const u of UNIQUES[table] ?? []) {
    if (u.when && !u.when(row)) continue
    if (rows.some((o) => o.id !== selfId && (!u.when || u.when(o)) && u.cols.every((c) => o[c] === row[c]))) return true
  }
  return false
}

// Columns whose database default is now()
const NOW_COLUMNS = { application_history: ['changed_at'], study_sessions: ['started_at'], focus_sessions: ['started_at'] }

// Strictly increasing timestamps keep ordering deterministic for rows written in the same millisecond.
let lastTs = 0
const monotonicNow = () => {
  lastTs = Math.max(Date.now(), lastTs + 1)
  return new Date(lastTs).toISOString()
}

function buildRow(table, input) {
  const now = monotonicNow()
  const nowDefaults = Object.fromEntries((NOW_COLUMNS[table] ?? []).map((c) => [c, now]))
  return {
    id: uuid(),
    created_at: now,
    updated_at: now,
    ...nowDefaults,
    ...clone(DEFAULTS[table] ?? {}),
    ...clone(input),
    user_id: getUserId(),
  }
}

/** Emulates public.log_application_status() */
function afterWrite(db, table, row, old) {
  if (table !== 'job_applications') return
  if (!old || old.status !== row.status) {
    db.application_history ??= []
    db.application_history.push(
      buildRow('application_history', { application_id: row.id, from_status: old?.status ?? null, to_status: row.status }),
    )
  }
}

export const localAdapter = {
  name: 'local',

  async list(table) {
    const rows = clone(read()[table] ?? [])
    return rows.sort((a, b) => (a.created_at + a.id).localeCompare(b.created_at + b.id))
  },

  async insert(table, inputs) {
    const db = read()
    const rows = (db[table] ??= [])
    const out = inputs.map((i) => {
      const row = buildRow(table, i)
      if (violatesUnique(table, rows, row, null)) throw dup()
      rows.push(row)
      afterWrite(db, table, row, null)
      return row
    })
    write(db)
    notify(table)
    if (table === 'job_applications') notify('application_history')
    return clone(out)
  },

  async update(table, id, patch) {
    const db = read()
    const rows = (db[table] ??= [])
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) throw new AppError('That record could not be found.', { code: 'PGRST116' })
    const { user_id, id: _id, created_at, ...clean } = patch
    const next = { ...rows[i], ...clone(clean), updated_at: new Date().toISOString() }
    if (violatesUnique(table, rows, next, id)) throw dup()
    afterWrite(db, table, next, rows[i])
    rows[i] = next
    write(db)
    notify(table)
    if (table === 'job_applications') notify('application_history')
    return clone(next)
  },

  async upsert(table, inputs, { onConflict = 'id', ignoreDuplicates = false } = {}) {
    const db = read()
    const rows = (db[table] ??= [])
    const cols = onConflict.split(',')
    const out = []
    for (const input of inputs) {
      const candidate = { ...input, user_id: getUserId() }
      const i = rows.findIndex((r) => cols.every((c) => r[c] === candidate[c]))
      if (i >= 0) {
        if (ignoreDuplicates) continue
        const { id, created_at, ...rest } = candidate
        const next = { ...rows[i], ...clone(rest), updated_at: new Date().toISOString() }
        if (violatesUnique(table, rows, next, rows[i].id)) throw dup()
        afterWrite(db, table, next, rows[i])
        rows[i] = next
        out.push(next)
      } else {
        const row = buildRow(table, candidate)
        if (violatesUnique(table, rows, row, null)) throw dup()
        rows.push(row)
        afterWrite(db, table, row, null)
        out.push(row)
      }
    }
    write(db)
    notify(table)
    if (table === 'job_applications') notify('application_history')
    return clone(out)
  },

  async remove(table, id) {
    return this.removeMany(table, [id])
  },

  async removeMany(table, ids) {
    const db = read()
    const set = new Set(ids)
    db[table] = (db[table] ?? []).filter((r) => !set.has(r.id))
    // emulate ON DELETE CASCADE / SET NULL
    const cascade = {
      habits: [['habit_logs', 'habit_id']],
      job_applications: [
        ['application_history', 'application_id'],
        ['interview_events', 'application_id'],
      ],
      workouts: [['exercise_logs', 'workout_id']],
      goals: [['milestones', 'goal_id']],
    }
    for (const [child, col] of cascade[table] ?? []) db[child] = (db[child] ?? []).filter((r) => !set.has(r[col]))
    const setNull = {
      goals: [
        ['study_sessions', 'goal_id'],
        ['notes', 'goal_id'],
      ],
      tasks: [
        ['notes', 'task_id'],
        ['focus_sessions', 'task_id'],
      ],
      learning_topics: [
        ['study_sessions', 'topic_id'],
        ['goals', 'topic_id'],
        ['focus_sessions', 'topic_id'],
      ],
      routines: [['workouts', 'routine_id']],
    }
    for (const [child, col] of setNull[table] ?? []) db[child] = (db[child] ?? []).map((r) => (set.has(r[col]) ? { ...r, [col]: null } : r))
    write(db)
    notify(table)
  },

  subscribe(onChange, onStatus) {
    channel() // start listening for other tabs
    localListeners.add(onChange)
    onStatus?.('SUBSCRIBED')
    return () => localListeners.delete(onChange)
  },

  /** Dev helper: wipe everything for the current dev user. */
  wipe() {
    localStorage.removeItem(key())
  },
}
