// The offline layer's front door. The data store (hooks/store.js) calls into this; screens read `useSyncStatus` and the actions below.
//   enabled     encryption + IndexedDB are available and a user is signed in. Otherwise LifeTrack behaves exactly as before (online only).
//   queueing    a write that fails because the server cannot be reached is kept in the outbox instead of being rolled back.
//   read cache  the last rows of each table, so a page opened before still opens offline.
import { useSyncExternalStore } from 'react'
import { db } from '@/services/db'
import * as outbox from './outbox'
import { createEngine } from './engine'
import { clearSnapshots, readSnapshot, saveSnapshot } from './snapshots'
import { vaultReady } from './vault'
import { available } from './idb'

// Tables that are never queued: the app writes them for itself, and a replay after the fact would announce things twice or out of date.
const NEVER_QUEUE = new Set(['notifications'])

let uid = null
let enabled = false
let engine = null
let bound = { applied: () => {}, reload: () => {} }
let cleanup = []
const listeners = new Set()
const emit = () => listeners.forEach((f) => f())

/** The store tells us how to show confirmed rows and how to refetch a table. */
export const bindStore = (fns) => {
  bound = fns
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

export async function start(userId) {
  stop()
  uid = userId
  enabled = !!userId && available() && (await vaultReady())
  if (uid !== userId) return // signed out / switched while the vault was opening
  if (!enabled) return emit()
  await outbox.init(userId)
  engine = createEngine({ db, applied: (t, r) => bound.applied(t, r) })
  engine.subscribe(emit)
  outbox.subscribe(emit)
  const run = (force) => () => void engine?.flush({ force })
  const onVisible = () => document.visibilityState === 'visible' && run(false)()
  const onOnline = () => {
    emit()
    setTimeout(run(true), 400) // let the connection settle before the first request
  }
  const onOffline = emit
  const onMessage = (e) => e.data?.type === 'lifetrack-sync' && run(true)()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  navigator.serviceWorker?.addEventListener?.('message', onMessage)
  const poll = setInterval(() => outbox.all().some((o) => o.status === 'pending') && online() && run(false)(), 60_000)
  cleanup = [
    () => window.removeEventListener('online', onOnline),
    () => window.removeEventListener('offline', onOffline),
    () => document.removeEventListener('visibilitychange', onVisible),
    () => navigator.serviceWorker?.removeEventListener?.('message', onMessage),
    () => clearInterval(poll),
    () => engine?.stop(),
  ]
  emit()
  if (online()) void engine.flush({ force: true }) // changes left over from a previous visit go out first thing
}

/** Sign-out or user switch: stop sending. The unsent changes stay (encrypted) on this device and go out after the next sign-in. */
export function stop() {
  cleanup.forEach((f) => f())
  cleanup = []
  engine = null
  enabled = false
  uid = null
  outbox.detach()
  emit()
}

export const isEnabled = () => enabled

// ------------------------------------------------------------------ queueing
/** Should a failed write be kept for later instead of reported as failed? */
export const shouldQueue = (table, error) => enabled && !NEVER_QUEUE.has(table) && (error ? !!error.isNetwork : !online())
/** Offline right now: skip the request instead of waiting for it to time out. */
export const knownOffline = () => enabled && !online()

const kick = () => {
  if (!enabled) return
  void navigator.serviceWorker?.ready?.then((r) => r.sync?.register?.('lifetrack-sync')).catch(() => {}) // the browser wakes us when it is back online, where supported
  engine?.schedule()
}

export const queueInsert = (table, rows) => (outbox.enqueue({ table, kind: 'insert', rows }), kick())
export const queueUpdate = (table, id, patch, base) => (
  outbox.enqueue({ table, kind: 'update', rowId: id, patch, base: base ?? null }),
  kick()
)
export const queueRemove = (table, id, base) => (outbox.enqueue({ table, kind: 'remove', rowId: id, base: base ?? null }), kick())
export const queueUpsert = (table, row, { keys, ignoreDuplicates }, base) => (
  outbox.enqueue({ table, kind: 'upsert', rows: [row], keys, ignoreDuplicates: !!ignoreDuplicates, base: base ?? null }),
  kick()
)

export const overlay = (table, rows) => outbox.overlay(table, rows)
export const hasQueued = (table, id) => outbox.hasQueued(table, id)
export const rowState = (table, id) => outbox.stateOfRow(table, id)

// ------------------------------------------------------------------ read cache
export const persist = (table, rows) => enabled && saveSnapshot(uid, table, rows)
export const hydrate = (table) => (enabled ? readSnapshot(uid, table) : Promise.resolve(null))
/** Locked, module locks changed, signed out: nothing may stay readable on disk. */
export const forgetCache = () => clearSnapshots(uid ?? undefined)
export const wipeAll = async (userId) => {
  await clearSnapshots(userId)
  await outbox.wipe(userId)
}

// ------------------------------------------------------------------ actions
export const syncNow = () => engine?.flush({ force: true })
export const retry = (id) => engine?.retry(id)
export const discard = (id) => engine?.discard(id, bound.reload)
export const resolve = (id, choice) => engine?.resolve(id, choice, bound.reload)
export const resumeAfterSignIn = () => engine?.resumeAuth()
export const entries = () => outbox.all()

// ------------------------------------------------------------------ status for the UI
let cached = null
const compute = () => {
  const e = engine?.getSnapshot()
  const o = online()
  const key = JSON.stringify([enabled, o, e, outbox.all().length])
  if (cached?.key === key) return cached.value
  const v = {
    enabled,
    online: o,
    running: !!e?.running && (e?.total ?? 0) > 0, // an empty round (nothing waiting) is not worth announcing
    paused: e?.paused ?? null,
    pending: e?.pending ?? 0,
    failed: e?.failed ?? 0,
    conflicts: e?.conflicts ?? 0,
    total: e?.total ?? 0,
    lastSyncAt: e?.lastSyncAt ?? null,
    nextAt: Number.isFinite(e?.nextAt) ? e.nextAt : null,
  }
  v.state = !o
    ? 'offline'
    : v.failed + v.conflicts > 0
      ? 'attention'
      : v.paused
        ? 'signin'
        : v.running
          ? 'syncing'
          : v.pending > 0
            ? 'pending'
            : 'synced'
  cached = { key, value: v }
  return v
}
const subscribe = (f) => (listeners.add(f), () => listeners.delete(f))
export const getStatus = compute
export const useSyncStatus = () => useSyncExternalStore(subscribe, compute)
/** The list of queued changes for the Sync Center. */
export const useQueue = () => useSyncExternalStore((f) => outbox.subscribe(f), outbox.snapshotVersion)
