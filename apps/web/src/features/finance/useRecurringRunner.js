import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTable } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { todayStr } from '@/lib/dates'
import { postDueRecurring } from '@/services/api'

/** While the app is open: every minute, on focus and whenever a rule changes, post what recurring rules owe. Idempotent across devices. */
export function useRecurringRunner() {
  const { settings, row } = useSettings()
  const { rows: rules } = useTable('recurring_rules')
  const busy = useRef(false)
  useEffect(() => {
    if (!row) return // wait until the real timezone has loaded
    const tz = settings.timezone
    const run = async () => {
      if (busy.current) return
      busy.current = true
      try {
        const n = await postDueRecurring(todayStr(tz))
        if (n > 0) toast(`${n} recurring transaction${n > 1 ? 's' : ''} added`)
      } catch {
        /* offline or a failed write: next_date has not moved, so the next tick picks it up; nothing is lost */
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
  }, [row, settings.timezone, rules])
}
