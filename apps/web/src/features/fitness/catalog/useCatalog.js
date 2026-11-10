import { useCallback, useEffect, useState } from 'react'
import { catalogIndex } from '@/domain/exerciseCatalog'

/** Where the Free Exercise DB catalog and its images are served from (apps/web/public/exercises). */
export const EXERCISE_BASE = '/exercises/'
export const exerciseImageUrl = (rel) => (rel ? EXERCISE_BASE + rel.split('/').map(encodeURIComponent).join('/') : null)

// One fetch per page load, shared by the browser, the detail page and "My exercises". A failure is not cached, so Retry works.
let loading = null
function loadCatalog() {
  loading ??= fetch(`${EXERCISE_BASE}catalog.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Exercise database unavailable (${res.status})`)
      return res.json()
    })
    .then((json) => ({ ...json, index: catalogIndex(json.exercises) }))
    .catch((err) => {
      loading = null
      throw err
    })
  return loading
}

/** { catalog: { meta, exercises, index } | null, loading, error, retry }. */
export function useCatalog() {
  const [state, setState] = useState({ catalog: null, loading: true, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setState((s) => (s.catalog ? s : { catalog: null, loading: true, error: null }))
    loadCatalog().then(
      (catalog) => live && setState({ catalog, loading: false, error: null }),
      (err) => live && setState({ catalog: null, loading: false, error: err.message || 'Could not load the exercise database' }),
    )
    return () => {
      live = false
    }
  }, [attempt])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, retry }
}
