// The decisions of the `webauthn` Edge Function, with every outside thing (GoTrue, the database, the clock) injected, so it runs the same under
// Deno and under the Node test suite (packages/core/tests/webauthn-function.test.js).
//
// What it guarantees:
//   * Only a signed-in user whose session still exists can ask for anything (`authenticate`, supplied by index.ts, asks GoTrue).
//   * A challenge is issued for one user + one session + one purpose, lives 2 minutes, and is deleted the moment it is used: replay is impossible.
//   * Adding a key requires an UNLOCKED session with the app lock on. Without that, a stolen token could enrol its own "fingerprint" and walk in.
//   * Unlocking happens ONLY here, after a verified signature from a key this user enrolled, with a counter that moved forward.
//   * A bad signature counts toward the same lockout as a wrong PIN (and can end the session). An expired challenge does not: that is just slowness.
import * as defaultWebauthn from '../_shared/webauthn.js'

const MAX_BODY = 16 * 1024

const reply = (status, body, headers = {}) => ({ status, body, headers })
const fail = (status, error, message, extra = {}) => reply(status, { ok: false, error, message, ...extra })

/** Browser cross-origin rules: answer only the origins we serve. A caller with no Origin header (a native app, curl) is not a browser. */
export function corsHeaders(origin, allowed) {
  if (!origin || !allowed.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

/**
 * @param request  { method, origin, authorization, body }   body is the parsed JSON (or null)
 * @param deps     { config: { rpId, rpName, origins }, authenticate(authorization) → {userId, sessionId, email} | null,
 *                   db: { status, issueChallenge, takeChallenge, credentials, addCredential, recordAssertion, unlock, failure },
 *                   webauthn?, now? }
 * @returns        { status, body, headers }
 */
export async function handleRequest(request, deps) {
  const { config, authenticate, db } = deps
  const wa = deps.webauthn ?? defaultWebauthn
  const cors = corsHeaders(request.origin, config.origins ?? [])
  const done = (r) => ({ ...r, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors, ...r.headers } })

  if (request.method === 'OPTIONS') return done(reply(request.origin && !cors['Access-Control-Allow-Origin'] ? 403 : 204, null))
  if (request.method !== 'POST') return done(fail(405, 'method_not_allowed', 'Use POST.'))
  if (request.origin && !cors['Access-Control-Allow-Origin']) return done(fail(403, 'origin_not_allowed', 'This site may not use passkeys here.'))
  if (!request.body || typeof request.body !== 'object' || (request.rawLength ?? 0) > MAX_BODY) return done(fail(400, 'bad_request', 'Send a small JSON object.'))

  const me = await authenticate(request.authorization)
  if (!me?.userId) return done(fail(401, 'not_signed_in', 'Sign in again.'))

  const configured = !!config.rpId && (config.origins?.length ?? 0) > 0
  const { action } = request.body
  if (action === 'capabilities') return done(reply(200, { ok: true, available: configured }))
  if (!configured) return done(fail(503, 'not_configured', 'Fingerprint and face unlock is not set up on this server yet.'))

  const rp = { rpId: config.rpId, origins: config.origins }
  const status = await db.status(me.userId, me.sessionId)

  /** One-time challenge for this user and session. */
  const issue = async (purpose) => {
    const challenge = wa.generateChallenge()
    await db.issueChallenge(me.userId, me.sessionId, purpose, challenge)
    return challenge
  }
  /** Consumes the challenge a response was made for, or says it is unknown / used / expired. */
  const consume = async (credential, purpose) => {
    const challenge = wa.challengeOf(credential?.response?.clientDataJSON)
    return challenge && (await db.takeChallenge(me.userId, me.sessionId, purpose, challenge)) ? challenge : null
  }
  /** A signature that does not verify is not slowness: count it, exactly like a wrong PIN. */
  const rejected = async (e) => {
    const f = await db.failure(me.userId, me.sessionId)
    return fail(401, 'not_accepted', 'That fingerprint or face unlock was not accepted.', {
      reason: e?.code ?? 'unknown',
      lockout_seconds: f?.lockout_seconds ?? 0,
      signed_out: !!f?.signed_out,
    })
  }
  const label = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '')

  switch (action) {
    case 'register-options': {
      if (!status.app_lock_enabled) return done(fail(409, 'app_lock_off', 'Turn on the app lock before adding a fingerprint or face unlock.'))
      if (!status.unlocked) return done(fail(403, 'locked', 'Unlock LifeTrack first.'))
      const existing = await db.credentials(me.userId)
      const challenge = await issue('register')
      const options = wa.registrationOptions({
        rpId: config.rpId,
        rpName: config.rpName || 'LifeTrack',
        user: { id: wa.b64uEncode(new TextEncoder().encode(me.userId)), name: me.email || 'LifeTrack user', displayName: me.email || 'LifeTrack user' },
        challenge,
        excludeCredentialIds: existing.map((c) => c.credential_id),
      })
      return done(reply(200, { ok: true, options }))
    }

    case 'register-verify': {
      if (!status.app_lock_enabled || !status.unlocked) return done(fail(403, 'locked', 'Unlock LifeTrack first.'))
      const challenge = await consume(request.body.credential, 'register')
      if (!challenge) return done(fail(400, 'challenge_expired', 'That took too long. Try adding it again.'))
      let reg
      try {
        reg = await wa.verifyRegistration({ credential: request.body.credential, expectedChallenge: challenge, ...rp })
      } catch (e) {
        if (e?.name !== 'WebAuthnError') throw e
        return done(fail(400, 'registration_rejected', 'That fingerprint or face unlock could not be added.', { reason: e.code }))
      }
      try {
        const id = await db.addCredential({
          userId: me.userId,
          credentialId: reg.credentialId,
          publicKeyJwk: reg.publicKeyJwk,
          alg: reg.alg,
          signCount: reg.signCount,
          transports: Array.isArray(request.body.transports) ? request.body.transports.filter((t) => typeof t === 'string').slice(0, 6) : [],
          label: label(request.body.label) || 'This device',
          deviceType: reg.deviceType,
          backedUp: reg.backedUp,
        })
        return done(reply(200, { ok: true, id }))
      } catch (e) {
        if (e?.code === '23505') return done(fail(409, 'already_added', 'That fingerprint or face unlock is already on an account.'))
        if (e?.code === '54000') return done(fail(409, 'too_many', e.message))
        throw e
      }
    }

    case 'authenticate-options': {
      if (!status.app_lock_enabled || !status.biometric_enabled) return done(fail(409, 'biometric_off', 'Fingerprint or face unlock is not turned on.'))
      const keys = await db.credentials(me.userId)
      if (!keys.length) return done(fail(409, 'biometric_off', 'No fingerprint or face unlock is registered.'))
      const challenge = await issue('authenticate')
      return done(reply(200, { ok: true, options: wa.authenticationOptions({ rpId: config.rpId, challenge, credentialIds: keys.map((k) => k.credential_id) }) }))
    }

    case 'authenticate-verify': {
      if (!status.app_lock_enabled || !status.biometric_enabled) return done(fail(409, 'biometric_off', 'Fingerprint or face unlock is not turned on.'))
      const challenge = await consume(request.body.credential, 'authenticate')
      if (!challenge) return done(fail(400, 'challenge_expired', 'That took too long. Try again.'))
      const keys = await db.credentials(me.userId)
      const key = keys.find((k) => k.credential_id === request.body.credential?.id)
      if (!key) return done(await rejected({ code: 'unknown_credential' }))
      let result
      try {
        result = await wa.verifyAuthentication({
          credential: request.body.credential,
          expectedChallenge: challenge,
          stored: { publicKeyJwk: key.public_key_jwk, alg: key.alg, signCount: Number(key.sign_count) },
          ...rp,
        })
      } catch (e) {
        if (e?.name !== 'WebAuthnError') throw e
        return done(await rejected(e))
      }
      // Saves the counter only if it moved forward. Refusing here also stops two copies of one response from both being honoured.
      if (!(await db.recordAssertion(key.id, me.userId, result.signCount))) return done(await rejected({ code: 'counter_regressed' }))
      await db.unlock(me.userId, me.sessionId)
      return done(reply(200, { ok: true }))
    }

    default:
      return done(fail(400, 'unknown_action', 'Unknown action.'))
  }
}
