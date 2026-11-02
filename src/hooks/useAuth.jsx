import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { auth } from '@/services/auth'
import { setUserId } from '@/services/session'
import { resetStore, startSync, stopSync } from './store'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still resolving
  const [recovery, setRecovery] = useState(false)
  const [realtime, setRealtime] = useState('CONNECTING')

  useEffect(() => {
    let alive = true
    auth
      .getSession()
      .then((s) => {
        if (alive) {
          setUserId(s?.user?.id ?? null)
          setSession(s)
        }
      })
      .catch(() => alive && setSession(null))
    const off = auth.onChange((event, s) => {
      const changed = (s?.user?.id ?? null) !== (window.__ltUser ?? null)
      window.__ltUser = s?.user?.id ?? null
      setUserId(s?.user?.id ?? null)
      if (changed) resetStore()
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
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
