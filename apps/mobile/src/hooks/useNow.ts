import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

/** Re-renders every `ms` while `active`; also refreshes immediately when the app returns to the foreground. */
export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), ms)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setNow(Date.now()) })
    return () => { clearInterval(id); sub.remove() }
  }, [ms, active])
  return now
}
