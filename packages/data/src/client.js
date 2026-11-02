import { createClient } from '@supabase/supabase-js'

/**
 * Build a Supabase client from the PUBLIC url + anon/publishable key only (never a service-role key).
 * `auth` lets each platform choose session storage (web: localStorage default; mobile: Expo SecureStore adapter).
 */
export function createSupabaseClient({ url, anonKey, auth = {} }) {
  return createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, ...auth } })
}

/** True only when real project credentials are present. */
export const hasCredentials = (url, key) => Boolean(url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-'))
