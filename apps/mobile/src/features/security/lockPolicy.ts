import { formatWait } from '@lifetrack/core/security'

// The rules of the app lock that do not need React or a clock: what the server's answers mean to a person, and when the phone should lock itself.
// Mirrors apps/web/src/features/security (SecurityProvider.jsx, AppLockCard.jsx), so the two behave the same.

/** What `security_state()` says (see normalizeState in @lifetrack/data). The server decides `locked`; the app only displays it. */
export interface SecurityState {
  appLockEnabled: boolean
  pinLength: number | null
  pinSetAt: string | null
  autoLockSeconds: number
  biometricEnabled: boolean
  passkeyCount: number
  locked: boolean
  /** Module locks (migration 0015): 'modules' closes only the chosen modules for a session that has not entered the PIN. */
  lockScope?: string
  lockedModules?: string[]
  sessionUnlocked?: boolean
  lockoutSeconds: number
  failedAttempts: number
  sessionId: string | null
}
/** What `verify_pin` and friends say (normalizePin). A wrong PIN is an answer here, not an error: raising would roll back the failure counter. */
export interface PinResult {
  ok: boolean
  reason: 'wrong_pin' | 'locked_out' | 'not_enabled' | null
  triesLeft: number | null
  lockoutSeconds: number
  signedOut: boolean
  failedAttempts: number
}

/** How often the heartbeat renews the server's unlock window while the person is active: often enough that it never lapses under them. */
export const heartbeatEvery = (autoLockSeconds: number) => Math.min(30_000, Math.max(10_000, (autoLockSeconds * 1000) / 3))
/** How often the phone checks whether the person has gone quiet. */
export const TICK_MS = 5_000

/** Idle for the whole auto-lock time? 0 means "when I leave the app", which has no idle clock. */
export const idleExpired = (autoLockSeconds: number, now: number, lastActivity: number) => autoLockSeconds > 0 && now - lastActivity >= autoLockSeconds * 1000
/** Leaving the app locks at once only for "when I leave the app". */
export const lockOnLeave = (autoLockSeconds: number) => autoLockSeconds === 0
/** Coming back after at least the auto-lock time away locks again. (A short trip to another app does not.) */
export const lockOnReturn = (autoLockSeconds: number, awayMs: number) => autoLockSeconds > 0 && awayMs >= autoLockSeconds * 1000

const plural = (n: number | null) => `${n} ${n === 1 ? 'try' : 'tries'}`
/** What a wrong-PIN answer from the server means for a person. */
export function explainPin(r: PinResult): string {
  if (r.signedOut) return 'Too many wrong PINs. For your safety you have been signed out.'
  if (r.reason === 'locked_out' || r.lockoutSeconds) return `Too many wrong PINs. Wait ${formatWait(r.lockoutSeconds)}.`
  return `Wrong PIN. ${plural(r.triesLeft)} left before a short lockout.`
}

/** "Chrome on Windows", "Android phone"… from a user agent. GoTrue stores whatever the client sent, so this is a best guess for a list, never a decision. */
export function describeDevice(userAgent: string): { label: string; kind: 'phone' | 'tablet' | 'desktop' | 'unknown' } {
  const ua = userAgent ?? ''
  if (!ua) return { label: 'Unknown device', kind: 'unknown' }
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad|ios|cfnetwork|darwin/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /macintosh|mac os/i.test(ua) ? 'macOS' : /linux|x11|cros/i.test(ua) ? 'Linux' : ''
  const app = /edg\//i.test(ua) ? 'Edge' : /firefox|fxios/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : /okhttp|expo|lifetrack|cfnetwork/i.test(ua) ? 'LifeTrack app' : ''
  const kind = /ipad|tablet/i.test(ua) ? 'tablet' : /android|iphone|ios|okhttp|cfnetwork|mobile/i.test(ua) ? 'phone' : os ? 'desktop' : 'unknown'
  const label = app && os ? `${app} on ${os}` : app || (os ? `${os} device` : 'Unknown device')
  return { label, kind }
}

/** "just now", "5 min ago", "3 h ago", "2 days ago": for a list of sessions and phones. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return 'never'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.floor(h / 24)} days ago`
}
