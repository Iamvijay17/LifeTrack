import { getUserId } from '@/services/session'
import { pushRecent, sanitizeRecents } from '@/features/command/model'

// What the person searched for and opened lately: a per-device, per-account convenience in localStorage (never synced, never required).
// Recently opened records share the Command Center's list, so both places show the same "recent" items.

const MAX_QUERIES = 8
const queriesKey = () => `lifetrack:search:queries:${getUserId() ?? 'anon'}`
const recentsKey = () => `lifetrack:recents:${getUserId() ?? 'anon'}`
export const HISTORY_EVENT = 'lifetrack:recents'

/** Stored searches, newest first. Anything that is not a short string is dropped (storage is the user's to edit). */
export function sanitizeQueries(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .filter((q) => typeof q === 'string' && q.trim() && q.length <= 100)
    .map((q) => q.trim())
    .filter((q) => (seen.has(q.toLowerCase()) ? false : seen.add(q.toLowerCase())))
    .slice(0, MAX_QUERIES)
}

/** `query` moved to the front (without a repeat), keeping at most MAX_QUERIES. */
export const pushQuery = (list, query) => {
  const q = String(query ?? '').trim()
  if (q.length < 2 || q.length > 100) return sanitizeQueries(list)
  return sanitizeQueries([q, ...(list ?? [])])
}

const readJson = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* a convenience only: search works without storage */
  }
}
const changed = () => {
  try {
    window.dispatchEvent(new Event(HISTORY_EVENT))
  } catch {
    /* no window (tests of pure code) */
  }
}

export const readQueries = () => sanitizeQueries(readJson(queriesKey()))
export const rememberQuery = (q) => {
  writeJson(queriesKey(), pushQuery(readQueries(), q))
  changed()
}
export const forgetQuery = (q) => {
  writeJson(
    queriesKey(),
    readQueries().filter((x) => x !== q),
  )
  changed()
}
export const clearQueries = () => {
  writeJson(queriesKey(), [])
  changed()
}

/** Recently opened records (not pages), newest first. */
export const readViewed = () => sanitizeRecents(readJson(recentsKey())).filter((r) => r.kind !== 'page')
export const rememberViewed = (entry) => {
  writeJson(recentsKey(), pushRecent(sanitizeRecents(readJson(recentsKey())), entry))
  changed()
}
export const clearViewed = () => {
  writeJson(
    recentsKey(),
    sanitizeRecents(readJson(recentsKey())).filter((r) => r.kind === 'page'),
  )
  changed()
}
