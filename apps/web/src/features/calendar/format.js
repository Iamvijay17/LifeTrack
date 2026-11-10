import { addDays, addMonths, diffDays, fmtClock, fmtDay, monthEnd, monthStart, startOfWeek } from '@/lib/dates'

export const HOUR_PX = 56
export const MIN_BLOCK_PX = 22
export const VIEWS = [
  { value: 'day', label: 'Day', key: 'd' },
  { value: 'week', label: 'Week', key: 'w' },
  { value: 'month', label: 'Month', key: 'm' },
  { value: 'agenda', label: 'Agenda', key: 'a' },
]

/** '#RRGGBB' with an alpha, for tinted backgrounds that work on any theme. */
export function tint(hex, alpha) {
  const n = Number.parseInt((hex || '#94A3B8').slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export const clock = (mins, prefs) => fmtClock(mins, prefs.time_format === '12h')
/** Hour-gutter label: "9 AM" or "09:00". */
export const hourLabel = (h, prefs) =>
  prefs.time_format === '12h' ? `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:00`

/** "9:00 AM – 10:30 AM", "All day", "Due" or, for an item spanning days, both ends. */
export function timeText(item, prefs, { withDate = false } = {}) {
  if (item.allDay) return item.date === item.endDate ? 'All day' : `${fmtDay(item.date, 'd MMM')} – ${fmtDay(item.endDate, 'd MMM')}`
  if (item.untimed) return 'Due'
  if (item.point) return clock(item.startMin, prefs)
  if (item.date !== item.endDate)
    return `${withDate ? `${fmtDay(item.date, 'd MMM')} ` : ''}${clock(item.startMin, prefs)} – ${fmtDay(item.endDate, 'd MMM')} ${clock(item.endMin === 1440 ? 0 : item.endMin, prefs)}`
  return `${clock(item.startMin, prefs)} – ${clock(item.endMin === 1440 ? 0 : item.endMin, prefs)}`
}

/** True for the relative names (Today, Tomorrow, Yesterday), which need the date spelled out beside them. */
export const isRelativeLabel = (label) => ['Today', 'Tomorrow', 'Yesterday'].includes(label)

export function dayLabel(date, today) {
  const d = diffDays(date, today)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  return fmtDay(date, 'EEE, d MMM')
}

/** The visible date range of a view, as { from, to, days } (days = the dates shown as columns or cells). */
export function viewRange(view, date, weekStartsOn) {
  if (view === 'day') return { from: date, to: date, days: [date] }
  if (view === 'week') {
    const from = startOfWeek(date, weekStartsOn)
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
    return { from, to: days[6], days }
  }
  if (view === 'month') {
    const first = startOfWeek(monthStart(date), weekStartsOn)
    const last = addDays(addMonths(date, 1), -1)
    const weeks = Math.ceil((diffDays(last, first) + 1) / 7)
    const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i))
    return { from: first, to: days.at(-1), days }
  }
  return { from: date, to: date, days: [date] }
}
/** Moves a view's anchor date by one page: a day, a week or a month. */
export function stepDate(view, date, dir) {
  if (view === 'day') return addDays(date, dir)
  if (view === 'week') return addDays(date, 7 * dir)
  if (view === 'month') {
    const first = addMonths(date, dir)
    return first.slice(0, 8) + String(Math.min(Number(date.slice(8)), Number(monthEnd(first).slice(8)))).padStart(2, '0')
  }
  return addDays(date, 7 * dir)
}

export function rangeTitle(view, date, range) {
  if (view === 'month') return fmtDay(date, 'MMMM yyyy')
  if (view === 'day') return fmtDay(date, 'EEEE, d MMMM yyyy')
  if (view === 'agenda') return 'Agenda'
  const a = range.from
  const b = range.to
  return a.slice(0, 7) === b.slice(0, 7)
    ? `${fmtDay(a, 'd')} – ${fmtDay(b, 'd MMMM yyyy')}`
    : a.slice(0, 4) === b.slice(0, 4)
      ? `${fmtDay(a, 'd MMM')} – ${fmtDay(b, 'd MMM yyyy')}`
      : `${fmtDay(a, 'd MMM yyyy')} – ${fmtDay(b, 'd MMM yyyy')}`
}
