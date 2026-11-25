import { useCallback, useMemo } from 'react'
import { notificationSettings } from '@lifetrack/core/notifications'
import { useSettings } from '@/hooks/useSettings'

/**
 * The notification centre's settings (user_settings.notification_settings, with defaults), the per-category switches that already existed
 * (notification_prefs) and the timezone every time in them is read in.
 */
export function useNotificationSettings() {
  const { settings, row, save } = useSettings()
  const stored = settings.notification_settings
  const value = useMemo(() => notificationSettings(stored), [stored])
  /** `patch` may replace whole fields (`{ desktop: true }`) or `quiet` as a whole. The result is always saved complete. */
  const update = useCallback((patch) => save({ notification_settings: { ...value, ...patch } }), [save, value])
  const setCategory = useCallback(
    (kind, on) => save({ notification_prefs: { ...settings.notification_prefs, [kind]: on } }),
    [save, settings.notification_prefs],
  )
  return {
    settings: value,
    prefs: settings.notification_prefs,
    calendarBrowser: settings.calendar_prefs?.browser_notifications === true,
    tz: settings.timezone,
    userId: row?.user_id ?? null,
    loaded: !!row,
    update,
    setCategory,
    userSettings: settings,
  }
}
