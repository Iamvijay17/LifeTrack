import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { security } from '@/services/security'
import { db, freshBackend, renderApp, signedInUser } from '../components/helpers'

// A locked module must not hand out data or actions through the right-click menu.
vi.setConfig({ testTimeout: 60_000 })
const PIN = '2486'
const today = () => new Date().toISOString().slice(0, 10)
const rightClick = (el) => fireEvent.contextMenu(el, { clientX: 120, clientY: 90 })

beforeEach(async () => {
  await freshBackend()
  await signedInUser()
  await db.insert('tasks', [{ title: 'Water the plants' }])
  await db.insert('transactions', [{ type: 'expense', amount_paise: 123400, category: 'Food', note: 'Secret lunch', txn_date: today() }])
  await security.setPin(PIN)
  await security.setLockModules('modules', ['finance'])
  await security.lock()
})

describe('with Finance locked', () => {
  it('the Finance page shows only the lock, and right-clicking it offers no Finance actions', async () => {
    renderApp('/finance')
    await screen.findByTestId('module-locked', {}, { timeout: 40_000 })
    rightClick(screen.getByTestId('module-locked'))
    expect(screen.queryByRole('menuitem', { name: /expense|income|savings|CSV/i })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Secret lunch/)
  })

  it('on the dashboard the locked widget offers nothing that opens or reveals Finance, and other widgets still work', async () => {
    renderApp('/')
    const locked = await screen.findByTestId('locked-finance', {}, { timeout: 40_000 })
    rightClick(locked.closest('[data-widget]'))
    // layout actions are fine (they show no data); opening the locked module is not offered
    expect(await screen.findByRole('menuitem', { name: 'Hide widget' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Open Finance/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Secret lunch|1,234/)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    const other = [...screen.getByTestId('widget-grid').querySelectorAll('[data-widget]')].find((w) => w.dataset.widget === 'goals')
    rightClick(other)
    expect(await screen.findByRole('menuitem', { name: /Open Goals/ })).toBeInTheDocument()
  })

  it('the dashboard page menu can still be used, and unlocked modules keep their menus', async () => {
    renderApp('/planner')
    const row = (await screen.findByText('Water the plants', {}, { timeout: 40_000 })).closest('li')
    rightClick(row)
    expect(await screen.findByRole('menuitem', { name: 'Mark complete' })).toBeInTheDocument()
    expect(within(screen.getByRole('menu')).queryByText(/Finance/)).toBeNull()
  })
})
