import { useCallback, useState } from 'react'
import { useLoad } from '@/hooks/useLoad'
import { fetchPage } from '@/services/pagedList'

/**
 * One list, one page at a time, by cursor: `next()` and `prev()` walk the history at constant cost. Changing sort, filters or search starts again at the first
 * page. Returns { items, loading, error, hasNext, hasPrev, next, prev, reload, total, reset }.
 */
export function usePagedList(table, params = {}, { enabled = true } = {}) {
  const [nav, setNav] = useState({ cursor: null, direction: 'next' })
  const key = JSON.stringify(params)
  const [seen, setSeen] = useState(key)
  if (seen !== key) {
    setSeen(key)
    setNav({ cursor: null, direction: 'next' })
  }
  const { data, loading, error, reload } = useLoad(
    () => fetchPage(table, { ...params, cursor: nav.cursor, direction: nav.direction }),
    [table, key, nav.cursor, nav.direction],
    { enabled },
  )
  const next = useCallback(() => data?.nextCursor && setNav({ cursor: data.nextCursor, direction: 'next' }), [data])
  const prev = useCallback(() => data?.prevCursor && setNav({ cursor: data.prevCursor, direction: 'prev' }), [data])
  const reset = useCallback(() => setNav({ cursor: null, direction: 'next' }), [])
  return {
    items: data?.items ?? [],
    total: data?.total ?? null,
    hasNext: Boolean(data?.nextCursor),
    hasPrev: Boolean(data?.prevCursor),
    loading,
    error,
    next,
    prev,
    reload: () => fetchPage(table, params, { force: true }).then(reload),
    reset,
  }
}
