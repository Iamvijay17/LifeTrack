import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  auth: { signIn: vi.fn(), signUp: vi.fn(), sendPasswordReset: vi.fn(), updatePassword: vi.fn() },
  state: { session: null, recovery: false, loading: false },
  clearRecovery: vi.fn(),
}))
vi.mock('@/services/auth', () => ({ auth: mocks.auth }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ ...mocks.state, clearRecovery: mocks.clearRecovery }) }))

const { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } = await import('@/features/auth/AuthPages')
const { email, newPasswordPair, passwordsMatch, passwordStrong } = await import('@/features/auth/authForm')
const { z } = await import('zod')
const STRONG = 'Violet-Harbor-42' // passes the new-password rules

const at = (path, el) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={el} />
        <Route path="/" element={<p>home</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(mocks.state, { session: null, recovery: false, loading: false })
})

describe('auth schemas', () => {
  it('email is trimmed and lower-cased, and must look like an email', () => {
    expect(email.parse('  Me@Example.COM ')).toBe('me@example.com')
    expect(email.safeParse('').error.issues[0].message).toBe('Enter your email')
    expect(email.safeParse('nope').error.issues[0].message).toBe('Enter a valid email')
  })
  it('new password: 8–72 chars and must match its confirmation, reported on the confirm field', () => {
    expect(newPasswordPair.safeParse({ password: 'short', confirm: 'short' }).error.issues[0].message).toBe('Use at least 8 characters')
    expect(newPasswordPair.safeParse({ password: 'x'.repeat(73), confirm: 'x'.repeat(73) }).error.issues[0].message).toBe('Too long')
    const bad = newPasswordPair.safeParse({ password: STRONG, confirm: 'different1' })
    expect(bad.error.issues[0]).toMatchObject({ message: 'Passwords do not match', path: ['confirm'] })
    expect(newPasswordPair.safeParse({ password: STRONG, confirm: STRONG }).success).toBe(true)
  })
  it('new password: easy-to-guess ones are refused with the reason, at the password field; signing in is never checked', () => {
    for (const weak of ['password123', 'Welcome2024!', 'abcd1234', '12345678', 'aaaaaaaa']) {
      const r = newPasswordPair.safeParse({ password: weak, confirm: weak })
      expect(r.success, weak).toBe(false)
      expect(r.error.issues[0].path, weak).toEqual(['password'])
    }
    expect(newPasswordPair.safeParse({ password: 'password123', confirm: 'password123' }).error.issues[0].message).toMatch(/most common/)
  })
  it('a password built from the name or email in the same form is refused', () => {
    const schema = passwordStrong(z.object({ name: z.string(), email: z.string(), password: z.string(), confirm: z.string() }))
    const r = schema.safeParse({ name: 'Ananya Rao', email: 'a@b.co', password: 'Ananya-2031-x', confirm: 'Ananya-2031-x' })
    expect(r.error.issues[0]).toMatchObject({ path: ['password'], message: expect.stringMatching(/name or email/) })
    expect(schema.safeParse({ name: 'Ananya Rao', email: 'a@b.co', password: STRONG, confirm: STRONG }).success).toBe(true)
  })
  it('passwordsMatch works on a wider schema too', () => {
    const s = passwordsMatch(z.object({ name: z.string(), password: z.string(), confirm: z.string() }))
    expect(s.safeParse({ name: 'a', password: 'x', confirm: 'y' }).success).toBe(false)
    expect(s.safeParse({ name: 'a', password: 'x', confirm: 'x' }).success).toBe(true)
  })
})

describe('LoginPage', () => {
  it('validates, then signs in and goes home', async () => {
    mocks.auth.signIn.mockResolvedValue()
    at('/login', <LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your email')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(mocks.auth.signIn).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Email'), ' Me@Test.dev ')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(mocks.auth.signIn).toHaveBeenCalledWith('me@test.dev', 'pw'))
    expect(await screen.findByText('home')).toBeInTheDocument()
  })
  it('shows a failed sign-in as an alert and stays put', async () => {
    mocks.auth.signIn.mockRejectedValue(new Error('Invalid login credentials'))
    at('/login', <LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })
  it('an already signed-in visitor is sent home', () => {
    mocks.state.session = { user: { id: 'u' } }
    at('/login', <LoginPage />)
    expect(screen.getByText('home')).toBeInTheDocument()
  })
})

describe('RegisterPage', () => {
  const fill = async (confirm) => {
    await userEvent.type(screen.getByLabelText('Name'), 'Vee')
    await userEvent.type(screen.getByLabelText('Email'), 'vee@test.dev')
    await userEvent.type(screen.getByLabelText('Password'), STRONG)
    await userEvent.type(screen.getByLabelText('Confirm password'), confirm)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
  }
  it('rejects mismatched passwords at the confirm field without calling the server', async () => {
    at('/register', <RegisterPage />)
    await fill(`${STRONG}x`)
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(mocks.auth.signUp).not.toHaveBeenCalled()
  })
  it('creates the account and goes home', async () => {
    mocks.auth.signUp.mockResolvedValue({ needsConfirmation: false })
    at('/register', <RegisterPage />)
    await fill(STRONG)
    await waitFor(() => expect(mocks.auth.signUp).toHaveBeenCalledWith('vee@test.dev', STRONG, 'Vee'))
    expect(await screen.findByText('home')).toBeInTheDocument()
  })
  it('when email confirmation is required it says so instead of navigating', async () => {
    mocks.auth.signUp.mockResolvedValue({ needsConfirmation: true })
    at('/register', <RegisterPage />)
    await fill(STRONG)
    expect(await screen.findByRole('status')).toHaveTextContent(/Check your email/)
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })
})

describe('ForgotPasswordPage', () => {
  it('always shows the same neutral notice', async () => {
    mocks.auth.sendPasswordReset.mockResolvedValue()
    at('/forgot-password', <ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'x@y.zz')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('If that email has an account')
    expect(mocks.auth.sendPasswordReset).toHaveBeenCalledWith('x@y.zz')
  })
})

describe('useSubmit', () => {
  it('a retry clears the previous error', async () => {
    mocks.auth.sendPasswordReset.mockRejectedValueOnce(new Error('Network down')).mockResolvedValueOnce()
    at('/forgot-password', <ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'x@y.zz')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ResetPasswordPage', () => {
  it('without a session it explains the link expired', () => {
    at('/reset-password', <ResetPasswordPage />)
    expect(screen.getByText('Link expired')).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })
  it('with a session it validates, updates the password, clears recovery mode and goes home', async () => {
    mocks.state.session = { user: { id: 'u' } }
    mocks.state.recovery = true
    mocks.auth.updatePassword.mockResolvedValue()
    at('/reset-password', <ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText('New password'), STRONG)
    await userEvent.type(screen.getByLabelText('Confirm password'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Confirm password'))
    await userEvent.type(screen.getByLabelText('Confirm password'), STRONG)
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
    await waitFor(() => expect(mocks.auth.updatePassword).toHaveBeenCalledWith(STRONG))
    expect(mocks.clearRecovery).toHaveBeenCalled()
    expect(await screen.findByText('home')).toBeInTheDocument()
  })
})
