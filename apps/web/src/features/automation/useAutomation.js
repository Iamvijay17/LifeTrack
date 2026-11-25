import { useEffect, useMemo, useRef } from 'react'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { todayStr } from '@/lib/dates'
import { runAutomations } from '@/services/api'

export const AUTOMATION_TABLES = ['automation_workflows', 'automation_executions']
/** The tables a test run reads to pick a real sample (a task, a habit, a goal). */
export const SAMPLE_TABLES = [
  'tasks',
  'habits',
  'habit_logs',
  'habit_pauses',
  'goals',
  'milestones',
  'study_sessions',
  'reminders',
  'calendar_events',
  'calendar_event_exceptions',
]

/** Workflows, runs and the pause switch, newest first, with the counts the dashboard shows. */
export function useAutomationData() {
  const { data, loading, error, refetch } = useTables(...AUTOMATION_TABLES)
  const { settings } = useSettings()
  return useMemo(() => {
    const workflows = [...data.automation_workflows].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    const executions = [...data.automation_executions].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const count = (s) => executions.filter((e) => e.status === s).length
    const lastRun = new Map()
    for (const e of executions) if (e.workflow_id && !lastRun.has(e.workflow_id)) lastRun.set(e.workflow_id, e)
    return {
      workflows,
      executions,
      lastRun,
      paused: !!settings.automation_prefs?.paused,
      stats: {
        total: workflows.length,
        active: workflows.filter((w) => w.enabled).length,
        disabled: workflows.filter((w) => !w.enabled).length,
        completed: count('completed'),
        failed: count('failed'),
        skipped: count('skipped'),
      },
      loading,
      error,
      refetch,
    }
  }, [data, settings.automation_prefs, loading, error, refetch])
}

/**
 * While LifeTrack is open: every 30 seconds (and on focus) start the runs that have come due. Idempotent across devices and tabs: each run is claimed
 * in the database first. Failures are swallowed on purpose, the next tick tries again, and the history shows what failed.
 * Automations run only while the app is open on a device: there is no server job.
 */
export function useAutomationRunner() {
  const { settings, row } = useSettings()
  const busy = useRef(false)
  useEffect(() => {
    if (!row) return undefined
    const tz = settings.timezone
    const run = async () => {
      if (busy.current) return
      busy.current = true
      try {
        await runAutomations({ today: todayStr(tz), tz, nowMs: Date.now(), weekStartsOn: settings.week_starts_on })
      } catch {
        /* retried on the next tick; nothing is lost */
      } finally {
        busy.current = false
      }
    }
    const first = setTimeout(run, 4_000)
    const id = setInterval(run, 30_000)
    window.addEventListener('focus', run)
    return () => {
      clearTimeout(first)
      clearInterval(id)
      window.removeEventListener('focus', run)
    }
  }, [row, settings.timezone, settings.week_starts_on])
}
