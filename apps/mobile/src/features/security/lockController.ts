import { TICK_MS, heartbeatEvery, idleExpired, lockOnLeave, lockOnReturn, type PinResult, type SecurityState } from './lockPolicy'

// The behaviour of the app lock on a phone, without React: the same rules as the web's SecurityProvider (apps/web/src/features/security), written as a
// small state machine so they can be tested with a fake clock. The provider (SecurityProvider.tsx) only connects it to AppState, touches and the screen.
//
// This DISPLAYS the lock; it does not decide it. `locked` is whatever the server last said, and the sensitive tables refuse a locked session regardless of
// anything here. What lives here is the behaviour around that: locking when the person goes quiet or leaves, keeping the server's unlock window alive while
// they are active, and failing CLOSED (the app stays shut) when the server cannot be asked.

/** 'idle' nobody signed in · 'loading' first answer pending · 'ready' · 'unsupported' (a database without migration 0012: behaves like before the feature) · 'error' */
export type LockStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error'
export interface LockSnapshot { status: LockStatus; state: SecurityState | null; error: string | null; locked: boolean; enabled: boolean }

export interface LockApi {
  getState(): Promise<SecurityState>
  unlockAfterLogin(): Promise<SecurityState>
  touch(): Promise<boolean>
  lock(): Promise<void>
  verifyPin(pin: string): Promise<PinResult>
}
export interface LockDeps {
  api: LockApi
  /** Ends the session (the server did, or this phone must). */
  signOut: () => Promise<void>
  isNotInstalled: (e: unknown) => boolean
  isSessionEnded: (e: unknown) => boolean
  /** Words for a person. */
  errorMessage: (e: unknown) => string
  now?: () => number
  /** Typing counts as activity, and the phone cannot see key presses: while the keyboard is up, the person is here. */
  keyboardVisible?: () => boolean
}

const IDLE: LockSnapshot = { status: 'idle', state: null, error: null, locked: false, enabled: false }
/**
 * Closed to this session? With the whole-app lock that is `locked`. With per-module locks (set on the web) the server reports `locked: false` yet still hides the
 * locked modules' rows (Finance shows empty), so the phone must ask for the PIN too: it has no per-module screens.
 */
const isClosed = (st: SecurityState | null) => !!st && (st.locked || (st.lockScope === 'modules' && st.sessionUnlocked === false))
const derive = (s: Omit<LockSnapshot, 'locked' | 'enabled'>): LockSnapshot => ({ ...s, locked: s.status === 'ready' && isClosed(s.state), enabled: s.status === 'ready' && !!s.state?.appLockEnabled })
const active = (s: LockSnapshot) => s.enabled && !s.locked

export function createLockController(deps: LockDeps) {
  const now = deps.now ?? Date.now
  let snap: LockSnapshot = IDLE
  const listeners = new Set<() => void>()
  let userId: string | null = null
  let epoch = 0 // changes with the signed-in person: an answer to an older question is dropped
  let locking = false // while a lock request is in flight, an older "unlocked" answer must not flip the screen back
  let lastActivity = now()
  let lastTouch = 0
  let hiddenAt: number | null = null
  let held = 0 // system prompts open (a fingerprint sheet): the app going inactive is not "the person left"
  let ticker: ReturnType<typeof setInterval> | null = null

  const set = (next: Omit<LockSnapshot, 'locked' | 'enabled'>) => {
    snap = derive(next)
    listeners.forEach((l) => l())
  }
  const stopTicker = () => {
    if (ticker) clearInterval(ticker)
    ticker = null
  }

  /** Renews the server's window while the person is active, often enough that it never lapses under them. */
  function beat(force = false) {
    if (!active(snap)) return
    const t = now()
    if (!force && t - lastTouch < heartbeatEvery(snap.state!.autoLockSeconds)) return
    lastTouch = t
    deps.api
      .touch()
      .then((still) => { if (!still && !locking) void refresh() })
      .catch(() => {}) // a blip: the next beat finds out
  }
  function tick() {
    if (!active(snap) || held > 0) return
    if (deps.keyboardVisible?.()) noteActivity()
    if (idleExpired(snap.state!.autoLockSeconds, now(), lastActivity)) void lockNow()
  }
  function noteActivity() {
    lastActivity = now()
    beat()
  }

  /** Takes the server's answer as the truth and starts or stops the clocks to match. */
  function apply(state: SecurityState) {
    const was = active(snap)
    set({ status: 'ready', state, error: null })
    if (active(snap)) {
      if (!was) {
        lastActivity = now() // a fresh unlock starts a fresh idle clock
        beat(true)
      }
      ticker ??= setInterval(tick, TICK_MS)
    } else stopTicker()
  }

  /**
   * Asks the server where things stand. `firstLook` also tries the "just typed the password" shortcut, which the server grants only to a session under a
   * minute old that was never unlocked or locked; for any other session it changes nothing.
   */
  async function refresh({ firstLook = false }: { firstLook?: boolean } = {}): Promise<SecurityState | null> {
    if (!userId || locking) return snap.state
    const mine = epoch
    try {
      let s = await deps.api.getState()
      if (s.locked && firstLook) s = await deps.api.unlockAfterLogin().catch(() => s)
      if (mine !== epoch) return snap.state
      apply(s)
      return s
    } catch (e) {
      if (mine !== epoch) return snap.state
      if (deps.isSessionEnded(e)) {
        // Signed out from another device: the access token still works for a while, the session does not. Back to the sign-in screen.
        await deps.signOut().catch(() => {})
        return null
      }
      if (deps.isNotInstalled(e)) {
        stopTicker()
        set({ status: 'unsupported', state: null, error: null })
        return null
      }
      // A blip while already running keeps what we know (the next heartbeat finds out). Never having heard from the server fails CLOSED.
      if (!snap.state) set({ status: 'error', state: null, error: deps.errorMessage(e) })
      return snap.state
    }
  }

  /** Locks now. The screen changes first; the server call follows. If it fails, the server's own inactivity window still closes the data. */
  async function lockNow() {
    if (!snap.state?.appLockEnabled) return
    locking = true
    apply({ ...snap.state, locked: true })
    try {
      await deps.api.lock()
    } catch {
      /* the server's inactivity window covers a lost request */
    } finally {
      locking = false
    }
  }

  return {
    getSnapshot: () => snap,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => void listeners.delete(l)
    },

    /** Who is signed in. Call it whenever the session changes: a new sign-in (even by the same person) starts a fresh look. */
    setUser(id: string | null) {
      if (!id) {
        userId = null
        epoch++
        stopTicker()
        snap = IDLE
        listeners.forEach((l) => l())
        return
      }
      if (userId !== id) {
        // A different person: forget everything and wait for the first answer. The same person with a new session object (a token refresh) is looked
        // at again quietly, so the screen they are on does not blink.
        userId = id
        epoch++
        stopTicker()
        set({ status: 'loading', state: null, error: null })
      }
      void refresh({ firstLook: true })
    },
    refresh,
    /** After "Try again" on the can't-check screen. */
    retry() {
      set({ status: 'loading', state: null, error: null })
      return refresh({ firstLook: true })
    },
    lockNow,

    async unlockWithPin(pin: string): Promise<PinResult> {
      try {
        const r = await deps.api.verifyPin(pin)
        if (r.signedOut) await deps.signOut().catch(() => {})
        return r
      } catch (e) {
        if (deps.isSessionEnded(e)) await deps.signOut().catch(() => {})
        throw e
      }
    },
    /** Call after a successful unlock (PIN or fingerprint), once the success animation has played. */
    async finishUnlock() {
      locking = false
      return refresh()
    },

    /** Any touch in the app. */
    noteActivity,

    /** The app went to the background (not "inactive": that is a notification shade or a system prompt). */
    appWentBackground() {
      if (held > 0 || hiddenAt !== null) return
      hiddenAt = now()
      if (active(snap) && lockOnLeave(snap.state!.autoLockSeconds)) void lockNow()
    },
    /** The app came back to the foreground. It is not activity: the idle clock keeps counting from the last real touch. */
    appCameBack() {
      if (held > 0) return
      const away = hiddenAt === null ? 0 : now() - hiddenAt
      hiddenAt = null
      if (active(snap) && lockOnReturn(snap.state!.autoLockSeconds, away)) void lockNow()
      else void refresh() // the server may have locked us meanwhile (another device, or its own window), or the lock was switched on elsewhere
    },
    /** Runs a system prompt (a fingerprint sheet) without the app counting its own prompt as the person leaving. */
    async hold<T>(fn: () => Promise<T>): Promise<T> {
      held++
      try {
        return await fn()
      } finally {
        held--
        lastActivity = now()
      }
    },

    dispose() {
      stopTicker()
      listeners.clear()
    },
  }
}
export type LockController = ReturnType<typeof createLockController>
