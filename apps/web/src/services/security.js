import { createSupabaseSecurity } from '@lifetrack/data'
import { supabase } from '@/lib/supabase'
import { auth } from './auth'
import { AppError } from './errors'
import { createLocalSecurity } from './localSecurity'

// A build with no database configured shows a configuration screen and never reaches the security code; anything that did would be told so plainly.
const notConnected = async () => {
  throw new AppError('LifeTrack is not connected to a database (missing Supabase configuration).')
}
const unavailable = new Proxy(
  {},
  { get: (_target, key) => (key === 'then' ? undefined : new Proxy(notConnected, { get: () => notConnected })) },
)

/**
 * The security API (app lock, passkeys, sessions) for this build. Supabase in production, where the database and the `webauthn` Edge Function decide;
 * the in-browser stand-in for the DEV backend. `__BACKEND__` is a build-time literal, so the branches a bundle does not use are removed from it: a
 * production build must never contain the dev backend (`pnpm verify:bundles` checks), which is why "no database" has its own third branch.
 */
export const security =
  __BACKEND__ === 'supabase'
    ? createSupabaseSecurity(supabase)
    : __BACKEND__ === 'local'
      ? createLocalSecurity({ endSession: () => auth.signOut() })
      : unavailable
