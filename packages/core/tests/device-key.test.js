import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DEVICE_KEY_CONTEXT, enrollMessage, isCounter, jwkThumbprint, normalizePublicKey, unlockMessage, verifyDeviceSignature } from '../src/devicekey'
import { WebAuthnError, b64uEncode } from '../src/webauthn'
import { softDeviceKey } from './fixtures/softDeviceKey'

const CHALLENGE = 'q3F1x9Zb0m5T2yQw8nLr4VhJkS7dGcPaE6uXoNt1BiA' // 43 characters, like generateChallenge()
const KEY_ID = '3f1c5a2e-7b9d-4c1a-8e6f-0a1b2c3d4e5f'
const code = async (p) => {
  try {
    await p
    return null
  } catch (e) {
    expect(e).toBeInstanceOf(WebAuthnError)
    return e.code
  }
}

describe('the public key', () => {
  const k = softDeviceKey()
  it('is reduced to the four members that are stored and signed over', () => {
    expect(normalizePublicKey({ ...k.publicKeyJwk, alg: 'ES256', ext: true, kid: 'x', key_ops: ['verify'] })).toEqual(k.publicKeyJwk)
  })
  it('is refused when it is private, the wrong curve or type, or malformed', () => {
    const bad = (jwk) => {
      try {
        normalizePublicKey(jwk)
        return null
      } catch (e) {
        return e.code
      }
    }
    expect(bad({ ...k.publicKeyJwk, d: 'c2VjcmV0' })).toBe('bad_key') // a private key must never be stored
    expect(bad({ ...k.publicKeyJwk, crv: 'P-384' })).toBe('bad_key')
    expect(bad({ ...k.publicKeyJwk, kty: 'RSA' })).toBe('bad_key')
    expect(bad({ ...k.publicKeyJwk, x: k.publicKeyJwk.x.slice(1) })).toBe('bad_key') // 31 bytes
    expect(bad({ ...k.publicKeyJwk, y: `${k.publicKeyJwk.y}A` })).toBe('bad_key') // 33 bytes
    expect(bad({ ...k.publicKeyJwk, x: 'A'.repeat(42) + '!' })).toBe('bad_key') // not base64url
    expect(bad({ ...k.publicKeyJwk, x: `${'A'.repeat(42)}B` })).toBe('bad_key') // non-canonical spelling of 32 bytes: would give the same key a second thumbprint
    expect(bad({ kty: 'EC', crv: 'P-256' })).toBe('bad_key')
    for (const v of [null, undefined, 'key', 42, []]) expect(bad(v), String(v)).toBe('bad_key')
  })
  it('has an RFC 7638 thumbprint that is stable, one-to-one with the key, and independent of member order', async () => {
    const { x, y } = k.publicKeyJwk
    const reference = b64uEncode(createHash('sha256').update(`{"crv":"P-256","kty":"EC","x":"${x}","y":"${y}"}`).digest()) // computed independently, by the RFC's recipe
    expect(await jwkThumbprint(k.publicKeyJwk)).toBe(reference)
    expect(await jwkThumbprint({ y, x, crv: 'P-256', kty: 'EC', ext: true, alg: 'ES256' })).toBe(reference)
    expect(reference).toHaveLength(43)
    expect(await jwkThumbprint(softDeviceKey().publicKeyJwk)).not.toBe(reference)
  })
})

describe('what is signed', () => {
  const k = softDeviceKey()
  it('is plain text with the context, the purpose and the one-time challenge in it', () => {
    expect(DEVICE_KEY_CONTEXT).toBe('lifetrack-device-key/v1')
    expect(unlockMessage({ challenge: CHALLENGE, keyId: KEY_ID, counter: 7 })).toBe(`lifetrack-device-key/v1|unlock|${CHALLENGE}|${KEY_ID}|7`)
    expect(enrollMessage({ challenge: CHALLENGE, publicKeyJwk: k.publicKeyJwk })).toBe(`lifetrack-device-key/v1|enroll|${CHALLENGE}|${k.publicKeyJwk.x}|${k.publicKeyJwk.y}`)
  })
  it('cannot be confused between purposes: an enrolment can never be read as an unlock, nor the other way round', () => {
    expect(enrollMessage({ challenge: CHALLENGE, publicKeyJwk: k.publicKeyJwk })).not.toBe(unlockMessage({ challenge: CHALLENGE, keyId: KEY_ID, counter: 1 }))
  })
  it('refuses a field that could smuggle in a separator, or a counter that is not a positive whole number', () => {
    const sig = (fn) => {
      try {
        fn()
        return null
      } catch (e) {
        return e.code
      }
    }
    expect(sig(() => unlockMessage({ challenge: 'a|b', keyId: KEY_ID, counter: 1 }))).toBe('bad_request')
    expect(sig(() => unlockMessage({ challenge: CHALLENGE, keyId: `${KEY_ID}|2`, counter: 1 }))).toBe('bad_request')
    expect(sig(() => unlockMessage({ challenge: '', keyId: KEY_ID, counter: 1 }))).toBe('bad_request')
    expect(sig(() => unlockMessage({ challenge: CHALLENGE, keyId: null, counter: 1 }))).toBe('bad_request')
    for (const counter of [0, -1, 1.5, NaN, '3', null, Number.MAX_SAFE_INTEGER + 1]) expect(sig(() => unlockMessage({ challenge: CHALLENGE, keyId: KEY_ID, counter })), String(counter)).toBe('bad_request')
    expect(isCounter(1)).toBe(true)
    expect(isCounter(Number.MAX_SAFE_INTEGER)).toBe(true)
    expect(isCounter(0)).toBe(false)
  })
})

describe('verifying a signature made by a phone', () => {
  const verify = (k, message, signature, jwk = k.publicKeyJwk) => verifyDeviceSignature({ publicKeyJwk: jwk, message, signature })

  it('accepts the enrolment proof and an unlock, signed by OpenSSL and checked by WebCrypto', async () => {
    const k = softDeviceKey()
    const e = k.enroll(CHALLENGE)
    expect(await code(verify(k, enrollMessage({ challenge: CHALLENGE, publicKeyJwk: e.publicKeyJwk }), e.signature))).toBeNull()
    const u = k.unlock(CHALLENGE, KEY_ID)
    expect(await code(verify(k, unlockMessage(u), u.signature))).toBeNull()
    expect(u.counter).toBe(1)
  })
  it('refuses a signature over anything else: another challenge, key id, counter or purpose', async () => {
    const k = softDeviceKey()
    const u = k.unlock(CHALLENGE, KEY_ID, { counter: 5 })
    const base = { challenge: CHALLENGE, keyId: KEY_ID, counter: 5 }
    expect(await code(verify(k, unlockMessage(base), u.signature))).toBeNull()
    expect(await code(verify(k, unlockMessage({ ...base, challenge: `${CHALLENGE.slice(1)}A` }), u.signature))).toBe('bad_signature')
    expect(await code(verify(k, unlockMessage({ ...base, keyId: '3f1c5a2e-7b9d-4c1a-8e6f-0a1b2c3d4e50' }), u.signature))).toBe('bad_signature')
    expect(await code(verify(k, unlockMessage({ ...base, counter: 6 }), u.signature))).toBe('bad_signature') // a lower counter cannot be claimed after the fact
    expect(await code(verify(k, enrollMessage({ challenge: CHALLENGE, publicKeyJwk: k.publicKeyJwk }), u.signature))).toBe('bad_signature')
  })
  it('refuses another phone\'s key, and a corrupted signature', async () => {
    const k = softDeviceKey(), other = softDeviceKey()
    const u = k.unlock(CHALLENGE, KEY_ID)
    expect(await code(verify(k, unlockMessage(u), u.signature, other.publicKeyJwk))).toBe('bad_signature')
    const bad = k.unlock(CHALLENGE, KEY_ID, { corruptSignature: true })
    expect(await code(verify(k, unlockMessage(bad), bad.signature))).toBe('bad_signature')
  })
  it('refuses signatures that are not well-formed DER ECDSA', async () => {
    const k = softDeviceKey()
    const u = k.unlock(CHALLENGE, KEY_ID)
    const msg = unlockMessage(u)
    const der = Buffer.from(u.signature, 'base64url')
    expect(await code(verify(k, msg, b64uEncode(der.subarray(0, der.length - 3))))).toBe('bad_signature') // truncated
    expect(await code(verify(k, msg, b64uEncode(Buffer.concat([der, Buffer.from([0])]))))).toBe('bad_signature') // trailing byte
    expect(await code(verify(k, msg, b64uEncode(Buffer.alloc(64, 7))))).toBe('bad_signature') // a raw r‖s blob is not DER
    expect(await code(verify(k, msg, b64uEncode(Buffer.from([0x30, 0x00]))))).toBe('bad_signature') // an empty SEQUENCE
    expect(await code(verify(k, msg, ''))).toBe('bad_signature')
    for (const s of ['not base64url!', null, undefined, 42]) expect(await code(verify(k, msg, s)), String(s)).toBe('bad_encoding')
  })
  it('refuses a public key that is not on the curve', async () => {
    const k = softDeviceKey()
    const u = k.unlock(CHALLENGE, KEY_ID)
    const off = { kty: 'EC', crv: 'P-256', x: b64uEncode(Buffer.alloc(32, 1)), y: b64uEncode(Buffer.alloc(32, 2)) }
    expect(await code(verify(k, unlockMessage(u), u.signature, off))).toBe('bad_key')
  })
  it('never needs, and never accepts, a private key', async () => {
    const k = softDeviceKey()
    const u = k.unlock(CHALLENGE, KEY_ID)
    expect(await code(verify(k, unlockMessage(u), u.signature, { ...k.publicKeyJwk, d: 'c2VjcmV0' }))).toBe('bad_key')
  })
  it('works for many different keys and messages (a signature is 70 to 72 bytes in DER, 64 raw: both lengths of r and s occur)', async () => {
    const lengths = new Set()
    for (let i = 0; i < 40; i++) {
      const k = softDeviceKey()
      const u = k.unlock(CHALLENGE, KEY_ID, { counter: i + 1 })
      lengths.add(Buffer.from(u.signature, 'base64url').length)
      expect(await code(verify(k, unlockMessage(u), u.signature))).toBeNull()
    }
    expect(lengths.size).toBeGreaterThan(1)
  })
})
