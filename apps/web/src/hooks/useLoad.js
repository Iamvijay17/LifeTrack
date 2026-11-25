import { useCallback, useEffect, useRef, useState } from 'react'
import { toAppError } from '@/services/errors'

/**
 * Runs an async loader when `deps` change and exposes { data, loading, error, reload }. A slower, older answer never replaces a newer one (each load
 * has a number), and nothing is set after the component has gone. `enabled: false` skips loading (e.g. when a feature is unavailable).
 */
export function useLoad(loader, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null })
  const seq = useRef(0)
  const alive = useRef(true)
  const run = useCallback(() => {
    if (!enabled) return Promise.resolve()
    const mine = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    return Promise.resolve()
      .then(loader)
      .then(
        (data) => alive.current && mine === seq.current && setState({ data, loading: false, error: null }),
        (e) => alive.current && mine === seq.current && setState((s) => ({ data: s.data, loading: false, error: toAppError(e) })),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's list of what the loader depends on
  }, [enabled, ...deps])
  useEffect(() => {
    alive.current = true
    run()
    return () => {
      alive.current = false
    }
  }, [run])
  return { ...state, reload: run }
}
