// Sleep & health presentation logic shared by web and mobile.
import { addDays, eachDay, fmtDay, fmtDuration } from '@lifetrack/utils'

export const WATER_PRESETS = [150, 250, 500, 1000]
export const MAX_CUSTOM_WATER_ML = 5000
export const isValidCustomWater = (n) => Number.isFinite(n) && Math.floor(n) > 0 && Math.floor(n) <= MAX_CUSTOM_WATER_ML

/** Last 7 days (ending today) of sleep hours, water and steps for the charts. Missing values are null. */
export function healthWeek(logs, today) {
  return eachDay(addDays(today, -6), today).map((d) => {
    const h = logs.find((x) => x.log_date === d)
    return { d, label: fmtDay(d, 'EEE'), sleep: h?.sleep_minutes != null ? Math.round((h.sleep_minutes / 60) * 10) / 10 : null, water: h?.water_ml || null, steps: h?.steps || null }
  })
}

export function healthSummary(logs, today) {
  const week = healthWeek(logs, today)
  const sleepVals = week.filter((w) => w.sleep != null)
  const weights = logs.filter((h) => h.weight_kg != null).sort((a, b) => a.log_date.localeCompare(b.log_date))
  const first = weights[0], last = weights.at(-1)
  return {
    week,
    nightsLogged: sleepVals.length,
    avgSleepMinutes: sleepVals.length ? (sleepVals.reduce((a, b) => a + b.sleep, 0) / sleepVals.length) * 60 : null,
    todayLog: logs.find((h) => h.log_date === today) ?? null,
    latestWeight: last ? Number(last.weight_kg) : null,
    weightChange: weights.length > 1 ? Number(last.weight_kg) - Number(first.weight_kg) : null,
    weightSeries: weights.slice(-30).map((h) => ({ label: fmtDay(h.log_date, 'd MMM'), kg: Number(h.weight_kg) })),
    history: [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date)).slice(0, 14),
  }
}

export const signedKg = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)} kg`
/** One-line summary of a day's log for the history list. */
export const historyLine = (h) =>
  [h.sleep_minutes != null && `Sleep ${fmtDuration(h.sleep_minutes)}`, h.water_ml > 0 && `Water ${h.water_ml} ml`, h.steps > 0 && `${h.steps.toLocaleString('en-IN')} steps`, h.energy_level && `Energy ${h.energy_level}/5`, h.weight_kg != null && `${h.weight_kg} kg`].filter(Boolean).join('  ·  ')
