import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { isNotInstalled, isSessionEnded } from '@lifetrack/data'
import { closedModules } from '@lifetrack/core/moduleLocks'
import { resetStore } from '@/hooks/store'
import { useAuth } from '@/hooks/useAuth'
import { explainPasskeyError, getPasskey, passkeySupport } from '@/lib/webauthn'
import { auth } from '@/services/auth'
import { toAppError } from '@/services/errors'
import { security } from '@/services/security'

// This provider DISPLAYS the lock; it does not decide it. `locked` is whatever the server last said (the database, in production), and the
// sensitive tables refuse locked sessions regardless of anything here. What lives here is the behaviour around it: locking when the user goes
// quiet or leaves, keeping the server's unlock window alive while they are active, and telling other tabs.

const Ctx = createContext(null)
export const useSecurity = () => useContext(Ctx)

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
const TICK_MS = 5_000
const CHANNEL = 'lifetrack-security'
const msFor = (s) => s * 1000

export function SecurityProvider({ children }) {
  const { session, user } = useAuth() ?? {}
  const userId = user?.id ?? null
  // 'idle' = nobody signed in · 'loading' · 'ready' · 'unsupported' (database without migration 0012: behaves like before the feature) · 'error'
  const [status, setStatus] = useState(userId ? 'loading' : 'idle')
  const lastUser = useRef(null)
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  // The module an unlock prompt is open for (a key such as 'finance', or '*' for "any"), or null. The prompt itself is drawn by AppLockGate.
  const [unlockFor, setUnlockFor] = useState(null)
  const [support, setSupport] = useState({ supported: false, platform: false, reason: null })
  const stateRef = useRef(null)
  const locking = useRef(false) // while a lock request is in flight, an older "unlocked" answer must not flip the screen back
  const lastActivity = useRef(Date.now())
  const lastTouch = useRef(0)
  const hiddenAt = useRef(null)
  const channel = useRef(null)

  const apply = useCallback((s) => {
    stateRef.current = s
    setState(s)
    setStatus('ready')
    setError(null)
  }, [])

  const announce = useCallback((type) => channel.current?.postMessage({ type, userId }), [userId])

  /**
   * Asks the server where things stand. `firstLook` also tries the "just typed the password" shortcut, which the server grants only to a
   * session under a minute old that was never unlocked or locked; for any other session it changes nothing.
   */
  const refresh = useCallback(
    async ({ firstLook = false } = {}) => {
      if (!userId || locking.current) return stateRef.current
      try {
        let s = await security.getState()
        if (s.locked && firstLook) s = await security.unlockAfterLogin().catch(() => s)
        apply(s)
        return s
      } catch (e) {
        if (isSessionEnded(e)) {
          // Signed out from another device: the access token still works for a while, the session does not. Go back to the sign-in screen.
          await auth.signOut().catch(() => {})
          return null
        }
        if (isNotInstalled(e)) {
          stateRef.current = null
          setState(null)
          setStatus('unsupported')
          return null
        }
        // A blip while already running keeps what we know (the next heartbeat finds out). Never having heard from the server fails CLOSED.
        if (!stateRef.current) {
          setError(toAppError(e).message)
          setStatus('error')
        }
        return stateRef.current
      }
    },
    [userId, apply],
  )

  // Who is signed in, and which session: a new sign-in (even by the same user) starts a fresh look.
  useEffect(() => {
    if (!userId) {
      lastUser.current = null
      stateRef.current = null
      setState(null)
      setStatus('idle')
      return
    }
    if (lastUser.current !== userId) {
      // A different person: forget everything and show the loader. The same person with a new session object (a sign-in, a profile update)
      // is looked at again quietly, so the page they are on does not blink.
      lastUser.current = userId
      stateRef.current = null
      setState(null)
      setStatus('loading')
    }
    refresh({ firstLook: true })
  }, [userId, session, refresh])
  useEffect(() => {
    if (userId) passkeySupport().then(setSupport)
  }, [userId])

  // Other tabs: lock one, lock all.
  useEffect(() => {
    if (!userId || typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    channel.current = ch
    ch.onmessage = (e) => e.data?.userId === userId && refresh()
    return () => {
      ch.close()
      channel.current = null
    }
  }, [userId, refresh])

  const locked = status === 'ready' && !!state?.locked
  const enabled = status === 'ready' && !!state?.appLockEnabled
  // With module locks the app is open and only the chosen modules are closed (see packages/core/src/moduleLocks.js).
  const closed = useMemo(() => (status === 'ready' ? closedModules(state) : []), [status, state])
  const closedKey = closed.join(',')
  const sessionUnlocked = status === 'ready' && !!state && state.sessionUnlocked !== false

  /** Locks now. The screen changes first; the server call follows. If it fails, the server's own inactivity window still closes the data. */
  const lockNow = useCallback(async () => {
    const now = stateRef.current
    if (!now?.appLockEnabled) return
    locking.current = true
    // The whole-app lock shows the lock screen; module locks close just their modules (the app stays open).
    apply({ ...now, locked: now.lockScope !== 'modules', sessionUnlocked: false })
    announce('lock')
    try {
      await security.lock()
    } catch {
      /* the server's inactivity window covers a lost request */
    } finally {
      locking.current = false
    }
  }, [apply, announce])

  // Locked means gone: nothing sensitive stays in memory behind the lock screen.
  useEffect(() => {
    if (!locked) return
    resetStore()
    toast.dismiss() // a reminder or a saved-entry toast could otherwise sit on top of the lock screen and show what is behind it
  }, [locked])

  // Module locks: when the set of closed modules changes (locked, unlocked, or a different choice), what was loaded is stale. Locking drops the
  // data of the modules that just closed; unlocking loads what the server now allows. The first answer starts from an empty store anyway.
  const seenClosed = useRef(null)
  useEffect(() => {
    if (status !== 'ready') return
    if (seenClosed.current !== null && seenClosed.current !== closedKey) {
      resetStore()
      toast.dismiss()
    }
    seenClosed.current = closedKey
    if (!closedKey) setUnlockFor(null) // everything is open again: any prompt is done
  }, [status, closedKey])
  useEffect(() => {
    if (!userId) seenClosed.current = null
  }, [userId])

  const unlockWithPin = useCallback(async (pin) => {
    try {
      const r = await security.verifyPin(pin)
      if (r.signedOut) await auth.signOut().catch(() => {})
      return r
    } catch (e) {
      if (isSessionEnded(e)) await auth.signOut().catch(() => {})
      throw e
    }
  }, [])
  /** Fingerprint / face / device PIN through the browser, checked by the server. Resolves { ok } or { ok: false, cancelled, message }. */
  const unlockWithPasskey = useCallback(async () => {
    try {
      const options = await security.passkeys.beginAuthentication()
      const credential = await getPasskey(options)
      await security.passkeys.finishAuthentication(credential)
      return { ok: true }
    } catch (e) {
      if (e?.detail?.signed_out) await auth.signOut().catch(() => {})
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') return { ok: false, ...explainPasskeyError(e) }
      return { ok: false, cancelled: false, message: toAppError(e).message, lockoutSeconds: e?.detail?.lockout_seconds ?? 0 }
    }
  }, [])
  /** Call after a successful unlock, once the success animation has played. */
  const finishUnlock = useCallback(async () => {
    locking.current = false
    const s = await refresh()
    announce('unlock')
    return s
  }, [refresh, announce])

  // ------------------------------------------------------------------ inactivity, leaving the app, heartbeat
  useEffect(() => {
    if (!enabled || locked || !sessionUnlocked) return // nothing is unlocked, so there is nothing to keep open
    const auto = state.autoLockSeconds

    const beat = (force = false) => {
      const now = Date.now()
      // Renew the server's window while the user is active, often enough that it never lapses under them.
      const every = Math.min(30_000, Math.max(10_000, msFor(auto) / 3))
      if (!force && now - lastTouch.current < every) return
      lastTouch.current = now
      security
        .touch()
        .then((still) => !still && !locking.current && refresh())
        .catch(() => {})
    }
    const onActivity = () => {
      lastActivity.current = Date.now()
      beat()
    }
    const tick = setInterval(() => {
      if (auto > 0 && Date.now() - lastActivity.current >= msFor(auto)) lockNow()
    }, TICK_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        if (auto === 0) lockNow() // "when I leave the app"
        return
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      // Coming back is not activity: the idle clock keeps counting from the last real tap, key press or scroll.
      if (auto > 0 && away >= msFor(auto)) lockNow()
      else refresh() // the server may have locked us meanwhile (another device, or its own window)
    }
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    lastActivity.current = Date.now()
    beat(true)
    return () => {
      clearInterval(tick)
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }))
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [enabled, locked, sessionUnlocked, state?.autoLockSeconds, lockNow, refresh])

  const value = useMemo(
    () => ({
      status,
      state,
      error,
      enabled,
      locked,
      closed,
      sessionUnlocked,
      unlockFor,
      requestUnlock: (module = '*') => setUnlockFor(module),
      cancelUnlock: () => setUnlockFor(null),
      support,
      refresh,
      retry: () => {
        setStatus('loading')
        refresh({ firstLook: true })
      },
      lockNow,
      unlockWithPin,
      unlockWithPasskey,
      finishUnlock,
      announce,
    }),
    [
      status,
      state,
      error,
      enabled,
      locked,
      closed,
      sessionUnlocked,
      unlockFor,
      support,
      refresh,
      lockNow,
      unlockWithPin,
      unlockWithPasskey,
      finishUnlock,
      announce,
    ],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
