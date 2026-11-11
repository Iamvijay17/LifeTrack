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

/**
 * A throwaway client for checking a password without touching the live session (see changePassword in @lifetrack/data). It keeps nothing: no stored
 * session, no refresh, no URL parsing, and its own storage key so the browser does not warn about two clients sharing one.
 */
export const createVerifierClient = () =>
  isSupabaseBackend
    ? createSupabaseClient({
        url: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'lifetrack-password-check' },
      })
    : null
