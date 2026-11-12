// In-memory stand-in for the dk_* SQL functions of migration 0014 and the way index.ts calls the `device-key` function, shared by the function's own tests
// (packages/core/tests) and the mobile app's tests (apps/mobile/tests), so both drive the REAL decisions in supabase/functions/device-key/logic.js.
import { handleRequest } from '../../../../supabase/functions/device-key/logic.js'
import { lockoutSecondsAfter, revokesSession } from '../../src/security'

/**
 * In-memory stand-in for the dk_* SQL functions, with their semantics: single-use challenges bound to user + session + purpose + key, the strictly
 * forward counter, one thumbprint once, and a failure count shared with the PIN. (The SQL itself is tested in supabase/tests/pglite/deviceKeys.test.ts.)
 */
export function fakeDb({ appLock = true, unlockedSessions = ['phone'] } = {}) {
  const s = { challenges: [], keys: [], unlocked: new Set(unlockedSessions), failures: 0, signedOut: false, appLock, nextId: 1, expireAll: false, log: [] }
  const db = {
    status: async (user, session) => ({ app_lock_enabled: s.appLock, unlocked: s.unlocked.has(session), key_count: s.keys.filter((k) => k.user === user).length }),
    issueChallenge: async (user, session, purpose, challenge, key = null) => void s.challenges.push({ user, session, purpose, challenge, key }),
    takeChallenge: async (user, session, purpose, challenge, key = null) => {
      const i = s.challenges.findIndex((c) => c.user === user && c.session === session && c.purpose === purpose && c.challenge === challenge && c.key === (key ?? null))
      if (i < 0 || s.expireAll) return false
      s.challenges.splice(i, 1)
      return true
    },
    keys: async (user) => s.keys.filter((k) => k.user === user).map((k) => ({ id: k.id, public_key_jwk: k.publicKeyJwk, alg: -7, sign_count: k.signCount })),
    addKey: async (k) => {
      if (s.keys.some((x) => x.thumbprint === k.thumbprint)) throw Object.assign(new Error('duplicate key'), { code: '23505' })
      if (s.keys.filter((x) => x.user === k.userId).length >= 10) throw Object.assign(new Error('You can use fingerprint or face unlock on up to 10 phones.'), { code: '54000' })
      const row = { ...k, id: `00000000-0000-4000-8000-${String(s.nextId++).padStart(12, '0')}`, user: k.userId, signCount: 0 }
      s.keys.push(row)
      return row.id
    },
    recordAssertion: async (id, user, count) => {
      const k = s.keys.find((x) => x.id === id && x.user === user)
      if (!k || !(count > k.signCount)) return false
      k.signCount = count
      return true
    },
    unlock: async (_user, session) => void s.unlocked.add(session),
    failure: async () => {
      s.failures++
      const signedOut = revokesSession(s.failures)
      if (signedOut) s.signedOut = true
      return { failed_attempts: s.failures, lockout_seconds: lockoutSecondsAfter(s.failures), signed_out: signedOut }
    },
  }
  return { s, db }
}

/** Calls the function as `user` on `session`, the way index.ts would. A native app sends no Origin header. */
export function client(fake, { user = 'u1', session = 'phone', origin = null } = {}) {
  const authenticate = async (auth) => (auth === 'Bearer good' ? { userId: user, sessionId: session, email: 'ann@example.com' } : auth === 'Bearer nosession' ? { userId: user, sessionId: null } : null)
  const call = (body, over = {}) => handleRequest({ method: 'POST', origin, authorization: 'Bearer good', body, rawLength: 100, ...over }, { authenticate, db: fake.db })
  return { call }
}

