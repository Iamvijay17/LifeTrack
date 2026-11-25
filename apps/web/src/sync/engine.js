// The sync engine: sends the outbox to the server in order, once per entry, and decides what to do with each answer.
//  · Nothing is dropped unless the server accepted it or the person discarded it.
//  · Every send is safe to repeat: inserts carry their final id (a repeat that finds the row already there counts as done), edits are checked
//    against the row's updated_at so they never overwrite a newer server version, deletes of rows that are gone are done.
//  · Errors are sorted (see classifyError): no connection waits for 'online'; a server hiccup backs off 2s, 4s, 8s … up to 5 minutes; an expired
//    session waits for sign-in; anything the server will never accept stops and asks the person.
import { BACKOFF, backoffDelay, classifyError, planRemove, planUpdate, resolvePatch } from '@lifetrack/core/offlineSync'
import { toAppError } from '@/services/errors'
import * as outbox from './outbox'

const strip = ({ user_id: _u, ...r }) => r
const transient = (message) => Object.assign(new Error(message), { status: 503 })

/**
 * @param deps.db       the data adapter (list/get/find/insert/update/upsert/remove)
 * @param deps.applied  (table, { rows, removedIds }) called with server-confirmed state so the screen can show it
 * @param deps.now      clock (tests)
 * @param deps.rand     randomness for backoff jitter (tests)
 */
export function createEngine({ db, applied, now = Date.now, rand = Math.random }) {
  const state = { running: false, paused: null, lastSyncAt: null, lastError: null, timer: null, listeners: new Set() }
  const emit = () => state.listeners.forEach((f) => f())
  let snap = view()

  function view() {
    const ops = outbox.all()
    return {
      running: state.running,
      paused: state.paused, // 'auth' | null
      pending: ops.filter((o) => o.status === 'pending').length,
      failed: ops.filter((o) => o.status === 'failed').length,
      conflicts: ops.filter((o) => o.status === 'conflict').length,
      total: ops.length,
      lastSyncAt: state.lastSyncAt,
      nextAt: ops.filter((o) => o.status === 'pending' && o.nextAt > now()).reduce((m, o) => Math.min(m, o.nextAt), Infinity),
      lastError: state.lastError,
    }
  }
  const refresh = () => {
    const v = view()
    if (JSON.stringify(v) === JSON.stringify(snap)) return
    snap = v
    emit()
  }
  outbox.subscribe(refresh)

  // ------------------------------------------------------------ one entry
  /** Send one entry. Returns 'done' | 'stop' (no connection: stop the round) | 'next'. */
  async function send(op) {
    try {
      const outcome = await attempt(op)
      if (outcome === 'conflict') return 'next' // already recorded on the entry
      outbox.drop(op.id)
      return 'done'
    } catch (raw) {
      const e = toAppError(raw)
      const kind = classifyError(e)
      if (kind === 'network') {
        // Not the change's fault: it is not counted as an attempt, but retries still space out (2s … 30s) while the connection stays down.
        const netFails = (op.netFails ?? 0) + 1
        outbox.patch(op.id, { lastError: e.message, netFails, nextAt: now() + Math.min(30_000, backoffDelay(netFails, rand)) })
        return 'stop'
      }
      if (kind === 'auth') {
        state.paused = 'auth'
        outbox.patch(op.id, { lastError: e.message })
        return 'stop'
      }
      const attempts = (op.attempts ?? 0) + 1
      if (kind === 'transient' && attempts < BACKOFF.maxAttempts) {
        outbox.patch(op.id, { attempts, lastError: e.message, nextAt: now() + backoffDelay(attempts, rand) })
        return 'next'
      }
      // Never accepted, or out of attempts: keep the change, tell the person, let them retry or discard.
      outbox.patch(op.id, { status: 'failed', attempts, lastError: e.message })
      return 'next'
    }
  }

  async function attempt(op) {
    const { table } = op
    if (op.kind === 'insert') return sendInsert(op)
    if (op.kind === 'update') return sendUpdate(op, op.rowId, op.patch, op.base)
    if (op.kind === 'remove') return sendRemove(op)
    if (op.kind === 'upsert') return sendUpsert(op)
    throw new Error(`unknown change kind for ${table}`)
  }

  async function sendInsert(op) {
    const rows = op.rows
    try {
      const out = await db.insert(op.table, rows.map(strip))
      applied(op.table, { rows: out })
    } catch (e) {
      if (e?.code !== '23505') throw e
      // A repeat of a request that had already succeeded (or the same id created elsewhere): the row exists, so it is done.
      const have = (await Promise.all(rows.map((r) => db.get(op.table, r.id)))).filter(Boolean)
      if (have.length !== rows.length) {
        const missing = rows.filter((r) => !have.some((h) => h.id === r.id))
        if (!missing.length) return
        // Something else (a unique rule on other columns) is refusing the missing ones: that is a real rejection.
        throw e
      }
      applied(op.table, { rows: have })
    }
  }

  async function sendUpdate(op, rowId, patch, base) {
    const server = await db.get(op.table, rowId)
    const plan = planUpdate({ base, patch, server })
    if (plan.action === 'noop') return void applied(op.table, { rows: [plan.row] })
    if (plan.action === 'conflict') return conflictOut(op, { reason: plan.reason, fields: plan.fields, server })
    try {
      const row = await db.update(op.table, rowId, plan.patch, { ifUpdatedAt: plan.ifUpdatedAt })
      applied(op.table, { rows: [row] })
    } catch (e) {
      if (e?.code !== 'CONFLICT') throw e
      // Changed between our look and our write: look again (the next round re-plans with the newer row).
      throw transient('The row changed while saving; trying again.')
    }
  }

  async function sendRemove(op) {
    const server = await db.get(op.table, op.rowId)
    const plan = planRemove({ base: op.base, server })
    if (plan.action === 'noop') return void applied(op.table, { removedIds: [op.rowId] })
    if (plan.action === 'conflict') return conflictOut(op, { reason: plan.reason, fields: plan.fields, server })
    try {
      await db.remove(op.table, op.rowId, { ifUpdatedAt: plan.ifUpdatedAt })
      applied(op.table, { removedIds: [op.rowId] })
    } catch (e) {
      if (e?.code !== 'CONFLICT') throw e
      const again = await db.get(op.table, op.rowId)
      if (again && again.updated_at === plan.ifUpdatedAt) {
        // Unchanged, yet the delete was refused: a locked module or a rule, not a conflict. Say so and keep the row.
        const err = new Error('This could not be deleted. It may be locked: unlock it and try again.')
        err.code = '42501'
        throw err
      }
      if (!again) return void applied(op.table, { removedIds: [op.rowId] })
      throw transient('The row changed while deleting; trying again.')
    }
  }

  // An upsert is stored one row per entry. It becomes an insert if no row matches its key, otherwise an edit of the row that does.
  async function sendUpsert(op) {
    const [row] = op.rows
    const keys = op.keys ?? []
    const match = keys.length ? Object.fromEntries(keys.filter((k) => k !== 'user_id').map((k) => [k, row[k]])) : { id: row.id }
    const [server] = Object.keys(match).length ? await db.find(op.table, match) : []
    if (!server) {
      try {
        applied(op.table, { rows: await db.insert(op.table, [strip(row)]) })
        return
      } catch (e) {
        if (e?.code !== '23505') throw e
        throw transient('A matching row appeared while saving; trying again.')
      }
    }
    if (op.ignoreDuplicates) return void applied(op.table, { rows: [server] })
    const patch = Object.fromEntries(Object.entries(strip(row)).filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k)))
    // No remembered version means this device never saw the row: any difference is a conflict, never a silent overwrite.
    return sendUpdate(op, server.id, patch, op.base ?? {})
  }

  function conflictOut(op, { reason, fields, server }) {
    outbox.patch(op.id, { status: 'conflict', conflict: { reason, fields, server: server ?? null, found: now() } })
    return 'conflict'
  }

  // -------------------------------------------------------------- the round
  let flushing = null
  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false
  /** Send everything that is due. One round at a time in this tab, and one tab at a time across the browser (Web Locks). */
  function flush({ force = false } = {}) {
    if (flushing) return flushing
    if (isOffline()) return Promise.resolve() // the browser knows there is no connection: do not spend retries on requests that cannot work
    const go = async () => {
      state.running = true
      refresh()
      try {
        await outbox.reload()
        const tried = new Set()
        for (;;) {
          const t = now()
          const blocked = new Set()
          let next = null
          for (const op of outbox.all()) {
            const id = rowKeys(op)
            if (op.status !== 'pending') {
              id.forEach((k) => blocked.add(k)) // later changes to the same row wait behind a failed / conflicting one
              continue
            }
            if (id.some((k) => blocked.has(k))) continue
            if (op.sending || tried.has(op.id)) continue
            if (!force && op.nextAt > t) {
              id.forEach((k) => blocked.add(k))
              continue
            }
            next = op
            break
          }
          if (!next) break
          tried.add(next.id)
          outbox.setSending(next.id, true)
          const r = await send(next)
          if (r === 'done') state.lastSyncAt = now()
          outbox.setSending(next.id, false)
          if (r === 'stop') break
        }
        if (!outbox.all().some((o) => o.status === 'pending' && o.nextAt <= now())) state.lastError = null
      } finally {
        state.running = false
        flushing = null
        schedule()
        refresh()
      }
    }
    flushing = (async () => {
      if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        const r = await navigator.locks.request('lifetrack-sync', { ifAvailable: true }, (lock) => (lock ? go() : 'busy'))
        if (r === 'busy') {
          flushing = null
          return
        }
        return r
      }
      return go()
    })()
    return flushing
  }

  /** Wake up when the earliest retry is due. */
  function schedule() {
    clearTimeout(state.timer)
    if (state.paused) return
    const due = outbox
      .all()
      .filter((o) => o.status === 'pending')
      .reduce((m, o) => Math.min(m, o.nextAt), Infinity)
    if (due === Infinity) return
    state.timer = setTimeout(() => void flush(), Math.max(250, due - now()))
  }

  // --------------------------------------------------- the person's choices
  const rowKeys = (op) => [op.rowId, ...(op.rows?.map((r) => r.id) ?? [])].filter(Boolean).map((id) => `${op.table}:${id}`)

  /** Try a failed entry again now. */
  const retry = (id) => {
    outbox.patch(id, { status: 'pending', attempts: 0, nextAt: 0, lastError: null })
    return flush()
  }

  /** Throw a change away. The row goes back to what the server has. */
  function discard(id, reload) {
    const op = outbox.all().find((o) => o.id === id)
    if (!op) return
    outbox.drop(id)
    reload?.(op.table)
    return flush()
  }

  /**
   * Settle a conflict. `choice` is 'mine' (send this device's values), 'theirs' (keep the server's row and drop this change) or an object
   * { field: 'mine' | 'theirs' } to take each field from one side. Whatever is sent again is checked against the server row as it is NOW, so even
   * "mine" can never silently overwrite something newer.
   */
  function resolve(id, choice, reload) {
    const op = outbox.all().find((o) => o.id === id)
    if (!op?.conflict) return
    const { fields, server, reason } = op.conflict
    const picks = typeof choice === 'object' ? choice : Object.fromEntries(fields.map((f) => [f.key, choice]))
    const wantsMine = Object.values(picks).some((p) => p === 'mine') || (choice === 'mine' && !fields.length)
    const requeue = (extra) =>
      outbox.patch(id, { status: 'pending', conflict: undefined, attempts: 0, nextAt: 0, lastError: null, ...extra })
    const keepServer = () => {
      outbox.drop(id)
      if (server) applied(op.table, { rows: [server] })
      else reload?.(op.table)
    }

    if (op.kind === 'remove') {
      if (choice === 'theirs') keepServer()
      else requeue({ base: server ?? op.base })
    } else if (reason === 'deleted') {
      if (choice === 'theirs') {
        outbox.drop(id)
        applied(op.table, { removedIds: [op.rowId ?? op.rows?.[0]?.id] })
      } else {
        // Bring the row back with this device's version: a fresh insert under the same id.
        const row = { ...(op.base ?? {}), ...(op.patch ?? {}), ...(op.rows?.[0] ?? {}) }
        requeue({ kind: 'insert', rows: [strip(row)], patch: undefined, base: undefined, rowId: undefined })
      }
    } else if (!wantsMine) {
      keepServer()
    } else {
      requeue({
        patch: resolvePatch(fields, picks),
        base: server ?? op.base,
        ...(op.kind === 'upsert' ? { kind: 'update', rowId: server?.id, rows: undefined } : {}),
      })
    }
    return flush()
  }

  return {
    flush,
    retry,
    discard,
    resolve,
    schedule,
    resumeAuth() {
      state.paused = null
      refresh()
      return flush()
    },
    getSnapshot: () => snap,
    subscribe: (f) => (state.listeners.add(f), () => state.listeners.delete(f)),
    stop() {
      clearTimeout(state.timer)
    },
  }
}
