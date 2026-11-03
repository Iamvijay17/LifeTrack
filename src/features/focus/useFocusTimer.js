import { useCallback, useEffect, useRef, useState } from 'react'
import { remainingSeconds } from '@/domain/focus'
import { getUserId } from '@/services/session'

// The running timer is a per-device, per-ACCOUNT convenience kept in localStorage, so it survives a reload. It is keyed by
// user id so one account never inherits another account's timer on a shared browser.
const keyFor = () => `lifetrack:focus-timer:${getUserId() ?? 'anon'}`
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(keyFor()))
  } catch {
    return null
  }
}
const storageWorks = () => {
  try {
    localStorage.setItem('__lt-probe', '1')
    localStorage.removeItem('__lt-probe')
    return true
  } catch {
    return false
  }
}
const persist = (v) => {
  try {
    v ? localStorage.setItem(keyFor(), JSON.stringify(v)) : localStorage.removeItem(keyFor())
  } catch {
    /* the timer still works without storage */
  }
}

/**
 * Pomodoro countdown driven by an absolute end timestamp, so it stays accurate in background tabs and survives a reload.
 * Several tabs of the same browser stay in step (pause/resume/stop in one is reflected in the others) and a finished block is
 * saved exactly once: the tab that finishes it first "claims" it by clearing the shared state, and other tabs see that and skip.
 * Finished focus blocks are saved to the database by the caller (`onFinish`).
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

  // follow changes made by another tab
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === keyFor() || e.key === null) setT(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (running && left === 0 && !fired.current) {
      fired.current = true
      const done = t
      // Another tab may have finished (and saved) it already. Without working storage there is nothing to coordinate on.
      const stored = load()
      const stillMine = stored ? stored.startedAt === done.startedAt : !storageWorks()
      update(null)
      if (stillMine) finish.current(done, true)
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
