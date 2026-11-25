// The decisions of the `device-key` Edge Function: fingerprint / face unlock for the MOBILE app lock. Every outside thing (GoTrue, the database, the clock)
// is injected, so this runs the same under Deno and under the Node test suite (packages/core/tests/device-key-function.test.js).
//
// It is the native counterpart of the `webauthn` function and keeps its guarantees:
//   * Only a signed-in user whose session still exists can ask for anything (`authenticate`, supplied by index.ts, asks GoTrue).
//   * A challenge is issued for one user + one session + one purpose (+ one key), lives 2 minutes, and is deleted the moment it is used: no replay.
//   * Adding a phone requires an UNLOCKED session with the app lock on, and a signature from the new key over a fresh challenge (proof that the phone
//     really holds the private key it is enrolling). Without that, a stolen token could enrol its own "fingerprint" and walk in.
//   * Unlocking happens ONLY here, after a verified signature from a key this user enrolled, with a counter that moved forward. A flag sent by the app
//     ("the biometric check passed") is not an input anywhere: there is nothing to claim, only a signature to verify.
//   * A bad signature counts toward the same lockout as a wrong PIN (and can end the session). An expired challenge does not: that is just slowness.
//
// It is for native apps. A request that carries an Origin header is a browser, and browsers use WebAuthn through the `webauthn` function instead.
import * as defaultDeviceKey from '../_shared/devicekey.js'
import { generateChallenge } from '../_shared/webauthn.js'

const MAX_BODY = 16 * 1024
const MAX_KEYS = 10
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLATFORMS = ['android', 'ios']

const reply = (status, body, headers = {}) => ({ status, body, headers })
const fail = (status, error, message, extra = {}) => reply(status, { ok: false, error, message, ...extra })

/**
 * @param request  { method, origin, authorization, body, rawLength }   body is the parsed JSON (or null)
 * @param deps     { authenticate(authorization) → {userId, sessionId, email} | null,
 *                   db: { status, issueChallenge, takeChallenge, keys, addKey, recordAssertion, unlock, failure },
 *                   deviceKey? (the verifier, for tests) }
 * @returns        { status, body, headers }
 */
export async function handleRequest(request, deps) {
  const { authenticate, db } = deps
  const dk = deps.deviceKey ?? defaultDeviceKey
  const done = (r) => ({ ...r, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...r.headers } })

  // No CORS headers are ever sent, so a page in a browser cannot read an answer even if it holds a token.
  if (request.origin) return done(fail(403, 'native_only', 'This is for the LifeTrack app.'))
  if (request.method !== 'POST') return done(fail(405, 'method_not_allowed', 'Use POST.'))
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || (request.rawLength ?? 0) > MAX_BODY) {
    return done(fail(400, 'bad_request', 'Send a small JSON object.'))
  }

  const me = await authenticate(request.authorization)
  // A token with no session claim (the anon key, an old token) can never unlock anything: unlocking is recorded against the session.
  if (!me?.userId || !me.sessionId) return done(fail(401, 'not_signed_in', 'Sign in again.'))

  const body = request.body
  if (body.action === 'capabilities') return done(reply(200, { ok: true, available: true }))

  const known = ['enroll-options', 'enroll-verify', 'unlock-options', 'unlock-verify']
  if (!known.includes(body.action)) return done(fail(400, 'unknown_action', 'Unknown action.'))

  const status = await db.status(me.userId, me.sessionId)

  /** One-time challenge for this user and session (and, to unlock, one key). */
  const issue = async (purpose, keyId = null) => {
    const challenge = generateChallenge()
    await db.issueChallenge(me.userId, me.sessionId, purpose, challenge, keyId)
    return challenge
  }
  /** Consumes the challenge a response was made for, or says it is unknown / used / expired. */
  const consume = async (challenge, purpose, keyId = null) =>
    typeof challenge === 'string' && challenge.length >= 22 && challenge.length <= 200 && (await db.takeChallenge(me.userId, me.sessionId, purpose, challenge, keyId))
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

  switch (body.action) {
    case 'enroll-options': {
      if (!status.app_lock_enabled) return done(fail(409, 'app_lock_off', 'Turn on the app lock before adding fingerprint or face unlock.'))
      if (!status.unlocked) return done(fail(403, 'locked', 'Unlock LifeTrack first.'))
      if ((status.key_count ?? 0) >= MAX_KEYS) return done(fail(409, 'too_many', 'You can use fingerprint or face unlock on up to 10 phones. Remove one first.'))
      return done(reply(200, { ok: true, options: { challenge: await issue('enroll'), algorithm: 'ES256', context: dk.DEVICE_KEY_CONTEXT } }))
    }

    case 'enroll-verify': {
      if (!status.app_lock_enabled || !status.unlocked) return done(fail(403, 'locked', 'Unlock LifeTrack first.'))
      let jwk
      try {
        jwk = dk.normalizePublicKey(body.publicKeyJwk)
      } catch (e) {
        if (e?.name !== 'WebAuthnError') throw e
        return done(fail(400, 'registration_rejected', 'That fingerprint or face unlock could not be added.', { reason: e.code }))
      }
      if (!(await consume(body.challenge, 'enroll'))) return done(fail(400, 'challenge_expired', 'That took too long. Try adding it again.'))
      let thumbprint
      try {
        await dk.verifyDeviceSignature({ publicKeyJwk: jwk, message: dk.enrollMessage({ challenge: body.challenge, publicKeyJwk: jwk }), signature: body.signature })
        thumbprint = await dk.jwkThumbprint(jwk)
      } catch (e) {
        if (e?.name !== 'WebAuthnError') throw e
        return done(fail(400, 'registration_rejected', 'That fingerprint or face unlock could not be added.', { reason: e.code }))
      }
      try {
        const id = await db.addKey({
          userId: me.userId,
          thumbprint,
          publicKeyJwk: jwk,
          label: label(body.label) || 'This phone',
          platform: PLATFORMS.includes(body.platform) ? body.platform : 'unknown',
        })
        return done(reply(200, { ok: true, id }))
      } catch (e) {
        if (e?.code === '23505') return done(fail(409, 'already_added', 'That fingerprint or face unlock is already on an account.'))
        if (e?.code === '54000') return done(fail(409, 'too_many', e.message))
        if (e?.code === '55000') return done(fail(409, 'app_lock_off', e.message))
        throw e
      }
    }

    case 'unlock-options': {
      if (!status.app_lock_enabled) return done(fail(409, 'app_lock_off', 'The app lock is off.'))
      if (typeof body.keyId !== 'string' || !UUID.test(body.keyId)) return done(fail(400, 'bad_request', 'Say which key this phone holds.'))
      const keys = await db.keys(me.userId)
      // This phone's key is not (or no longer) on the account: removed from another device, or the lock was turned off. The phone forgets it and uses the PIN.
      if (!keys.some((k) => k.id === body.keyId)) return done(fail(409, 'unknown_key', 'This phone is not set up for fingerprint or face unlock any more. Use your PIN.'))
      return done(reply(200, { ok: true, options: { challenge: await issue('unlock', body.keyId), keyId: body.keyId, context: dk.DEVICE_KEY_CONTEXT } }))
    }

    case 'unlock-verify': {
      if (!status.app_lock_enabled) return done(fail(409, 'app_lock_off', 'The app lock is off.'))
      if (typeof body.keyId !== 'string' || !UUID.test(body.keyId) || !dk.isCounter(body.counter) || typeof body.signature !== 'string') {
        return done(fail(400, 'bad_request', 'That request was incomplete.'))
      }
      if (!(await consume(body.challenge, 'unlock', body.keyId))) return done(fail(400, 'challenge_expired', 'That took too long. Try again.'))
      const key = (await db.keys(me.userId)).find((k) => k.id === body.keyId)
      if (!key) return done(fail(409, 'unknown_key', 'This phone is not set up for fingerprint or face unlock any more. Use your PIN.'))
      try {
        await dk.verifyDeviceSignature({
          publicKeyJwk: key.public_key_jwk,
          message: dk.unlockMessage({ challenge: body.challenge, keyId: body.keyId, counter: body.counter }),
          signature: body.signature,
        })
      } catch (e) {
        if (e?.name !== 'WebAuthnError') throw e
        return done(await rejected(e))
      }
      // Saves the counter only if it moved forward. Refusing here also stops two copies of one signature from both being honoured.
      if (!(await db.recordAssertion(key.id, me.userId, body.counter))) return done(await rejected({ code: 'counter_regressed' }))
      await db.unlock(me.userId, me.sessionId)
      return done(reply(200, { ok: true }))
    }

    default:
      return done(fail(400, 'unknown_action', 'Unknown action.'))
  }
}
