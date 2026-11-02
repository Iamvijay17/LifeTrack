import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { fireDueReminders } from '@/services/api'
import { useSettings } from '@/hooks/useSettings'
import { timeStrInTz, todayStr } from '@/lib/dates'

/** While the app is open: every minute (and on focus) turn due reminders into notifications. Idempotent across devices. */
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
        const n = await fireDueReminders(todayStr(tz), timeStrInTz(new Date(), tz), prefs.current)
        if (n > 0) toast(`${n} new reminder${n > 1 ? 's' : ''}`, { description: 'Open the bell to see them.' })
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
