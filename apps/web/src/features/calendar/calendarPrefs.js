import { useCallback, useMemo } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useIsDesktop } from '@/hooks/useMediaQuery'

export const DEFAULT_CALENDAR_PREFS = {
  time_format: '12h',
  default_view: null, // null: Week on a computer, Day on a phone
  default_duration: 60,
  default_alert: null, // minutes before, or null for none
  show_weekends: true,
  browser_notifications: false,
}

/** The user's calendar settings (stored in user_settings.calendar_prefs) with defaults, plus the week start they already chose for the whole app. */
export function useCalendarPrefs() {
  const { settings, save } = useSettings()
  const desktop = useIsDesktop()
  const stored = settings.calendar_prefs
  const prefs = useMemo(
    () => ({
      ...DEFAULT_CALENDAR_PREFS,
      ...stored,
      week_starts_on: Number(settings.week_starts_on) === 0 ? 0 : 1,
      timezone: settings.timezone,
      view: stored?.default_view || (desktop ? 'week' : 'day'),
    }),
    [stored, settings.week_starts_on, settings.timezone, desktop],
  )
  const update = useCallback(
    ({ week_starts_on, ...rest }) =>
      save({ calendar_prefs: { ...stored, ...rest }, ...(week_starts_on !== undefined ? { week_starts_on } : {}) }),
    [save, stored],
  )
  return { prefs, update }
}
