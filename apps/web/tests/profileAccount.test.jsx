import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { avatarFileProblem, centreSquare, isAvatar } from '@/lib/avatar'
import { auth } from '@/services/auth'
import { freshBackend, renderApp, signedInUser } from './components/helpers'

describe('avatar helpers', () => {
  it('accepts only small inline images, never a link or a script type', () => {
    expect(isAvatar('data:image/jpeg;base64,/9j/4AAQ')).toBe(true)
    expect(isAvatar('https://example.com/a.png')).toBe(false)
    expect(isAvatar('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
    expect(isAvatar('data:image/png;base64,' + 'A'.repeat(60001))).toBe(false)
    expect(isAvatar(null)).toBe(false)
  })
  it('checks the chosen file', () => {
    expect(avatarFileProblem(null)).toMatch(/Choose/)
    expect(avatarFileProblem({ type: 'image/gif', size: 10 })).toMatch(/JPEG/)
    expect(avatarFileProblem({ type: 'image/png', size: 9 * 1024 * 1024 })).toMatch(/8 MB/)
    expect(avatarFileProblem({ type: 'image/webp', size: 1000 })).toBeNull()
  })
  it('crops a centred square', () => {
    expect(centreSquare(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 })
    expect(centreSquare(100, 300)).toEqual({ sx: 0, sy: 100, side: 100 })
  })
})

describe('changing the email (dev backend)', () => {
  beforeEach(freshBackend)
  it('changes it immediately, and refuses an address another account has', async () => {
    await auth.signUp('other@example.com', 'secret123', 'Other')
    await signedInUser('ann@example.com')
    await expect(auth.changeEmail('OTHER@example.com')).rejects.toThrow(/already exists/)
    await expect(auth.changeEmail('new@example.com')).resolves.toEqual({ needsConfirmation: false })
    expect((await auth.getSession()).user.email).toBe('new@example.com')
  })
})

describe('Settings profile card', () => {
  beforeEach(freshBackend)
  it('shows photo, email and when the account was created', async () => {
    await signedInUser('ann@example.com')
    renderApp('/settings')
    expect(await screen.findByRole('button', { name: /add photo/i }, { timeout: 30_000 })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('ann@example.com')
    await waitFor(() => expect(screen.getByText(/Account created/)).toBeInTheDocument())
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getAllByRole('button', { name: 'Change' }).at(-1))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  }, 60_000) // the Settings page is lazy-loaded; a full parallel run can be slow on its first render
})
