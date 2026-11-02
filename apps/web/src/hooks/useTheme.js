import { useEffect } from 'react'
import { useSettings } from './useSettings'

export function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#09090B' : '#FAFAFA')
  try { localStorage.setItem('lifetrack:theme', theme) } catch { /* non-critical preference */ }
}

/** Keeps <html class="dark"> in sync with the account's theme setting (so it follows you across devices). */
export function useThemeSync() {
  const { settings, row } = useSettings()
  useEffect(() => {
    if (!row) return
    applyTheme(settings.theme)
    if (settings.theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [row, settings.theme])
}
