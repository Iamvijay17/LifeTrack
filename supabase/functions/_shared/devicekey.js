// GENERATED from packages/core/src/devicekey.js by scripts/sync-function-core.mjs — do not edit; change the source and re-run the script.
// Device keys: what the server checks when a PHONE unlocks the app lock with its fingerprint or face.
//
// The phone holds an ECDSA P-256 private key that its operating system releases only after a biometric check (Android Keystore + BiometricPrompt, iOS
// Keychain + Face ID / Touch ID, "biometry current set"); the server holds the public half. This module defines what the phone signs and verifies the
// signature, on WebCrypto only, so the SAME file runs in Deno (the `device-key` Edge Function), in Node (the tests) and in the apps. It is copied to
// supabase/functions/_shared by scripts/sync-function-core.mjs.
//
// What is signed (UTF-8 text; the fields are joined by "|", which none of them can contain):
//   lifetrack-device-key/v1|enroll|<challenge>|<x>|<y>                proof of possession, when a phone is added
//   lifetrack-device-key/v1|unlock|<challenge>|<keyId>|<counter>      one unlock
// The challenge is one-time and bound to the user and the session by the server, so a signature cannot be replayed, or carried to another session. The
// counter must move forward on every unlock: a copy of the key falls behind (or runs ahead of) the original, and is noticed.
//
// Signature format: ASN.1 DER ECDSA over SHA-256 of the message, as base64url. That is what Android's Signature("SHA256withECDSA") and iOS's
// ecdsaSignatureMessageX962SHA256 produce, so a hardware-resident native key can replace the JavaScript one without the server noticing.
//
// The caller is responsible for what this module cannot know: that the challenge was issued to THIS user and session and is being consumed once, and who
// the user is. Failures are WebAuthnError (the type webauthn.js throws), so a caller has one error to catch.

import { WebAuthnError, b64uDecode, b64uEncode, derToRaw } from './webauthn.js'

export const DEVICE_KEY_CONTEXT = 'lifetrack-device-key/v1'

const fail = (code, message) => {
  throw new WebAuthnError(code, message)
}

// ------------------------------------------------------------------------------------------------------ keys
const canonical = (v) => {
  // A P-256 coordinate is exactly 32 bytes. Re-encoding catches a non-canonical base64url spelling of the same bytes: it would give the same key a
  // second thumbprint, and a second row.
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(v)) return false
  try {
    return b64uEncode(b64uDecode(v)) === v
  } catch {
    return false
  }
}

/** The public key reduced to exactly what is stored and signed over (no private part, no other members). Throws 'bad_key'. */
export function normalizePublicKey(jwk) {
  if (!jwk || typeof jwk !== 'object' || jwk.kty !== 'EC' || jwk.crv !== 'P-256') fail('bad_key', 'Expected an EC P-256 public key.')
  // A private key must never be accepted, even by accident: it would be stored.
  if ('d' in jwk) fail('bad_key', 'That is a private key. Send the public key only.')
  if (!canonical(jwk.x) || !canonical(jwk.y)) fail('bad_key', 'The key coordinates are not 32 bytes of base64url.')
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }
}

/** RFC 7638 thumbprint: SHA-256 of the required members in lexicographic order, base64url. The same key always gets the same one. */
export async function jwkThumbprint(jwk) {
  const k = normalizePublicKey(jwk)
  const json = `{"crv":"${k.crv}","kty":"${k.kty}","x":"${k.x}","y":"${k.y}"}`
  return b64uEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))))
}

// ------------------------------------------------------------------------------------------------------ what is signed
const field = (v, what) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(v) ? v : fail('bad_request', `Bad ${what}.`))

/** A counter the phone may send: a whole number from 1 (the server starts at 0 and requires it to move forward). */
export const isCounter = (n) => Number.isSafeInteger(n) && n >= 1

export function enrollMessage({ challenge, publicKeyJwk }) {
  const k = normalizePublicKey(publicKeyJwk)
  return [DEVICE_KEY_CONTEXT, 'enroll', field(challenge, 'challenge'), k.x, k.y].join('|')
}

export function unlockMessage({ challenge, keyId, counter }) {
  if (!isCounter(counter)) fail('bad_request', 'Bad counter.')
  return [DEVICE_KEY_CONTEXT, 'unlock', field(challenge, 'challenge'), field(keyId, 'key id'), counter].join('|')
}

// ------------------------------------------------------------------------------------------------------ verification
/**
 * Checks that `signature` (base64url DER) is this public key's ECDSA P-256 / SHA-256 signature over `message`.
 * Resolves on success; throws WebAuthnError 'bad_key' | 'bad_encoding' | 'bad_signature' otherwise.
 */
export async function verifyDeviceSignature({ publicKeyJwk, message, signature }) {
  const jwk = normalizePublicKey(publicKeyJwk)
  let key
  try {
    key = await crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']) // rejects points off the curve
  } catch {
    return fail('bad_key', 'The public key is not valid.')
  }
  const raw = derToRaw(b64uDecode(signature))
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, new TextEncoder().encode(message))
  if (!ok) fail('bad_signature', 'The signature does not match.')
}
