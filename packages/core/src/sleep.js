export { sleepMinutes } from '@lifetrack/utils'

/** Used until the user sets their own goal. Also the target the daily score has always used. */
export const DEFAULT_SLEEP_GOAL_MINUTES = 450
export const MIN_SLEEP_GOAL_MINUTES = 240
export const MAX_SLEEP_GOAL_MINUTES = 720

/** The goal is kept in the `habit_prefs` settings blob, so it syncs across devices without a schema change. */
export const sleepGoalOf = (settings) => {
  const v = Number(settings?.habit_prefs?.sleep_goal_minutes)
  return v >= MIN_SLEEP_GOAL_MINUTES && v <= MAX_SLEEP_GOAL_MINUTES ? v : DEFAULT_SLEEP_GOAL_MINUTES
}

const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
// Bedtimes straddle midnight, so measure from noon: 23:30 and 00:30 are an hour apart, not 23 hours.
const fromNoon = (t) => (toMinutes(t) + 720) % 1440
const clock = (noonMinutes) => {
  const m = Math.round(noonMinutes + 720) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * How regular sleep has been: average bedtime and wake time, how much bedtime varies (standard deviation, minutes), how many logged nights
 * met the goal, and a word for it. `logs` are health logs. Needs three nights, because a "consistency" from one or two means nothing.
 */
export function sleepConsistency(logs, { goalMinutes = DEFAULT_SLEEP_GOAL_MINUTES } = {}) {
  const timed = logs.filter((l) => l.bedtime && l.wake_time)
  const slept = logs.filter((l) => l.sleep_minutes != null)
  const nightsMetGoal = slept.filter((l) => l.sleep_minutes >= goalMinutes).length
  if (timed.length < 3) return { nights: timed.length, nightsLogged: slept.length, nightsMetGoal, avgBedtime: null, avgWake: null, spreadMinutes: null, label: null }
  const beds = timed.map((l) => fromNoon(l.bedtime))
  const mean = beds.reduce((a, b) => a + b, 0) / beds.length
  const spread = Math.round(Math.sqrt(beds.reduce((a, b) => a + (b - mean) ** 2, 0) / beds.length))
  const wakes = timed.map((l) => toMinutes(l.wake_time))
  const wake = wakes.reduce((a, b) => a + b, 0) / wakes.length
  return {
    nights: timed.length,
    nightsLogged: slept.length,
    nightsMetGoal,
    avgBedtime: clock(mean),
    avgWake: clock(wake - 720),
    spreadMinutes: spread,
    label: spread <= 30 ? 'Very regular' : spread <= 60 ? 'Fairly regular' : 'Irregular',
  }
}

/** Average energy (1–5) over logs that have one; null when none do. */
export function averageEnergy(logs) {
  const vals = logs.filter((l) => l.energy_level != null).map((l) => l.energy_level)
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
}
