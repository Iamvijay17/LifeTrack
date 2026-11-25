import { describe, expect, it } from 'vitest'
import {
  authenticationOptions,
  b64uDecode,
  b64uEncode,
  challengeOf,
  generateChallenge,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration,
  WebAuthnError,
} from '../src/webauthn'
import { FLAGS, softAuthenticator } from './fixtures/softAuthenticator'

const RP = 'lifetrack.test'
const ORIGIN = 'https://lifetrack.test'
const base = { rpId: RP, origins: [ORIGIN] }
const codeOf = async (p) => {
  try {
    await p
    return null
  } catch (e) {
    expect(e).toBeInstanceOf(WebAuthnError)
    return e.code
  }
}

/** Registers a fresh authenticator and returns it with what the server would store. */
async function enrolled(opts) {
  const auth = softAuthenticator(opts)
  const challenge = generateChallenge()
  const reg = await verifyRegistration({ ...base, credential: auth.register(challenge), expectedChallenge: challenge })
  return { auth, reg, stored: { publicKeyJwk: reg.publicKeyJwk, alg: reg.alg, signCount: reg.signCount } }
}

describe.each([
  ['ES256 (Touch ID, Android)', -7],
  ['RS256 (Windows Hello with a TPM)', -257],
])('passkeys with %s', (_name, alg) => {
  it('registers, then signs in', async () => {
    const { auth, reg, stored } = await enrolled({ alg })
    expect(reg).toMatchObject({ credentialId: auth.credentialId, alg, signCount: 0, backedUp: false, deviceType: 'singleDevice' })
    const challenge = generateChallenge()
    const out = await verifyAuthentication({ ...base, credential: auth.assert(challenge), expectedChallenge: challenge, stored })
    expect(out.signCount).toBe(1)
  })

  it('rejects a signature made by a different key', async () => {
    const { stored } = await enrolled({ alg })
    const impostor = softAuthenticator({ alg })
    const challenge = generateChallenge()
    expect(await codeOf(verifyAuthentication({ ...base, credential: impostor.assert(challenge), expectedChallenge: challenge, stored }))).toBe('bad_signature')
  })

  it('rejects a corrupted signature', async () => {
    const { auth, stored } = await enrolled({ alg })
    const challenge = generateChallenge()
    const credential = auth.assert(challenge, { corruptSignature: true })
    expect(await codeOf(verifyAuthentication({ ...base, credential, expectedChallenge: challenge, stored }))).toBe('bad_signature')
  })
})

describe('registration checks', () => {
  const attempt = (mutate, options = {}) => {
    const auth = softAuthenticator()
    const challenge = generateChallenge()
    return verifyRegistration({ ...base, credential: auth.register(challenge, options), expectedChallenge: mutate?.challenge ?? challenge, ...mutate?.args })
  }
  it('accepts an authenticator that backs its keys up (a synced passkey) and says so', async () => {
    const auth = softAuthenticator()
    const c = generateChallenge()
    const reg = await verifyRegistration({ ...base, credential: auth.register(c, { flags: FLAGS.UP | FLAGS.UV | FLAGS.AT | FLAGS.BE | FLAGS.BS }), expectedChallenge: c })
    expect(reg).toMatchObject({ backedUp: true, deviceType: 'multiDevice' })
  })
  it('does not read the attestation statement, so any format registers the same way', async () => {
    expect(await attempt(null, { fmt: 'packed' })).toMatchObject({ alg: -7 })
  })
  it('rejects the wrong challenge', async () => expect(await codeOf(attempt({ challenge: generateChallenge() }))).toBe('challenge_mismatch'))
  it('rejects an origin that is not on the list', async () => {
    expect(await codeOf(attempt({ args: { origins: ['https://evil.test'] } }))).toBe('origin_mismatch')
  })
  it('rejects a credential made for another site (RP ID hash)', async () => expect(await codeOf(attempt(null, { rp: 'evil.test' }))).toBe('rp_mismatch'))
  it('rejects a registration where the user was not verified', async () => {
    expect(await codeOf(attempt(null, { flags: FLAGS.UP | FLAGS.AT }))).toBe('no_user_verification')
  })
  it('rejects a registration without user presence', async () => {
    expect(await codeOf(attempt(null, { flags: FLAGS.UV | FLAGS.AT }))).toBe('no_user_presence')
  })
  it('rejects a response that carries no credential', async () => {
    expect(await codeOf(attempt(null, { flags: FLAGS.UP | FLAGS.UV }))).toBe('no_credential')
  })
  it('rejects an assertion presented as a registration', async () => {
    const auth = softAuthenticator()
    const c = generateChallenge()
    const sneaky = auth.register(c, { extra: {} })
    sneaky.response.clientDataJSON = b64uEncode(new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: c, origin: ORIGIN })))
    expect(await codeOf(verifyRegistration({ ...base, credential: sneaky, expectedChallenge: c }))).toBe('wrong_ceremony')
  })
  it('rejects cross-origin frames', async () => {
    const auth = softAuthenticator()
    const c = generateChallenge()
    expect(await codeOf(verifyRegistration({ ...base, credential: auth.register(c, { extra: { crossOrigin: true } }), expectedChallenge: c }))).toBe('origin_mismatch')
    expect(await codeOf(verifyRegistration({ ...base, credential: auth.register(c, { extra: { topOrigin: ORIGIN } }), expectedChallenge: c }))).toBe('origin_mismatch')
  })
  it('rejects a credential id that is not the one in the authenticator data', async () => {
    const auth = softAuthenticator()
    const c = generateChallenge()
    const cred = auth.register(c)
    cred.id = b64uEncode(new Uint8Array(32).fill(7))
    expect(await codeOf(verifyRegistration({ ...base, credential: cred, expectedChallenge: c }))).toBe('id_mismatch')
  })
  it('rejects garbage without throwing anything but WebAuthnError', async () => {
    const c = generateChallenge()
    for (const credential of [null, {}, { id: 'x', response: {} }, { id: 'x', response: { clientDataJSON: '!!', attestationObject: '' } }]) {
      expect(await codeOf(verifyRegistration({ ...base, credential, expectedChallenge: c }))).toBeTruthy()
    }
    const auth = softAuthenticator()
    const cred = auth.register(c)
    cred.response.attestationObject = b64uEncode(new Uint8Array([0xbf, 0x00])) // indefinite-length map
    expect(await codeOf(verifyRegistration({ ...base, credential: cred, expectedChallenge: c }))).toBe('bad_cbor')
    cred.response.attestationObject = b64uEncode(new Uint8Array([0xa1, 0x64, 0x61])) // truncated
    expect(await codeOf(verifyRegistration({ ...base, credential: cred, expectedChallenge: c }))).toBe('bad_cbor')
  })
})

describe('sign-in checks', () => {
  const run = async (tweak = {}, assertOpts = {}, args = {}) => {
    const { auth, stored } = await enrolled()
    const challenge = generateChallenge()
    return verifyAuthentication({ ...base, credential: auth.assert(challenge, assertOpts), expectedChallenge: challenge, stored, ...args, ...tweak })
  }
  it('rejects a response to a different challenge (replay of an old sign-in)', async () => {
    expect(await codeOf(run({ expectedChallenge: generateChallenge() }))).toBe('challenge_mismatch')
  })
  it('rejects a registration presented as a sign-in', async () => expect(await codeOf(run({}, { type: 'webauthn.create' }))).toBe('wrong_ceremony'))
  it('rejects another origin', async () => expect(await codeOf(run({ origins: ['https://evil.test'] }))).toBe('origin_mismatch'))
  it('rejects another RP ID', async () => expect(await codeOf(run({}, { rp: 'evil.test' }))).toBe('rp_mismatch'))
  it('rejects a sign-in where the user was only present, not verified', async () => {
    expect(await codeOf(run({}, { flags: FLAGS.UP }))).toBe('no_user_verification')
    expect(await codeOf(run({ requireUserVerification: false }, { flags: FLAGS.UP }))).toBeNull()
  })
  it('rejects a response without user presence', async () => expect(await codeOf(run({}, { flags: FLAGS.UV }))).toBe('no_user_presence'))

  it('detects a cloned authenticator: the counter must go forward', async () => {
    const { auth, stored } = await enrolled({ signCount: 10 })
    const c = generateChallenge()
    const first = await verifyAuthentication({ ...base, credential: auth.assert(c), expectedChallenge: c, stored })
    expect(first.signCount).toBe(11)
    auth.counter = 5 // the copy has fallen behind
    const c2 = generateChallenge()
    expect(await codeOf(verifyAuthentication({ ...base, credential: auth.assert(c2), expectedChallenge: c2, stored: { ...stored, signCount: 11 } }))).toBe('counter_regressed')
    expect(await codeOf(verifyAuthentication({ ...base, credential: auth.assert(c2), expectedChallenge: c2, stored: { ...stored, signCount: auth.counter } }))).toBe('counter_regressed') // equal is not "forward"
  })
  it('accepts authenticators that never count (synced passkeys stay at 0)', async () => {
    const { auth, stored } = await enrolled({ counts: false })
    const c = generateChallenge()
    expect((await verifyAuthentication({ ...base, credential: auth.assert(c), expectedChallenge: c, stored })).signCount).toBe(0)
  })
  it('rejects malformed authenticator data and signatures', async () => {
    const { auth, stored } = await enrolled()
    const c = generateChallenge()
    const short = auth.assert(c)
    short.response.authenticatorData = b64uEncode(new Uint8Array(10))
    expect(await codeOf(verifyAuthentication({ ...base, credential: short, expectedChallenge: c, stored }))).toBe('bad_auth_data')
    const noSig = auth.assert(c)
    noSig.response.signature = b64uEncode(new Uint8Array([0x30, 0x02, 0x02, 0x00]))
    expect(await codeOf(verifyAuthentication({ ...base, credential: noSig, expectedChallenge: c, stored }))).toBe('bad_signature')
  })
  it('refuses a stored key it cannot use', async () => {
    const { auth, stored } = await enrolled()
    const c = generateChallenge()
    expect(await codeOf(verifyAuthentication({ ...base, credential: auth.assert(c), expectedChallenge: c, stored: { ...stored, publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'AA', y: 'AA' } } }))).toBe('bad_key')
  })
})

describe('helpers', () => {
  it('base64url round-trips every byte value and rejects other alphabets', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect([...b64uDecode(b64uEncode(all))]).toEqual([...all])
    expect(b64uEncode(new Uint8Array([251, 255]))).toBe('-_8')
    expect(() => b64uDecode('a+b/')).toThrow(WebAuthnError)
  })
  it('challenges are 32 random bytes, never repeated', () => {
    const a = generateChallenge()
    expect(b64uDecode(a)).toHaveLength(32)
    expect(generateChallenge()).not.toBe(a)
  })
  it('reads the challenge out of client data, or null', () => {
    const auth = softAuthenticator()
    expect(challengeOf(auth.assert('abc').response.clientDataJSON)).toBe('abc')
    expect(challengeOf('not base64url!')).toBeNull()
    expect(challengeOf(b64uEncode(new TextEncoder().encode('{}')))).toBeNull()
  })
  it('asks the browser for a platform authenticator that verifies the user, and no attestation', () => {
    const o = registrationOptions({ rpId: RP, rpName: 'LifeTrack', user: { id: 'u', name: 'a@b.c' }, challenge: 'c', excludeCredentialIds: ['x'] })
    expect(o).toMatchObject({
      attestation: 'none',
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      excludeCredentials: [{ type: 'public-key', id: 'x' }],
    })
    expect(o.pubKeyCredParams.map((p) => p.alg)).toEqual([-7, -257])
    expect(authenticationOptions({ rpId: RP, challenge: 'c', credentialIds: ['x'] })).toMatchObject({ userVerification: 'required', allowCredentials: [{ type: 'public-key', id: 'x' }] })
  })
})
