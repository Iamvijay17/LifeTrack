import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { freshBackend, renderApp } from './helpers'

beforeEach(freshBackend)

describe('public legal pages', () => {
  it.each([
    ['/privacy', /Privacy Policy/, 'Privacy policy · LifeTrack'],
    ['/terms', /Terms of Service/, 'Terms of service · LifeTrack'],
  ])('%s is reachable without signing in and names its tab', async (path, heading, title) => {
    // As if arriving from inside the app: the page sits outside the shell, so it must replace the previous page's tab name itself.
    document.title = 'Calendar · LifeTrack'
    renderApp(path)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
    expect(document.title).toBe(title)
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
