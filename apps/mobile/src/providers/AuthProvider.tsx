import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { setUserId } from '@lifetrack/data'
import { authService, supabase } from '../lib/supabase'
import { queryClient } from '../data/client'

interface AuthValue { session: Session | null; loading: boolean; email: string; displayName: string }
const Ctx = createContext<AuthValue>({ session: null, loading: true, email: '', displayName: '' })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const lastUser = useRef<string | null>(null)

  useEffect(() => {
    const sb = supabase
    if (!authService || !sb) { setSession(null); return }
    let alive = true
    const apply = (s: Session | null) => {
      const id = s?.user?.id ?? null
      setUserId(id)
      // A different (or no) user must never see the previous user's cached rows.
      if (id !== lastUser.current) { lastUser.current = id; queryClient.clear() }
      if (alive) setSession(s)
    }
    authService.getSession().then(apply).catch(() => apply(null))
    const off = authService.onChange((_event: string, s: Session | null) => apply(s)) // includes TOKEN_REFRESHED, SIGNED_OUT (also on expired/revoked refresh token)
    // Tokens refresh only while the app is in the foreground.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sb.auth.startAutoRefresh()
      else sb.auth.stopAutoRefresh()
    })
    if (AppState.currentState === 'active') sb.auth.startAutoRefresh()
    return () => { alive = false; off(); sub.remove(); sb.auth.stopAutoRefresh() }
  }, [])

  const value = useMemo<AuthValue>(() => ({
    session: session ?? null,
    loading: session === undefined,
    email: session?.user?.email ?? '',
    displayName: (session?.user?.user_metadata?.display_name as string | undefined) || session?.user?.email?.split('@')[0] || '',
  }), [session])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
