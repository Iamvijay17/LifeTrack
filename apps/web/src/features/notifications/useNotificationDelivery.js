import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { deliveryMessages, deliveryStamp, handledStamps, planDelivery } from '@lifetrack/core/notifications'
import { useTable } from '@/hooks/store'
import { showSystemNotification } from './browserNotifications'
import { openNotificationDrawer } from './drawerState'
import { useNotificationSettings } from './useNotificationSettings'

const TICK_MS = 10_000
const KEEP = 400 // how many arrivals a device remembers

const key = (uid, name) => `lifetrack:${name}:${uid}`
const readSet = (k) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(k)) ?? [])
  } catch {
    return new Set()
  }
}
const writeSet = (k, set) => {
  try {
    localStorage.setItem(k, JSON.stringify([...set].slice(-KEEP)))
  } catch {
    /* private mode or a full disk: the worst case is that a refresh announces an arrival once more */
  }
}

/**
 * While LifeTrack is open: tells you about notifications as they arrive, whichever device or the server made them.
 *  - It looks at the rows, not at who created them, so reminders, calendar alerts, the nudges from your modules and anything another device made
 *    all take the same path.
 *  - Each arrival is announced once per device. What a device has announced is remembered in localStorage, so a refresh does not announce again,
 *    and opening the app long after something arrived does not replay it: it is simply in the inbox (see planDelivery).
 *  - A page you can see shows a toast. When your attention is elsewhere (another tab, window or app) you get a browser notification instead of, or as well as,
 *    that, if you turned those on and the browser allows them.
 *  - Quiet hours hold the interruption, not the notification. When they end, what was held is summed up in one message.
 *  - A snoozed notification that comes back counts as a new arrival, so it announces itself again.
 */
export function useNotificationDelivery() {
  const { settings, prefs, tz, userId, calendarBrowser } = useNotificationSettings()
  const { rows } = useTable('notifications')
  const navigate = useNavigate()
  const latest = useRef({})
  latest.current = { rows, settings, prefs, tz, calendarBrowser, navigate }
  const runRef = useRef(null)

  useEffect(() => {
    if (!userId) return undefined
    const announcedKey = key(userId, 'announced')
    const heldKey = key(userId, 'held')
    const held = readSet(heldKey)

    const present = async (msg) => {
      const { settings, calendarBrowser, navigate } = latest.current
      const open = () => {
        navigate(msg.link)
        if (msg.rows.length > 1) openNotificationDrawer()
      }
      // A toast is for a page you can see. A browser notification is for when your attention is elsewhere: another tab, another window, another app.
      const visible = document.visibilityState === 'visible'
      const focused = document.hasFocus()
      if (visible) {
        const show = msg.priority === 'urgent' ? toast.error : msg.priority === 'high' ? toast.warning : toast
        show(msg.title, {
          id: msg.tag,
          description: msg.body || undefined,
          duration: msg.priority === 'urgent' ? 12_000 : msg.priority === 'high' ? 8_000 : 5_000,
          action: { label: msg.rows.length > 1 ? 'Open' : 'View', onClick: open },
        })
      }
      if (focused) return
      // Calendar users who turned browser notifications on in Calendar settings keep getting them for events, as before.
      const wanted = settings.desktop || (calendarBrowser && msg.rows.every((n) => n.kind === 'event'))
      if (wanted)
        await showSystemNotification({ title: msg.title, body: msg.body, tag: msg.tag, onOpen: open, urgent: msg.priority === 'urgent' })
    }

    const run = () => {
      const { rows, settings, prefs, tz } = latest.current
      const announced = readSet(announcedKey) // another tab may have announced something since we last looked
      const plan = planDelivery(rows, { announced, held, nowMs: Date.now(), tz, settings, prefs })
      if (!plan.announce.length && !plan.hold.length && !plan.release.length && !plan.ignore.length) return
      for (const n of plan.hold) held.add(deliveryStamp(n))
      for (const stamp of handledStamps(plan)) {
        announced.add(stamp)
        held.delete(stamp)
      }
      // Remember first, then speak: if two tabs run at once, the second one finds it already announced.
      writeSet(announcedKey, announced)
      writeSet(heldKey, held)
      for (const msg of deliveryMessages(plan)) present(msg)
    }

    runRef.current = run
    run()
    const id = setInterval(run, TICK_MS)
    const onVisible = () => document.visibilityState === 'visible' && run()
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      runRef.current = null
      clearInterval(id)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])

  // New rows arriving through Realtime or a write are looked at straight away, not on the next tick.
  useEffect(() => {
    runRef.current?.()
  }, [rows, settings, prefs, tz])
}
