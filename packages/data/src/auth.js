import { AppError, toAppError } from './errors'

const resolve = (v) => (typeof v === 'function' ? v() : v)

/**
 * Auth service over a Supabase client.
 * @param supabase  injected client
 * @param redirects { signUp, passwordReset } URL strings or functions returning one. Web: origin URLs. Mobile: deep links.
 * @param options   { verifierClient } returns a THROWAWAY client (no persisted session) used to check a password without disturbing the live session.
 */
export const createSupabaseAuth = (supabase, redirects = {}, { verifierClient } = {}) => ({
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
  /**
   * Change the password of a signed-in user, proving they know the current one. GoTrue verifies it (and its rate limits / the optional lockout hook
   * apply). The check runs on a throwaway client: signing in on the live one would replace its session, and the app lock is bound to the session.
   * Afterwards every OTHER device is signed out, so a session someone else may hold does not outlive the old password.
   * @returns {{ othersSignedOut: boolean }}
   */
  async changePassword(current, next) {
    const { data } = await supabase.auth.getSession()
    const email = data.session?.user?.email
    if (!email) throw new AppError('Sign in again to change your password.')
    const probe = verifierClient?.() ?? supabase
    const { error: bad } = await probe.auth.signInWithPassword({ email, password: current })
    if (bad) throw new AppError(/invalid login/i.test(bad.message) ? 'Your current password is not correct.' : toAppError(bad).message)
    if (probe !== supabase) await probe.auth.signOut({ scope: 'local' }).catch(() => {}) // NOT the default 'global': that would end every session, including this one
    let { error } = await supabase.auth.updateUser({ password: next })
    if (error && (error.code === 'reauthentication_needed' || /reauthentication/i.test(error.message ?? ''))) {
      // "Secure password change" is on in the project and this session is older than 24 hours: GoTrue wants a fresh sign-in or an emailed code. The
      // current password was verified a moment ago, so sign in afresh (the app lock opens a brand-new session by itself) and try once more.
      const { error: again } = await supabase.auth.signInWithPassword({ email, password: current })
      if (again) throw toAppError(again)
      ;({ error } = await supabase.auth.updateUser({ password: next }))
    }
    if (error) throw toAppError(error)
    const { error: others } = await supabase.auth.signOut({ scope: 'others' })
    return { othersSignedOut: !others }
  },
  async updateDisplayName(name) { const { error } = await supabase.auth.updateUser({ data: { display_name: name } }); if (error) throw toAppError(error) },
  async deleteAccount() {
    const { error } = await supabase.rpc('delete_my_account')
    if (error) throw toAppError(error)
    await supabase.auth.signOut().catch(() => {})
  },
})
