import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { freshBackend, renderApp } from './helpers'

beforeEach(freshBackend)

describe('public legal pages', () => {
  it.each([['/privacy', /Privacy Policy/], ['/terms', /Terms of Service/]])('%s is reachable without signing in', async (path, heading) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
  })
  it('the privacy policy states the deletion route and that nothing is sold or tracked', async () => {
    renderApp('/privacy')
    await screen.findByRole('heading', { name: /Privacy Policy/ })
    expect(document.body.textContent).toMatch(/Delete account/)
    expect(document.body.textContent).toMatch(/do not sell your data/i)
  })
  it('the sign-in page links to both', async () => {
    renderApp('/login')
    expect(await screen.findByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
  })
})
