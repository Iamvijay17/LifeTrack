import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Banners } from '@/components/layout/StatusIndicators'

afterEach(() => Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }))

describe('connection banner', () => {
  it('renders the offline banner (regression: its icon import was once missing and crashed the app)', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    render(<Banners />)
    expect(screen.getByRole('alert')).toHaveTextContent(/offline/i)
  })
  it('shows and hides as the connection changes', () => {
    render(<Banners />)
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
