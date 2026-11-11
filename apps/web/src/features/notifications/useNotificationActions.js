import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { dismissPatch, readPatch, restorePatch, snoozePatch, unreadPatch, validateSnooze } from '@lifetrack/core/notifications'
import * as store from '@/hooks/store'
import {
  deleteNotifications,
  dismissNotification,
  dismissNotifications,
  markAllRead,
  markNotificationRead,
  markNotificationUnread,
  restoreNotification,
  snoozeNotification,
} from '@/services/api'
import { toAppError } from '@/services/errors'
import { formatWhen } from './notificationFormat'
import { useNotificationSettings } from './useNotificationSettings'

/**
 * What a person can do to a notification, shared by the drawer, the inbox and the history so they behave the same.
 *  - Changes show at once and are put back, with the reason, if saving fails. (A busy lock like useAction's would drop a second tap on another card.)
 *  - Dismiss offers Undo; snooze says when it comes back.
 */
export function useNotificationActions() {
  const { tz } = useNotificationSettings()

  const attempt = useCallback(async (n, patch, call) => {
    store.patch('notifications', [{ ...n, ...patch }]) // optimistic: the list reacts before the round trip
    try {
      return await call()
    } catch (e) {
      store.patch('notifications', [n])
      toast.error(toAppError(e).message)
      return undefined
    }
  }, [])

  return useMemo(() => {
    const restore = (n) => attempt(n, restorePatch(), () => restoreNotification(n))
    return {
      read: (n) => (n.read_at ? undefined : attempt(n, readPatch(Date.now()), () => markNotificationRead(n))),
      unread: (n) => (n.read_at ? attempt(n, unreadPatch(), () => markNotificationUnread(n)) : undefined),
      /** Moves it to the history, with an Undo for a few seconds. */
      async dismiss(n) {
        const done = await attempt(n, dismissPatch(n, Date.now()), () => dismissNotification(n))
        if (done) toast('Dismissed', { description: n.title, duration: 5000, action: { label: 'Undo', onClick: () => restore(n) } })
        return done
      },
      restore,
      /** Hides it until `untilMs` (a choice from the snooze list, or a date and time the person picked). */
      async snooze(n, untilMs) {
        const problem = validateSnooze(untilMs, Date.now())
        if (problem) {
          toast.error(problem)
          return undefined
        }
        const done = await attempt(n, snoozePatch(untilMs), () => snoozeNotification(n, untilMs))
        if (done)
          toast(`Snoozed until ${formatWhen(untilMs, tz)}`, {
            description: n.title,
            duration: 4000,
            action: { label: 'Undo', onClick: () => restore(n) },
          })
        return done
      },
      async readAll() {
        try {
          const count = await markAllRead()
          if (count) toast.success(count === 1 ? '1 notification marked as read' : `${count} notifications marked as read`)
          return count
        } catch (e) {
          toast.error(toAppError(e).message)
          return undefined
        }
      },
      async dismissAll(rows, label = 'Dismissed') {
        if (!rows.length) return 0
        try {
          const count = await dismissNotifications(rows)
          toast.success(`${label} (${count})`, {
            action: { label: 'Undo', onClick: () => Promise.all(rows.map((r) => restoreNotification(r))).catch(() => {}) },
          })
          return count
        } catch (e) {
          toast.error(toAppError(e).message)
          return undefined
        }
      },
      async remove(rows) {
        if (!rows.length) return 0
        try {
          const count = await deleteNotifications(rows.map((r) => r.id))
          toast.success(count === 1 ? 'Notification deleted' : `${count} notifications deleted`)
          return count
        } catch (e) {
          toast.error(toAppError(e).message)
          return undefined
        }
      },
    }
  }, [attempt, tz])
}
