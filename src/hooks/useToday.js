import { useEffect, useState } from 'react'
import { todayStr } from '@/lib/dates'
import { useSettings } from './useSettings'

/** Today's date string in the user's timezone; re-evaluated on focus and at midnight so all devices agree. */
export function useToday() {
  const { settings } = useSettings()
  const tz = settings.timezone
  const [today, setToday] = useState(() => todayStr(tz))
  useEffect(() => {
    const tick = () => setToday(todayStr(tz))
    tick()
    const id = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [tz])
  return today
}
