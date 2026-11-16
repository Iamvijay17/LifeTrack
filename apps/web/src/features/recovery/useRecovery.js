import { useMemo } from 'react'
import { useTables } from '@/hooks/store'
import { useNow } from '@/hooks/useNow'
import { useToday } from '@/hooks/useToday'
import { planRecovery } from '@/domain/recovery'
import { useCalendarPrefs } from '@/features/calendar/calendarPrefs'

export const RECOVERY_TABLES = [
  'tasks',
  'task_reschedules',
  'calendar_events',
  'calendar_event_exceptions',
  'interview_events',
  'job_applications',
  'reminders',
  'habits',
  'habit_logs',
]

/**
 * Everything the recovery page knows: the rows, the plan computed from them (suggestions, day loads) and the context (today, zone, settings) that
 * every check must use. Read-only: nothing here changes a task. "Today" and "now" are read in the user's zone, so the day boundary is their midnight.
 */
export function useRecovery() {
  const today = useToday()
  const nowMs = useNow(60_000)
  const { prefs, update } = useCalendarPrefs()
  const { data, loading, error, refetch } = useTables(...RECOVERY_TABLES)
  const source = useMemo(
    () => ({
      tasks: data.tasks,
      events: data.calendar_events,
      exceptions: data.calendar_event_exceptions,
      interviews: data.interview_events,
      applications: data.job_applications,
      reminders: data.reminders,
      habits: data.habits,
      habitLogs: data.habit_logs,
      reschedules: data.task_reschedules,
    }),
    [data],
  )
  const ctx = useMemo(() => ({ today, tz: prefs.timezone, nowMs, prefs }), [today, prefs, nowMs])
  const plan = useMemo(() => planRecovery(source, ctx), [source, ctx])
  return { source, ctx, plan, prefs, updatePrefs: update, loading, error, refetch }
}
