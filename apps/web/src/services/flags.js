// The browser's side of feature flags (migration 0028). The database evaluates every flag for the signed-in person (`evaluate_flags`); this module fetches the
// answers once for all flags, keeps them for a minute, re-asks after any change an administrator makes here, and falls back safely:
//   - the server can not be reached → the last answer is kept (an old flag value beats an error),
//   - there never was an answer, or there is no server (dev mode, demo) → the code defaults, which are the app's behaviour from before flags existed.
// What a flag hides here is presentation. Whatever must be enforced is enforced by the database (`flag_enabled()`), never by a hidden button.
import { createCache, FRESHNESS } from '@lifetrack/core/cache'
import { ENVIRONMENTS, FLAG_REGISTRY, flagValue } from '@lifetrack/core/flags'
import { getUserId } from '@lifetrack/data'
import { supabase } from '@/lib/supabase'
import { isDemo } from './demo'
import { toAppError } from './errors'

export const currentEnv = () => {
  const v = import.meta.env?.VITE_APP_ENV
  return ENVIRONMENTS.includes(v) ? v : import.meta.env?.PROD ? 'production' : 'development'
}
export const defaultFlagMap = () => Object.fromEntries(FLAG_REGISTRY.map((f) => [f.key, f.default]))

const cache = createCache({ ttlMs: FRESHNESS.presentation.ttlMs, maxEntries: 20 })
const listeners = new Set()
export const onFlagsInvalidated = (fn) => (listeners.add(fn), () => listeners.delete(fn))

/** Drop every cached answer (after this browser changed a flag, on sign-out) and tell the open screens to ask again. */
export function invalidateFlags() {
  cache.bump('flags')
  cache.bump('experiment')
  listeners.forEach((f) => f())
}
export const flagCacheStats = () => cache.stats()

/** { flags: {key: bool}, killed, version, source: 'server' | 'defaults' }. Never throws. */
export async function loadFlags({ force = false } = {}) {
  if (!supabase || isDemo()) return { flags: defaultFlagMap(), killed: false, version: null, source: 'defaults' }
  const key = cache.key('flags', getUserId(), currentEnv())
  try {
    return await cache.get(
      key,
      async () => {
        const { data, error } = await supabase.rpc('evaluate_flags', { p_env: currentEnv() })
        if (error) throw toAppError(error)
        return {
          flags: { ...defaultFlagMap(), ...data.flags },
          killed: Boolean(data.killed),
          version: data.version ?? null,
          source: 'server',
        }
      },
      { ...FRESHNESS.presentation, force },
    )
  } catch {
    // The flag service is not deployed yet (migration 0028 not run), or the network is down: behave as before flags existed.
    return { flags: defaultFlagMap(), killed: false, version: null, source: 'defaults' }
  }
}
export { flagValue }

/** Which variant does this person see? Anything that goes wrong is "control" and nothing is recorded. */
export async function assignExperiment(key) {
  if (!supabase || isDemo()) return { variant: 'control', enrolled: false }
  try {
    return await cache.get(
      cache.key('experiment', getUserId(), key),
      async () => {
        const { data, error } = await supabase.rpc('experiment_assign', { p_key: key })
        if (error) throw toAppError(error)
        return data
      },
      FRESHNESS.presentation,
    )
  } catch {
    return { variant: 'control', enrolled: false }
  }
}
/** Reports that this person did the thing the experiment measures. Fire and forget: it never fails the action it follows. */
export async function trackConversion(key, event = 'conversion') {
  if (!supabase || isDemo()) return false
  try {
    const { data } = await supabase.rpc('experiment_convert', { p_key: key, p_event: event })
    return Boolean(data)
  } catch {
    return false
  }
}
