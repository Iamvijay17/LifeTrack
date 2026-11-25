import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NAV } from '@/lib/nav'
import { getUserId } from '@/services/session'
import { bumpUsage, pushRecent, sanitizeRecents, sanitizeUsage } from './model'

// Recently opened pages and items: a per-device, per-account convenience kept in localStorage (never synced, never required).
const keyFor = () => `lifetrack:recents:${getUserId() ?? 'anon'}`
const read = () => {
  try {
    return sanitizeRecents(JSON.parse(localStorage.getItem(keyFor())))
  } catch {
    return []
  }
}
const write = (list) => {
  try {
    localStorage.setItem(keyFor(), JSON.stringify(list))
  } catch {
    /* recents are a convenience; the palette works without storage */
  }
}

/** The recents list, with `remember(entry)` for an item the person opened. Pages are remembered as they are visited. */
export function useRecents() {
  const [list, setList] = useState(read)
  const { pathname } = useLocation()
  const user = useRef(getUserId())
  const remember = useCallback((entry) => {
    setList((cur) => {
      const next = pushRecent(cur, entry)
      write(next)
      return next
    })
  }, [])
  useEffect(() => {
    // A different account on the same browser starts from its own list.
    if (user.current !== getUserId()) {
      user.current = getUserId()
      setList(read())
    }
    const page = NAV.find((n) => n.to === pathname)
    if (page) remember({ id: page.to, kind: 'page', label: page.label, to: page.to, module: page.module })
  }, [pathname, remember])
  // The search page records the records it opens in the same list: pick those up too.
  useEffect(() => {
    const again = () => setList(read())
    window.addEventListener('lifetrack:recents', again)
    return () => window.removeEventListener('lifetrack:recents', again)
  }, [])
  const clear = useCallback(() => {
    write([])
    setList([])
  }, [])
  return { recents: list, remember, clear }
}

const usageKey = () => `lifetrack:usage:${getUserId() ?? 'anon'}`
const readUsage = () => {
  try {
    return sanitizeUsage(JSON.parse(localStorage.getItem(usageKey())))
  } catch {
    return {}
  }
}

/** How often and how lately each palette action was run (per device and account, like the recents). */
export function useUsage() {
  const [usage, setUsage] = useState(readUsage)
  const count = useCallback((id) => {
    setUsage((cur) => {
      const next = bumpUsage(cur, id)
      try {
        localStorage.setItem(usageKey(), JSON.stringify(next))
      } catch {
        /* a convenience only */
      }
      return next
    })
  }, [])
  return { usage, count }
}
