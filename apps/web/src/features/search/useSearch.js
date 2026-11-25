import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildSuggestions, hasCriteria, normalizeParams } from '@lifetrack/core/globalSearch'
import { globalSearch } from '@/services/globalSearch'
import { useModuleLocks } from '@/features/security/useModuleLocks'

/**
 * Runs the search for `params` and keeps the page it last got: `{ status, data, error, retry }`. `status` is 'idle' (nothing to look for),
 * 'loading' (first load; `data` is null), 'refreshing' (a newer search is running; `data` is the previous page), 'ready' or 'error'.
 * An older answer that arrives after a newer search started is thrown away.
 */
export function useGlobalSearch(params) {
  const { closed } = useModuleLocks()
  const key = JSON.stringify(normalizeParams(params))
  const closedKey = closed.join(',')
  const [state, setState] = useState({ status: 'idle', data: null, error: null })
  const [again, setAgain] = useState(0)
  const latest = useRef(0)
  useEffect(() => {
    const p = JSON.parse(key)
    if (!hasCriteria(p)) {
      latest.current++
      setState({ status: 'idle', data: null, error: null })
      return undefined
    }
    const mine = ++latest.current
    setState((s) => ({ status: s.data ? 'refreshing' : 'loading', data: s.data, error: null }))
    globalSearch(p, { closed: closedKey ? closedKey.split(',') : [] }).then(
      (data) => mine === latest.current && setState({ status: 'ready', data, error: null }),
      (error) => mine === latest.current && setState({ status: 'error', data: null, error }),
    )
    return undefined
  }, [key, closedKey, again])
  const retry = useCallback(() => setAgain((n) => n + 1), [])
  return { ...state, retry }
}

/** The value, `ms` after it stops changing. */
export function useDebounced(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Autocomplete for what is being typed: the person's earlier searches that start with it, then titles of matching records. */
export function useSuggestions(text, recent, enabled) {
  const { closed } = useModuleLocks()
  const typed = useDebounced(String(text ?? '').trim(), 150)
  const [found, setFound] = useState({ for: '', rows: [] })
  const closedKey = closed.join(',')
  useEffect(() => {
    if (!enabled || typed.length < 1) return undefined
    let live = true
    globalSearch({ q: typed, limit: 12 }, { closed: closedKey ? closedKey.split(',') : [] }).then(
      (r) => live && setFound({ for: typed, rows: r.rows }),
      () => live && setFound({ for: typed, rows: [] }), // suggestions are a nicety: the search itself shows any real error
    )
    return () => {
      live = false
    }
  }, [typed, enabled, closedKey])
  return useMemo(
    () => (enabled && typed ? buildSuggestions(typed, found.for === typed ? found.rows : [], recent) : []),
    [typed, found, recent, enabled],
  )
}
