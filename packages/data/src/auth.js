import { AppError, toAppError } from './errors'

const resolve = (v) => (typeof v === 'function' ? v() : v)

/**
 * Auth service over a Supabase client.
 * @param supabase  injected client
 * @param redirects { signUp, passwordReset } URL strings or functions returning one. Web: origin URLs. Mobile: deep links.
 */
export const createSupabaseAuth = (supabase, redirects = {}) => ({
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
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: resolve(redirects.signUp) } })
    if (error) throw toAppError(error)
    return { needsConfirmation: !data.session }
  },
  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new AppError(/invalid login/i.test(error.message) ? 'Incorrect email or password.' : toAppError(error).message)
  },
  async signOut() { const { error } = await supabase.auth.signOut(); if (error) throw toAppError(error) },
  async sendPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resolve(redirects.passwordReset) })
    if (error) throw toAppError(error)
  },
  async updatePassword(password) { const { error } = await supabase.auth.updateUser({ password }); if (error) throw toAppError(error) },
  async updateDisplayName(name) { const { error } = await supabase.auth.updateUser({ data: { display_name: name } }); if (error) throw toAppError(error) },
  async deleteAccount() {
    const { error } = await supabase.rpc('delete_my_account')
    if (error) throw toAppError(error)
    await supabase.auth.signOut().catch(() => {})
  },
})
