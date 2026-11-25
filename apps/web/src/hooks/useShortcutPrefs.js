import { useSyncExternalStore } from 'react'
import { chordKeyProblem, chordTable, normalizeOverrides } from '@/lib/shortcuts'

// Remapped chord keys. Kept in this browser (like the keyboard itself, a choice of this device); validated on every read.
const KEY = 'lifetrack:shortcuts'
const read = () => {
  try {
    return normalizeOverrides(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
  } catch {
    return normalizeOverrides({})
  }
}
let state = read()
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const commit = (next) => {
  state = normalizeOverrides(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode: the choice lasts until the tab closes */
  }
  emit()
}

export const getOverrides = () => state
export const useShortcutOverrides = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
  )
/** key → target maps for the listener, after the remaps. */
export const getChordTables = () => ({ go: chordTable('go', state), create: chordTable('create', state) })

/** Give `target` a new chord key. Returns an error message, or null when it was saved. */
export function setChordKey(group, target, key) {
  const problem = chordKeyProblem(group, target, key, state)
  if (problem) return problem
  commit({ ...state, [group]: { ...state[group], [target]: key } })
  return null
}
export const resetChordKey = (group, target) => {
  const { [target]: _gone, ...rest } = state[group]
  commit({ ...state, [group]: rest })
}
export const resetShortcuts = () => commit({ go: {}, create: {} })
export const reloadShortcutPrefs = () => ((state = read()), emit()) // for tests
