import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { clientNowTime, unreadCount } from '@lifetrack/core/reminders'
import { timeStrInTz, todayStr } from '@lifetrack/utils'
import { api, store } from '../../data/client'
import { useTable } from '../../data/useTable'
import type { Row } from '../../data/queryStore'
import { useSettings } from '../../hooks/useSettings'
import { ensureChannels, pushService } from './index'
import { notificationIdFromData, routeFromNotificationData } from './payload'
import { presentationFor } from './timerNotifier'

// While the app is open, show incoming notifications as banners (and in the notification list) with sound.
Notifications.setNotificationHandler({
  handleNotification: async (n) => presentationFor(n.request.content.data, AppState.currentState ?? 'active'),
})

/** Mounted once for the signed-in app: channels, token refresh, tap routing, unread badge and the reminder fallback runner. */
export function NotificationsBootstrap() {
  const router = useRouter()
  const { settings, row } = useSettings()
  const { rows } = useTable<Row & { read_at: string | null }>('notifications')
  const handled = useRef(new Set<string>())
  const prefs = useRef(settings.notification_prefs)
  prefs.current = settings.notification_prefs

  // Channels + keep this device's push token fresh (never prompts) + react to token rotation.
  useEffect(() => {
    ensureChannels().catch(() => {})
    pushService.refresh().catch(() => {})
    const sub = Notifications.addPushTokenListener(() => { pushService.refresh().catch(() => {}) })
    return () => sub.remove()
  }, [])

  // Tapping a notification — from a cold start, background or foreground — opens the right screen and marks it read.
  const last = Notifications.useLastNotificationResponse()
  useEffect(() => {
    if (!last) return
    const id = last.notification.request.identifier
    if (handled.current.has(id) || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return
    handled.current.add(id)
    const data = last.notification.request.content.data
    const nid = notificationIdFromData(data)
    if (nid) store.update('notifications', nid, { read_at: new Date().toISOString() }).catch(() => {})
    setTimeout(() => router.push(routeFromNotificationData(data) as never), 0) // let the navigator mount first on a cold start
  }, [last, router])

  // App icon badge = unread notifications.
  const unread = unreadCount(rows)
  useEffect(() => { Notifications.setBadgeCountAsync(unread).catch(() => {}) }, [unread])

  // Fallback: if the server job is not running, turn due reminders into notifications from the app. It waits a short grace
  // period so the server (which also sends the push) always goes first. Idempotent via the notification dedupe key.
  useEffect(() => {
    if (!row) return // wait until the real timezone has loaded
    const tz = settings.timezone
    let busy = false
    const run = async () => {
      if (busy) return
      busy = true
      try { await api.fireDueReminders(todayStr(tz), clientNowTime(timeStrInTz(new Date(), tz)), prefs.current) } catch { /* retried on the next tick */ } finally { busy = false }
    }
    run()
    const id = setInterval(run, 60_000)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run() })
    return () => { clearInterval(id); sub.remove() }
  }, [row, settings.timezone])

  return null
}
