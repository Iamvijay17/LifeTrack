import { useCallback, useEffect, useRef, useState } from 'react'
import { remainingSeconds } from '@/domain/focus'

const KEY = 'lifetrack:focus-timer'
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
const persist = (v) => {
  try {
    v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY)
  } catch {
    /* the timer still works without storage */
  }
}

/**
 * Pomodoro countdown driven by an absolute end timestamp, so it stays accurate in background tabs and survives a reload
 * (the in-progress timer is a per-device convenience; finished focus blocks are saved to the database by the caller).
 * state: { mode, plannedMinutes, endsAt|null, pausedLeft|null, taskId, topicId, label, startedAt }
 */
export function useFocusTimer({ onFinish }) {
  const [t, setT] = useState(load)
  const [now, setNow] = useState(() => Date.now())
  const finish = useRef(onFinish)
  finish.current = onFinish
  const fired = useRef(false)

  const update = useCallback((next) => {
    persist(next)
    setT(next)
  }, [])
  const running = !!t && t.endsAt != null
  const left = !t ? 0 : t.endsAt != null ? remainingSeconds(t.endsAt, now) : (t.pausedLeft ?? t.plannedMinutes * 60)

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
    timer: t,
    left,
    running,
    paused: !!t && !running,
    start: (cfg) => {
      fired.current = false
      setNow(Date.now())
      update({ ...cfg, endsAt: Date.now() + cfg.plannedMinutes * 60_000, pausedLeft: null, startedAt: Date.now() })
    },
    pause: () => t && update({ ...t, endsAt: null, pausedLeft: remainingSeconds(t.endsAt, Date.now()) }),
    resume: () => {
      if (!t) return
      setNow(Date.now())
      update({ ...t, endsAt: Date.now() + (t.pausedLeft ?? 0) * 1000, pausedLeft: null })
    },
    /** Stop early: returns seconds actually spent. */
    stop: () => {
      if (!t) return 0
      const spent = t.plannedMinutes * 60 - left
      update(null)
      return spent
    },
  }
}
