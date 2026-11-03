import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { auth } from '@/services/auth'
import { setUserId } from '@/services/session'
import { resetStore, startSync, stopSync } from './store'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still resolving
  const [recovery, setRecovery] = useState(false)
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
      return
    }
    startSync(setRealtime)
    return stopSync
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
