import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { addDays } from '@/lib/dates'
import { alertSchedule, alertText, buildCalendarItems, dueAlerts } from '@/domain/calendar'
import { isKindEnabled } from '@/domain/reminders'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { raiseCalendarAlert } from '@/services/api'
import { useCalendarPrefs } from './calendarPrefs'

const HORIZON_DAYS = 29 // the longest alert offset is four weeks
const TICK_MS = 30_000

/** Whether this browser can show system notifications, and whether the user has said yes. Never asks by itself. */
export function useBrowserNotifications() {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied')
  const request = useCallback(async () => {
    if (!supported) return 'denied'
    const result = await Notification.requestPermission() // only ever called from a click
    setPermission(result)
    return result
  }, [supported])
  return { supported, permission, request }
}

const showSystemNotification = (title, body, tag, link) => {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const n = new Notification(title, { body, tag, icon: '/favicon.svg' })
    n.onclick = () => {
      window.focus()
      if (link) window.location.assign(link)
      n.close()
    }
  } catch {
    /* some browsers only allow notifications through a service worker; the in-app notification still exists */
  }
}

/**
 * While LifeTrack is open: turns the alerts you set on events and tasks into notifications when their time comes.
 *  - Each alert has a key (which item, which occurrence, which offset). The key is the notification's dedupe_key, which is unique per user in the
 *    database, so with LifeTrack open on a phone and a laptop (or in two tabs) only the first insert wins and you are told once.
 *  - Only the device that wins also shows the browser notification, and only if you turned that on in Calendar settings and the browser allowed it.
 *  - An alert that is more than 15 minutes late (a laptop that was asleep) is skipped rather than replayed.
 *  - Alerts for events do not reach a closed app: there is no server job for them (the reminders list has one; see docs/KNOWN_ISSUES.md).
 */
export function useCalendarAlerts() {
  const { settings, row } = useSettings()
  const { prefs } = useCalendarPrefs()
  const { data } = useTables('tasks', 'calendar_events', 'calendar_event_exceptions')
  const tz = settings.timezone
  const raised = useRef(new Set()) // keys this tab has already handled, so a minute tick never retries a lost race
  const notify = useRef({ on: prefs.browser_notifications, enabled: isKindEnabled(settings.notification_prefs, 'event') })
  notify.current = { on: prefs.browser_notifications, enabled: isKindEnabled(settings.notification_prefs, 'event') }

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
      if (busy || !notify.current.enabled) return
      busy = true
      try {
        const now = Date.now()
        for (const a of dueAlerts(schedule.current, now)) {
          if (raised.current.has(a.key)) continue
          raised.current.add(a.key)
          const text = alertText(a, now)
          const link = `/calendar?view=day&date=${a.item.date}`
          let made = null
          try {
            made = await raiseCalendarAlert({ key: a.key, title: text, body: '', link })
          } catch {
            raised.current.delete(a.key) // a failed save is retried on the next tick
            continue
          }
          if (!made) continue // another device or tab told you already
          toast(text, { description: 'Open the bell to see it.' })
          if (notify.current.on) showSystemNotification(text, '', a.key, link)
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
