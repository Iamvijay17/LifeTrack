// Passkey (WebAuthn) verification, on WebCrypto only: no dependencies, so the SAME file runs in Deno (the `webauthn` Edge Function), in Node (tests)
// and in the browser (the in-browser dev backend). It is copied to supabase/functions/_shared by scripts/sync-function-core.mjs.
//
// Trust model: we ask for attestation "none". We do NOT learn which authenticator model made a key, and we do not need to: the key only has to
// prove that the person at the device can do what they did at registration (touch the sensor / enter the device PIN). Everything the spec requires
// of a relying party for "none" is checked here: challenge, origin, RP ID hash, user-presence and user-verification flags, algorithm, the key
// itself, the signature over (authenticatorData ‖ SHA-256(clientDataJSON)), and the signature counter. The caller is responsible for the two things
// this module cannot know: that the challenge was issued by us to THIS user and is single-use, and who the user is.
//
// All binary values travel as base64url strings, exactly as `toJSON()` of the browser's credential objects produces them.

export class WebAuthnError extends Error {
  constructor(code, message) {
    super(message ?? code)
    this.name = 'WebAuthnError'
    this.code = code
  }
}
const fail = (code, message) => {
  throw new WebAuthnError(code, message)
}

// ------------------------------------------------------------------------------------------------------ bytes
export const b64uEncode = (bytes) => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const b64uDecode = (str) => {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) fail('bad_encoding', 'Expected a base64url string.')
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
const utf8 = (u8) => new TextDecoder('utf-8', { fatal: true }).decode(u8)
const sha256 = async (data) => new Uint8Array(await crypto.subtle.digest('SHA-256', data))
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
const equalBytes = (a, b) => {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]
  return r === 0
}
const equalText = (a, b) => typeof a === 'string' && typeof b === 'string' && equalBytes(new TextEncoder().encode(a), new TextEncoder().encode(b))

/** A fresh 32-byte random challenge as base64url. */
export const generateChallenge = () => b64uEncode(crypto.getRandomValues(new Uint8Array(32)))

// ------------------------------------------------------------------------------------------------------ CBOR (decoder only)
// Enough of RFC 8949 to read an attestation object: definite lengths, ints, byte/text strings, arrays, maps (kept as Map so integer keys survive).
function decodeCbor(u8, start = 0) {
  let o = start
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const need = (n) => {
    if (o + n > u8.length) fail('bad_cbor', 'Truncated CBOR.')
  }
  const readLen = (info) => {
    if (info < 24) return info
    if (info === 24) {
      need(1)
      return u8[o++]
    }
    if (info === 25) {
      need(2)
      o += 2
      return view.getUint16(o - 2)
    }
    if (info === 26) {
      need(4)
      o += 4
      return view.getUint32(o - 4)
    }
    if (info === 27) {
      need(8)
      o += 8
      const n = view.getBigUint64(o - 8)
      if (n > BigInt(Number.MAX_SAFE_INTEGER)) fail('bad_cbor', 'Number too large.')
      return Number(n)
    }
    return fail('bad_cbor', 'Indefinite or reserved CBOR length.')
  }
  const read = (depth) => {
    if (depth > 8) fail('bad_cbor', 'CBOR nested too deeply.')
    need(1)
    const head = u8[o++]
    const major = head >> 5
    const info = head & 31
    if (major === 7) {
      if (info === 20) return false
      if (info === 21) return true
      if (info === 22 || info === 23) return null
      if (info === 25) {
        need(2)
        o += 2
        return NaN // half-precision floats are never needed here; skip over them
      }
      if (info === 26) {
        need(4)
        o += 4
        return view.getFloat32(o - 4)
      }
      if (info === 27) {
        need(8)
        o += 8
        return view.getFloat64(o - 8)
      }
      return fail('bad_cbor', 'Unsupported CBOR simple value.')
    }
    const n = readLen(info)
    switch (major) {
      case 0:
        return n
      case 1:
        return -1 - n
      case 2:
      case 3: {
        need(n)
        const bytes = u8.subarray(o, o + n)
        o += n
        return major === 2 ? bytes : utf8(bytes)
      }
      case 4: {
        if (n > u8.length) fail('bad_cbor', 'CBOR array larger than its input.')
        return Array.from({ length: n }, () => read(depth + 1))
      }
      case 5: {
        if (n > u8.length) fail('bad_cbor', 'CBOR map larger than its input.')
        const map = new Map()
        for (let i = 0; i < n; i++) {
          const k = read(depth + 1)
          map.set(k, read(depth + 1))
        }
        return map
      }
      default:
        return read(depth + 1) // major 6: a tag; its content is what we want
    }
  }
  const value = read(0)
  return { value, end: o }
}

// ------------------------------------------------------------------------------------------------------ authenticator data
const FLAG = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40, ED: 0x80 }
const ES256 = -7
const RS256 = -257
export const SUPPORTED_ALGS = [ES256, RS256]

function parseAuthData(authData, { withKey = false } = {}) {
  if (authData.length < 37) fail('bad_auth_data', 'Authenticator data is too short.')
  const view = new DataView(authData.buffer, authData.byteOffset, authData.byteLength)
  const flags = authData[32]
  const out = { rpIdHash: authData.subarray(0, 32), flags, signCount: view.getUint32(33), up: !!(flags & FLAG.UP), uv: !!(flags & FLAG.UV) }
  out.backupEligible = !!(flags & FLAG.BE)
  out.backedUp = !!(flags & FLAG.BS)
  if (out.backedUp && !out.backupEligible) fail('bad_auth_data', 'Backup state without backup eligibility.')
  if (withKey) {
    if (!(flags & FLAG.AT)) fail('no_credential', 'The response carries no credential.')
    if (authData.length < 55) fail('bad_auth_data', 'Authenticator data is too short.')
    const idLen = view.getUint16(53)
    if (idLen < 16 || idLen > 1023 || authData.length < 55 + idLen) fail('bad_auth_data', 'Credential ID has an impossible length.')
    out.credentialId = authData.subarray(55, 55 + idLen)
    out.aaguid = b64uEncode(authData.subarray(37, 53))
    const { value } = decodeCbor(authData, 55 + idLen)
    if (!(value instanceof Map)) fail('bad_key', 'The credential public key is not a COSE key.')
    out.cose = value
  }
  return out
}

/** COSE key → JWK, for the two algorithms we ask for (ES256 and RS256) and nothing else. */
function coseToJwk(cose) {
  const alg = cose.get(3)
  const bytes = (k) => {
    const v = cose.get(k)
    return v instanceof Uint8Array ? v : fail('bad_key', 'The credential public key is incomplete.')
  }
  if (alg === ES256) {
    if (cose.get(1) !== 2 || cose.get(-1) !== 1) fail('bad_key', 'Expected a P-256 key for ES256.')
    const x = bytes(-2)
    const y = bytes(-3)
    if (x.length !== 32 || y.length !== 32) fail('bad_key', 'Bad P-256 coordinate length.')
    return { alg, jwk: { kty: 'EC', crv: 'P-256', x: b64uEncode(x), y: b64uEncode(y), ext: true } }
  }
  if (alg === RS256) {
    if (cose.get(1) !== 3) fail('bad_key', 'Expected an RSA key for RS256.')
    const n = bytes(-1)
    const e = bytes(-2)
    if (n.length < 256) fail('bad_key', 'RSA key is shorter than 2048 bits.')
    return { alg, jwk: { kty: 'RSA', alg: 'RS256', n: b64uEncode(n), e: b64uEncode(e), ext: true } }
  }
  return fail('unsupported_alg', 'This authenticator uses a signature algorithm LifeTrack does not accept.')
}
const importParams = (alg) => (alg === ES256 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' })
const importKey = (jwk, alg) => crypto.subtle.importKey('jwk', jwk, importParams(alg), false, ['verify'])

/** WebCrypto's ECDSA wants r‖s (64 bytes); authenticators send an ASN.1 DER SEQUENCE of two INTEGERs. Also used for the phone's device keys (devicekey.js). */
export function derToRaw(der, size = 32) {
  const bad = () => fail('bad_signature', 'Malformed ECDSA signature.')
  let o = 0
  const len = () => {
    let l = der[o++]
    if (l & 0x80) {
      const n = l & 0x7f
      if (n < 1 || n > 2) bad()
      l = 0
      for (let i = 0; i < n; i++) l = (l << 8) | der[o++]
    }
    return l
  }
  if (der[o++] !== 0x30) bad()
  if (len() !== der.length - o) bad()
  const ints = []
  for (let i = 0; i < 2; i++) {
    if (der[o++] !== 0x02) bad()
    const l = len()
    let v = der.subarray(o, o + l)
    o += l
    while (v.length > size && v[0] === 0) v = v.subarray(1)
    if (v.length > size) bad()
    ints.push(v)
  }
  if (o !== der.length) bad()
  const raw = new Uint8Array(size * 2)
  raw.set(ints[0], size - ints[0].length)
  raw.set(ints[1], size * 2 - ints[1].length)
  return raw
}

// ------------------------------------------------------------------------------------------------------ client data
/** The challenge inside a response's clientDataJSON: the caller looks it up (and consumes it) BEFORE verifying. */
export function challengeOf(clientDataJSON) {
  try {
    const c = JSON.parse(utf8(b64uDecode(clientDataJSON)))
    return typeof c.challenge === 'string' ? c.challenge : null
  } catch {
    return null
  }
}

function checkClientData(clientDataJSON, { type, expectedChallenge, origins }) {
  let c
  try {
    c = JSON.parse(utf8(b64uDecode(clientDataJSON)))
  } catch {
    return fail('bad_client_data', 'The client data is not valid JSON.')
  }
  if (c.type !== type) fail('wrong_ceremony', `Expected a "${type}" response.`)
  if (!equalText(c.challenge, expectedChallenge)) fail('challenge_mismatch', 'The challenge does not match.')
  if (typeof c.origin !== 'string' || !origins.includes(c.origin)) fail('origin_mismatch', 'This request came from an origin LifeTrack does not accept.')
  if (c.crossOrigin === true || c.topOrigin !== undefined) fail('origin_mismatch', 'Cross-origin passkey requests are not accepted.')
}

async function checkRpAndFlags(parsed, { rpId, requireUserVerification }) {
  const hash = await sha256(new TextEncoder().encode(rpId))
  if (!equalBytes(parsed.rpIdHash, hash)) fail('rp_mismatch', 'The passkey was made for a different site.')
  if (!parsed.up) fail('no_user_presence', 'The authenticator did not confirm a user was present.')
  if (requireUserVerification && !parsed.uv) fail('no_user_verification', 'The authenticator did not verify the user (fingerprint, face or device PIN).')
}

// ------------------------------------------------------------------------------------------------------ the two ceremonies
/**
 * Registration. `credential` is the browser's PublicKeyCredential as JSON (id, response.clientDataJSON, response.attestationObject, base64url).
 * Returns what to store: { credentialId, publicKeyJwk, alg, signCount, backedUp, deviceType, aaguid }. Throws WebAuthnError otherwise.
 */
export async function verifyRegistration({ credential, expectedChallenge, rpId, origins, requireUserVerification = true }) {
  const r = credential?.response
  if (!r || typeof credential.id !== 'string') fail('bad_request', 'Missing credential.')
  checkClientData(r.clientDataJSON, { type: 'webauthn.create', expectedChallenge, origins })
  const att = decodeCbor(b64uDecode(r.attestationObject)).value
  const authData = att instanceof Map ? att.get('authData') : null
  if (!(authData instanceof Uint8Array)) fail('bad_attestation', 'The attestation object has no authenticator data.')
  const parsed = parseAuthData(authData, { withKey: true })
  await checkRpAndFlags(parsed, { rpId, requireUserVerification })
  if (b64uEncode(parsed.credentialId) !== credential.id) fail('id_mismatch', 'The credential ID does not match the authenticator data.')
  const { alg, jwk } = coseToJwk(parsed.cose)
  try {
    await importKey(jwk, alg) // rejects points that are not on the curve, malformed moduli, …
  } catch {
    fail('bad_key', 'The credential public key is not valid.')
  }
  return {
    credentialId: credential.id,
    publicKeyJwk: jwk,
    alg,
    signCount: parsed.signCount,
    backedUp: parsed.backedUp,
    deviceType: parsed.backupEligible ? 'multiDevice' : 'singleDevice',
    aaguid: parsed.aaguid,
  }
}

/**
 * Sign-in with a stored credential. `stored` is { publicKeyJwk, alg, signCount } as returned by verifyRegistration.
 * Returns { signCount, backedUp }; the caller must save the new count and reject the sign-in if saving finds a stale one (cloned authenticator).
 */
export async function verifyAuthentication({ credential, expectedChallenge, rpId, origins, stored, requireUserVerification = true }) {
  const r = credential?.response
  if (!r || typeof credential.id !== 'string') fail('bad_request', 'Missing credential.')
  checkClientData(r.clientDataJSON, { type: 'webauthn.get', expectedChallenge, origins })
  const authData = b64uDecode(r.authenticatorData)
  const parsed = parseAuthData(authData)
  await checkRpAndFlags(parsed, { rpId, requireUserVerification })

  const clientHash = await sha256(b64uDecode(r.clientDataJSON))
  const signed = concat(authData, clientHash)
  let sig = b64uDecode(r.signature)
  if (stored.alg === ES256) sig = derToRaw(sig)
  let key
  try {
    key = await importKey(stored.publicKeyJwk, stored.alg)
  } catch {
    return fail('bad_key', 'The stored public key is not valid.')
  }
  const ok = await crypto.subtle.verify(stored.alg === ES256 ? { name: 'ECDSA', hash: 'SHA-256' } : importParams(RS256), key, sig, signed)
  if (!ok) fail('bad_signature', 'The signature does not match.')

  // A counter that does not move forward means the credential may have been copied. Authenticators that do not count (Apple, Google passkeys) stay at 0.
  if ((parsed.signCount !== 0 || stored.signCount !== 0) && parsed.signCount <= stored.signCount) {
    fail('counter_regressed', 'This passkey looks cloned: its counter went backwards.')
  }
  return { signCount: parsed.signCount, backedUp: parsed.backedUp }
}

// ------------------------------------------------------------------------------------------------------ options for the browser
/** Options for navigator.credentials.create(), JSON-safe. A platform authenticator that must verify the user = fingerprint / face / device PIN. */
export function registrationOptions({ rpId, rpName, user, challenge, excludeCredentialIds = [], timeout = 60_000 }) {
  return {
    rp: { id: rpId, name: rpName },
    user: { id: user.id, name: user.name, displayName: user.displayName ?? user.name },
    challenge,
    pubKeyCredParams: SUPPORTED_ALGS.map((alg) => ({ type: 'public-key', alg })),
    timeout,
    attestation: 'none',
    excludeCredentials: excludeCredentialIds.map((id) => ({ type: 'public-key', id })),
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
  }
}
/** Options for navigator.credentials.get(), JSON-safe. `allowCredentials` limits the prompt to this user's own passkeys. */
export function authenticationOptions({ rpId, challenge, credentialIds, timeout = 60_000 }) {
  return {
    rpId,
    challenge,
    timeout,
    userVerification: 'required',
    allowCredentials: credentialIds.map((id) => ({ type: 'public-key', id })),
  }
}
