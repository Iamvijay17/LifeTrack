import { createClient } from '@supabase/supabase-js'
import { isSupabaseBackend } from './backend'

/** True only when real project credentials were present at build time. */
export const isSupabaseConfigured = isSupabaseBackend

// Frontend uses ONLY the anon/publishable key. Authorisation is enforced by Row Level Security.
export const supabase = isSupabaseBackend
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
