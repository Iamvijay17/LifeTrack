import { supabase, isSupabaseConfigured, createVerifierClient } from '@/lib/supabase'
import { createSupabaseAuth } from '@lifetrack/data'
import { assessPassword, formatWait, passwordLockoutSecondsAfter } from '@lifetrack/core/security'
import { AppError } from './errors'
import { localAdapter } from './localAdapter'
import { checkSecret, hashSecret, markLogin, wipeSecurity } from './localSecurity'
import { setUserId } from './session'

// ------------------------------------------------------------------ Supabase (shared implementation)
const sb = isSupabaseConfigured
  ? createSupabaseAuth(
      supabase,
      { signUp: () => window.location.origin, passwordReset: () => `${window.location.origin}/reset-password` },
      { verifierClient: createVerifierClient },
    )
  : null

// ----------------------------------------------------------------- Local DEV
const USERS = 'lifetrack-dev:users'
const SESSION = 'lifetrack-dev:session'
const listeners = new Set()
const users = () => {
  try {
    return JSON.parse(localStorage.getItem(USERS)) ?? []
  } catch {
    return []
  }
}
// Passwords are stored salted and slow (PBKDF2, see localSecurity.js). Accounts made before that kept an unsalted SHA-256 under `hash`: they still
// sign in, and are upgraded to the new format the first time their password is checked.
const legacyHash = async (pw) => {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lt:${pw}`))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  return btoa(unescape(encodeURIComponent(`lt:${pw}`)))
}
const saveUsers = (list) => localStorage.setItem(USERS, JSON.stringify(list))
const passwordMatches = async (u, pw) => {
  if (u.pw) return checkSecret(pw, u.pw)
  if (u.hash && u.hash === (await legacyHash(pw))) {
    const { hash: _old, ...rest } = u
    const upgraded = { ...rest, pw: await hashSecret(pw) }
    saveUsers(users().map((x) => (x.id === u.id ? upgraded : x)))
    return true
  }
  return false
}
// Wrong passwords are counted per account, like the database hook does for Supabase (hook_password_verification_attempt in 0012_security.sql).
const FAILS = 'lifetrack-dev:password-failures'
const readFails = () => {
  try {
    return JSON.parse(localStorage.getItem(FAILS)) ?? {}
  } catch {
    return {}
  }
}
const lockedMessage = (email) => {
  const left = Math.ceil(((readFails()[email]?.until ?? 0) - Date.now()) / 1000)
  return left > 0 ? `Too many sign-in attempts. Try again in ${formatWait(left)}.` : null
}
const noteAttempt = (email, ok) => {
  const all = readFails()
  if (ok) delete all[email]
  else {
    const n = (all[email]?.n ?? 0) + 1
    const wait = passwordLockoutSecondsAfter(n)
    all[email] = { n, until: wait ? Date.now() + wait * 1000 : 0 }
  }
  localStorage.setItem(FAILS, JSON.stringify(all))
}
const verifyPassword = async (u, pw) => {
  const blocked = lockedMessage(u.email)
  if (blocked) throw new AppError(blocked) // even the right password is refused during the lockout
  const ok = await passwordMatches(u, pw)
  noteAttempt(u.email, ok)
  return ok
}
const toSession = (u) => (u ? { user: { id: u.id, email: u.email, user_metadata: { display_name: u.name } } } : null)
const current = () => {
  try {
    const id = JSON.parse(localStorage.getItem(SESSION))?.userId
    return toSession(users().find((u) => u.id === id))
  } catch {
    return null
  }
}
const emit = (event) => listeners.forEach((cb) => cb(event, current()))

const local = {
  async getSession() {
    return current()
  },
  onChange(cb) {
    listeners.add(cb)
    const onStorage = (e) => {
      if (e.key === SESSION) cb(current() ? 'SIGNED_IN' : 'SIGNED_OUT', current())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(cb)
      window.removeEventListener('storage', onStorage)
    }
  },
  async signUp(email, password, displayName) {
    const list = users()
    if (list.some((u) => u.email === email.toLowerCase())) throw new AppError('An account with this email already exists.')
    const u = { id: crypto.randomUUID(), email: email.toLowerCase(), name: displayName, pw: await hashSecret(password) }
    saveUsers([...list, u])
    localStorage.setItem(SESSION, JSON.stringify({ userId: u.id }))
    markLogin(u.id)
    emit('SIGNED_IN')
    return { needsConfirmation: false }
  },
  async signIn(email, password) {
    const u = users().find((x) => x.email === email.toLowerCase())
    if (!u) throw new AppError('Incorrect email or password.')
    if (!(await verifyPassword(u, password))) throw new AppError('Incorrect email or password.')
    localStorage.setItem(SESSION, JSON.stringify({ userId: u.id }))
    markLogin(u.id) // a new session: the app lock opens without the PIN, because the password was just typed
    emit('SIGNED_IN')
  },
  async signOut() {
    localStorage.removeItem(SESSION)
    emit('SIGNED_OUT')
  },
  async sendPasswordReset() {
    throw new AppError('Password reset emails need a Supabase project. DEV mode has no email delivery.')
  },
  async updatePassword(password) {
    const s = current()
    if (!s) throw new AppError('Not signed in.')
    const pw = await hashSecret(password)
    saveUsers(
      users().map((u) => {
        if (u.id !== s.user.id) return u
        const { hash: _old, ...rest } = u
        return { ...rest, pw }
      }),
    )
  },
  async changePassword(currentPassword, next) {
    const s = current()
    if (!s) throw new AppError('Sign in again to change your password.')
    const u = users().find((x) => x.id === s.user.id)
    if (!(await verifyPassword(u, currentPassword))) throw new AppError('Your current password is not correct.')
    const verdict = assessPassword(next, { email: u.email, name: u.name })
    if (!verdict.ok) throw new AppError(verdict.issues[0])
    await local.updatePassword(next)
    return { othersSignedOut: true } // the dev backend has no other sessions
  },
  async updateDisplayName(name) {
    const s = current()
    if (!s) throw new AppError('Not signed in.')
    localStorage.setItem(USERS, JSON.stringify(users().map((u) => (u.id === s.user.id ? { ...u, name } : u))))
    emit('USER_UPDATED')
  },
  async deleteAccount() {
    const s = current()
    if (!s) return
    localAdapter.wipe()
    wipeSecurity(s.user.id)
    localStorage.setItem(USERS, JSON.stringify(users().filter((u) => u.id !== s.user.id)))
    await local.signOut()
  },
}

const unavailableAuth = {
  getSession: async () => null,
  onChange: () => () => {},
  ...Object.fromEntries(
    ['signUp', 'signIn', 'signOut', 'sendPasswordReset', 'updatePassword', 'changePassword', 'updateDisplayName', 'deleteAccount'].map(
      (k) => [
        k,
        async () => {
          throw new AppError('LifeTrack is not connected to a database (missing Supabase configuration).')
        },
      ],
    ),
  ),
}

export const auth = __BACKEND__ === 'supabase' ? sb : __BACKEND__ === 'local' ? local : unavailableAuth
export { setUserId }
