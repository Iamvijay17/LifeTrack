// Sends unexpected errors to the database's error log (System Health shows them to administrators). Deliberately small:
//   * one row per distinct error on the server (a counter, not a copy per occurrence), and at most 20 reports per person per 10 minutes there;
//   * here, the same error is sent once per page load and at most 10 distinct errors per load;
//   * only the message, the first lines of the stack and the route WITHOUT its query string or hash leave the browser: no user id, no data, no URLs with tokens.
import { supabase } from '@/lib/supabase'
import { isDemo } from '@/services/demo'

const sent = new Set()
const MAX_PER_LOAD = 10
const RELEASE = String(import.meta.env?.VITE_APP_VERSION ?? '')

/** Strips anything that looks like a secret from text before it is sent. */
export const scrub = (s) =>
  String(s ?? '')
    .replace(/(eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,})/g, '[token]') // JWTs
    .replace(/\b(lt_live_|whsec_)[\w-]{6,}/g, '[secret]')
    .replace(/([?&#](?:access_token|refresh_token|token|code|key|apikey|password)=)[^&\s)]+/gi, '$1[redacted]')

export function reportError(category, error, route = typeof location === 'undefined' ? '' : location.pathname) {
  try {
    if (!supabase || isDemo()) return
    const message = scrub(error?.message ?? error).slice(0, 300)
    if (!message) return
    const stack = scrub(error?.stack ?? '')
      .split('\n')
      .slice(0, 8)
      .join('\n')
      .slice(0, 2000)
    const fp = `${category}|${message}|${stack.split('\n')[1] ?? ''}`
    if (sent.has(fp) || sent.size >= MAX_PER_LOAD) return
    sent.add(fp)
    supabase
      .rpc('report_client_error', { p_category: category, p_message: message, p_stack: stack, p_route: route, p_release: RELEASE })
      .then(
        () => {},
        () => {},
      )
  } catch {
    /* reporting must never cause an error */
  }
}

let installed = false
export function installErrorReporting() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => {
    if (e.message === 'ResizeObserver loop completed with undelivered notifications.') return // harmless browser noise
    reportError('frontend', e.error ?? e.message)
  })
  window.addEventListener('unhandledrejection', (e) =>
    reportError(e.reason?.name === 'TypeError' && /fetch|network/i.test(e.reason?.message ?? '') ? 'network' : 'frontend', e.reason),
  )
}
