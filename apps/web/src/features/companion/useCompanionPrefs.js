import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_COMPANION, normalizeCompanionPrefs } from '@/domain/companion'

// The companion's layout belongs to this device (a laptop's floating window and a second monitor's want different things), so it lives in
// localStorage like the sound and view preferences, and several windows stay in step through the `storage` event.
const KEY = 'lifetrack:companion'
const listeners = new Set()
let current = null

function read() {
  try {
    return normalizeCompanionPrefs(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return normalizeCompanionPrefs(null)
  }
}
const get = () => (current ??= read())
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))

export function setCompanionPrefs(patch) {
  const next = normalizeCompanionPrefs({ ...get(), ...(typeof patch === 'function' ? patch(get()) : patch) })
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* applies for this visit */
  }
  listeners.forEach((l) => l())
}
export const resetCompanionPrefs = () => setCompanionPrefs({ ...DEFAULT_COMPANION })

/** Test helper. */
export function resetCompanionCache() {
  current = null
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) resetCompanionCache()
  })
}

export function useCompanionPrefs() {
  const prefs = useSyncExternalStore(subscribe, get, get)
  const update = useCallback((patch) => setCompanionPrefs(patch), [])
  return [prefs, update]
}
