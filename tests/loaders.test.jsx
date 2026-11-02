import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FullScreenLoader, InitialAppLoader, PageLoader, SectionLoader, ButtonLoader, SkeletonLoader, OrbitMark, MESSAGES, messageForPath } from '@/components/loaders'
import { Button } from '@/components/ui/button'
import { readFileSync } from 'node:fs'

describe('loader messages', () => {
  it('maps routes to contextual messages', () => {
    expect(messageForPath('/')).toBe('Preparing your dashboard...')
    expect(messageForPath('/planner')).toBe('Loading your daily planner...')
    expect(messageForPath('/learning')).toBe('Loading your learning journey...')
    expect(messageForPath('/reports')).toBe('Preparing your insights...')
    expect(messageForPath('/finance')).toBe('Syncing your progress...')
    expect(messageForPath('/something-new')).toBe(MESSAGES.sync)
  })
  it('never implies a percentage', () => {
    expect(Object.values(MESSAGES).join(' ')).not.toMatch(/\d+\s*%/)
  })
})

describe('loader components', () => {
  it.each([['FullScreenLoader', <FullScreenLoader message="Hello..." />], ['PageLoader', <PageLoader message="Hello..." />], ['SectionLoader', <SectionLoader message="Hello..." />]])(
    '%s is a polite live status region carrying the message', (_n, ui) => {
      render(ui)
      const status = screen.getByRole('status')
      expect(status).toHaveAttribute('aria-live', 'polite')
      expect(status).toHaveAttribute('aria-busy', 'true')
      expect(status).toHaveTextContent('Hello...')
      expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true') // the artwork is decorative
      expect(status.textContent).not.toMatch(/%/)
    })
  it('InitialAppLoader shows the dashboard message and brand name', () => {
    render(<InitialAppLoader />)
    expect(screen.getByRole('status')).toHaveTextContent(/Preparing your dashboard/)
    expect(screen.getByRole('status')).toHaveTextContent('LifeTrack')
  })
  it('reserves space so content does not shift', () => {
    render(<SectionLoader minHeight={200} />)
    expect(screen.getByTestId('section-loader')).toHaveStyle({ minHeight: '200px' })
    render(<OrbitMark size={64} />)
    expect(document.querySelector('svg[width="64"][height="64"]')).toBeTruthy()
  })
  it('gives each mark unique gradient ids (several can be on screen)', () => {
    const { container } = render(<><OrbitMark /><OrbitMark /></>)
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('SkeletonLoader announces loading to screen readers and renders the requested shapes', () => {
    const { container } = render(<SkeletonLoader variant="cards" cards={3} label="Loading goals" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading goals…')
    expect(container.querySelectorAll('.skeleton').length).toBe(6)
  })
  it('Button shows the ButtonLoader, is busy and cannot be double-submitted', () => {
    render(<Button loading>Save</Button>)
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b).toBeDisabled(); expect(b).toHaveAttribute('aria-busy', 'true')
    expect(b.querySelector('svg.lt-orbit')).toBeTruthy()
    render(<ButtonLoader />)
  })
})

describe('motion CSS', () => {
  const css = readFileSync('src/index.css', 'utf8')
  const orbit = css.slice(css.indexOf('LifeTrack Progress Orbit'))
  it('animates only compositor-friendly properties', () => {
    const frames = [...orbit.matchAll(/@keyframes (lt-[\w-]+) \{([^]*?)\n\}|@keyframes (lt-[\w-]+) \{[^\n]*\}/g)].map((m) => m[0]).join('\n')
    expect(frames).toMatch(/lt-spin/)
    expect(frames).not.toMatch(/\b(width|height|top|left|margin|filter|blur|box-shadow)\b/)
  })
  it('has no filters or blur in the loader styles', () => {
    expect(orbit).not.toMatch(/filter:|blur\(/)
  })
  it('stops all looping motion and shows the finished check under prefers-reduced-motion', () => {
    const rm = orbit.slice(orbit.indexOf('prefers-reduced-motion'))
    for (const sel of ['.lt-spin-outer', '.lt-spin-inner', '.lt-glow', '.lt-msg']) expect(rm).toContain(sel)
    expect(rm).toMatch(/\.lt-check \{ animation: none; stroke-dashoffset: 0; \}/)
  })
})
