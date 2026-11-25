import { createClient } from '@supabase/supabase-js'

/**
 * Build a Supabase client from the PUBLIC url + anon/publishable key only (never a service-role key).
 * `auth` lets each platform choose session storage (web: localStorage default; mobile: Expo SecureStore adapter).
 * `global` (optional) is supabase-js's own `global` option: the apps use it to label each database request with its source and a request id (audit log).
 */
export function createSupabaseClient({ url, anonKey, auth = {}, global }) {
  return createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, ...auth }, ...(global ? { global } : {}) })
}

/** True only when real project credentials are present. */
export const hasCredentials = (url, key) => Boolean(url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-'))
