import { useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useTheme, type ThemePreference } from './ThemeProvider'

/** Applies the theme saved on the account (dark / light / system) so it matches every other device. */
export function ThemeSync() {
  const { settings } = useSettings()
  const { setPreference } = useTheme()
  useEffect(() => { setPreference((['dark', 'light', 'system'].includes(settings.theme) ? settings.theme : 'system') as ThemePreference) }, [settings.theme, setPreference])
  return null
}
