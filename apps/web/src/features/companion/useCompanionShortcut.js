import { useEffect } from 'react'
import { toast } from 'sonner'
import { openCompanionWindow } from './window'

/**
 * Alt+Shift+L opens the companion window. A web page only hears the keyboard while one of its own windows is focused, so this works inside
 * LifeTrack and nowhere else. A shortcut that works from any app needs the optional desktop app (see docs/DESKTOP_COMPANION.md).
 */
export function useCompanionShortcut() {
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.code !== 'KeyL') return
      e.preventDefault()
      if (!openCompanionWindow()) toast.error('Your browser blocked the window. Allow pop-ups for LifeTrack and try again.')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
