// Pure habit logic (no React, no Supabase): per-habit stats, dashboard summary and heatmap data.
import { addDays, eachDay } from '@lifetrack/utils'
import { completion, isDueToday, isScheduled, streaks } from './streaks'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const scheduleLabel = (h) =>
  h.frequency === 'daily'
    ? 'Every day'
    : h.frequency === 'weekly'
      ? `${h.weekly_target}× / week`
      : WEEKDAYS.filter((_, i) => h.days_of_week.includes(i)).join(' · ')

/**
 * One row per habit with its logs, streaks, 30-day / overall completion, today's log and whether it is due.
 * Shared by the Habits page, the dashboard and quick-add.
 */
export function buildHabitStats(habits, habitLogs, today, weekStartsOn = 1) {
  const byHabit = new Map()
  for (const l of habitLogs) {
    const list = byHabit.get(l.habit_id) ?? []
    list.push(l)
    byHabit.set(l.habit_id, list)
  }
  return habits.map((h) => {
    const logs = byHabit.get(h.id) ?? []
    return {
      habit: h,
      logs,
      ...streaks(h, logs, today, weekStartsOn),
      rate30: completion(h, logs, addDays(today, -29), today, today, weekStartsOn).rate,
      rateAll: completion(h, logs, h.start_date, today, today, weekStartsOn).rate,
      today: logs.find((l) => l.log_date === today) ?? null,
      due: isDueToday(h, logs, today, weekStartsOn),
    }
  })
}

/** Headline numbers for the active (non-archived) habits on `day`. */
export function summarizeHabits(stats, day) {
  const active = stats.filter((s) => !s.habit.archived_at)
  const rates = active.map((s) => s.rate30).filter((x) => x != null)
  return {
    active,
    doneOnDay: active.filter((s) => s.logs.some((l) => l.log_date === day && l.status === 'done')).length,
    longest: active.reduce((m, s) => Math.max(m, s.longest), 0),
    bestCurrent: active.reduce((m, s) => Math.max(m, s.current), 0),
    avg30: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
  }
}

/**
 * Heatmap input: for each day with something planned, how many habits were done out of how many were planned.
 * Skipped and rest-day habits are removed from the plan, so they never count against you.
 */
export function heatmapCounts(stats, from, to) {
  const out = new Map()
  for (const d of eachDay(from, to)) {
    let done = 0
    let planned = 0
    for (const s of stats) {
      const l = s.logs.find((x) => x.log_date === d)
      if (l?.status === 'skipped' || l?.status === 'rest') continue
      const scheduled = s.habit.frequency === 'weekly' ? l?.status === 'done' : isScheduled(s.habit, d)
      if (l?.status === 'done') {
        done++
        planned++
      } else if (scheduled) planned++
    }
    if (planned) out.set(d, { done, planned })
  }
  return out
}
