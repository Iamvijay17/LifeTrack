import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { auth } from '@/services/auth'
import { setUserId } from '@/services/session'
import { resetStore, startSync, stopSync } from './store'
import * as offline from '@/sync'

const Ctx = createContext(null)

// Did this page load come from the emailed password-reset link (PKCE `?code=`, or an older `#...type=recovery`)? Read once, before the auth
// client consumes the URL, because the PASSWORD_RECOVERY event can fire before anyone listens. Only such a visit may set a password without
// the current one (see ResetPasswordPage).
const ARRIVED_FROM_RESET_LINK =
  typeof window !== 'undefined' &&
  window.location.pathname.startsWith('/reset-password') &&
  (/[?&]code=/.test(window.location.search) || /type=recovery/.test(window.location.hash))

// Per-account conveniences that hold item titles (the palette's recently opened notes, transactions…). They are dropped on sign-out so a
// shared browser keeps no trace of them; the rest (timer state, nudge memory) holds no personal content.
const forgetOnSignOut = (uid) => {
  try {
    localStorage.removeItem(`lifetrack:recents:${uid}`)
  } catch {
    /* storage unavailable: nothing was kept */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still resolving
  const [recovery, setRecovery] = useState(ARRIVED_FROM_RESET_LINK)
  const [realtime, setRealtime] = useState('CONNECTING')
  const lastUser = useRef(null)

  useEffect(() => {
    let alive = true
    auth
      .getSession()
      .then((s) => {
        if (alive) {
          lastUser.current = s?.user?.id ?? null
          setUserId(lastUser.current)
          setSession(s)
        }
      })
      .catch(() => alive && setSession(null))
    const off = auth.onChange((event, s) => {
      const id = s?.user?.id ?? null
      const changed = id !== lastUser.current
      if (event === 'SIGNED_OUT' && lastUser.current) {
        forgetOnSignOut(lastUser.current)
        void offline.forgetCache() // the saved copy of the person's data does not outlive their session (unsent changes are kept, encrypted, for their next sign-in)
      }
      lastUser.current = id
      setUserId(id)
      if (changed) resetStore()
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      // A silent token refresh keeps the same user: don't hand the whole tree a new session object every hour.
      setSession((prev) => (!changed && event === 'TOKEN_REFRESHED' && prev ? prev : s))
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) {
      stopSync()
      offline.stop()
      return
    }
    startSync(setRealtime)
    void offline.start(userId)
    return () => {
      stopSync()
      offline.stop()
    }
  }, [userId])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading: session === undefined,
      recovery,
      clearRecovery: () => setRecovery(false),
      realtime,
      displayName: session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || '',
    }),
    [session, recovery, realtime],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
