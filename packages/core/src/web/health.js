// Pure health-log logic (no React, no Supabase): the daily form <-> record conversion, the last-7-days series and summaries.
import { addDays, eachDay, fmtDay } from '@lifetrack/utils'
import { sleepMinutes } from './sleep'

// -------------------------------------------------------------- form <-> record
/** A stored health log (or null for a day with none) -> the daily-log form's text values. */
export const logToForm = (h) => ({
  bedtime: h?.bedtime?.slice(0, 5) ?? '',
  wake_time: h?.wake_time?.slice(0, 5) ?? '',
  water_ml: h ? String(h.water_ml ?? 0) : '',
  steps: h ? String(h.steps ?? 0) : '',
  energy_level: h?.energy_level ? String(h.energy_level) : '',
  weight_kg: h?.weight_kg != null ? String(h.weight_kg) : '',
  notes: h?.notes ?? '',
})

/** The daily-log form values -> the columns to store. Sleep duration is derived here, never typed. */
export function formToLog(v) {
  const n = (s) => (s === '' ? null : Number(s))
  return {
    bedtime: v.bedtime || null,
    wake_time: v.wake_time || null,
    sleep_minutes: v.bedtime ? sleepMinutes(v.bedtime, v.wake_time) : null,
    water_ml: n(v.water_ml) ?? 0,
    steps: n(v.steps) ?? 0,
    energy_level: n(v.energy_level),
    weight_kg: n(v.weight_kg),
    notes: v.notes,
  }
}

// --------------------------------------------------------------------- series
/** The 7 days ending `today`, with sleep in hours (1 dp) and water/steps (null when nothing logged, so charts show gaps). */
export function healthWeek(logs, today) {
  return eachDay(addDays(today, -6), today).map((d) => {
    const h = logs.find((x) => x.log_date === d)
    return {
      d,
      label: fmtDay(d, 'EEE'),
      sleep: h?.sleep_minutes != null ? Math.round((h.sleep_minutes / 60) * 10) / 10 : null,
      water: h?.water_ml || null,
      steps: h?.steps || null,
    }
  })
}

/** Average sleep in minutes over the nights that were logged (null when none) and how many nights that was. */
export function averageSleep(week) {
  const nights = week.filter((w) => w.sleep != null)
  return { minutes: nights.length ? (nights.reduce((a, b) => a + b.sleep, 0) / nights.length) * 60 : null, nights: nights.length }
}

/** Body weight from the daily logs: first, latest, change since the first log, and the last `limit` points for the chart. */
export function weightSeries(logs, limit = 40) {
  const weights = logs.filter((h) => h.weight_kg != null).sort((a, b) => a.log_date.localeCompare(b.log_date))
  const first = weights[0] ?? null
  const latest = weights.at(-1) ?? null
  return {
    first,
    latest,
    change: weights.length > 1 ? Number(latest.weight_kg) - Number(first.weight_kg) : null,
    data: weights.slice(-limit).map((h) => ({ label: fmtDay(h.log_date, 'd MMM'), kg: Number(h.weight_kg) })),
  }
}

/** Percentage of a goal reached, or null when no goal is set (a missing goal is not "0%"). */
export const percentOfGoal = (value, goal) => (goal > 0 ? ((value ?? 0) / goal) * 100 : null)

/** Newest logs first. */
export const recentLogs = (logs, count = 14) => [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date)).slice(0, count)
