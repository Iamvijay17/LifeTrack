// The browser half of passkeys. It talks to the platform authenticator (Touch ID, Windows Hello, Android biometrics, or the device PIN) through
// navigator.credentials, and hands the result back as JSON for the server to check. JavaScript never sees a fingerprint or a face, and neither does
// LifeTrack: the browser only reports "the user was verified" inside a signed response.
import { b64uDecode, b64uEncode } from '@lifetrack/core/webauthn'

const buf = (s) => b64uDecode(s).buffer.slice(0) // a clean ArrayBuffer, as the API wants

/**
 * What this browser can do. `platform` is true when the device has its own fingerprint / face / PIN sensor to use.
 * Nothing here asks for a biometric; it only asks whether the browser supports the API.
 */
export async function passkeySupport() {
  if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
    return {
      supported: false,
      platform: false,
      reason: window?.isSecureContext === false ? 'Passkeys need a secure (https) connection.' : 'This browser does not support passkeys.',
    }
  }
  let platform = false
  try {
    platform = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    /* treat as unavailable */
  }
  return {
    supported: true,
    platform,
    reason: platform ? null : 'This device has no fingerprint, face or screen-lock sensor the browser can use.',
  }
}

const toJson = (cred, extra = {}) => {
  const r = cred.response
  return {
    id: cred.id,
    rawId: b64uEncode(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: b64uEncode(r.clientDataJSON),
      ...(r.attestationObject ? { attestationObject: b64uEncode(r.attestationObject) } : {}),
      ...(r.authenticatorData
        ? {
            authenticatorData: b64uEncode(r.authenticatorData),
            signature: b64uEncode(r.signature),
            userHandle: r.userHandle ? b64uEncode(r.userHandle) : null,
          }
        : {}),
    },
    ...extra,
  }
}

/** Runs the registration prompt. `options` is the server's JSON (base64url strings). Returns { credential, transports }. */
export async function createPasskey(options, { signal } = {}) {
  const cred = await navigator.credentials.create({
    signal,
    publicKey: {
      ...options,
      challenge: buf(options.challenge),
      user: { ...options.user, id: buf(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({ ...c, id: buf(c.id) })),
    },
  })
  if (!cred) throw Object.assign(new Error('No credential was created.'), { name: 'NotAllowedError' })
  return { credential: toJson(cred), transports: cred.response.getTransports?.() ?? [] }
}

/** Runs the sign-in prompt (fingerprint / face / device PIN). Returns the response as JSON. */
export async function getPasskey(options, { signal } = {}) {
  const cred = await navigator.credentials.get({
    signal,
    publicKey: {
      ...options,
      challenge: buf(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map((c) => ({ ...c, id: buf(c.id) })),
    },
  })
  if (!cred) throw Object.assign(new Error('No credential was returned.'), { name: 'NotAllowedError' })
  return toJson(cred)
}

/** Turns a WebAuthn failure into something a person can act on. `cancelled` means they dismissed the prompt: say nothing scary. */
export function explainPasskeyError(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'AbortError':
      return { cancelled: true, message: 'Cancelled, or it took too long.' }
    case 'InvalidStateError':
      return { cancelled: false, message: 'This device is already registered.' }
    case 'NotSupportedError':
      return { cancelled: false, message: 'This device cannot create the kind of key LifeTrack needs.' }
    case 'SecurityError':
      return { cancelled: false, message: 'The browser refused: this site address does not match the one set up for fingerprint unlock.' }
    default:
      return {
        cancelled: false,
        message: e?.message && e.message.length < 140 ? e.message : 'Something went wrong with the fingerprint or face unlock.',
      }
  }
}
