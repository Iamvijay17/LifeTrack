// Supabase Edge Function (Deno): passkey (fingerprint / face / device PIN) enrolment and unlock for the app lock. All decisions are in logic.js
// (tested in Node); this file only connects it to GoTrue and the database. Deploy with:  supabase functions deploy webauthn
// (JWT verification stays ON: only signed-in users can call it.)
//
// Secrets (supabase secrets set …):
//   WEBAUTHN_RP_ID      the site's domain, no scheme or port, e.g. app.example.com  (localhost for local development)
//   WEBAUTHN_ORIGINS    comma-separated exact origins of the web app, e.g. https://app.example.com  (http://localhost:5173 for development)
//   WEBAUTHN_RP_NAME    optional, shown by some authenticators; defaults to LifeTrack
// Unset RP_ID / ORIGINS = the function answers "not configured" and the app hides fingerprint unlock. Nothing else is needed:
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions by Supabase itself and never leave the server.
import { createClient } from '@supabase/supabase-js'
import { handleRequest } from './logic.js'
import { b64uDecode } from '../_shared/webauthn.js'

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)

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
    status: (user: string, session: string | null) => rpc('pk_status', { p_user: user, p_session: session }),
    issueChallenge: (user: string, session: string | null, purpose: string, challenge: string) => rpc('pk_issue_challenge', { p_user: user, p_session: session, p_purpose: purpose, p_challenge: challenge }),
    takeChallenge: (user: string, session: string | null, purpose: string, challenge: string) => rpc('pk_take_challenge', { p_user: user, p_session: session, p_purpose: purpose, p_challenge: challenge }),
    credentials: (user: string) => rpc('pk_credentials', { p_user: user }),
    addCredential: (c: Record<string, unknown>) =>
      rpc('pk_add_credential', {
        p_user: c.userId, p_credential_id: c.credentialId, p_jwk: c.publicKeyJwk, p_alg: c.alg, p_sign_count: c.signCount,
        p_transports: c.transports, p_label: c.label, p_device_type: c.deviceType, p_backed_up: c.backedUp,
      }),
    recordAssertion: (id: string, user: string, count: number) => rpc('pk_record_assertion', { p_id: id, p_user: user, p_new_count: count }),
    unlock: (user: string, session: string | null) => rpc('pk_unlock', { p_user: user, p_session: session }),
    failure: (user: string, session: string | null) => rpc('pk_failure', { p_user: user, p_session: session }),
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
      { config: { rpId: Deno.env.get('WEBAUTHN_RP_ID') ?? '', origins: list(Deno.env.get('WEBAUTHN_ORIGINS')), rpName: Deno.env.get('WEBAUTHN_RP_NAME') ?? 'LifeTrack' }, authenticate, db },
    )
    return new Response(out.body === null ? null : JSON.stringify(out.body), { status: out.status, headers: out.headers })
  } catch (e) {
    console.error('webauthn:', (e as Error).message) // never echo internals to the client
    return new Response(JSON.stringify({ ok: false, error: 'server_error', message: 'Something went wrong. Try again.' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
