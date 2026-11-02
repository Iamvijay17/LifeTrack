// Cloud-first data store. Supabase is the source of truth; this is only an in-memory cache that is
// (a) filled from the database, (b) updated from confirmed write responses, and (c) invalidated by
// Realtime events, window focus, reconnects and a slow safety-net poll. Nothing here is persisted locally.
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { db } from '@/services/db'
import { toAppError } from '@/services/errors'

const EMPTY = Object.freeze({ rows: Object.freeze([]), status: 'idle', error: null })
const state = new Map() // table -> { rows, status: idle|loading|ready|error, error }
const subs = new Map() // table -> Set<fn>
const inflight = new Map() // table -> Promise
const timers = new Map()
let epoch = 0 // bumps on sign-out so stale responses are dropped

const get = (t) => state.get(t) ?? EMPTY
function set(t, patch) {
  state.set(t, { ...get(t), ...patch })
  subs.get(t)?.forEach((f) => f())
}

export function load(table, { force = false } = {}) {
  const cur = get(table)
  if (!force && (cur.status === 'ready' || cur.status === 'loading')) return inflight.get(table) ?? Promise.resolve()
  if (inflight.has(table)) return inflight.get(table)
  const my = epoch
  if (cur.status !== 'ready') set(table, { status: 'loading', error: null })
  const p = db
    .list(table)
    .then((rows) => {
      if (my === epoch) set(table, { rows, status: 'ready', error: null })
    })
    .catch((e) => {
      if (my === epoch) set(table, { status: 'error', error: toAppError(e).message })
    })
    .finally(() => inflight.delete(table))
  inflight.set(table, p)
  return p
}

export const refetch = (table) => load(table, { force: true })

/** Re-pull every table that has been loaded (used on focus / reconnect / realtime reconnect). */
export function refetchLoaded() {
  return Promise.all([...state.keys()].filter((t) => get(t).status !== 'idle').map((t) => refetch(t)))
}

export function scheduleRefetch(table) {
  clearTimeout(timers.get(table))
  timers.set(
    table,
    setTimeout(() => {
      if (state.has(table)) refetch(table)
    }, 250),
  )
}

export function resetStore() {
  epoch++
  inflight.clear()
  timers.forEach(clearTimeout)
  const keys = [...state.keys()]
  state.clear()
  keys.forEach((t) => subs.get(t)?.forEach((f) => f()))
}

// ------------------------------------------------------------ cache patching
const upsertLocal = (table, rows) => {
  const cur = [...get(table).rows]
  for (const r of rows) {
    const i = cur.findIndex((x) => x.id === r.id)
    if (i >= 0) cur[i] = r
    else cur.push(r)
  }
  set(table, { rows: cur, status: 'ready' })
}
const removeLocal = (table, ids) => {
  const s = new Set(ids)
  set(table, { rows: get(table).rows.filter((r) => !s.has(r.id)) })
}

// ---------------------------------------------------------------- save status
const save = { pending: 0, status: 'idle', error: null, savedAt: null }
const saveSubs = new Set()
let saveSnap = { ...save }
const emitSave = () => {
  saveSnap = { ...save }
  saveSubs.forEach((f) => f())
}
let savedTimer
export async function tracked(fn) {
  save.pending++
  save.status = 'saving'
  save.error = null
  emitSave()
  try {
    const out = await fn()
    save.pending--
    if (save.pending === 0) {
      save.status = 'saved'
      save.savedAt = Date.now()
      clearTimeout(savedTimer)
      savedTimer = setTimeout(() => {
        if (save.pending === 0 && save.status === 'saved') {
          save.status = 'idle'
          emitSave()
        }
      }, 2500)
    }
    emitSave()
    return out
  } catch (e) {
    save.pending--
    const err = toAppError(e)
    save.status = 'error'
    save.error = err.message
    emitSave()
    throw err
  }
}
export const useSaveStatus = () =>
  useSyncExternalStore(
    (f) => {
      saveSubs.add(f)
      return () => saveSubs.delete(f)
    },
    () => saveSnap,
  )
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (save.pending > 0) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
}

// Tables that database triggers write to as a side effect of writing another table.
const TRIGGER_TARGETS = { job_applications: ['application_history'] }
const afterWrite = (table) => {
  for (const t of TRIGGER_TARGETS[table] ?? []) if (state.has(t)) scheduleRefetch(t)
}

// ------------------------------------------------------------------ mutations
export const insert = (table, rows) =>
  tracked(async () => {
    const out = await db.insert(table, Array.isArray(rows) ? rows : [rows])
    upsertLocal(table, out)
    afterWrite(table)
    return Array.isArray(rows) ? out : out[0]
  })
export const update = (table, id, patch) =>
  tracked(async () => {
    const row = await db.update(table, id, patch)
    upsertLocal(table, [row])
    afterWrite(table)
    return row
  })
export const upsert = (table, rows, opts) =>
  tracked(async () => {
    const out = await db.upsert(table, Array.isArray(rows) ? rows : [rows], opts)
    upsertLocal(table, out)
    afterWrite(table)
    return Array.isArray(rows) ? out : out[0]
  })
export const remove = (table, id) =>
  tracked(async () => {
    await db.remove(table, id)
    removeLocal(table, [id])
  })
export const removeMany = (table, ids) =>
  tracked(async () => {
    await db.removeMany(table, ids)
    removeLocal(table, ids)
  })

// ---------------------------------------------------------------------- hooks
export function useTable(table) {
  const snap = useSyncExternalStore(
    (f) => {
      let s = subs.get(table)
      if (!s) subs.set(table, (s = new Set()))
      s.add(f)
      return () => s.delete(f)
    },
    () => get(table),
  )
  useEffect(() => {
    load(table)
  }, [table, snap.status])
  return {
    rows: snap.rows,
    loading: snap.status === 'idle' || (snap.status === 'loading' && snap.rows.length === 0),
    error: snap.error,
    refetch: () => refetch(table),
  }
}

/** Load several tables at once. `data[table]` is always an array. */
export function useTables(...tables) {
  const parts = tables.map((t) => useTable(t)) // eslint-disable-line react-hooks/rules-of-hooks -- fixed list per call site
  const key = tables.join(',')
  return useMemo(
    () => ({
      data: Object.fromEntries(tables.map((t, i) => [t, parts[i].rows])),
      loading: parts.some((p) => p.loading),
      error: parts.find((p) => p.error)?.error ?? null,
      refetch: () => Promise.all(parts.map((p) => p.refetch())),
    }),
    // `tables` is a fixed list per call site and `parts` is derived from it; depending on each part's rows/loading/error keeps the memo exact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, ...parts.map((p) => p.rows), ...parts.map((p) => p.loading), ...parts.map((p) => p.error)],
  )
}

// ------------------------------------------------------------------- realtime
let unsub = null
let pollTimer = null
export function startSync(onStatus) {
  stopSync()
  unsub = db.subscribe(
    (table) => scheduleRefetch(table),
    (status) => {
      onStatus?.(status)
      if (status === 'SUBSCRIBED') refetchLoaded() // catch up on anything missed while disconnected
    },
  )
  const onVisible = () => {
    if (document.visibilityState === 'visible') refetchLoaded()
  }
  window.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', onVisible)
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) refetchLoaded()
  }, 90_000)
  stopFns = () => {
    window.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('online', onVisible)
    clearInterval(pollTimer)
  }
}
let stopFns = null
export function stopSync() {
  unsub?.()
  unsub = null
  stopFns?.()
  stopFns = null
}

/** Synchronous read of the cached rows (for read-modify-write helpers). */
export const peek = (table) => get(table).rows
