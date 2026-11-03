import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { todayStr } from '@/lib/dates'
import { setUserId } from '@/services/session'
import * as store from '@/hooks/store'
import { QUICK, QuickActionsProvider, QuickAddMenu } from '@/features/quick/QuickActions'
import { HabitQuick } from '@/features/quick/HabitQuick'
import { StudyStart } from '@/features/quick/StudyStart'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const wrap = (ui) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      {ui}
      <Where />
    </MemoryRouter>,
  )

beforeEach(() => {
  localStorage.clear()
  setUserId('user-a')
  store.resetStore()
})

describe('QuickActionsProvider', () => {
  it('lists every quick action in the menu', async () => {
    wrap(
      <QuickActionsProvider>
        <QuickAddMenu />
      </QuickActionsProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }))
    for (const q of QUICK) expect(await screen.findByRole('button', { name: q.label })).toBeInTheDocument()
    expect(QUICK).toHaveLength(7)
  })

  it('loads the form on demand: choosing "Add task" closes the menu and opens the task dialog', async () => {
    wrap(
      <QuickActionsProvider>
        <QuickAddMenu />
      </QuickActionsProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    expect(await screen.findByRole('dialog', { name: /task/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log water' })).not.toBeInTheDocument()
  })

  it('opens the water dialog from the menu too (a different lazy branch)', async () => {
    wrap(
      <QuickActionsProvider>
        <QuickAddMenu />
      </QuickActionsProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Log water' }))
    expect(await screen.findByRole('dialog', { name: /water/i }, { timeout: 5000 })).toBeInTheDocument()
  })
})

describe('HabitQuick', () => {
  it('says so when nothing is due', async () => {
    await store.load('habits')
    await store.load('habit_logs')
    wrap(<HabitQuick onClose={() => {}} />)
    expect(await screen.findByText(/No habits due today/)).toBeInTheDocument()
  })

  it('checks a due habit in and out', async () => {
    await store.load('habits')
    await store.load('habit_logs')
    await store.insert('habits', { name: 'Stretch', color: '#22C55E', frequency: 'daily', start_date: '2020-01-01' })
    wrap(<HabitQuick onClose={() => {}} />)
    const row = await screen.findByRole('button', { name: 'Stretch' })
    expect(row).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(row)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stretch' })).toHaveAttribute('aria-pressed', 'true'))
    expect(store.peek('habit_logs')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Stretch' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stretch' })).toHaveAttribute('aria-pressed', 'false'))
  })

  it('does not list archived habits', async () => {
    await store.load('habits')
    await store.load('habit_logs')
    const old = await store.insert('habits', {
      name: 'Old one',
      color: '#22C55E',
      frequency: 'daily',
      start_date: '2020-01-01',
      archived_at: '2021-01-01T00:00:00Z',
    })
    // an archived habit that still has a check-in for today must not come back as a row
    await store.insert('habit_logs', { habit_id: old.id, log_date: todayStr(), status: 'done' })
    wrap(<HabitQuick onClose={() => {}} />)
    expect(await screen.findByText(/No habits due today/)).toBeInTheDocument()
    expect(screen.queryByText('Old one')).not.toBeInTheDocument()
  })
})

describe('StudyStart', () => {
  const routes = (onClose) => (
    <Routes>
      <Route path="/" element={<StudyStart onClose={onClose} />} />
      <Route path="/learning" element={<p>learning page</p>} />
    </Routes>
  )

  it('starts a timer and goes to Learning', async () => {
    for (const t of ['goals', 'learning_topics', 'study_sessions']) await store.load(t)
    const onClose = vi.fn()
    render(<MemoryRouter>{routes(onClose)}</MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Start timer' }))
    expect(await screen.findByText('learning page')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
    expect(store.peek('study_sessions').filter((s) => s.status === 'running')).toHaveLength(1)
  })

  it('with a timer already running it only points you to it and starts nothing', async () => {
    for (const t of ['goals', 'learning_topics', 'study_sessions']) await store.load(t)
    await store.insert('study_sessions', { session_date: '2026-03-01', status: 'running', started_at: new Date().toISOString() })
    render(<MemoryRouter>{routes(() => {})}</MemoryRouter>)
    expect(await screen.findByText('A timer is already running.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start timer' }))
    expect(await screen.findByText('learning page')).toBeInTheDocument()
    expect(store.peek('study_sessions')).toHaveLength(1)
  })
})
