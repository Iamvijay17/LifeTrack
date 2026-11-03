import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAction } from '@/hooks/useAction'
import { HabitDialog } from '@/features/habits/HabitDialog'
import { setUserId } from '@/services/session'
import * as store from '@/hooks/store'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))
const { toast } = await import('sonner')

beforeEach(() => {
  localStorage.clear()
  setUserId('user-a')
  store.resetStore()
  vi.clearAllMocks()
})

const Boom = ({ explode }) => {
  if (explode) throw new Error('bad row')
  return <p>fine</p>
}

describe('ErrorBoundary', () => {
  it('shows a recovery screen instead of a blank page, and recovers when the route changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Boom explode />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
    rerender(
      <ErrorBoundary resetKey="/b">
        <Boom explode={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })
})

describe('useAction', () => {
  function Harness({ fn }) {
    const [run, pending] = useAction(fn, { success: 'Saved' })
    return (
      <button onClick={run} disabled={false}>
        {pending ? 'busy' : 'go'}
      </button>
    )
  }
  it('ignores a second click while the first is running, then toasts success', async () => {
    let release
    const fn = vi.fn(
      () =>
        new Promise((r) => {
          release = r
        }),
    )
    render(<Harness fn={fn} />)
    const btn = screen.getByRole('button')
    await userEvent.click(btn)
    await userEvent.click(btn)
    expect(fn).toHaveBeenCalledTimes(1)
    await act(async () => release())
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved'))
  })
  it('surfaces failures as a friendly error toast', async () => {
    render(<Harness fn={() => Promise.reject(new Error('nope'))} />)
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'))
  })
})

describe('HabitDialog (useEntityForm)', () => {
  function Host({ habit }) {
    const [open, setOpen] = useState(true)
    return open ? <HabitDialog open onOpenChange={setOpen} habit={habit} today="2026-03-01" /> : <p>closed</p>
  }
  it('validates, creates a habit and closes', async () => {
    await store.load('habits')
    render(<Host />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name your habit')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Name'), 'Read 20 pages')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument())
    expect(store.peek('habits')).toMatchObject([{ name: 'Read 20 pages', frequency: 'daily', start_date: '2026-03-01' }])
  })
  it('edits an existing habit with its current values pre-filled', async () => {
    await store.load('habits')
    const h = await store.insert('habits', { name: 'Run', color: '#22C55E', frequency: 'daily', start_date: '2026-01-01' })
    render(<Host habit={h} />)
    const name = await screen.findByLabelText('Name')
    await waitFor(() => expect(name).toHaveValue('Run'))
    await userEvent.clear(name)
    await userEvent.type(name, 'Run 5k')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(store.peek('habits')[0].name).toBe('Run 5k'))
    expect(store.peek('habits')).toHaveLength(1)
  })
})
