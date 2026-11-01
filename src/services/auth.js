import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { AppError, toAppError } from './errors'
import { localAdapter } from './localAdapter'
import { setUserId } from './session'

// ------------------------------------------------------------------ Supabase
const sb = {
  async getSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw toAppError(error)
    return data.session
  },
  onChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session))
    return () => data.subscription.unsubscribe()
  },
  async signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin } })
    if (error) throw toAppError(error)
    return { needsConfirmation: !data.session }
  },
  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new AppError(/invalid login/i.test(error.message) ? 'Incorrect email or password.' : toAppError(error).message)
  },
  async signOut() { const { error } = await supabase.auth.signOut(); if (error) throw toAppError(error) },
  async sendPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
    if (error) throw toAppError(error)
  },
  async updatePassword(password) { const { error } = await supabase.auth.updateUser({ password }); if (error) throw toAppError(error) },
  async deleteAccount() {
    const { error } = await supabase.rpc('delete_my_account')
    if (error) throw toAppError(error)
    await supabase.auth.signOut().catch(() => {})
  },
}

// ----------------------------------------------------------------- Local DEV
const USERS = 'lifetrack-dev:users'
const SESSION = 'lifetrack-dev:session'
const listeners = new Set()
const users = () => { try { return JSON.parse(localStorage.getItem(USERS)) ?? [] } catch { return [] } }
const hash = async (pw) => {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lt:${pw}`))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  return btoa(unescape(encodeURIComponent(`lt:${pw}`)))
}
const toSession = (u) => (u ? { user: { id: u.id, email: u.email, user_metadata: { display_name: u.name } } } : null)
const current = () => { try { const id = JSON.parse(localStorage.getItem(SESSION))?.userId; return toSession(users().find((u) => u.id === id)) } catch { return null } }
const emit = (event) => listeners.forEach((cb) => cb(event, current()))

const local = {
  async getSession() { return current() },
  onChange(cb) {
    listeners.add(cb)
    const onStorage = (e) => { if (e.key === SESSION) cb(current() ? 'SIGNED_IN' : 'SIGNED_OUT', current()) }
    window.addEventListener('storage', onStorage)
    return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage) }
  },
  async signUp(email, password, displayName) {
    const list = users()
    if (list.some((u) => u.email === email.toLowerCase())) throw new AppError('An account with this email already exists.')
    const u = { id: crypto.randomUUID(), email: email.toLowerCase(), name: displayName, hash: await hash(password) }
    localStorage.setItem(USERS, JSON.stringify([...list, u]))
    localStorage.setItem(SESSION, JSON.stringify({ userId: u.id }))
    emit('SIGNED_IN')
    return { needsConfirmation: false }
  },
  async signIn(email, password) {
    const u = users().find((x) => x.email === email.toLowerCase())
    if (!u || u.hash !== (await hash(password))) throw new AppError('Incorrect email or password.')
    localStorage.setItem(SESSION, JSON.stringify({ userId: u.id }))
    emit('SIGNED_IN')
  },
  async signOut() { localStorage.removeItem(SESSION); emit('SIGNED_OUT') },
  async sendPasswordReset() { throw new AppError('Password reset emails need a Supabase project. DEV mode has no email delivery.') },
  async updatePassword(password) {
    const s = current(); if (!s) throw new AppError('Not signed in.')
    const h = await hash(password)
    localStorage.setItem(USERS, JSON.stringify(users().map((u) => (u.id === s.user.id ? { ...u, hash: h } : u))))
  },
  async deleteAccount() {
    const s = current(); if (!s) return
    localAdapter.wipe()
    localStorage.setItem(USERS, JSON.stringify(users().filter((u) => u.id !== s.user.id)))
    await local.signOut()
  },
}

export const auth = isSupabaseConfigured ? sb : local
export { setUserId }
