import { useEffect } from 'react'
import { AppState } from 'react-native'
import { db } from '../lib/supabase'
import { store } from '../data/client'

/** Keeps the cache in step with other devices: Realtime events invalidate tables; reconnect/foreground re-pulls. RLS filters events. */
export function RealtimeSync() {
  useEffect(() => {
    const d = db
    if (!d) return
    let off: (() => void) | undefined
    const start = () => {
      off?.()
      off = d.subscribe((table: string) => store.invalidate(table), (status: string) => { if (status === 'SUBSCRIBED') store.refetchLoaded() })
    }
    start()
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { start(); store.refetchLoaded() } else { off?.(); off = undefined } // sockets are suspended in background
    })
    return () => { sub.remove(); off?.() }
  }, [])
  return null
}
