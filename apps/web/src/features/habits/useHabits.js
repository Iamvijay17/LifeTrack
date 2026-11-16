import { useMemo } from 'react'
import { useTable, useTables } from '@/hooks/store'
import { buildHabitStats } from '@/domain/habits'

/** Habits + logs + derived stats, shared by the Habits page, Overview and Quick-add. */
export function useHabits(today, weekStartsOn = 1) {
  const { data, loading, error, refetch } = useTables('habits', 'habit_logs')
  // Pauses are optional: if the database has not had migration 0018 yet this table fails to load, and habits simply behave as if never paused.
  const { rows: pauses } = useTable('habit_pauses')
  const stats = useMemo(
    () => buildHabitStats(data.habits, data.habit_logs, today, weekStartsOn, pauses),
    [data.habits, data.habit_logs, pauses, today, weekStartsOn],
  )
  return { habits: data.habits, logs: data.habit_logs, pauses, stats, loading, error, refetch }
}
