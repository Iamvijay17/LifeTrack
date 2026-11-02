import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True only when real project credentials are present. Otherwise the app runs in clearly-labelled DEV mode. */
export const isSupabaseConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-'))

// Frontend uses ONLY the anon/publishable key. Authorisation is enforced by Row Level Security.
export const supabase = isSupabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
