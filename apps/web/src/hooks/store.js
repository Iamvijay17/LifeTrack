// Cloud-first data store. Supabase is the source of truth; this is only an in-memory cache that is
// (a) filled from the database, (b) updated from confirmed write responses, and (c) invalidated by
// Realtime events, window focus, reconnects and a slow safety-net poll. Nothing here is persisted locally.
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { db } from '@/services/db'
import { toAppError } from '@/services/errors'
import { DEFAULTS } from '@lifetrack/constants/schema'
import { getUserId } from '@lifetrack/data'

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

// Every local cache write bumps a per-table version. A fetch that was started before a write may carry an older
// snapshot, so if the version moved while it was in flight the result is discarded and the fetch is repeated.
const versions = new Map() // table -> number
const dirty = new Set() // tables that need one more fetch once the in-flight one finishes
const ver = (t) => versions.get(t) ?? 0
const bump = (t) => versions.set(t, ver(t) + 1)
const MAX_ATTEMPTS = 3

export function load(table, { force = false } = {}) {
  const cur = get(table)
  if (inflight.has(table)) {
    if (force) dirty.add(table)
    return inflight.get(table)
  }
  // An errored table is retried only on request (Try again), focus/reconnect or the safety-net sync — never in a render-driven loop.
  if (!force && (cur.status === 'ready' || cur.status === 'error')) return Promise.resolve()
  const my = epoch
  if (cur.status !== 'ready') set(table, { status: 'loading', error: null })
  const run = async () => {
    for (let attempt = 1; ; attempt++) {
      const startVer = ver(table)
      dirty.delete(table)
      let rows
      try {
        rows = await db.list(table)
      } catch (e) {
        if (my !== epoch) return
        // A failed background refresh keeps the data already on screen; only a failed first load is an error state.
        if (get(table).status === 'ready') return
        set(table, { status: 'error', error: toAppError(e).message })
        return
      }
      if (my !== epoch) return
      if (!settled(table) && get(table).status === 'ready') {
        dirty.add(table) // an unconfirmed write would be overwritten by this snapshot: try again once it has settled
        return
      }
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
  dirty.clear()
  pending.clear()
  versions.clear()
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
// Every write is optimistic: the cache changes at once, the request runs, and the confirmed row replaces the guess. If the request fails the
// guess is undone (only the fields this write touched, so a second write to the same row is not lost) and the error is rethrown to the caller.
// `pending` counts unconfirmed writes per table: a background refetch that would overwrite a guess is postponed until they settle.
const pending = new Map() // table -> number
const hold = (t) => pending.set(t, (pending.get(t) ?? 0) + 1)
const release = (t) => {
  const n = (pending.get(t) ?? 1) - 1
  if (n <= 0) {
    pending.delete(t)
    if (dirty.has(t)) scheduleRefetch(t)
  } else pending.set(t, n)
}
const settled = (t) => !pending.has(t)

const newId = () => {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const b = c.getRandomValues(new Uint8Array(16)) // plain-http pages have no randomUUID
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Rows the app creates for itself, and that tell the person something when they appear (a notification toasts), are never guessed: if another
// device wins the race to create the same one, a guess would have told them twice.
const NO_GUESS = new Set(['notifications'])

/** Put back the old values of the fields `patched` changed, unless something newer has changed them since. */
function revertFields(table, id, before, patched) {
  const row = get(table).rows.find((r) => r.id === id)
  if (!row) return
  const back = { ...row }
  for (const k of Object.keys(patched)) if (same(row[k], patched[k])) back[k] = before[k]
  upsertLocal(table, [back])
}

/** A stand-in for a row the database has not confirmed yet: defaults and the input. For inserts it already carries the id the row will have. */
const guessRow = (table, input, id = newId()) => {
  const now = new Date().toISOString()
  const mine = getUserId()
  return {
    created_at: now,
    updated_at: now,
    ...(DEFAULTS[table] ?? {}),
    ...input,
    id,
    ...(mine ? { user_id: mine } : {}),
  }
}

export const insert = (table, rows) =>
  tracked(async () => {
    const list = Array.isArray(rows) ? rows : [rows]
    // The id is chosen here and sent with the insert, so the stand-in IS the row: nothing is swapped, and anything watching ids sees one row, not two.
    const sent = NO_GUESS.has(table) ? list : list.map((r) => ({ ...r, id: r.id ?? newId() }))
    if (!NO_GUESS.has(table))
      upsertLocal(
        table,
        sent.map((r) => guessRow(table, r, r.id)),
      )
    hold(table)
    try {
      const out = await db.insert(table, sent)
      patchGroup(table, (r) => sent.some((s) => s.id === r.id) || out.some((o) => o.id === r.id), out)
      afterWrite(table)
      return Array.isArray(rows) ? out : out[0]
    } catch (e) {
      if (!NO_GUESS.has(table))
        removeLocal(
          table,
          sent.map((s) => s.id),
        )
      throw e
    } finally {
      release(table)
    }
  })

export const update = (table, id, patch) =>
  tracked(async () => {
    const before = get(table).rows.find((r) => r.id === id)
    if (before) upsertLocal(table, [{ ...before, ...patch }])
    hold(table)
    try {
      const row = await db.update(table, id, patch)
      upsertLocal(table, [row])
      afterWrite(table)
      return row
    } catch (e) {
      if (before) revertFields(table, id, before, patch)
      throw e
    } finally {
      release(table)
    }
  })

export const upsert = (table, rows, opts) =>
  tracked(async () => {
    const list = Array.isArray(rows) ? rows : [rows]
    const keys = String(opts?.onConflict ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    // Match each row to the cached row the database will treat as the same one (same conflict columns), so toggling an existing row is a change, not a duplicate.
    const undo = []
    const guesses = []
    for (const r of list) {
      const cached = keys.length
        ? get(table).rows.find((x) => keys.every((k) => k === 'user_id' || x[k] === r[k]))
        : r.id
          ? get(table).rows.find((x) => x.id === r.id)
          : null
      if (cached) {
        undo.push({ id: cached.id, before: cached, patched: r })
        upsertLocal(table, [{ ...cached, ...r }])
      } else if (!NO_GUESS.has(table)) {
        const g = guessRow(table, r)
        guesses.push(g)
        upsertLocal(table, [g])
      }
    }
    hold(table)
    try {
      const out = await db.upsert(table, list, opts)
      const temp = new Set(guesses.map((g) => g.id))
      const ids = new Set(out.map((r) => r.id))
      patchGroup(table, (r) => temp.has(r.id) || ids.has(r.id), out)
      afterWrite(table)
      return Array.isArray(rows) ? out : out[0]
    } catch (e) {
      removeLocal(
        table,
        guesses.map((g) => g.id),
      )
      for (const u of undo) revertFields(table, u.id, u.before, u.patched)
      throw e
    } finally {
      release(table)
    }
  })

export const remove = (table, id) =>
  tracked(async () => {
    const before = get(table).rows.find((r) => r.id === id)
    if (before) removeLocal(table, [id])
    hold(table)
    try {
      await db.remove(table, id)
      removeLocal(table, [id])
    } catch (e) {
      if (before && !get(table).rows.some((r) => r.id === id)) upsertLocal(table, [before])
      throw e
    } finally {
      release(table)
    }
  })

export const removeMany = (table, ids) =>
  tracked(async () => {
    const gone = get(table).rows.filter((r) => ids.includes(r.id))
    removeLocal(table, ids)
    hold(table)
    try {
      await db.removeMany(table, ids)
      removeLocal(table, ids)
    } catch (e) {
      const back = gone.filter((r) => !get(table).rows.some((x) => x.id === r.id))
      if (back.length) upsertLocal(table, back)
      throw e
    } finally {
      release(table)
    }
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
  unsub = db.subscribe(
    (table, payload) => applyChange(table, payload),
    (status) => {
      onStatus?.(status)
      connected = status === 'SUBSCRIBED'
      if (connected) {
        // Catch up on anything missed while disconnected (and in the gap before the first subscription).
        lastSync = Date.now()
        if (everConnected) refetchLoaded()
        else refetchLoaded({ readyOnly: true })
        everConnected = true
      }
    },
  )
  const onVisible = () => {
    if (document.visibilityState === 'visible') syncAll()
  }
  const onOnline = () => syncAll({ force: true })
  window.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', onOnline)
  // Safety net only while Realtime is NOT delivering changes; when it is connected the poll would just re-download data.
  pollTimer = setInterval(() => {
    if (!connected && document.visibilityState === 'visible' && navigator.onLine) syncAll({ force: true })
  }, POLL_MS)
  stopFns = () => {
    window.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('online', onOnline)
    clearInterval(pollTimer)
  }
}
export function stopSync() {
  unsub?.()
  unsub = null
  stopFns?.()
  stopFns = null
  connected = false
  everConnected = false
}

// ------------------------------------------------------------ server-side operations
/** Runs a database function (atomic multi-row / counter operations) and tracks it in the save indicator. */
export const rpc = (name, args) => tracked(() => db.rpc(name, args))

/** Synchronous read of the cached rows (for read-modify-write helpers). */
export const peek = (table) => get(table).rows
/** Whether a table has finished loading. A background job must not act on a table that has not (an unloaded list reads as empty, not as unknown). */
export const isReady = (table) => get(table).status === 'ready'
