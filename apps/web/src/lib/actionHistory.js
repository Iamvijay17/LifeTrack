// A short, safe history of reversible actions (the ones a menu or bulk action reported with an `undo`), for Undo/Redo anywhere in the app.
//
// Safety rules:
//  - An entry expires (TTL_MS). An expired action is never silently reversed.
//  - An entry may carry `check()`: "is the data still as this action left it?". If someone (or another device) changed it since, Undo refuses
//    instead of overwriting the newer value, and the entry is dropped.
//  - Actions that cannot be reversed never enter the history (they simply have no `undo`).
// Pure and framework-free: `createHistory()` is what the tests use; `history` is the app's one instance.

export const TTL_MS = 10 * 60 * 1000
export const MAX_ENTRIES = 50

/** @typedef {{ label: string, undo: () => any, redo?: () => any, check?: () => boolean | Promise<boolean>, at: number }} Entry */

export function createHistory({ now = () => Date.now(), ttl = TTL_MS, max = MAX_ENTRIES } = {}) {
  /** @type {Entry[]} */ let undos = []
  /** @type {Entry[]} */ let redos = []
  const subs = new Set()
  const emit = () => subs.forEach((f) => f())
  const fresh = (e) => now() - e.at <= ttl
  const prune = () => {
    undos = undos.filter(fresh)
    redos = redos.filter(fresh)
  }

  /** Runs `fn` (an entry's undo or redo) after the freshness and stale checks. Returns { ok, reason? }. */
  async function guarded(entry, fn) {
    if (!fresh(entry)) return { ok: false, reason: 'expired' }
    if (entry.check) {
      let same = false
      try {
        same = await entry.check()
      } catch {
        same = false
      }
      if (!same) return { ok: false, reason: 'stale' }
    }
    try {
      await fn()
    } catch (error) {
      return { ok: false, reason: 'failed', error }
    }
    return { ok: true }
  }

  const api = {
    /** Record a reversible action. Starting something new clears what could have been redone. */
    push(entry) {
      if (typeof entry?.undo !== 'function') return null
      const e = { label: entry.label ?? 'Action', undo: entry.undo, redo: entry.redo, check: entry.check, at: now() }
      prune()
      undos = [...undos, e].slice(-max)
      redos = []
      emit()
      return e
    },
    /** Undo one entry (default: the latest). The result says why when it could not. */
    async undo(entry = undos[undos.length - 1]) {
      prune()
      if (!entry || !undos.includes(entry)) return { ok: false, reason: 'nothing' }
      undos = undos.filter((e) => e !== entry)
      const r = await guarded(entry, entry.undo)
      // An entry whose data has since changed is dropped; a failed one goes back so it can be tried again.
      if (r.ok && entry.redo) redos = [...redos, { ...entry, at: now() }]
      if (!r.ok && r.reason === 'failed') undos = [...undos, entry]
      emit()
      return { ...r, label: entry.label }
    },
    async redo() {
      prune()
      const entry = redos[redos.length - 1]
      if (!entry) return { ok: false, reason: 'nothing' }
      redos = redos.slice(0, -1)
      const r = await guarded(entry, entry.redo)
      if (r.ok) undos = [...undos, { ...entry, at: now() }]
      else if (r.reason === 'failed') redos = [...redos, entry]
      emit()
      return { ...r, label: entry.label }
    },
    clear() {
      undos = []
      redos = []
      emit()
    },
    get canUndo() {
      return undos.some(fresh)
    },
    get canRedo() {
      return redos.some(fresh)
    },
    /** Newest first, for a history list. */
    entries: () =>
      undos
        .filter(fresh)
        .map((e) => e.label)
        .reverse(),
    subscribe: (f) => (subs.add(f), () => subs.delete(f)),
  }
  return api
}

export const history = createHistory()
