import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isPlatformAdmin, platformAvailable } from '@/services/platform'

const cache = new Map() // user id → boolean, so the answer is asked for once per sign-in, not on every page

/** True when the signed-in person is a platform administrator (decided by the database). Only used to show or hide a menu entry. */
export function useIsAdmin() {
  const { session } = useAuth()
  const uid = session?.user?.id ?? null
  const [admin, setAdmin] = useState(() => (uid ? (cache.get(uid) ?? false) : false))
  useEffect(() => {
    if (!uid || !platformAvailable()) return setAdmin(false)
    if (cache.has(uid)) return setAdmin(cache.get(uid))
    let alive = true
    isPlatformAdmin().then((v) => {
      cache.set(uid, v)
      if (alive) setAdmin(v)
    })
    return () => {
      alive = false
    }
  }, [uid])
  return admin
}
