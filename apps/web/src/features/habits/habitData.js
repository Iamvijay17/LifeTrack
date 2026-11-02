import { useMemo } from 'react'
import { useTables } from '@/hooks/store'
import { habitStats } from '@lifetrack/core/habits'

/** Habits + logs + derived stats, shared by the Habits page, Overview and Quick-add. */
export function useHabits(today, weekStartsOn = 1) {
  const { data, loading, error, refetch } = useTables('habits', 'habit_logs')
  const stats = useMemo(() => habitStats(data.habits, data.habit_logs, today, weekStartsOn), [data.habits, data.habit_logs, today, weekStartsOn])
  return { habits: data.habits, logs: data.habit_logs, stats, loading, error, refetch }
}
