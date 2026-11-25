import { useMemo } from 'react'
import { useSecurity } from './SecurityProvider'

const NONE = Object.freeze({
  closed: Object.freeze([]),
  isLocked: () => false,
  isUnlockedSession: true,
  unlock: () => {},
})

/**
 * Which modules are locked for this session right now, and a way to ask for the unlock prompt.
 *
 *   const locks = useModuleLocks()
 *   locks.isLocked('finance')   // true while Finance asks for the PIN
 *   locks.unlock('finance')     // opens the PIN / fingerprint prompt
 *
 * With no lock, no provider, or the whole-app lock (whose lock screen replaces the app, so no module is ever "locked" on its own), nothing is
 * locked. The answer is the server's (security_state); the data of a locked module is also refused by the database, so this only decides what to draw.
 */
export function useModuleLocks() {
  const sec = useSecurity()
  return useMemo(() => {
    if (!sec || sec.status !== 'ready' || sec.closed.length === 0) return sec ? { ...NONE, unlock: sec.requestUnlock } : NONE
    const closed = sec.closed
    return { closed, isLocked: (key) => closed.includes(key), isUnlockedSession: false, unlock: sec.requestUnlock }
  }, [sec])
}

/** `rows` of a module, or an empty list while that module is locked. The database already hands a locked session nothing; this also covers the DEV backend. */
export const useGated = () => {
  const { isLocked } = useModuleLocks()
  return (module, rows) => (isLocked(module) ? EMPTY : rows)
}
const EMPTY = Object.freeze([])
