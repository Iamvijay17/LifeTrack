import { useEffect, useSyncExternalStore } from 'react'
import { useSettings } from './useSettings'

export function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#09090B' : '#FAFAFA')
  try {
    localStorage.setItem('lifetrack:theme', theme)
  } catch {
    /* non-critical preference */
  }
}

const onThemeClass = (notify) => {
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
const currentTheme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')
/** The theme actually on screen, for things drawn outside Tailwind's dark classes. */
export const useResolvedTheme = () => useSyncExternalStore(onThemeClass, currentTheme)

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
