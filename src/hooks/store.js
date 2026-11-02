// Cloud-first data store. Supabase is the source of truth; this is only an in-memory cache that is
// (a) filled from the database, (b) updated from confirmed write responses, and (c) invalidated by
// Realtime events, window focus, reconnects and a slow safety-net poll. Nothing here is persisted locally.
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { db } from '@/services/db'
import { toAppError } from '@/services/errors'

const EMPTY = Object.freeze({ rows: Object.freeze([]), status: 'idle', error: null })
const state = new Map()       // table -> { rows, status: idle|loading|ready|error, error }
const subs = new Map()        // table -> Set<fn>
const inflight = new Map()    // table -> Promise
const timers = new Map()
let epoch = 0                 // bumps on sign-out so stale responses are dropped

const get = (t) => state.get(t) ?? EMPTY
function set(t, patch) {
  state.set(t, { ...get(t), ...patch })
  subs.get(t)?.forEach((f) => f())
}

// Every local cache write bumps a per-table version. A fetch that was started before a write may carry an older
// snapshot, so if the version moved while it was in flight the result is discarded and the fetch is repeated.
const versions = new Map()    // table -> number
const dirty = new Set()       // tables that need one more fetch once the in-flight one finishes
const ver = (t) => versions.get(t) ?? 0
const bump = (t) => versions.set(t, ver(t) + 1)
const MAX_ATTEMPTS = 3

export function load(table, { force = false } = {}) {
  const cur = get(table)
  if (inflight.has(table)) { if (force) dirty.add(table); return inflight.get(table) }
  // An errored table is retried only on request (Try again), focus/reconnect or the safety-net sync — never in a render-driven loop.
  if (!force && (cur.status === 'ready' || cur.status === 'error')) return Promise.resolve()
  const my = epoch
  if (cur.status !== 'ready') set(table, { status: 'loading', error: null })
  const run = async () => {
    for (let attempt = 1; ; attempt++) {
      const startVer = ver(table)
      dirty.delete(table)
      let rows
      try { rows = await db.list(table) } catch (e) {
        if (my !== epoch) return
        // A failed background refresh keeps the data already on screen; only a failed first load is an error state.
        if (get(table).status === 'ready') return
        set(table, { status: 'error', error: toAppError(e).message }); return
      }
      if (my !== epoch) return
      const stale = ver(table) !== startVer || dirty.has(table)
      if (stale && attempt < MAX_ATTEMPTS) continue
      set(table, { rows, status: 'ready', error: null })
      if (stale) scheduleRefetch(table)
      return
    }
  }
  const p = run().finally(() => inflight.delete(table))
  inflight.set(table, p)
  return p
}

export const refetch = (table) => load(table, { force: true })

/** Re-pull every table that has been loaded (used on focus / reconnect / realtime reconnect). */
export function refetchLoaded({ readyOnly = false } = {}) {
  const wanted = (t) => (readyOnly ? get(t).status === 'ready' : get(t).status !== 'idle')
  return Promise.all([...state.keys()].filter(wanted).map((t) => refetch(t)))
}

export function scheduleRefetch(table) {
  clearTimeout(timers.get(table))
  timers.set(table, setTimeout(() => { if (state.has(table)) refetch(table) }, 250))
}

export function resetStore() {
  epoch++
  inflight.clear(); dirty.clear(); versions.clear()
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
  bump(table)
  set(table, { rows: cur, status: 'ready' })
}
const removeLocal = (table, ids) => {
  const s = new Set(ids)
  bump(table)
  set(table, { rows: get(table).rows.filter((r) => !s.has(r.id)) })
}
/** Replace the cached rows matching `drop` with `rows` (used by operations that rewrite a group of rows atomically). */
export const patchGroup = (table, drop, rows) => {
  const kept = get(table).rows.filter((r) => !drop(r))
  bump(table)
  set(table, { rows: [...kept, ...rows], status: 'ready' })
}
export const patch = (table, rows) => upsertLocal(table, rows)

const sameFields = (a, b) => Object.keys(b).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
/**
 * Apply a Realtime change straight to the cache instead of re-downloading the table.
 * Echoes of this device's own writes are recognised (the cached row already has those values) and ignored.
 * `payload` is absent for the local DEV adapter, which falls back to a refetch.
 */
export function applyChange(table, payload) {
  if (get(table).status !== 'ready') return // not loaded (or still loading): the load itself will see the change
  if (!payload?.eventType) return scheduleRefetch(table)
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id
    if (!id) return scheduleRefetch(table)
    if (get(table).rows.some((r) => r.id === id)) removeLocal(table, [id])
    return
  }
  const row = payload.new
  if (!row?.id) return scheduleRefetch(table)
  const cached = get(table).rows.find((r) => r.id === row.id)
  if (!cached && payload.eventType === 'UPDATE') return scheduleRefetch(table) // we never saw this row: get the full record
  if (cached) {
    if (cached.updated_at && row.updated_at && Date.parse(cached.updated_at) > Date.parse(row.updated_at)) return // older than what we hold
    if (sameFields(cached, row)) return
    return upsertLocal(table, [{ ...cached, ...row }]) // merge: unchanged large (TOAST) columns may be missing from the payload
  }
  upsertLocal(table, [row])
}

// ---------------------------------------------------------------- save status
const save = { pending: 0, status: 'idle', error: null, savedAt: null }
const saveSubs = new Set()
let saveSnap = { ...save }
const emitSave = () => { saveSnap = { ...save }; saveSubs.forEach((f) => f()) }
let savedTimer
export async function tracked(fn) {
  save.pending++; save.status = 'saving'; save.error = null; emitSave()
  try {
    const out = await fn()
    save.pending--
    if (save.pending === 0) { save.status = 'saved'; save.savedAt = Date.now(); clearTimeout(savedTimer); savedTimer = setTimeout(() => { if (save.pending === 0 && save.status === 'saved') { save.status = 'idle'; emitSave() } }, 2500) }
    emitSave()
    return out
  } catch (e) {
    save.pending--
    const err = toAppError(e)
    save.status = 'error'; save.error = err.message; emitSave()
    throw err
  }
}
export const useSaveStatus = () => useSyncExternalStore((f) => { saveSubs.add(f); return () => saveSubs.delete(f) }, () => saveSnap)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => { if (save.pending > 0) { e.preventDefault(); e.returnValue = '' } })
}

// Tables that database triggers write to as a side effect of writing another table.
const TRIGGER_TARGETS = { job_applications: ['application_history'] }
const afterWrite = (table) => { for (const t of TRIGGER_TARGETS[table] ?? []) if (state.has(t)) scheduleRefetch(t) }

// ------------------------------------------------------------------ mutations
export const insert = (table, rows) => tracked(async () => {
  const out = await db.insert(table, Array.isArray(rows) ? rows : [rows])
  upsertLocal(table, out); afterWrite(table)
  return Array.isArray(rows) ? out : out[0]
})
export const update = (table, id, patch) => tracked(async () => {
  const row = await db.update(table, id, patch)
  upsertLocal(table, [row]); afterWrite(table)
  return row
})
export const upsert = (table, rows, opts) => tracked(async () => {
  const out = await db.upsert(table, Array.isArray(rows) ? rows : [rows], opts)
  upsertLocal(table, out); afterWrite(table)
  return Array.isArray(rows) ? out : out[0]
})
export const remove = (table, id) => tracked(async () => {
  await db.remove(table, id)
  removeLocal(table, [id])
})
export const removeMany = (table, ids) => tracked(async () => {
  await db.removeMany(table, ids)
  removeLocal(table, ids)
})

// ---------------------------------------------------------------------- hooks
export function useTable(table) {
  const snap = useSyncExternalStore(
    (f) => { let s = subs.get(table); if (!s) subs.set(table, (s = new Set())); s.add(f); return () => s.delete(f) },
    () => get(table),
  )
  useEffect(() => { load(table) }, [table, snap.status])
  return { rows: snap.rows, loading: snap.status === 'idle' || (snap.status === 'loading' && snap.rows.length === 0), error: snap.error, refetch: () => refetch(table) }
}

/** Load several tables at once. `data[table]` is always an array. */
export function useTables(...tables) {
  const parts = tables.map((t) => useTable(t)) // eslint-disable-line react-hooks/rules-of-hooks -- fixed list per call site
  const key = tables.join(',')
  return useMemo(() => ({
    data: Object.fromEntries(tables.map((t, i) => [t, parts[i].rows])),
    loading: parts.some((p) => p.loading),
    error: parts.find((p) => p.error)?.error ?? null,
    refetch: () => Promise.all(parts.map((p) => p.refetch())),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [key, ...parts.map((p) => p.rows), ...parts.map((p) => p.loading), ...parts.map((p) => p.error)])
}

// ------------------------------------------------------------------- realtime
const MIN_SYNC_GAP = 5_000
const POLL_MS = 90_000
let unsub = null
let pollTimer = null
let connected = false
let everConnected = false
let lastSync = 0
let stopFns = null

/** Refetch everything loaded, at most once per MIN_SYNC_GAP unless forced (focus + visibility fire together on tab switch). */
function syncAll({ force = false } = {}) {
  const now = Date.now()
  if (!force && now - lastSync < MIN_SYNC_GAP) return Promise.resolve()
  lastSync = now
  return refetchLoaded()
}

export function startSync(onStatus) {
  stopSync()
  unsub = db.subscribe((table, payload) => applyChange(table, payload), (status) => {
    onStatus?.(status)
    connected = status === 'SUBSCRIBED'
    if (connected) {
      // Catch up on anything missed while disconnected (and in the gap before the first subscription).
      lastSync = Date.now()
      if (everConnected) refetchLoaded(); else refetchLoaded({ readyOnly: true })
      everConnected = true
    }
  })
  const onVisible = () => { if (document.visibilityState === 'visible') syncAll() }
  const onOnline = () => syncAll({ force: true })
  window.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', onOnline)
  // Safety net only while Realtime is NOT delivering changes; when it is connected the poll would just re-download data.
  pollTimer = setInterval(() => { if (!connected && document.visibilityState === 'visible' && navigator.onLine) syncAll({ force: true }) }, POLL_MS)
  stopFns = () => {
    window.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); window.removeEventListener('online', onOnline)
    clearInterval(pollTimer)
  }
}
export function stopSync() { unsub?.(); unsub = null; stopFns?.(); stopFns = null; connected = false; everConnected = false }

// ------------------------------------------------------------ server-side operations
/** Runs a database function (atomic multi-row / counter operations) and tracks it in the save indicator. */
export const rpc = (name, args) => tracked(() => db.rpc(name, args))

/** Synchronous read of the cached rows (for read-modify-write helpers). */
export const peek = (table) => get(table).rows
