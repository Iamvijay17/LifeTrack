import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NAV } from '@/lib/nav'
import { getUserId } from '@/services/session'
import { pushRecent, sanitizeRecents } from './model'

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
  const clear = useCallback(() => {
    write([])
    setList([])
  }, [])
  return { recents: list, remember, clear }
}
