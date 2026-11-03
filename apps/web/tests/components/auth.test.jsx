import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { freshBackend, renderApp, signedInUser } from './helpers'
import { auth } from '@/services/auth'

beforeEach(freshBackend)

describe('route protection', () => {
  it('sends a signed-out visitor to the login page', async () => {
    renderApp('/habits')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
  it('sends a signed-in user away from the login page to the app', async () => {
    await signedInUser()
    renderApp('/login')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull())
  })
})

describe('login form', () => {
  it('validates before calling the backend', async () => {
    renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'))
    expect(await auth.getSession()).toBeNull()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })
  it('shows the backend error for a wrong password and stays signed out', async () => {
    await auth.signUp('ann@example.com', 'secret123', 'Ann')
    await auth.signOut()
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'ann@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'nope-nope')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(await auth.getSession()).toBeNull()
  })
  it('signs in with correct credentials and lands in the app', async () => {
    await auth.signUp('ann@example.com', 'secret123', 'Ann')
    await auth.signOut()
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'ann@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull())
    expect((await auth.getSession()).user.email).toBe('ann@example.com')
  })
})
