import { useMemo, useState } from 'react'
import { addDays } from '@/lib/dates'
import { normalizeRange, periodFor, shiftAnchor } from '@/domain/insights'

/**
 * The reporting period: a calendar week / month / quarter / year (stepped back and forward with `offset`, 0 = the current one),
 * or a custom from/to. The future is never offered: `next` stops at the current period.
 */
export function usePeriod(today, weekStartsOn, initialKind = 'month') {
  const [kind, setKindState] = useState(initialKind)
  const [offset, setOffset] = useState(0)
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const range = useMemo(
    () => (kind === 'custom' ? normalizeRange(custom) : periodFor(kind, shiftAnchor(kind, today, offset), weekStartsOn)),
    [kind, offset, custom, today, weekStartsOn],
  )
  return {
    kind,
    setKind: (k) => {
      setKindState(k)
      setOffset(0)
    },
    offset,
    prev: () => setOffset((o) => o - 1),
    next: () => setOffset((o) => Math.min(0, o + 1)),
    reset: () => setOffset(0),
    canNext: kind !== 'custom' && offset < 0,
    custom,
    setCustom,
    range,
  }
}
