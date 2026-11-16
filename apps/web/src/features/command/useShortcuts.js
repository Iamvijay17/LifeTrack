import { useEffect, useRef } from 'react'
import { CREATE_KEYS, GO_KEYS, isTypingTarget } from './model'

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
export function useShortcuts({ toggle, open, help, go, create, paletteOpen }) {
  const handlers = useRef({})
  handlers.current = { toggle, open, help, go, create, paletteOpen }
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
      if (e.defaultPrevented || e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return disarm()
      if (h.paletteOpen || isTypingTarget(e.target) || overlayOpen()) return disarm()
      const key = e.key
      if (pending) {
        const table = pending === 'g' ? GO_KEYS : CREATE_KEYS
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
        e.preventDefault()
        h.help()
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
