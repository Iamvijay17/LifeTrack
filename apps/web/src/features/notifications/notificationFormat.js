import { addDays, fmtClock, fmtDay, localDayMinutes } from '@lifetrack/utils'

/** "Today, 6:00 PM", "Tomorrow, 8:00 AM", "Mon 16 Nov, 8:00 AM": an instant as the person's own calendar reads it. */
export function formatWhen(ms, tz, nowMs = Date.now()) {
  const { date, minutes } = localDayMinutes(ms, tz)
  const today = localDayMinutes(nowMs, tz).date
  const day =
    date === today
      ? 'Today'
      : date === addDays(today, 1)
        ? 'Tomorrow'
        : date === addDays(today, -1)
          ? 'Yesterday'
          : fmtDay(date, 'EEE d MMM')
  return `${day}, ${fmtClock(minutes, true)}`
}
/** Just the clock: "9:00 AM". */
export const formatClock = (ms, tz) => fmtClock(localDayMinutes(ms, tz).minutes, true)
