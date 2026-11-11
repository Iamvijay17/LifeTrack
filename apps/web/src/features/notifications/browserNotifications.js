import { useCallback, useEffect, useState } from 'react'

// Browser (desktop) notifications. They work while LifeTrack is open in some tab, including a background one. A closed browser needs Web Push, which
// needs a server and keys; that is not part of this build (docs/ROADMAP.md). Asking for permission only ever happens from a click.
export const browserSupported = () => typeof window !== 'undefined' && 'Notification' in window
/** 'granted' | 'denied' | 'default' | 'unsupported' */
export const browserPermission = () => (browserSupported() ? Notification.permission : 'unsupported')

/** Whether this browser can show system notifications, and whether the person has said yes. Never asks by itself. */
export function useBrowserNotifications() {
  const supported = browserSupported()
  const [permission, setPermission] = useState(browserPermission)
  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return undefined
    let status
    let off = false
    // The person can change this in the browser's own settings while the page is open.
    navigator.permissions
      .query({ name: 'notifications' })
      .then((s) => {
        if (off) return
        status = s
        s.onchange = () => setPermission(browserPermission())
      })
      .catch(() => {})
    return () => {
      off = true
      if (status) status.onchange = null
    }
  }, [supported])
  const request = useCallback(async () => {
    if (!supported) return 'unsupported'
    try {
      const result = await Promise.resolve(Notification.requestPermission()) // older Safari takes a callback and returns nothing
      const now = result ?? browserPermission()
      setPermission(now)
      return now
    } catch {
      return browserPermission()
    }
  }, [supported])
  return { supported, permission, request }
}

/**
 * Shows one browser notification. `tag` makes a second one with the same tag replace the first, so two tabs never stack duplicates.
 * Resolves to whether one was shown. Some mobile browsers refuse `new Notification()` and only allow it through the service worker.
 */
export async function showSystemNotification({ title, body = '', tag, onOpen, urgent = false }) {
  if (!browserSupported() || Notification.permission !== 'granted') return false
  const options = { body, tag, icon: '/favicon.svg', badge: '/favicon.svg', requireInteraction: urgent }
  try {
    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      onOpen?.()
      n.close()
    }
    return true
  } catch {
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.()
      if (!reg) return false
      await reg.showNotification(title, options)
      return true
    } catch {
      return false
    }
  }
}
