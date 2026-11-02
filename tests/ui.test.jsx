import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Segmented } from '@/components/ui/misc'

const Boom = ({ msg = 'kaboom' }) => { throw new Error(msg) }

describe('ErrorBoundary', () => {
  it('shows a recoverable message instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
  it('explains a stale lazy chunk after a deploy', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom msg="Failed to fetch dynamically imported module: /assets/x.js" /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('new version')
  })
  it('renders children when nothing fails', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
  })
})

describe('Segmented (tablist)', () => {
  const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]
  const Wrap = () => { const [v, setV] = useState('a'); return <Segmented value={v} onChange={setV} options={opts} /> }
  it('supports arrow/Home/End keys with roving tabindex', () => {
    render(<Wrap />)
    const tabs = () => screen.getAllByRole('tab')
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1])
    fireEvent.keyDown(tabs()[0], { key: 'ArrowRight' })
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tabs()[1], { key: 'End' })
    expect(tabs()[2]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tabs()[2], { key: 'ArrowRight' })
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true') // wraps
  })
})
