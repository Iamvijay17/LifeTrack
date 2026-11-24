// DEV-ONLY adapter used when Supabase credentials are missing. Data lives in THIS browser only and is NOT
// synced across devices. It exists so the UI can be developed/tested without a cloud project, and it
// emulates the pieces of the database the app relies on (defaults, unique constraints, status-history trigger,
// cross-tab "realtime"). Production = Supabase.
import { getUserId } from './session'
import { createLocalAdapter } from './localCore'

const key = () => `lifetrack-dev:db:${getUserId()}`
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(key())) ?? {}
  } catch {
    return {}
  }
}
const write = (db) => localStorage.setItem(key(), JSON.stringify(db))

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

export const localAdapter = /* @__PURE__ */ createLocalAdapter({
  read,
  write,
  notify,
  listen(cb) {
    channel() // start listening for other tabs
    localListeners.add(cb)
    return () => localListeners.delete(cb)
  },
  /** Dev helper: wipe everything for the current dev user. */
  wipe: () => localStorage.removeItem(key()),
})
