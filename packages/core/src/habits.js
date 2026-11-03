// Habit presentation logic shared by web and mobile (streak maths lives in ./streaks).
import { addDays, eachDay } from '@lifetrack/utils'
import { streaks, completion, isDueToday, isScheduled } from './streaks'

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const scheduleLabel = (h) =>
  h.frequency === 'daily' ? 'Every day' : h.frequency === 'weekly' ? `${h.weekly_target}× / week` : WEEKDAY_SHORT.filter((_, i) => h.days_of_week.includes(i)).join(' · ')
export const pctText = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`)
/** 0..4 intensity for a completion ratio (heatmap cell colour). */
export const levelFor = (ratio) => (ratio <= 0 ? 0 : ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio < 1 ? 3 : 4)

/** Per-habit stats: streaks, 30-day and overall completion, today's log, and whether it is still due. */
export function habitStats(habits, habitLogs, today, weekStartsOn = 1) {
  const byHabit = new Map()
  for (const l of habitLogs) { const a = byHabit.get(l.habit_id) ?? []; a.push(l); byHabit.set(l.habit_id, a) }
  return habits.map((h) => {
    const logs = byHabit.get(h.id) ?? []
    const s = streaks(h, logs, today, weekStartsOn)
    const c30 = completion(h, logs, addDays(today, -29), today, today, weekStartsOn)
    const all = completion(h, logs, h.start_date, today, today, weekStartsOn)
    return { habit: h, logs, ...s, rate30: c30.rate, rateAll: all.rate, today: logs.find((l) => l.log_date === today) ?? null, due: isDueToday(h, logs, today, weekStartsOn) }
  })
}

/** Headline numbers for the Habits screen. `stats` comes from habitStats. */
export function habitSummary(stats, day) {
  const active = stats.filter((s) => !s.habit.archived_at)
  const doneToday = active.filter((s) => s.logs.some((l) => l.log_date === day && l.status === 'done')).length
  const rates = active.map((s) => s.rate30).filter((x) => x != null)
  return {
    active,
    doneToday,
    total: active.length,
    longest: active.reduce((m, s) => Math.max(m, s.longest), 0),
    bestCurrent: active.reduce((m, s) => Math.max(m, s.current), 0),
    avg30: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
  }
}

/** Heatmap data for the last ~27 weeks. `focus` = 'all' or a habit id. Returns Maps keyed by 'yyyy-MM-dd'. */
export function habitHeatmap(active, focus, today) {
  const levels = new Map(), titles = new Map()
  const from = addDays(today, -26 * 7 - 7)
  const subset = focus === 'all' ? active : active.filter((s) => s.habit.id === focus)
  for (const d of eachDay(from, today)) {
    let done = 0, planned = 0
    for (const s of subset) {
      const l = s.logs.find((x) => x.log_date === d)
      if (l?.status === 'skipped' || l?.status === 'rest') continue
      const sched = s.habit.frequency === 'weekly' ? l?.status === 'done' : isScheduled(s.habit, d)
      if (l?.status === 'done') { done++; planned++ } else if (sched) planned++
    }
    if (planned) { levels.set(d, levelFor(done / planned)); titles.set(d, `${done}/${planned} done`) }
  }
  return { levels, titles }
}

/** Whether a habit shows as scheduled on `date` (weekly "X times a week" habits count any day). */
export const isScheduledOn = (habit, date) => habit.frequency === 'weekly' || isScheduled(habit, date)
