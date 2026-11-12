import { createSupabaseSecurity } from '@lifetrack/data'
import { supabase } from './supabase'

/**
 * The app lock's API (PIN, heartbeat, sessions) and the phone's biometric keys, over the signed-in user's Supabase session. It holds no secret and
 * decides nothing: whether the app is locked is whatever the database says (migration 0012), and a fingerprint or face only counts when its signature
 * is verified by the `device-key` Edge Function (migration 0014). Null when the app has no Supabase credentials (then there is no lock at all).
 */
export const security = supabase ? createSupabaseSecurity(supabase) : null
export type SecurityApi = NonNullable<typeof security>
