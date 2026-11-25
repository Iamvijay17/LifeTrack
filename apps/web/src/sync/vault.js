// Encryption at rest for what LifeTrack keeps on the device (cached rows and queued changes). A random AES-GCM key is made once per browser
// profile and stored as a NON-EXTRACTABLE CryptoKey in IndexedDB: scripts and files on disk can use it only through this browser, and it can
// never be read out or copied. This does not stand in for the device's own lock: it keeps the data from sitting in the profile folder as
// readable text. It never holds the sign-in session: that stays where the Supabase client keeps it, and no token is ever written here.
// If encryption cannot be set up the cache is switched off rather than written in the clear.
import { available, idb } from './idb'

const KEY_ID = 'device-key-v1'
let keyPromise

const subtle = () => globalThis.crypto?.subtle

async function loadKey() {
  if (!available() || !subtle()) return null
  try {
    const stored = await idb.get('keys', KEY_ID)
    if (stored) return stored
    const key = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await idb.put('keys', KEY_ID, key)
    // Two tabs may race to create it: keep whichever was stored first.
    return (await idb.get('keys', KEY_ID)) ?? key
  } catch {
    return null
  }
}
const key = () => (keyPromise ??= loadKey())

export const vaultReady = async () => (await key()) !== null

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Encrypt any JSON-able value. `aad` binds the blob to what it belongs to (so it cannot be swapped for another entry's). */
export async function seal(value, aad = '') {
  const k = await key()
  if (!k) throw new Error('vault unavailable')
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, k, enc.encode(JSON.stringify(value)))
  return { v: 1, iv, ct }
}

/** Decrypt; returns undefined if the blob is damaged, was made for another entry, or the key is gone. */
export async function open(blob, aad = '') {
  const k = await key()
  if (!k || !blob?.ct) return undefined
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: blob.iv, additionalData: enc.encode(aad) }, k, blob.ct)
    return JSON.parse(dec.decode(pt))
  } catch {
    return undefined
  }
}

export const _reset = () => {
  keyPromise = undefined
}
