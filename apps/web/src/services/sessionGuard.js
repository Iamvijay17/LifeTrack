// What to do when the server says the sign-in has run out ("JWT expired", PGRST301) in the middle of using the app.
// supabase-js renews tokens by itself and signs out when the renewal is refused, so this only matters when the server rejects a token the device
// still believes in (session ended elsewhere, device clock far off, account removed). Without it every later action fails with the same toast and
// the person is stuck on a page that can no longer save anything.
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { auth } from './auth'

/** True when `e` (as made by toAppError) means the sign-in itself is no longer accepted, not a network or permission problem. */
export const isSessionExpiredError = (e) => e?.code === 'jwt' || e?.code === 'PGRST301'

let checking = null

/**
 * Ask the server whether this session is still good; if not, end it on this device so the app returns to the sign-in page (kept for after the
 * sign-in: see Protected in App.jsx). Concurrent failures share one check. A network failure while checking proves nothing and signs nobody out.
 * @returns {Promise<boolean>} true when the person was signed out
 */
export function handleExpiredSession() {
  if (!supabase) return Promise.resolve(false) // local backend: no server tokens
  checking ??= (async () => {
    try {
      const { error } = await supabase.auth.getUser() // contacts the server (getSession would trust the stored token)
      const status = error?.status
      const rejected =
        Boolean(error) &&
        (status === 401 || status === 403 || error.name === 'AuthSessionMissingError' || /JWT|expired/i.test(error.message ?? ''))
      if (!rejected) return false
      await auth.signOut().catch(() => {})
      toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' })
      return true
    } catch {
      return false
    } finally {
      // Hold the result briefly so a burst of failing requests (every table re-fetching at once) triggers one check, not one each.
      setTimeout(() => (checking = null), 2000)
    }
  })()
  return checking
}
