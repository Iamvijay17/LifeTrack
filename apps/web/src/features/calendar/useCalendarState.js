import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isValidDay } from '@/lib/dates'
import { VIEWS } from './format'

const FILTERS_KEY = 'lifetrack:calendar:filters'
export const NO_FILTERS = { hiddenCategories: [], priorities: [], status: 'all' }

/** The visible view and anchor date live in the URL (/calendar?view=week&date=2026-11-10), so a notification, a link or the back button lands on the right page. */
export function useCalendarView(defaultView, today) {
  const [params, setParams] = useSearchParams()
  const asked = params.get('view')
  const view = VIEWS.some((v) => v.value === asked) ? asked : defaultView
  const date = isValidDay(params.get('date')) ? params.get('date') : today
  const go = useCallback(
    ({ view: nextView, date: nextDate }) =>
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          if (nextView) n.set('view', nextView)
          if (nextDate) n.set('date', nextDate)
          return n
        },
        { replace: true },
      ),
    [setParams],
  )
  return { view, date, go }
}

const readFilters = () => {
  try {
    return { ...NO_FILTERS, ...JSON.parse(localStorage.getItem(FILTERS_KEY)) }
  } catch {
    return NO_FILTERS
  }
}

/** Category, priority and status filters: a per-device convenience, kept in this browser only. */
export function useCalendarFilters() {
  const [filters, setFilters] = useState(readFilters)
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
    } catch {
      /* private mode or blocked storage: filters just won't survive a reload */
    }
  }, [filters])
  const toggleCategory = useCallback(
    (key) =>
      setFilters((f) => ({
        ...f,
        hiddenCategories: f.hiddenCategories.includes(key) ? f.hiddenCategories.filter((k) => k !== key) : [...f.hiddenCategories, key],
      })),
    [],
  )
  const togglePriority = useCallback(
    (key) =>
      setFilters((f) => ({
        ...f,
        priorities: f.priorities.includes(key) ? f.priorities.filter((k) => k !== key) : [...f.priorities, key],
      })),
    [],
  )
  const setStatus = useCallback((status) => setFilters((f) => ({ ...f, status })), [])
  const clear = useCallback(() => setFilters(NO_FILTERS), [])
  const active = filters.hiddenCategories.length + filters.priorities.length + (filters.status !== 'all' ? 1 : 0)
  return useMemo(
    () => ({ filters, active, toggleCategory, togglePriority, setStatus, clear }),
    [filters, active, toggleCategory, togglePriority, setStatus, clear],
  )
}
