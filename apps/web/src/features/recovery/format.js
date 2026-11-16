import { timeToMinutes } from '@/lib/dates'
import { clock, dayLabel, isRelativeLabel } from '@/features/calendar/format'
import { fmtDay } from '@/lib/dates'

/** '14:30' as the user likes to read it (12h or 24h, from the calendar settings). */
export const hm = (t, prefs) => (t ? clock(timeToMinutes(String(t).slice(0, 5)), prefs) : '')
export const slotText = (s, prefs) => (s?.start ? `${hm(s.start, prefs)} – ${hm(s.end, prefs)}` : 'No time set')
/** 'Today', 'Tomorrow' or 'Wed, 12 Nov'. */
export const when = (date, today) => dayLabel(date, today)
/** 'Tomorrow · 12 Nov' for the relative names, so the date is never hidden behind a word. */
export function whenLong(date, today) {
  const label = dayLabel(date, today)
  return isRelativeLabel(label) ? `${label} · ${fmtDay(date, 'd MMM')}` : label
}
export const hours = (mins) => (mins % 60 === 0 ? `${mins / 60}h` : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`)
