import { useState } from 'react'
import { rangeFor } from '@/domain/analytics'
import { addDays } from '@/lib/dates'

/**
 * The selected reporting period: a preset ('week' | 'month' | 'year') or a custom from/to.
 * `from`/`to` are always ordered (if a custom range is typed backwards the two are swapped, never an empty chart).
 */
export function useDateRange(today, weekStartsOn, initialPreset = 'month') {
  const [preset, setPreset] = useState(initialPreset)
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const range = preset === 'custom' ? custom : rangeFor(preset, today, weekStartsOn)
  const { from, to } = range.from <= range.to ? range : { from: range.to, to: range.from }
  return { preset, setPreset, custom, setCustom, from, to }
}
