import { useCallback, useEffect, useRef, useState } from 'react'
import { focusLeft, isFinished, isRunning, pauseFocus, resumeFocus, spentSeconds, startFocus } from '@lifetrack/core/focusTimer'

const KEY = 'lifetrack:focus-timer'
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } }
const persist = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch { /* the timer still works without storage */ } }

/**
 * Pomodoro countdown driven by an absolute end timestamp, so it stays accurate in background tabs and survives a reload
 * (the in-progress timer is a per-device convenience; finished focus blocks are saved to the database by the caller).
 * state: { mode, plannedMinutes, endsAt|null, pausedLeft|null, taskId, topicId, label, startedAt }
 */
export function useFocusTimer({ onFinish }) {
  const [t, setT] = useState(load)
  const [now, setNow] = useState(() => Date.now())
  const finish = useRef(onFinish); finish.current = onFinish
  const fired = useRef(false)

  const update = useCallback((next) => { persist(next); setT(next) }, [])
  const running = isRunning(t)
  const left = focusLeft(t, now)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (running && left === 0 && !fired.current) {
      fired.current = true
      const done = t
      update(null)
      finish.current(done, true)
    }
    if (!running) fired.current = false
  }, [running, left, t, update])

  return {
    timer: t, left, running, paused: !!t && !running,
    start: (cfg) => { fired.current = false; setNow(Date.now()); update(startFocus(cfg, Date.now())) },
    pause: () => t && update(pauseFocus(t, Date.now())),
    resume: () => { if (!t) return; setNow(Date.now()); update(resumeFocus(t, Date.now())) },
    /** Stop early: returns seconds actually spent. */
    stop: () => { if (!t) return 0; const spent = spentSeconds(t, Date.now()); update(null); return spent },
  }
}
