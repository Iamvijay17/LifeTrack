// Supabase Edge Function (Deno): fingerprint / face unlock for the MOBILE app lock. All decisions are in logic.js (tested in Node); this file only connects
// it to GoTrue and the database. Deploy with:  supabase functions deploy device-key
// (JWT verification stays ON: only signed-in users can call it.)
//
// It needs no secrets and no configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions by Supabase itself and never leave
// the server. (Unlike `webauthn`, there is no relying-party domain: a phone's key is not tied to a website.) Run migration 0014_device_keys.sql first.
import { createClient } from '@supabase/supabase-js'
import { handleRequest } from './logic.js'
import { b64uDecode } from '../_shared/webauthn.js'

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return data
  }

  const authenticate = async (authorization: string | null) => {
    const jwt = (authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return null
    // GoTrue checks the signature, the expiry AND that the session behind the token still exists (a signed-out device gets nothing).
    const { data, error } = await sb.auth.getUser(jwt)
    if (error || !data.user) return null
    let sessionId: string | null = null
    try { sessionId = JSON.parse(new TextDecoder().decode(b64uDecode(jwt.split('.')[1]))).session_id ?? null } catch { /* no session claim */ }
    return { userId: data.user.id, sessionId, email: data.user.email ?? '' }
  }

  const db = {
    status: (user: string, session: string | null) => rpc('dk_status', { p_user: user, p_session: session }),
    issueChallenge: (user: string, session: string | null, purpose: string, challenge: string, key: string | null) =>
      rpc('dk_issue_challenge', { p_user: user, p_session: session, p_purpose: purpose, p_challenge: challenge, p_key: key }),
    takeChallenge: (user: string, session: string | null, purpose: string, challenge: string, key: string | null) =>
      rpc('dk_take_challenge', { p_user: user, p_session: session, p_purpose: purpose, p_challenge: challenge, p_key: key }),
    keys: (user: string) => rpc('dk_keys', { p_user: user }),
    addKey: (k: Record<string, unknown>) =>
      rpc('dk_add_key', { p_user: k.userId, p_thumbprint: k.thumbprint, p_jwk: k.publicKeyJwk, p_label: k.label, p_platform: k.platform }),
    recordAssertion: (id: string, user: string, count: number) => rpc('dk_record_assertion', { p_id: id, p_user: user, p_new_count: count }),
    unlock: (user: string, session: string | null) => rpc('dk_unlock', { p_user: user, p_session: session }),
    failure: (user: string, session: string | null) => rpc('dk_failure', { p_user: user, p_session: session }),
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
      { authenticate, db },
    )
    return new Response(out.body === null ? null : JSON.stringify(out.body), { status: out.status, headers: out.headers })
  } catch (e) {
    console.error('device-key:', (e as Error).message) // never echo internals to the client
    return new Response(JSON.stringify({ ok: false, error: 'server_error', message: 'Something went wrong. Try again.' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
