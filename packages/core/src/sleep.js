import { timeToMinutes } from '@lifetrack/utils'

/** Minutes slept between bedtime and wake time, correctly handling overnight sleep (23:30 -> 06:30 = 7h). */
export function sleepMinutes(bedtime, wake) {
  const b = timeToMinutes(bedtime)
  const w = timeToMinutes(wake)
  if (b == null || w == null || Number.isNaN(b) || Number.isNaN(w)) return null
  if (b === w) return null // ambiguous: 0 or 24h — ask the user to fix it
  return (w - b + 1440) % 1440
}
