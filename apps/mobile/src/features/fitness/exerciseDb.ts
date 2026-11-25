import { useCallback, useEffect, useState } from 'react'
import { catalogIndex } from '@lifetrack/core/exerciseCatalog'

// The exercise database (Free Exercise DB, Unlicense) and its photos are hosted by the LifeTrack web app under /exercises/, so the app
// stays small: it fetches the catalog once and loads each photo when it is on screen. PUBLIC value, inlined at build time.
export const exerciseBase = () => { const url = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, ''); return url ? `${url}/exercises/` : null }
export const exerciseImageUrl = (rel: string | null | undefined) => { const base = exerciseBase(); return base && rel ? base + rel.split('/').map(encodeURIComponent).join('/') : null }

export interface CatalogExercise {
  id: string; name: string; category: string; primary: string[]; secondary: string[]; equipment: string; level: string; type: string
  force: string | null; mechanic: string | null; instructions: string[]; images: string[]
}
export interface Catalog { meta: { source: string; url: string; license: string; licenseUrl: string; count: number }; exercises: CatalogExercise[]; index: ReturnType<typeof catalogIndex> }

const loading = new Map<string, Promise<Catalog>>()
function loadCatalog(): Promise<Catalog> {
  const base = exerciseBase()
  if (!base) return Promise.reject(new Error('NO_WEB_URL'))
  if (!loading.has(base)) {
    loading.set(base, fetch(`${base}catalog.json`)
      .then((res) => { if (!res.ok) throw new Error(`Exercise database unavailable (${res.status})`); return res.json() })
      .then((json) => ({ ...json, index: catalogIndex(json.exercises) }) as Catalog)
      .catch((err) => { loading.delete(base); throw err })) // a failure is not cached, so Try again works
  }
  return loading.get(base)!
}

/** { catalog, loading, error, retry }. `error` is 'NO_WEB_URL' when the build has no web address to load from. */
export function useExerciseCatalog() {
  const [state, setState] = useState<{ catalog: Catalog | null; loading: boolean; error: string | null }>({ catalog: null, loading: true, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    loadCatalog().then((catalog) => live && setState({ catalog, loading: false, error: null }), (err) => live && setState({ catalog: null, loading: false, error: err.message || 'Could not load the exercise database' }))
    return () => { live = false }
  }, [attempt])
  const retry = useCallback(() => { setState((s) => ({ ...s, loading: true, error: null })); setAttempt((n) => n + 1) }, [])
  return { ...state, retry }
}
