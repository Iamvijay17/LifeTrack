// The demo database: the same engine as the dev backend, but the rows live in this tab's memory only. It never touches localStorage, IndexedDB,
// the network or the signed-in account's data, and everything is gone on reload. No storage key lives here, on purpose.
import { createLocalAdapter } from './localCore'

export function createDemoAdapter() {
  let rows = {}
  const listeners = new Set()
  return createLocalAdapter({
    read: () => rows,
    write: (db) => {
      rows = db
    },
    notify: (table) => queueMicrotask(() => listeners.forEach((cb) => cb(table))),
    listen: (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    wipe: () => {
      rows = {}
    },
  })
}
