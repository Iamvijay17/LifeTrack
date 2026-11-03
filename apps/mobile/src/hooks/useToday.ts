import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { todayStr } from '@lifetrack/utils'
import { useSettings } from './useSettings'

/** Today's date in the user's timezone; re-evaluated every 30s and when the app returns to the foreground. */
export function useToday() {
  const { settings } = useSettings()
  const tz = settings.timezone
  const [today, setToday] = useState(() => todayStr(tz))
  useEffect(() => {
    const tick = () => setToday(todayStr(tz))
    tick()
    const id = setInterval(tick, 30_000)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tick() })
    return () => { clearInterval(id); sub.remove() }
  }, [tz])
  return today
}
