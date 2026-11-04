import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { todayStr } from '@lifetrack/utils'
import { api } from '../../data/client'
import { useTable } from '../../data/useTable'
import { useSettings } from '../../hooks/useSettings'

/** Mounted once for the signed-in app: every minute, on returning to the app and whenever a rule changes, post what recurring rules owe. Idempotent across devices. */
export function RecurringRunner() {
  const { settings, row } = useSettings()
  const { rows: rules } = useTable('recurring_rules')
  const busy = useRef(false)
  useEffect(() => {
    if (!row) return // wait until the real timezone has loaded
    const tz = settings.timezone
    const run = async () => {
      if (busy.current) return
      busy.current = true
      // Offline or a failed write: next_date has not moved, so the next tick picks it up. Nothing is lost.
      try { await api.postDueRecurring(todayStr(tz)) } catch { /* retried on the next tick */ } finally { busy.current = false }
    }
    run()
    const id = setInterval(run, 60_000)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run() })
    return () => { clearInterval(id); sub.remove() }
  }, [row, settings.timezone, rules])
  return null
}
