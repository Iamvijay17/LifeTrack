import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { flagValue } from '@lifetrack/core/flags'
import { useAuth } from '@/hooks/useAuth'
import { EmptyState } from '@/components/shared/states'
import { assignExperiment, defaultFlagMap, loadFlags, onFlagsInvalidated, trackConversion } from '@/services/flags'

const FlagsContext = createContext({ flags: defaultFlagMap(), source: 'defaults', killed: false, reload: () => {} })
const REFRESH_MS = 5 * 60_000

/** Loads the person's flags once for the whole app and refreshes them on focus, every few minutes, and after an administrator changes one here. */
export function FlagsProvider({ children }) {
  const { session } = useAuth()
  const uid = session?.user?.id ?? null
  const [state, setState] = useState(() => ({ flags: defaultFlagMap(), source: 'defaults', killed: false }))
  const alive = useRef(true)
  const reload = useCallback(
    async (force = false) => {
      if (!uid) return setState({ flags: defaultFlagMap(), source: 'defaults', killed: false })
      const r = await loadFlags({ force })
      if (alive.current)
        setState((s) => (s.source === r.source && s.killed === r.killed && JSON.stringify(s.flags) === JSON.stringify(r.flags) ? s : r))
    },
    [uid],
  )
  useEffect(() => {
    alive.current = true
    void reload()
    const timer = setInterval(() => void reload(), REFRESH_MS)
    const onFocus = () => void reload() // cheap: served from the cache while it is fresh
    window.addEventListener('focus', onFocus)
    const off = onFlagsInvalidated(() => void reload(true))
    return () => {
      alive.current = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      off()
    }
  }, [reload])
  const value = useMemo(() => ({ ...state, reload }), [state, reload])
  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>
}

export const useFlags = () => useContext(FlagsContext)
/** One flag. Before anything has loaded (and when the flag service is unreachable) it is the code default, so nothing flickers off. */
export const useFlag = (key) => flagValue(useContext(FlagsContext).flags, key)
/** The modules (nav keys) whose `module.<name>` flag is off. */
export function useDisabledModules() {
  const { flags } = useContext(FlagsContext)
  return useMemo(
    () =>
      new Set(
        Object.entries(flags)
          .filter(([k, v]) => k.startsWith('module.') && !v)
          .map(([k]) => k.slice(7)),
      ),
    [flags],
  )
}

/** Hides a page while its flag is off. Presentation only: the data behind it is protected by the database, not by this. */
export function FlagGate({ flag, children }) {
  const on = useFlag(flag)
  if (on) return children
  return (
    <EmptyState
      icon={ShieldOff}
      title="This feature is switched off for now"
      description="An administrator has turned it off, usually while something is being fixed. Your data is untouched. It will be back here when it is switched on again."
    />
  )
}

/**
 * The variant of an experiment for this person: "control" until the server says otherwise, and for anyone not enrolled. `convert()` reports the goal (once).
 * Exposure is recorded by the server when someone is enrolled, not by this hook rendering.
 */
export function useExperiment(key) {
  const { source } = useFlags()
  const { session } = useAuth()
  const [state, setState] = useState({ variant: 'control', enrolled: false, loading: true })
  useEffect(() => {
    let alive = true
    if (!session || source !== 'server') return setState({ variant: 'control', enrolled: false, loading: false })
    assignExperiment(key).then((r) => alive && setState({ ...r, loading: false }))
    return () => {
      alive = false
    }
  }, [key, session, source])
  const convert = useCallback(
    (event = 'conversion') => (state.enrolled ? trackConversion(key, event) : Promise.resolve(false)),
    [key, state.enrolled],
  )
  return { ...state, convert }
}
