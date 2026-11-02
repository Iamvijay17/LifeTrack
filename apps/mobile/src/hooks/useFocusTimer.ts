import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { focusLeft, isFinished, isRunning, pauseFocus, resumeFocus, spentSeconds, startFocus } from '@lifetrack/core/focusTimer'
import { useNow } from './useNow'

const KEY = 'lifetrack:focus-timer'
export interface FocusState { mode: 'focus' | 'short_break' | 'long_break'; plannedMinutes: number; endsAt: number | null; pausedLeft: number | null; taskId: string | null; topicId: string | null; label: string; startedAt: number }

/**
 * Pomodoro countdown (same state machine as web). Driven by an absolute end time, persisted on this device so it
 * survives backgrounding and app restarts; a timer that ended while the app was closed finishes on next open.
 * Finished focus blocks are saved to the database by `onFinish`.
 */
export function useFocusTimer({ onFinish }: { onFinish: (t: FocusState, completed: boolean) => void }) {
  const [t, setT] = useState<FocusState | null>(null)
  const [ready, setReady] = useState(false)
  const finish = useRef(onFinish); finish.current = onFinish
  const fired = useRef(false)
  const now = useNow(500, isRunning(t))

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => { if (raw) try { setT(JSON.parse(raw)) } catch { /* ignore corrupt state */ } }).finally(() => setReady(true))
  }, [])
  const update = useCallback((next: FocusState | null) => {
    setT(next)
    ;(next ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => { /* the timer still works without storage */ })
  }, [])

  const left = focusLeft(t, now)
  const running = isRunning(t)
  useEffect(() => {
    if (!ready) return
    if (t && isFinished(t, Date.now()) && !fired.current) { fired.current = true; const done = t; update(null); finish.current(done, true) }
    if (!running) fired.current = false
  }, [ready, running, left, t, update])

  return {
    ready, timer: t, left, running, paused: !!t && !running,
    start: (cfg: Omit<FocusState, 'endsAt' | 'pausedLeft' | 'startedAt'>) => { fired.current = false; update(startFocus(cfg, Date.now())) },
    pause: () => t && update(pauseFocus(t, Date.now())),
    resume: () => t && update(resumeFocus(t, Date.now())),
    /** Stop early: returns seconds actually spent. */
    stop: () => { if (!t) return 0; const spent = spentSeconds(t, Date.now()); update(null); return spent },
  }
}
