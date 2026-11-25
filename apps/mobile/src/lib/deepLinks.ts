// Pure helpers for deep links and notification taps. Kept free of React/Expo so they are unit-tested.

/** Web-style link paths (what the server stores in notifications.link) → mobile routes. Unknown links fall back to the dashboard. */
const TABS = new Set(['/planner', '/habits', '/finance'])
const MODULES = new Set(['learning', 'jobs', 'fitness', 'health', 'nutrition', 'focus', 'notes', 'goals', 'analytics', 'settings', 'notifications'])
// Web pages that have no mobile screen yet map to the closest useful place.
const FALLBACK: Record<string, string> = { '/reports': '/module/analytics', '/export': '/module/settings' }

export function webLinkToRoute(link: string | null | undefined): string {
  if (!link) return '/'
  let path = link.trim()
  try { if (/^[a-z]+:\/\//i.test(path)) path = new URL(path).pathname } catch { return '/' }
  path = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
  if (path === '/') return '/'
  if (TABS.has(path)) return path
  if (FALLBACK[path]) return FALLBACK[path]
  const m = /^\/(?:module\/)?([a-z]+)$/.exec(path)
  return m && MODULES.has(m[1]) ? `/module/${m[1]}` : '/'
}

/** Extracts the router path from an incoming URL (custom scheme or https). `lifetrack://planner` → `/planner`. */
export function pathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(url)
  if (!m) return url.startsWith('/') ? (url.split('?')[0] || '/') : null
  const scheme = m[1].toLowerCase()
  let rest = m[2]
  if (scheme === 'exp' || scheme.startsWith('exp+')) rest = rest.replace(/^[^/]*\/(--\/)?/, '') // dev-client / Expo Go wrapper
  else if (scheme === 'http' || scheme === 'https') rest = rest.replace(/^[^/]*\/?/, '')
  const path = '/' + rest.split('?')[0].split('#')[0].replace(/^\/+/, '').replace(/\/+$/, '')
  return path === '/' ? '/' : path
}

const PUBLIC = ['/sign-in', '/sign-up', '/forgot-password', '/auth-callback', '/reset-password']
/** Paths that work signed-out; anything else needs a session and is remembered until sign-in completes. */
export const isPublicPath = (p: string) => PUBLIC.some((x) => p === x || p.startsWith(x + '/'))
export const needsSession = (p: string | null) => !!p && p !== '/' && !isPublicPath(p)

let pending: string | null = null
/** Remember where a signed-out user was heading so we can take them there after sign-in. */
export const rememberPending = (path: string | null) => { if (needsSession(path)) pending = path }
export const takePending = () => { const p = pending; pending = null; return p }
export const peekPending = () => pending
