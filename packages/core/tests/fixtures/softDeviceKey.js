// A software "phone" for tests: what the mobile app's device key does, built on node:crypto (OpenSSL) so it is independent of the verifier under test
// (WebCrypto) and of the mobile app's own signer (@noble/curves). It writes the signed messages out by hand rather than importing the builders from
// src/devicekey.js, so a change to the wire format has to be made here too and cannot slip through.
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'

const CONTEXT = 'lifetrack-device-key/v1'
const b64u = (buf) => Buffer.from(buf).toString('base64url')

/** @param counter  where this phone's own signature counter starts (it adds 1 before every unlock) */
export function softDeviceKey({ counter = 0 } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const { x, y } = publicKey.export({ format: 'jwk' })
  let n = counter
  const signText = (text) => sign('sha256', Buffer.from(text), privateKey) // ECDSA → ASN.1 DER, what Keystore and SecKeyCreateSignature produce
  const flip = (sig) => {
    const copy = Buffer.from(sig)
    copy[copy.length - 1] ^= 1
    return copy
  }

  return {
    /** The public key, exactly as the app sends it. */
    publicKeyJwk: { kty: 'EC', crv: 'P-256', x, y },
    /** Proof of possession for adding this phone. */
    enroll(challenge, { corruptSignature = false, message } = {}) {
      const sig = signText(message ?? `${CONTEXT}|enroll|${challenge}|${x}|${y}`)
      return { challenge, publicKeyJwk: { kty: 'EC', crv: 'P-256', x, y }, signature: b64u(corruptSignature ? flip(sig) : sig) }
    },
    /** One unlock: bumps the phone's counter (unless `counter` is given), signs, and returns what the app sends. */
    unlock(challenge, keyId, { counter: c, corruptSignature = false, message } = {}) {
      const used = c ?? ++n
      const sig = signText(message ?? `${CONTEXT}|unlock|${challenge}|${keyId}|${used}`)
      return { keyId, challenge, counter: used, signature: b64u(corruptSignature ? flip(sig) : sig) }
    },
    /** A key id as the server would assign it. */
    newKeyId: () => randomUUID(),
    /** The phone's own counter, for tests that need to rewind or copy it. */
    get counter() {
      return n
    },
    set counter(v) {
      n = v
    },
  }
}
