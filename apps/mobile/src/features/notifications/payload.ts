import { webLinkToRoute } from '../../lib/deepLinks'

/** Route to open for a tapped notification. `data` comes from the push payload / local notification and is untrusted. */
export function routeFromNotificationData(data: unknown): string {
  const link = data && typeof data === 'object' ? (data as { link?: unknown }).link : undefined
  return webLinkToRoute(typeof link === 'string' ? link : null)
}
export const notificationIdFromData = (data: unknown): string | null => {
  const id = data && typeof data === 'object' ? (data as { notificationId?: unknown }).notificationId : undefined
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null
}
