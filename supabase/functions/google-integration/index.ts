// Supabase Edge Function (Deno): Google Calendar sync and Google Drive backup for the Integration Center. All decisions are in logic.js (tested in Node);
// this file only connects it to GoTrue and the database. Deploy with:  supabase functions deploy google-integration
// (JWT verification stays ON: only signed-in users can call it.) Setup, secrets and the Google Cloud steps: docs/INTEGRATIONS.md.
//
// Secrets (supabase secrets set …): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET (a long random string), APP_ORIGIN (e.g. https://app.example.com).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself and never leave the server.
import { createClient } from '@supabase/supabase-js'
import { handleRequest } from './logic.js'
import { googleStore } from '../_shared/googleStore.js'

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const env = Object.fromEntries(
    ['SUPABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'OAUTH_STATE_SECRET', 'APP_ORIGIN'].map((k) => [k, Deno.env.get(k) ?? '']),
  )
  const authenticate = async (authorization: string | null) => {
    const jwt = (authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return null
    const { data, error } = await sb.auth.getUser(jwt) // GoTrue checks the signature, the expiry and that the session still exists
    return error || !data.user ? null : { userId: data.user.id, email: data.user.email ?? '' }
  }
  let body: unknown = null
  let rawLength = 0
  if (req.method === 'POST') {
    const text = await req.text()
    rawLength = text.length
    try { body = JSON.parse(text) } catch { body = null }
  }
  try {
    const out = await handleRequest(
      { method: req.method, origin: req.headers.get('origin'), authorization: req.headers.get('authorization'), body, rawLength },
      { authenticate, store: googleStore(sb), fetch: (u: string, i?: RequestInit) => fetch(u, i), env },
    )
    return new Response(out.body === null ? null : JSON.stringify(out.body), { status: out.status, headers: out.headers })
  } catch (e) {
    console.error('google-integration:', (e as Error).message) // never echo internals to the client
    return new Response(JSON.stringify({ ok: false, error: 'server_error', message: 'Something went wrong. Try again.' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
