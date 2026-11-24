import { useEffect, useRef } from 'react'
import { isTypingTarget } from './model'
import { getChordTables } from '@/hooks/useShortcutPrefs'

const CHORD_MS = 1200

// Something else is open on top of the page (a form, a menu, a confirmation): single-key shortcuts leave it alone.
const overlayOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')

/**
 * The app-wide keyboard shortcuts, one listener that is removed when the component unmounts.
 *
 *   Ctrl/Cmd + K   open or close the palette (works from anywhere, including text fields, like in every palette)
 *   /              open the palette
 *   ?              open the palette's shortcut sheet
 *   g then <key>   go to a page          c then <key>   create something
 *
 * Everything except Ctrl/Cmd + K is a bare key, so it is ignored while the person is typing, while another dialog or menu is open,
 * and when a modifier is held (the browser's own shortcuts keep working).
 */
export function useShortcuts({ toggle, open, help, go, create, quick, paletteOpen }) {
  const handlers = useRef({})
  handlers.current = { toggle, open, help, go, create, quick, paletteOpen }
  useEffect(() => {
    let pending = null // 'g' | 'c', armed by the first key of a chord
    let timer = 0
    const disarm = () => {
      pending = null
      clearTimeout(timer)
    }
    const onKey = (e) => {
      const h = handlers.current
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        disarm()
        h.toggle()
        return
      }
      // Mod+Shift+N: quick create. Mod+/: the shortcut sheet. Both work from anywhere except while typing.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !h.paletteOpen && !isTypingTarget(e.target) && !overlayOpen()) {
        if (e.shiftKey && e.key.toLowerCase() === 'n' && h.quick) {
          e.preventDefault()
          disarm()
          return h.quick()
        }
        if (!e.shiftKey && e.key === '/') {
          e.preventDefault()
          disarm()
          return h.help()
        }
      }
      if (e.defaultPrevented || e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return disarm()
      if (h.paletteOpen || isTypingTarget(e.target) || overlayOpen()) return disarm()
      const key = e.key
      if (pending) {
        const tables = getChordTables()
        const table = pending === 'g' ? tables.go : tables.create
        const hit = table[key.toLowerCase()]
        const kind = pending
        disarm()
        if (hit) {
          e.preventDefault()
          if (kind === 'g') h.go(hit)
          else h.create(hit)
        }
        return
      }
      if (key === '/') {
        e.preventDefault()
        h.open()
      } else if (key === '?') {
        // A page with its own shortcut list (the Calendar) handles '?' itself. Its listener runs after this one, so wait until the key press
        // has been handled everywhere and open the app-wide sheet only if no page took it. ('?' has no browser default to prevent.)
        setTimeout(() => {
          if (!e.defaultPrevented && !overlayOpen()) handlers.current.help()
        }, 0)
      } else if ((key === 'g' || key === 'c') && !e.shiftKey) {
        pending = key
        timer = setTimeout(disarm, CHORD_MS)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      disarm()
    }
  }, [])
}
