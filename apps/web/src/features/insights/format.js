import { fmtDuration } from '@/lib/dates'

const num = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })

/** One value, written for people. `null` is always an em dash: "no data" is never shown as 0. */
export function formatValue(kind, v, money) {
  if (v == null) return '—'
  if (kind === 'minutes') return fmtDuration(Math.round(v))
  if (kind === 'rate') return `${Math.round(v * 100)}%`
  if (kind === 'money') return money(v)
  if (kind === 'kg') return `${num(v)} kg`
  return num(v)
}

/** The change between two periods as short text: "+12%", "+5 pts" for rates, "+₹300" for money when the old value was 0. */
export function formatChange(row, money) {
  if (row.verdict === 'unavailable') return 'n/a'
  if (row.verdict === 'same') return 'no change'
  const sign = row.diff > 0 ? '+' : '−'
  if (row.kind === 'rate') return `${sign}${Math.round(Math.abs(row.diff) * 100)} pts`
  if (row.pct != null) return `${sign}${Math.round(Math.abs(row.pct) * 100)}%`
  return `${sign}${formatValue(row.kind, Math.abs(row.diff), money)}`
}

export const periodLabel = (kind, range, fmtDay) => {
  if (kind === 'day') return fmtDay(range.from, 'EEE d MMM yyyy')
  if (kind === 'week') return `${fmtDay(range.from, 'd MMM')} – ${fmtDay(range.to, 'd MMM yyyy')}`
  if (kind === 'month') return fmtDay(range.from, 'MMMM yyyy')
  if (kind === 'quarter') return `Q${Math.floor((Number(range.from.slice(5, 7)) - 1) / 3) + 1} ${range.from.slice(0, 4)}`
  if (kind === 'year') return range.from.slice(0, 4)
  return `${fmtDay(range.from, 'd MMM yyyy')} – ${fmtDay(range.to, 'd MMM yyyy')}`
}

export const KIND_NAME = { day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly', custom: 'Custom' }
