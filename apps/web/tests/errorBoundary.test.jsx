import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { ConfigError } from '@/components/shared/ConfigError'

let explode = true
const swallow = (e) => e.preventDefault()
const Bomb = () => {
  if (explode) throw new Error('boom')
  return <p>recovered</p>
}

beforeEach(() => {
  explode = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // jsdom reports errors thrown during render as window 'error' events; the boundary handles them, so keep test output clean
  window.addEventListener('error', swallow)
})
afterEach(() => {
  window.removeEventListener('error', swallow)
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('shows a friendly fallback instead of crashing, and never leaks the error message', () => {
    render(
      <ErrorBoundary variant="section">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText(/boom/)).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })
  it('"Try again" re-renders the children', async () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    explode = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })
  it('recovers automatically when the resetKey (route) changes', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    explode = false
    rerender(
      <ErrorBoundary resetKey="/b">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })
  it('passes children through when nothing is wrong', () => {
    explode = false
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })
})

describe('ConfigError', () => {
  it('tells the operator exactly what to set, without showing any secret', () => {
    render(<ConfigError />)
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL')
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_ANON_KEY')
  })
})
