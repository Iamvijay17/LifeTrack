import { useEffect, useRef } from 'react'
import { fireDueReminders } from '@/services/api'
import { useSettings } from '@/hooks/useSettings'
import { timeStrInTz, todayStr } from '@/lib/dates'
import { clientNowTime } from '@lifetrack/core/reminders'

/**
 * While the app is open: every minute (and on focus) turn due reminders into notifications. Idempotent across devices.
 * It does not announce anything itself: the notification it creates is announced by useNotificationDelivery like any other, so quiet hours,
 * priority and browser notifications apply in one place. A reminder that came due while every device was off is created late and carries the time
 * it was meant for (`due_at`), so the inbox can show it as missed.
 */
export function useReminderRunner() {
  const { settings, row } = useSettings()
  const busy = useRef(false)
  const prefs = useRef(settings.notification_prefs)
  prefs.current = settings.notification_prefs
  useEffect(() => {
    if (!row) return
    const tz = settings.timezone
    const run = async () => {
      if (busy.current) return
      busy.current = true
      try {
        // Wait a short grace period: the server job fires first (and also pushes to phones); this is only the fallback.
        await fireDueReminders(todayStr(tz), clientNowTime(timeStrInTz(new Date(), tz)), prefs.current, { tz })
      } catch {
        /* a failed check is retried on the next tick; nothing is lost */
      } finally {
        busy.current = false
      }
    }
    run()
    const id = setInterval(run, 60_000)
    window.addEventListener('focus', run)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', run)
    }
  }, [row, settings.timezone])
}
