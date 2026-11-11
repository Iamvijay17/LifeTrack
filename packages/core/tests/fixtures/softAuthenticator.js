// A software WebAuthn authenticator for tests. It produces what a real platform authenticator (Touch ID, Windows Hello) produces: an attestation
// object with CBOR authenticator data and a COSE key at registration, and a DER-encoded signature over authData ‖ SHA-256(clientDataJSON) later.
// It is built on node:crypto, independently of the verifier under test (which uses WebCrypto), so the two cannot share a bug.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'

const b64u = (buf) => Buffer.from(buf).toString('base64url')

// ---- a tiny CBOR encoder, enough for attestation objects
function cbor(v) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n])
    if (n < 256) return Buffer.from([(major << 5) | 24, n])
    if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
    const b = Buffer.alloc(5)
    b[0] = (major << 5) | 26
    b.writeUInt32BE(n, 1)
    return b
  }
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v)
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)])
  // Realm-agnostic checks: under jsdom a Node Buffer is not `instanceof` the test realm's Uint8Array.
  if (ArrayBuffer.isView(v)) return Buffer.concat([head(2, v.length), Buffer.from(v)])
  if (Object.prototype.toString.call(v) === '[object Map]') return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])])
  throw new Error(`cbor: unsupported ${typeof v}`)
}

export const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40 }

/**
 * @param alg   -7 (ES256, like Touch ID / Android) or -257 (RS256, like Windows Hello with a TPM)
 * @param rpId, origin   where the "browser" thinks it is
 */
export function softAuthenticator({ alg = -7, rpId = 'lifetrack.test', origin = 'https://lifetrack.test', signCount = 0, counts = true } = {}) {
  const { publicKey, privateKey } = alg === -7 ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' }) : generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' })
  const credentialId = randomBytes(32)
  const cose =
    alg === -7
      ? new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])
      : new Map([[1, 3], [3, -257], [-1, Buffer.from(jwk.n, 'base64url')], [-2, Buffer.from(jwk.e, 'base64url')]])
  let counter = signCount

  const clientData = (type, challenge, extra = {}) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...extra }))
  const flagsByte = (flags) => Buffer.from([flags])
  const counterBytes = (n) => {
    const b = Buffer.alloc(4)
    b.writeUInt32BE(n)
    return b
  }
  const rpHash = (id = rpId) => createHash('sha256').update(id).digest()

  const self = {
    credentialId: b64u(credentialId),
    publicKeyJwk: jwk,
    /** Mutable knobs a test can turn to simulate misbehaviour. */
    tamper: {},
    register(challenge, { flags = FLAGS.UP | FLAGS.UV | FLAGS.AT, rp = rpId, extra, fmt = 'none' } = {}) {
      const idLen = Buffer.alloc(2)
      idLen.writeUInt16BE(credentialId.length)
      const authData = Buffer.concat([rpHash(rp), flagsByte(flags), counterBytes(counter), Buffer.alloc(16), idLen, credentialId, cbor(cose)])
      const attestationObject = cbor(new Map([['fmt', fmt], ['attStmt', new Map()], ['authData', authData]]))
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: 'public-key',
        response: { clientDataJSON: b64u(clientData('webauthn.create', challenge, extra)), attestationObject: b64u(attestationObject) },
      }
    },
    assert(challenge, { flags = FLAGS.UP | FLAGS.UV, rp = rpId, extra, type = 'webauthn.get', corruptSignature = false } = {}) {
      if (counts) counter += 1
      const authData = Buffer.concat([rpHash(rp), flagsByte(flags), counterBytes(counter)])
      const cd = clientData(type, challenge, extra)
      const signed = Buffer.concat([authData, createHash('sha256').update(cd).digest()])
      const signature = sign('sha256', signed, privateKey) // ECDSA → DER; RSA → PKCS#1 v1.5, exactly what authenticators send
      if (corruptSignature) signature[signature.length - 1] ^= 1
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: 'public-key',
        response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: null },
      }
    },
    get counter() {
      return counter
    },
    set counter(n) {
      counter = n
    },
  }
  return self
}
