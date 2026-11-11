import { useEffect, useRef } from 'react'
import { fromItemPriority } from '@lifetrack/core/notifications'
import { addDays } from '@/lib/dates'
import { alertSchedule, alertText, buildCalendarItems, dueAlerts } from '@/domain/calendar'
import { isKindEnabled } from '@/domain/reminders'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { raiseCalendarAlert } from '@/services/api'

// Calendar settings used to define this; it now lives with the rest of the notification centre. Kept here so the calendar's settings keep importing it.
export { useBrowserNotifications } from '@/features/notifications/browserNotifications'

const HORIZON_DAYS = 29 // the longest alert offset is four weeks
const TICK_MS = 30_000

/**
 * While LifeTrack is open: turns the alerts you set on events and tasks into notifications when their time comes.
 *  - Each alert has a key (which item, which occurrence, which offset). The key is the notification's dedupe_key, which is unique per user in the
 *    database, so with LifeTrack open on a phone and a laptop (or in two tabs) only the first insert wins and you are told once.
 *  - Showing it (a toast in the app, a browser notification when the page is in the background) is not done here: the notification centre announces
 *    every new notification the same way, so quiet hours, priority and the browser-notification switch apply to calendar alerts too.
 *  - An alert that is more than 15 minutes late (a laptop that was asleep) is skipped rather than replayed.
 *  - Alerts for events do not reach a closed app: there is no server job for them (the reminders list has one; see docs/KNOWN_ISSUES.md).
 */
export function useCalendarAlerts() {
  const { settings, row } = useSettings()
  const { data } = useTables('tasks', 'calendar_events', 'calendar_event_exceptions')
  const tz = settings.timezone
  const raised = useRef(new Set()) // keys this tab has already handled, so a minute tick never retries a lost race
  const notify = useRef(true)
  notify.current = isKindEnabled(settings.notification_prefs, 'event')

  const schedule = useRef([])
  // Recomputed when your data changes (and when the day turns), not on every tick.
  const day = useToday()
  useEffect(() => {
    if (!row) return
    const items = buildCalendarItems(
      { tasks: data.tasks, events: data.calendar_events, exceptions: data.calendar_event_exceptions },
      { from: addDays(day, -1), to: addDays(day, HORIZON_DAYS), tz, today: day, nowMs: Date.now() },
    )
    schedule.current = alertSchedule(items, { tz })
  }, [row, data.tasks, data.calendar_events, data.calendar_event_exceptions, tz, day])

  useEffect(() => {
    if (!row) return undefined
    let busy = false
    const run = async () => {
      if (busy || !notify.current) return
      busy = true
      try {
        const now = Date.now()
        for (const a of dueAlerts(schedule.current, now)) {
          if (raised.current.has(a.key)) continue
          raised.current.add(a.key)
          try {
            await raiseCalendarAlert({
              key: a.key,
              title: alertText(a, now),
              body: '',
              link: `/calendar?view=day&date=${a.item.date}`,
              priority: fromItemPriority(a.item.priority),
            })
          } catch {
            raised.current.delete(a.key) // a failed save is retried on the next tick
          }
        }
      } finally {
        busy = false
      }
    }
    run()
    const id = setInterval(run, TICK_MS)
    window.addEventListener('focus', run)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', run)
    }
  }, [row])
}
