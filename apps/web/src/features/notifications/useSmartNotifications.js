import { useEffect, useRef } from 'react'
import { dueCandidates, sourceCandidates, SOURCE_KINDS, SOURCE_TABLES, sourceTables } from '@lifetrack/core/notificationSources'
import * as store from '@/hooks/store'
import { raiseNotification } from '@/services/api'
import { useNotificationSettings } from './useNotificationSettings'

const TICK_MS = 60_000
// The first check waits a moment, so loading the tables it reads (tasks, habits, transactions…) does not compete with what the page you opened needs.
const START_DELAY_MS = 2_000

const memory = (uid) => `lifetrack:raised:${uid}`
function readRaised(uid) {
  try {
    return JSON.parse(localStorage.getItem(memory(uid))) ?? {}
  } catch {
    return {}
  }
}
function writeRaised(uid, raised, nowMs) {
  const live = Object.fromEntries(Object.entries(raised).filter(([, expires]) => expires > nowMs)) // a key that has expired can never come due again
  try {
    localStorage.setItem(memory(uid), JSON.stringify(live))
  } catch {
    /* only costs a retry */
  }
  return live
}

/**
 * While LifeTrack is open: turns what is happening in your other modules into notifications (see packages/core/src/notificationSources.js for what
 * and when). It reads the same rows the screens do and only loads the tables for categories you have not switched off.
 *  - Every notification has a key that names what it is about and which day, and the key is unique in the database. With the app open on a phone and
 *    a laptop, both try, one wins, nobody is told twice.
 *  - A device also remembers the keys it has raised, so deleting a notification from the history does not bring it back on the next refresh.
 *  - A category whose tables have not loaded (or failed to) is skipped, not treated as empty: an unloaded habit log must never read as "nothing done".
 */
export function useSmartNotifications() {
  const { settings, prefs, tz, userId, userSettings } = useNotificationSettings()
  const latest = useRef({})
  latest.current = { settings, prefs, tz, userSettings }
  const tables = sourceTables(prefs, settings).join(',')

  useEffect(() => {
    if (!userId || !tables) return undefined
    let busy = false
    let stopped = false
    const raised = readRaised(userId)
    const run = async () => {
      if (busy || stopped) return
      busy = true
      try {
        const { settings, prefs, tz, userSettings } = latest.current
        await Promise.all([...sourceTables(prefs, settings), 'notifications'].map((t) => store.load(t)))
        if (stopped || !store.isReady('notifications')) return
        // Skip any category whose data is not all there.
        const usable = { ...prefs }
        for (const kind of SOURCE_KINDS) if (!SOURCE_TABLES[kind].every(store.isReady)) usable[kind] = false
        const peek = store.peek
        const nowMs = Date.now()
        const candidates = sourceCandidates(
          {
            tasks: peek('tasks'),
            habits: peek('habits'),
            habitLogs: peek('habit_logs'),
            workouts: peek('workouts'),
            routines: peek('routines'),
            interviews: peek('interview_events'),
            applications: peek('job_applications'),
            topics: peek('learning_topics'),
            recurringRules: peek('recurring_rules'),
            goals: peek('goals'),
            milestones: peek('milestones'),
            transactions: peek('transactions'),
            budgets: peek('budgets'),
          },
          { nowMs, tz, settings, prefs: usable, user: userSettings },
        )
        const existing = new Set(peek('notifications').map((n) => n.dedupe_key))
        for (const c of dueCandidates(candidates, nowMs)) {
          if (raised[c.key]) continue
          if (existing.has(c.key)) {
            raised[c.key] = c.expiresMs
            continue
          }
          raised[c.key] = c.expiresMs // claim it first so an overlapping tick can't send a second
          try {
            await raiseNotification({ key: c.key, kind: c.kind, title: c.title, body: c.body, link: c.link, priority: c.priority })
          } catch {
            delete raised[c.key] // not saved: try again next tick
          }
        }
        const live = writeRaised(userId, raised, nowMs)
        for (const k of Object.keys(raised)) if (!(k in live)) delete raised[k]
      } finally {
        busy = false
      }
    }
    const first = setTimeout(run, START_DELAY_MS)
    const id = setInterval(run, TICK_MS)
    window.addEventListener('focus', run)
    return () => {
      stopped = true
      clearTimeout(first)
      clearInterval(id)
      window.removeEventListener('focus', run)
    }
  }, [userId, tables])
}
