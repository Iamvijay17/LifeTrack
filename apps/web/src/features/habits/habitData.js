import { useMemo } from 'react'
import { useTables } from '@/hooks/store'
import { streaks, completion, isDueToday } from '@lifetrack/core/streaks'

/** Habits + logs + derived stats, shared by the Habits page, Overview and Quick-add. */
export function useHabits(today, weekStartsOn = 1) {
  const { data, loading, error, refetch } = useTables('habits', 'habit_logs')
  const stats = useMemo(() => {
    const byHabit = new Map()
    for (const l of data.habit_logs) { const a = byHabit.get(l.habit_id) ?? []; a.push(l); byHabit.set(l.habit_id, a) }
    const rows = data.habits.map((h) => {
      const logs = byHabit.get(h.id) ?? []
      const s = streaks(h, logs, today, weekStartsOn)
      const c30 = completion(h, logs, addDaysSafe(today, -29), today, today, weekStartsOn)
      const all = completion(h, logs, h.start_date, today, today, weekStartsOn)
      return { habit: h, logs, ...s, rate30: c30.rate, rateAll: all.rate, today: logs.find((l) => l.log_date === today) ?? null, due: isDueToday(h, logs, today, weekStartsOn) }
    })
    return rows
  }, [data.habits, data.habit_logs, today, weekStartsOn])
  return { habits: data.habits, logs: data.habit_logs, stats, loading, error, refetch }
}
import { addDays as addDaysSafe } from '@/lib/dates'
