// Offline sync rules, as plain functions with no I/O: how a failed request is classified, when to retry, how queued changes merge,
// and how a queued change is checked against what the server holds now. The web sync engine (apps/web/src/sync) does the I/O and calls these.

// ------------------------------------------------------------------ errors
/**
 * What to do about a failed request.
 *  network    no connection: keep the change, wait for 'online', do not count it as an attempt
 *  auth       the session needs refreshing / signing in again: keep the change, pause until it does
 *  transient  the server had a hiccup (5xx, 429, timeout): retry later with backoff
 *  conflict   the row changed somewhere else (CONFLICT from a guarded write)
 *  permanent  the server will never accept this as it is (validation, permission, locked module): needs the person
 */
export function classifyError(e) {
  const code = String(e?.code ?? '')
  const status = Number(e?.status ?? e?.cause?.status ?? 0)
  const msg = String(e?.message ?? '')
  if (code === 'CONFLICT') return 'conflict'
  if (e?.isNetwork) return 'network'
  if (code === 'jwt' || code === 'PGRST301' || status === 401 || /JWT|token.*expired|session.*expired/i.test(msg)) return 'auth'
  if (status === 429 || status === 408 || status >= 500 || /timeout|timed out|temporarily|rate limit/i.test(msg)) return 'transient'
  if (/^08|^53|^57/.test(code)) return 'transient' // connection / resource / operator-intervention classes
  return 'permanent'
}

// ----------------------------------------------------------------- backoff
export const BACKOFF = { baseMs: 2_000, maxMs: 5 * 60_000, maxAttempts: 8 }

/** Exponential backoff with jitter (±20%): 2s, 4s, 8s … capped at 5 minutes. `rand` is injectable for tests. */
export function backoffDelay(attempts, rand = Math.random, cfg = BACKOFF) {
  const raw = Math.min(cfg.maxMs, cfg.baseMs * 2 ** Math.max(0, attempts - 1))
  return Math.round(raw * (0.8 + rand() * 0.4))
}

// ------------------------------------------------------------ row helpers
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** Columns the database owns: never part of a person's edit, never compared. */
export const SERVER_FIELDS = ['id', 'user_id', 'created_at', 'updated_at']
const editable = (o = {}) => Object.fromEntries(Object.entries(o).filter(([k]) => !SERVER_FIELDS.includes(k)))

// ----------------------------------------------------------- queue merging
/**
 * Fold a new change into the queue where that cannot change the outcome, so a burst of edits is sent as one request and a row that was
 * created and deleted offline never reaches the server. `queue` holds changes that have NOT started sending (pending, no attempt in flight).
 * Returns { queue, merged } — merged=false means the change must be appended as its own entry.
 */
export function coalesce(queue, change) {
  const ix = queue.findIndex((q) => q.table === change.table && (q.rowId === change.rowId || q.rows?.some?.((r) => r.id === change.rowId)))
  const prev = ix < 0 ? null : queue[ix]
  if (!prev || prev.status !== 'pending' || change.rowId == null) return { queue, merged: false }
  const swap = (op) => queue.map((q, i) => (i === ix ? op : q))

  if (change.kind === 'update' && prev.kind === 'update')
    return { queue: swap({ ...prev, patch: { ...prev.patch, ...change.patch } }), merged: true }
  if (change.kind === 'update' && prev.kind === 'insert' && prev.rows.length === 1)
    return { queue: swap({ ...prev, rows: [{ ...prev.rows[0], ...change.patch }] }), merged: true }
  if (change.kind === 'remove' && prev.kind === 'insert' && prev.rows.length === 1)
    return { queue: queue.filter((_, i) => i !== ix), merged: true, cancelled: true }
  if (change.kind === 'remove' && prev.kind === 'update') return { queue: swap({ ...change, base: prev.base }), merged: true }
  return { queue, merged: false }
}

// -------------------------------------------------------- conflict planning
/**
 * Decide how a queued edit meets the row as the server holds it now.
 *  base   the row as this device last saw it (before the edit)
 *  patch  the fields this device changed
 *  server the row on the server now, or null if it is gone
 * Returns one of:
 *  { action: 'apply', patch, ifUpdatedAt }   safe to send (the server changed other fields, or nothing)
 *  { action: 'noop', row }                   the server already holds exactly these values
 *  { action: 'conflict', reason, fields }    the same field changed on both sides to different values, or the row was deleted
 */
export function planUpdate({ base, patch, server }) {
  const mine = editable(patch)
  if (!server)
    return {
      action: 'conflict',
      reason: 'deleted',
      fields: Object.keys(mine).map((key) => ({ key, mine: mine[key], theirs: undefined, base: base?.[key] })),
    }
  if (!base || base.updated_at === server.updated_at) return finish(mine, server)
  const clashes = []
  const send = {}
  for (const [key, value] of Object.entries(mine)) {
    if (same(server[key], value)) continue // already what we want
    const serverChanged = !same(server[key], base[key])
    if (serverChanged) clashes.push({ key, mine: value, theirs: server[key], base: base[key] })
    else send[key] = value
  }
  if (clashes.length) return { action: 'conflict', reason: 'edited', fields: clashes }
  return finish(send, server)
}
function finish(send, server) {
  const need = Object.fromEntries(Object.entries(send).filter(([k, v]) => !same(server[k], v)))
  return Object.keys(need).length ? { action: 'apply', patch: need, ifUpdatedAt: server.updated_at } : { action: 'noop', row: server }
}

/** A queued delete: safe if the row is unchanged since it was seen, a no-op if already gone, a conflict if someone edited it meanwhile. */
export function planRemove({ base, server }) {
  if (!server) return { action: 'noop' }
  if (!base || base.updated_at === server.updated_at) return { action: 'apply', ifUpdatedAt: server.updated_at }
  const changed = Object.keys(editable(server)).filter((k) => !same(server[k], base[k]))
  if (!changed.length) return { action: 'apply', ifUpdatedAt: server.updated_at } // only the timestamp moved
  return {
    action: 'conflict',
    reason: 'edited-before-delete',
    fields: changed.map((key) => ({ key, mine: undefined, theirs: server[key], base: base[key] })),
  }
}

/** Build the patch to send once a person has chosen per field: picks = { field: 'mine' | 'theirs' }. */
export function resolvePatch(fields, picks) {
  const out = {}
  for (const f of fields) if ((picks[f.key] ?? 'mine') === 'mine') out[f.key] = f.mine
  return out
}
