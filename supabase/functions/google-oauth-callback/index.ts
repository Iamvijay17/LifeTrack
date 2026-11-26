// Supabase Edge Function (Deno): where Google sends the browser after the person approves (or refuses) LifeTrack. Deploy with:
//   supabase functions deploy google-oauth-callback --no-verify-jwt
// It has no sign-in header (it is a plain browser redirect). It checks the HMAC-signed, 10-minute `state` created by google-integration and hands the
// code back to the app in the URL fragment; it stores nothing. The signed-in app then finishes the connection (`finish` in google-integration), which
// only succeeds for the account that started it.
import { handleCallback } from '../google-integration/logic.js'

Deno.serve(async (req) => {
  const env = Object.fromEntries(
    ['SUPABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'OAUTH_STATE_SECRET', 'APP_ORIGIN'].map((k) => [k, Deno.env.get(k) ?? '']),
  )
  const q = new URL(req.url).searchParams
  try {
    const { location } = await handleCallback({ code: q.get('code') ?? undefined, state: q.get('state') ?? undefined, error: q.get('error') ?? undefined }, { env })
    return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  } catch (e) {
    console.error('google-oauth-callback:', (e as Error).message)
    return new Response(null, { status: 302, headers: { Location: `${env.APP_ORIGIN}/integrations?error=failed`, 'Cache-Control': 'no-store' } })
  }
})
