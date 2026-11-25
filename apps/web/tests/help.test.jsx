import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import HelpPage from '@/features/help/HelpPage'
import { FAQ, FAQ_CATEGORIES, GUIDES, matches, textOf } from '@/features/help/helpContent'
import { NAV } from '@/lib/nav'

const renderHelp = () =>
  render(
    <MemoryRouter initialEntries={['/help']}>
      <HelpPage />
    </MemoryRouter>,
  )

describe('help content', () => {
  it('has a guide for every module except help itself, each pointing at a real page', () => {
    const covered = new Set(GUIDES.map((g) => g.module))
    for (const n of NAV.filter((n) => n.module !== 'help')) expect(covered.has(n.module), n.module).toBe(true)
    for (const g of GUIDES) {
      expect(
        NAV.some((n) => n.module === g.module),
        g.module,
      ).toBe(true)
      expect(g.steps.length).toBeGreaterThan(0)
    }
  })

  it('files every question under a known category', () => {
    for (const f of FAQ) expect(FAQ_CATEGORIES).toContain(f.cat)
    expect(new Set(FAQ.map((f) => f.q)).size).toBe(FAQ.length)
  })

  it('matches on every word, in any order, ignoring case', () => {
    const t = textOf('Back up your data', ['JSON file'])
    expect(matches('json DATA', t)).toBe(true)
    expect(matches('json streak', t)).toBe(false)
    expect(matches('   ', t)).toBe(true)
  })
})

describe('HelpPage', () => {
  it('shows guides, FAQ and shortcuts', () => {
    renderHelp()
    expect(screen.getByRole('heading', { name: 'Guides by module' })).toBeInTheDocument()
    expect(screen.getByText('Daily Planner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(screen.getByText('Is my data private?')).toBeInTheDocument()
  })

  it('filters the FAQ by category', async () => {
    renderHelp()
    await userEvent.click(screen.getByRole('tab', { name: 'Reminders' }))
    expect(screen.getByText('Why did my reminder not go off?')).toBeInTheDocument()
    expect(screen.queryByText('Is my data private?')).not.toBeInTheDocument()
  })

  it('searches across guides and answers, and can be cleared', async () => {
    renderHelp()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search help' }), 'restore')
    expect(screen.getByRole('status')).toHaveTextContent(/matches for “restore”/)
    expect(screen.getByText('Data Export')).toBeInTheDocument()
    expect(screen.queryByText('Daily Planner')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search help' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search help' }), 'zzzzqx')
    expect(screen.getByText('Nothing found')).toBeInTheDocument()
    await userEvent.click(
      within(screen.getByText('Nothing found').closest('div').parentElement).getByRole('button', { name: 'Clear search' }),
    )
    expect(screen.getByText('Daily Planner')).toBeInTheDocument()
  })
})
