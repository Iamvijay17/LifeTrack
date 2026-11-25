// The outbox: every change made while the server could not be reached, kept (encrypted) until it has been confirmed. An entry leaves ONLY
// when the server accepted it or the person discarded it. It survives reloads, closed tabs and restarts, and is shared by every tab.
import { coalesce } from '@lifetrack/core/offlineSync'
import { available, idb } from './idb'
import { open, seal, vaultReady } from './vault'

let uid = null
let ops = [] // this user's entries, oldest first
const subs = new Set()
let chan
let writeChain = Promise.resolve()
let counter = 0

const emit = () => subs.forEach((f) => f())
export const subscribe = (f) => (subs.add(f), () => subs.delete(f))
export const all = () => ops
export const snapshotVersion = () => ops // a new array on every change, for useSyncExternalStore

const newId = () => globalThis.crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

// Entries changed here whose disk write has not finished (`unsaved`), and entries dropped here whose disk delete has not (`gone`): a reload that
// reads the disk in between must not undo either.
const unsaved = new Set()
const gone = new Set()
const persist = (fn, done) => {
  writeChain = writeChain
    .then(fn)
    .catch(() => {})
    .then(done) // a failed disk write never breaks the in-memory queue; it is retried on the next change
  return writeChain
}
const keyOf = (id) => `op:${id}`
const putOp = (op) => {
  unsaved.add(op.id)
  gone.delete(op.id)
  const snap = { ...op, sending: undefined }
  return persist(
    async () => {
      if (!available() || !(await vaultReady())) return
      await idb.put('outbox', keyOf(op.id), { user: op.user, seq: op.seq, blob: await seal(snap, keyOf(op.id)) })
    },
    () => unsaved.delete(op.id),
  )
}
const delOp = (id) => {
  gone.add(id)
  unsaved.delete(id)
  return persist(
    async () => {
      if (available()) await idb.del('outbox', keyOf(id))
    },
    () => gone.delete(id),
  )
}

function broadcast() {
  try {
    chan?.postMessage({ from: 'outbox' })
  } catch {
    /* channel closed */
  }
}

/** Read this user's entries from disk (also called when another tab changed them). */
export async function reload() {
  if (!uid || !available()) return
  try {
    await writeChain
    const rows = await idb.entries('outbox') // (writes made from here on are merged below)
    const mine = []
    for (const [k, rec] of rows) {
      if (rec.user !== uid) continue
      const op = await open(rec.blob, k)
      if (op) mine.push(op)
    }
    // What this tab changed since it started reading wins over the disk copy, and an entry being sent right now keeps its in-memory state.
    const memory = new Map(ops.map((o) => [o.id, o]))
    const merged = mine
      .filter((o) => !gone.has(o.id))
      .map((o) => (unsaved.has(o.id) || memory.get(o.id)?.sending ? (memory.get(o.id) ?? o) : o))
    const have = new Set(merged.map((o) => o.id))
    for (const o of ops) if (!have.has(o.id) && unsaved.has(o.id)) merged.push(o)
    ops = merged.sort((a, b) => a.seq - b.seq)
    emit()
  } catch {
    /* unreadable: keep what is in memory */
  }
}

export async function init(userId) {
  if (uid === userId) return
  uid = userId
  ops = []
  emit()
  if (!userId) return
  if (typeof BroadcastChannel !== 'undefined' && !chan) {
    chan = new BroadcastChannel('lifetrack-outbox')
    chan.onmessage = () => void reload()
  }
  await reload()
}

/** Leave the user's entries on disk (they sync after the next sign-in) but stop showing them. */
export function detach() {
  uid = null
  ops = []
  emit()
}

/** Delete this user's entries from disk (account deletion). */
export async function wipe(userId) {
  try {
    if (available()) for (const [k, rec] of await idb.entries('outbox')) if (!userId || rec.user === userId) await idb.del('outbox', k)
  } catch {
    /* nothing stored */
  }
  if (!userId || userId === uid) {
    ops = []
    emit()
  }
}

/** Add a change. Returns the entry that now holds it (a merged one if it folded into an earlier change). */
export function enqueue(change) {
  const entry = {
    id: newId(),
    user: uid,
    seq: Date.now() * 1000 + (counter++ % 1000),
    status: 'pending',
    attempts: 0,
    nextAt: 0,
    createdAt: Date.now(),
    ...change,
  }
  const waiting = ops.filter((o) => o.status === 'pending' && !o.sending)
  const { queue, merged, cancelled } = coalesce(waiting, entry)
  if (merged) {
    const before = new Map(waiting.map((o) => [o.id, o]))
    const keep = new Set(queue.map((o) => o.id))
    for (const w of waiting) if (!keep.has(w.id)) void delOp(w.id)
    ops = ops.filter((o) => !before.has(o.id) || keep.has(o.id)).map((o) => queue.find((q) => q.id === o.id) ?? o)
    for (const q of queue) if (before.get(q.id) !== q) void putOp(q)
    emit()
    broadcast()
    return cancelled
      ? null
      : queue.find((q) => q.table === entry.table && (q.rowId === entry.rowId || q.rows?.some?.((r) => r.id === entry.rowId)))
  }
  ops = [...ops, entry]
  void putOp(entry)
  emit()
  broadcast()
  return entry
}

/** Change fields of an entry (status, attempts, nextAt, conflict …). */
export function patch(id, fields) {
  let next
  ops = ops.map((o) => (o.id === id ? (next = { ...o, ...fields }) : o))
  if (next) {
    const { sending: _s, ...saved } = next
    void putOp(saved)
  }
  emit()
  broadcast()
  return next
}

export function drop(id) {
  ops = ops.filter((o) => o.id !== id)
  void delOp(id)
  emit()
  broadcast()
}

/** Mark an entry as being sent by THIS tab (memory only, never saved). */
export function setSending(id, on) {
  ops = ops.map((o) => (o.id === id ? { ...o, sending: on || undefined } : o))
  emit()
}

// ------------------------------------------------------ views over the queue
export const forTable = (table) => ops.filter((o) => o.table === table)
export const hasQueued = (table, rowId) =>
  ops.some((o) => o.table === table && (o.rowId === rowId || o.ids?.includes(rowId) || o.rows?.some((r) => r.id === rowId)))
export const stateOfRow = (table, rowId) => {
  const o = ops.find((x) => x.table === table && (x.rowId === rowId || x.rows?.some((r) => r.id === rowId)))
  return o ? (o.status === 'pending' ? 'pending' : o.status) : null
}

/**
 * Lay the queued changes over rows fresh from the server, so a refresh while offline-made changes are still waiting does not make them vanish:
 * created rows appear, edits show, deleted rows stay hidden.
 */
export function overlay(table, rows) {
  const mine = ops.filter((o) => o.table === table)
  if (!mine.length) return rows
  let out = rows
  for (const o of mine) {
    if (o.kind === 'insert') {
      const have = new Set(out.map((r) => r.id))
      out = [...out, ...o.rows.filter((r) => !have.has(r.id)).map((r) => stamp(r, o))]
    } else if (o.kind === 'update') {
      out = out.map((r) => (r.id === o.rowId ? { ...r, ...o.patch } : r))
    } else if (o.kind === 'remove') {
      out = out.filter((r) => r.id !== o.rowId)
    } else if (o.kind === 'upsert') {
      for (const r of o.rows) {
        const i = out.findIndex((x) => (o.keys.length ? o.keys.every((k) => k === 'user_id' || x[k] === r[k]) : x.id === r.id))
        out = i >= 0 ? out.map((x, j) => (j === i ? { ...x, ...r } : x)) : [...out, stamp(r, o)]
      }
    }
  }
  return out
}
const stamp = (r, o) => ({
  ...r,
  created_at: r.created_at ?? new Date(o.createdAt).toISOString(),
  updated_at: r.updated_at ?? new Date(o.createdAt).toISOString(),
})

export const _reset = () => {
  uid = null
  ops = []
  writeChain = Promise.resolve()
  unsaved.clear()
  gone.clear()
  counter = 0
  subs.clear()
  chan?.close()
  chan = undefined
}
