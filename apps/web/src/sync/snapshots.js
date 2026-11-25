// The read cache: the last rows the server gave for each table, kept encrypted so pages that were open before still show their data offline.
// Keyed per signed-in user. Cleared whenever the app locks, a module lock changes, or the person signs out: "locked means gone" holds on disk too.
import { available, idb } from './idb'
import { open, seal, vaultReady } from './vault'

const key = (uid, table) => `${uid}:${table}`
const timers = new Map()
const latest = new Map()
const DELAY = 500

/** Save a table's rows soon (a burst of changes is written once). */
export function saveSnapshot(uid, table, rows) {
  if (!uid || !available()) return
  const k = key(uid, table)
  latest.set(k, rows)
  clearTimeout(timers.get(k))
  timers.set(
    k,
    setTimeout(() => {
      timers.delete(k)
      const r = latest.get(k)
      latest.delete(k)
      if (r) void writeNow(uid, table, r)
    }, DELAY),
  )
}

async function writeNow(uid, table, rows) {
  try {
    if (!(await vaultReady())) return
    const k = key(uid, table)
    await idb.put('snapshots', k, { savedAt: Date.now(), blob: await seal({ rows }, k) })
  } catch {
    /* a full disk or a closed database loses only the offline copy, never the live data */
  }
}

/** { rows, savedAt } or null. */
export async function readSnapshot(uid, table) {
  if (!uid || !available()) return null
  try {
    const k = key(uid, table)
    const rec = await idb.get('snapshots', k)
    if (!rec) return null
    const data = await open(rec.blob, k)
    return data?.rows ? { rows: data.rows, savedAt: rec.savedAt } : null
  } catch {
    return null
  }
}

/** Forget every saved table (of one user, or all). Pending writes are dropped too so nothing is written after the wipe. */
export async function clearSnapshots(uid) {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  latest.clear()
  if (!available()) return
  try {
    if (uid) await idb.delPrefix('snapshots', `${uid}:`)
    else await idb.clear('snapshots')
  } catch {
    /* nothing was stored */
  }
}
