import { createPrivateKey, createPublicKey, randomBytes, verify, type JsonWebKey } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { b64uDecode } from '@lifetrack/core/webauthn'
import { enrollMessage, unlockMessage, verifyDeviceSignature } from '@lifetrack/core/devicekey'
import { generateKeyPair, publicJwk, signMessage } from '../src/features/security/ecdsa'

// The mobile app signs in JavaScript (@noble/curves); the server verifies with WebCrypto, and OpenSSL stands in here as a third, independent opinion.
const CHALLENGE = 'q3F1x9Zb0m5T2yQw8nLr4VhJkS7dGcPaE6uXoNt1BiA'
const KEY_ID = '3f1c5a2e-7b9d-4c1a-8e6f-0a1b2c3d4e5f'
const b64u = (u8: Uint8Array) => Buffer.from(u8).toString('base64url')

describe('the device key pair', () => {
  it('is made from operating-system entropy, and the same entropy always gives the same key', async () => {
    const entropy = randomBytes(48)
    const a = await generateKeyPair(entropy)
    const b = await generateKeyPair(entropy)
    expect(b64u(a.secretKey)).toBe(b64u(b.secretKey))
    expect(a.publicKeyJwk).toEqual(b.publicKeyJwk)
    expect(b64u((await generateKeyPair(randomBytes(48))).secretKey)).not.toBe(b64u(a.secretKey))
    expect(a.secretKey).toHaveLength(32)
  })
  it('refuses too little randomness rather than make a weak key', async () => {
    await expect(generateKeyPair(randomBytes(16))).rejects.toThrow(/randomness/)
    await expect(generateKeyPair(new Uint8Array(0))).rejects.toThrow(/randomness/)
  })
  it('has a public JWK that OpenSSL derives from the same secret: a P-256 point, two 32-byte coordinates, no private part', async () => {
    const { secretKey, publicKeyJwk } = await generateKeyPair(randomBytes(48))
    expect(Object.keys(publicKeyJwk).sort()).toEqual(['crv', 'kty', 'x', 'y'])
    expect(publicKeyJwk).toMatchObject({ kty: 'EC', crv: 'P-256' })
    expect(b64uDecode(publicKeyJwk.x)).toHaveLength(32)
    expect(b64uDecode(publicKeyJwk.y)).toHaveLength(32)
    const priv = createPrivateKey({ key: { ...publicKeyJwk, d: b64u(secretKey) } as JsonWebKey, format: 'jwk' })
    const expected = createPublicKey(priv).export({ format: 'jwk' })
    expect(publicKeyJwk.x).toBe(expected.x)
    expect(publicKeyJwk.y).toBe(expected.y)
    expect(await publicJwk(secretKey)).toEqual(publicKeyJwk)
  })
})

describe('signing', () => {
  it('produces ASN.1 DER ECDSA over SHA-256 that OpenSSL accepts (the format Keystore and SecKey produce too)', async () => {
    const { secretKey, publicKeyJwk } = await generateKeyPair(randomBytes(48))
    const message = unlockMessage({ challenge: CHALLENGE, keyId: KEY_ID, counter: 3 })
    const sig = Buffer.from(await signMessage(secretKey, message), 'base64url')
    expect(sig[0]).toBe(0x30) // a DER SEQUENCE
    expect(sig.length).toBeGreaterThanOrEqual(68)
    expect(sig.length).toBeLessThanOrEqual(72)
    expect(verify('sha256', Buffer.from(message), createPublicKey({ key: publicKeyJwk as JsonWebKey, format: 'jwk' }), sig)).toBe(true)
    expect(verify('sha256', Buffer.from(`${message}x`), createPublicKey({ key: publicKeyJwk as JsonWebKey, format: 'jwk' }), sig)).toBe(false)
  })
  it('is verified by the server\'s own check (WebCrypto), for the enrolment proof and for an unlock', async () => {
    const { secretKey, publicKeyJwk } = await generateKeyPair(randomBytes(48))
    const enroll = enrollMessage({ challenge: CHALLENGE, publicKeyJwk })
    await expect(verifyDeviceSignature({ publicKeyJwk, message: enroll, signature: await signMessage(secretKey, enroll) })).resolves.toBeUndefined()
    const unlock = unlockMessage({ challenge: CHALLENGE, keyId: KEY_ID, counter: 1 })
    const signature = await signMessage(secretKey, unlock)
    await expect(verifyDeviceSignature({ publicKeyJwk, message: unlock, signature })).resolves.toBeUndefined()
    // …and it means exactly that message, for exactly that key
    await expect(verifyDeviceSignature({ publicKeyJwk, message: unlockMessage({ challenge: CHALLENGE, keyId: KEY_ID, counter: 2 }), signature })).rejects.toMatchObject({ code: 'bad_signature' })
    const other = await generateKeyPair(randomBytes(48))
    await expect(verifyDeviceSignature({ publicKeyJwk: other.publicKeyJwk, message: unlock, signature })).rejects.toMatchObject({ code: 'bad_signature' })
  })
  it('is deterministic (RFC 6979): signing needs no random number generator, which Hermes does not provide', async () => {
    const { secretKey } = await generateKeyPair(randomBytes(48))
    const m = unlockMessage({ challenge: CHALLENGE, keyId: KEY_ID, counter: 9 })
    expect(await signMessage(secretKey, m)).toBe(await signMessage(secretKey, m))
  })
  it('works for many keys, whatever the lengths of r and s', async () => {
    const lengths = new Set<number>()
    for (let i = 0; i < 25; i++) {
      const { secretKey, publicKeyJwk } = await generateKeyPair(randomBytes(48))
      const m = unlockMessage({ challenge: CHALLENGE, keyId: KEY_ID, counter: i + 1 })
      const signature = await signMessage(secretKey, m)
      lengths.add(Buffer.from(signature, 'base64url').length)
      await verifyDeviceSignature({ publicKeyJwk, message: m, signature })
    }
    expect(lengths.size).toBeGreaterThan(1)
  })
})
