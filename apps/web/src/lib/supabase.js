import { createSupabaseClient } from '@lifetrack/data'
import { isSupabaseBackend } from './backend'

/** True only when real project credentials were present at build time. */
export const isSupabaseConfigured = isSupabaseBackend

// Frontend uses ONLY the anon/publishable key. Authorisation is enforced by Row Level Security.
export const supabase = isSupabaseBackend
  ? createSupabaseClient({
      url: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      auth: { detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null
