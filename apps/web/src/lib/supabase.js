import { createSupabaseClient } from '@lifetrack/data'
import { isSupabaseBackend } from './backend'
import { queryRecorder, timedFetch } from './queryStats'

/**
 * Labels every DATABASE request (PostgREST, `/rest/v1/`) with where it came from and a fresh id, so the audit log can say "web app, request 4f2a…" and an
 * administrator can follow one action through the logs. Auth, storage and Edge Function calls are left alone: those servers restrict which headers a
 * browser may send, and these two are only meaningful to the database.
 */
export const requestContextFetch = (source) => (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? '')
  if (!url.includes('/rest/v1/')) return fetch(input, init)
  const headers = new Headers(init?.headers ?? (typeof input === 'object' ? input.headers : undefined))
  headers.set('x-lifetrack-source', source)
  headers.set('x-request-id', globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  return fetch(input, { ...init, headers })
}

/** True only when real project credentials were present at build time. */
export const isSupabaseConfigured = isSupabaseBackend

// Frontend uses ONLY the anon/publishable key. Authorisation is enforced by Row Level Security.
export const supabase = isSupabaseBackend
  ? createSupabaseClient({
      url: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      auth: { detectSessionInUrl: true, flowType: 'pkce' },
      global: { fetch: timedFetch(requestContextFetch('web')) },
    })
  : null

// Timings of this browser's own database requests go to the administrators' performance view (a sample of sessions, batched, nothing identifying).
if (supabase) queryRecorder.start((rows) => supabase.rpc('report_query_stats', { p_rows: rows }))

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
