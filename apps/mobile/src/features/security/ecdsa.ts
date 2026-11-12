import { b64uEncode } from '@lifetrack/core/webauthn'

// ES256 (ECDSA P-256 over SHA-256) for the phone's device key, in plain JavaScript on @noble/curves.
//
// Why JavaScript: React Native's Hermes has no WebCrypto, and Expo has no API that creates or signs with a hardware-resident EC key. What the operating system
// does protect is the secret itself (see deviceKey.ts: it is sealed by expo-secure-store behind the user's biometrics, so only a fingerprint or face check
// can release it). The server contract does not depend on this: it verifies an ASN.1 DER ECDSA signature, exactly what Android's Keystore and iOS's
// SecKey produce, so a native hardware key could replace this file without any server change.
//
// The curve code is imported lazily: nothing is evaluated until a phone key is created or used, so it costs the app's start-up nothing.

type P256 = (typeof import('@noble/curves/nist.js'))['p256']
let curve: Promise<P256> | null = null
const p256 = () => (curve ??= import('@noble/curves/nist.js').then((m) => m.p256))

export interface DevicePublicJwk { kty: 'EC'; crv: 'P-256'; x: string; y: string }

/** Messages are ASCII by construction (@lifetrack/core/devicekey only lets [A-Za-z0-9_-] and "|" through), so a charCode copy is a faithful UTF-8. */
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

/**
 * A new key pair. `entropy` must come from the operating system's CSPRNG (expo-crypto); it is the only randomness used. 48 bytes, so the reduction
 * into the curve's order is unbiased.
 */
export async function generateKeyPair(entropy: Uint8Array): Promise<{ secretKey: Uint8Array; publicKeyJwk: DevicePublicJwk }> {
  if (entropy.length < 40) throw new Error('Not enough randomness to make a key.')
  const c = await p256()
  const secretKey = c.utils.randomSecretKey(entropy)
  return { secretKey, publicKeyJwk: await publicJwk(secretKey) }
}

/** The public half as a JWK: the 65-byte uncompressed point 04 ‖ X ‖ Y, split into its two 32-byte coordinates. */
export async function publicJwk(secretKey: Uint8Array): Promise<DevicePublicJwk> {
  const point = (await p256()).getPublicKey(secretKey, false)
  return { kty: 'EC', crv: 'P-256', x: b64uEncode(point.subarray(1, 33)), y: b64uEncode(point.subarray(33, 65)) }
}

/** An ASN.1 DER ECDSA signature over SHA-256 of the message, as base64url. Deterministic (RFC 6979): signing needs no randomness. */
export async function signMessage(secretKey: Uint8Array, message: string): Promise<string> {
  const sig = (await p256()).sign(ascii(message), secretKey, { prehash: true, format: 'der' })
  return b64uEncode(sig)
}
