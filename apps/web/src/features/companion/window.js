import { useCallback, useEffect, useState } from 'react'

// What a browser can and cannot do for a small always-visible window. Everything here is feature-detected: nothing is assumed, and the
// Companion tells the person which of these their browser has. Capabilities that no browser offers (a global shortcut, a tray icon, always-on-top
// for an ordinary window) belong to the optional desktop wrapper and are documented in docs/DESKTOP_COMPANION.md.

export const COMPANION_PATH = '/companion'
const POPUP_NAME = 'lifetrack-companion'

/** Open the companion in its own small window. Returns it, or null when the browser blocked the popup (it must follow a click or key press). */
export function openCompanionWindow() {
  const w = window.open(COMPANION_PATH, POPUP_NAME, 'popup=yes,width=380,height=640,left=40,top=40')
  w?.focus?.()
  return w ?? null
}

/** What this browser supports, for the Companion's "What works here" list. */
export function detectCapabilities() {
  const has = (f) => {
    try {
      return !!f()
    } catch {
      return false
    }
  }
  return {
    popup: true,
    floating: has(() => 'documentPictureInPicture' in window), // Document Picture-in-Picture: a real always-on-top window (Chromium desktop)
    installed: has(() => matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true),
    notifications: has(() => 'Notification' in window),
    resize: has(() => typeof window.resizeTo === 'function'),
  }
}

/**
 * Document Picture-in-Picture: a small window that stays above every other window, which a normal browser window cannot do. Chromium on
 * desktop only (Chrome and Edge 116+). The companion's content is rendered into that window as a React portal, so it is the same live app,
 * not a copy. Closing it brings the content back. Styles and the light/dark class are copied across and kept in sync.
 */
export function useFloatingWindow() {
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window
  const [win, setWin] = useState(null)

  const open = useCallback(
    async ({ width = 360, height = 580 } = {}) => {
      if (!supported) return null
      if (window.documentPictureInPicture.window) return window.documentPictureInPicture.window // already floating (another tab of ours)
      const w = await window.documentPictureInPicture.requestWindow({ width, height })
      for (const sheet of document.styleSheets) {
        try {
          const style = w.document.createElement('style')
          style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n')
          w.document.head.appendChild(style)
        } catch {
          if (sheet.href) {
            const link = w.document.createElement('link')
            link.rel = 'stylesheet'
            link.href = sheet.href
            w.document.head.appendChild(link)
          }
        }
      }
      w.document.title = 'LifeTrack Companion'
      w.document.documentElement.className = document.documentElement.className
      Object.assign(w.document.documentElement.dataset, document.documentElement.dataset)
      w.document.body.className = 'bg-background text-foreground font-sans antialiased'
      w.addEventListener('pagehide', () => setWin(null))
      setWin(w)
      return w
    },
    [supported],
  )

  const close = useCallback(() => {
    win?.close()
    setWin(null)
  }, [win])

  // Keep the floating window's theme and accent in step with the main one.
  useEffect(() => {
    if (!win) return
    const sync = () => {
      win.document.documentElement.className = document.documentElement.className
      Object.assign(win.document.documentElement.dataset, document.documentElement.dataset)
      const accent = document.getElementById('lt-accent')
      let mirror = win.document.getElementById('lt-accent')
      if (accent) {
        if (!mirror) {
          mirror = win.document.createElement('style')
          mirror.id = 'lt-accent'
          win.document.head.appendChild(mirror)
        }
        mirror.textContent = accent.textContent
      }
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true })
    return () => mo.disconnect()
  }, [win])

  return { supported, win, open, close }
}
