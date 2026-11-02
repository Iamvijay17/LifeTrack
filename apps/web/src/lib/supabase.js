import { createSupabaseClient, hasCredentials } from '@lifetrack/data'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True only when real project credentials are present. Otherwise the app runs in clearly-labelled DEV mode. */
export const isSupabaseConfigured = hasCredentials(url, key)

// Frontend uses ONLY the anon/publishable key. Authorisation is enforced by Row Level Security.
export const supabase = isSupabaseConfigured
  ? createSupabaseClient({ url, anonKey: key, auth: { detectSessionInUrl: true } })
  : null
