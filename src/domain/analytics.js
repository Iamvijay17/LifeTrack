import { addDays, diffDays, eachDay, fmtDay, monthKey, startOfWeek, monthStart } from '@/lib/dates'

/** Group dated values into day / week / month buckets depending on the range length. */
export function bucketize(items, getDate, getValue, from, to, weekStartsOn = 1) {
  const span = diffDays(to, from) + 1
  const unit = span <= 31 ? 'day' : span <= 120 ? 'week' : 'month'
  const keyOf = (d) => (unit === 'day' ? d : unit === 'week' ? startOfWeek(d, weekStartsOn) : monthStart(d))
  const map = new Map()
  const keys = []
  for (const d of eachDay(from, to)) {
    const k = keyOf(d)
    if (!map.has(k)) {
      map.set(k, 0)
      keys.push(k)
    }
  }
  for (const it of items) {
    const d = getDate(it)
    if (!d || d < from || d > to) continue
    const k = keyOf(d)
    map.set(k, (map.get(k) ?? 0) + getValue(it))
  }
  const fmt = unit === 'month' ? 'MMM yy' : 'd MMM'
  return { unit, data: keys.map((k) => ({ key: k, label: fmtDay(k, fmt), value: map.get(k) })) }
}

export const rangeFor = (preset, today, weekStartsOn = 1) => {
  if (preset === 'week') {
    const s = startOfWeek(today, weekStartsOn)
    return { from: s, to: addDays(s, 6) }
  }
  if (preset === 'month') {
    const s = monthStart(today)
    const [y, m] = s.split('-').map(Number)
    return { from: s, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
  }
  if (preset === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
  return null
}

export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export { monthKey }
