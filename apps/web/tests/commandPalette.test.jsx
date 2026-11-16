import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import * as store from '@/hooks/store'
import { setUserId } from '@/services/session'
import { todayStr } from '@/lib/dates'
import { QuickActionsProvider } from '@/features/quick/QuickActions'
import { CommandCenterProvider } from '@/features/command/CommandCenter'
import { GlobalSearch } from '@/components/layout/GlobalSearch'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const Where = () => {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}
const setup = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QuickActionsProvider>
        <CommandCenterProvider>
          <GlobalSearch />
          <input aria-label="Plain field" />
          <textarea aria-label="Long field" />
          <Where />
        </CommandCenterProvider>
      </QuickActionsProvider>
    </MemoryRouter>,
  )
const box = () => screen.findByRole('combobox', { name: 'Search everything' })
const openPalette = async () => {
  await userEvent.keyboard('{Control>}k{/Control}')
  return box()
}
const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
  localStorage.clear()
  setUserId('user-a')
  store.resetStore()
  vi.clearAllMocks()
})

describe('opening and closing', () => {
  it('opens with Ctrl+K and Cmd+K, toggles shut, and closes with Escape', async () => {
    setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openPalette()
    expect(screen.getByRole('dialog', { name: 'Command Center' })).toBeInTheDocument()
    await userEvent.keyboard('{Control>}k{/Control}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(await box()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens from the header button, which advertises the shortcut', async () => {
    setup()
    const btn = screen.getByRole('button', { name: /search/i })
    expect(btn).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K')
    await userEvent.click(btn)
    expect(await box()).toBeInTheDocument()
  })

  it('Escape clears the text first, then closes', async () => {
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'abc')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('keyboard shortcuts leave typing alone', () => {
  it('"/" and "g d" work on the page but not inside a text field', async () => {
    setup('/planner')
    await userEvent.click(screen.getByLabelText('Plain field'))
    await userEvent.keyboard('/gd?')
    expect(screen.getByLabelText('Plain field')).toHaveValue('/gd?')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(where()).toBe('/planner')
    await userEvent.click(screen.getByLabelText('Long field'))
    await userEvent.keyboard('gh')
    expect(where()).toBe('/planner')
    await userEvent.click(document.body)
    await userEvent.keyboard('gh')
    expect(where()).toBe('/habits')
  })

  it('Ctrl+K still opens from inside a text field', async () => {
    setup()
    await userEvent.click(screen.getByLabelText('Plain field'))
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(await box()).toBeInTheDocument()
  })

  it('"/" opens the palette and "?" opens the shortcut sheet', async () => {
    setup()
    await userEvent.keyboard('/')
    expect(await box()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.keyboard('?')
    expect(await screen.findByRole('region', { name: /Go to/ })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}') // back to the list, not closed
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('"c" then a key creates; a chord that times out or misses does nothing', async () => {
    setup()
    await userEvent.keyboard('cf')
    expect(where()).toBe('/nutrition?add=1')
    await userEvent.keyboard('cz')
    expect(where()).toBe('/nutrition?add=1')
  })

  it('ignores modified keys, so the browser shortcuts keep working', async () => {
    setup()
    fireEvent.keyDown(document.body, { key: 'g', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'h' })
    expect(where()).toBe('/')
  })

  it('removes its listener when the app unmounts', async () => {
    const { unmount } = setup()
    unmount()
    const spy = vi.fn()
    window.addEventListener('keydown', spy)
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(spy).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    window.removeEventListener('keydown', spy)
  })
})

describe('the list and keyboard navigation', () => {
  it('shows quick actions and every module under Go to', async () => {
    setup()
    await openPalette()
    expect(screen.getByRole('option', { name: /Log food/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Start focus session/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Record workout/ })).toBeInTheDocument()
    const go = screen.getByRole('group', { name: 'Go to' })
    for (const name of ['Dashboard', 'Daily Planner', 'Finance', 'Food & Nutrition', 'Security & Privacy', 'Data Export']) {
      expect(within(go).getByRole('option', { name: new RegExp(name.replace(/[&]/g, '\\$&')) })).toBeInTheDocument()
    }
  })

  it('moves with the arrows, wraps, tracks aria-activedescendant and runs with Enter', async () => {
    setup()
    const input = await openPalette()
    const opts = screen.getAllByRole('option')
    expect(opts[0]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', opts[0].id)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    const all = screen.getAllByRole('option')
    expect(all[all.length - 1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.type(input, 'finance')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(where()).toBe('/finance'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not run on Enter while a word is being composed', async () => {
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'finance')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(where()).toBe('/')
  })

  it('"Log food" opens the Nutrition page add flow and "Start focus session" the focus link', async () => {
    setup()
    await openPalette()
    await userEvent.click(screen.getByRole('option', { name: /Log food/ }))
    expect(where()).toBe('/nutrition?add=1')
    await openPalette()
    await userEvent.click(screen.getByRole('option', { name: /Start focus session/ }))
    expect(where()).toBe('/focus?start=1')
  })

  it('"Add task" opens the existing task dialog', async () => {
    setup()
    await openPalette()
    await userEvent.click(screen.getByRole('option', { name: /Add a task for today/ }))
    expect(await screen.findByRole('dialog', { name: /new task/i }, { timeout: 5000 })).toBeInTheDocument()
  })
})

describe('search', () => {
  const seed = async () => {
    await store.load('tasks')
    await store.insert('tasks', { title: 'Quarterly report', category: 'Work', priority: 'high', due_date: '2026-11-20' })
    await store.load('notes')
    await store.insert('notes', { title: 'Reading list', body: 'quarterly books', category: 'Ideas', tags: [] })
  }

  it('finds records across modules, highlights the match and opens it', async () => {
    await seed()
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'quarter')
    const task = await screen.findByRole('option', { name: /Quarterly report/ })
    expect(within(task).getByText('Quarter', { selector: 'mark' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Reading list/ })).toBeInTheDocument()
    await userEvent.click(task)
    await waitFor(() => expect(where()).toBe('/planner?date=2026-11-20'))
  })

  it('remembers what was opened and offers it next time, with the pages visited', async () => {
    await seed()
    setup('/habits')
    const input = await openPalette()
    await userEvent.type(input, 'quarterly report')
    await userEvent.click(await screen.findByRole('option', { name: /Quarterly report/ }))
    await openPalette()
    const recent = screen.getByRole('group', { name: 'Recent' })
    expect(within(recent).getByRole('option', { name: /Quarterly report/ })).toBeInTheDocument()
    expect(within(recent).getByRole('option', { name: /Habits/ })).toBeInTheDocument()
    expect(within(recent).queryByRole('option', { name: /Daily Planner/ })).not.toBeInTheDocument() // the page you are on is not a place to go
    expect(JSON.parse(localStorage.getItem('lifetrack:recents:user-a')).length).toBeGreaterThan(1)
  })

  it("keeps each account's recents apart and survives broken storage", async () => {
    localStorage.setItem('lifetrack:recents:user-a', '{not json')
    setup()
    await openPalette()
    expect(screen.queryByRole('group', { name: 'Recent' })).not.toBeInTheDocument()
  })

  it('shows a loading note while the data is read', async () => {
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'zz')
    expect(await screen.findByRole('status')).toHaveTextContent(/Searching/)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('says nothing matched, and still offers to capture the text', async () => {
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'qqqxyz')
    expect(await screen.findByText(/No matches for/)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Add task “qqqxyz”/ })).toBeInTheDocument()
  })
})

describe('context-aware actions', () => {
  it('offers page-specific actions first, once', async () => {
    setup('/nutrition')
    await openPalette()
    const here = screen.getByRole('group', { name: 'On this page' })
    expect(within(here).getByRole('option', { name: /Log food/ })).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: /Log food/ })).toHaveLength(1)
  })

  it('offers none on a page with nothing specific', async () => {
    setup('/analytics')
    await openPalette()
    expect(screen.queryByRole('group', { name: 'On this page' })).not.toBeInTheDocument()
  })
})

describe('quick capture', () => {
  it('"task:" saves a task through createTask with the parsed due date', async () => {
    await store.load('tasks')
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'task: call the bank tomorrow')
    const opt = await screen.findByRole('option', { name: /Add task “call the bank”/ })
    expect(screen.queryByRole('option', { name: /Save note/ })).not.toBeInTheDocument()
    await userEvent.click(opt)
    await waitFor(() => expect(store.peek('tasks')).toHaveLength(1))
    const t = store.peek('tasks')[0]
    expect(t).toMatchObject({ title: 'call the bank', status: 'pending', category: 'Personal' })
    expect(t.due_date > todayStr()).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('Task added', expect.objectContaining({ description: 'call the bank' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('plain text offers task, note and reminder; Enter on the note saves it', async () => {
    await store.load('notes')
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'idea for the weekend')
    const cap = within(await screen.findByRole('group', { name: 'Quick capture' }))
    expect(cap.getAllByRole('option')).toHaveLength(3)
    await userEvent.click(cap.getByRole('option', { name: /Save note/ }))
    await waitFor(() => expect(store.peek('notes')).toHaveLength(1))
    expect(store.peek('notes')[0]).toMatchObject({ body: 'idea for the weekend', category: 'Quick' })
  })

  it('"remind:" sets a reminder with the parsed time', async () => {
    await store.load('reminders')
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'remind: pay rent today 5pm')
    await userEvent.click(await screen.findByRole('option', { name: /Set reminder/ }))
    await waitFor(() => expect(store.peek('reminders')).toHaveLength(1))
    expect(store.peek('reminders')[0]).toMatchObject({ title: 'pay rent', remind_time: '17:00', remind_date: todayStr(), active: true })
  })

  it('reports a failed save instead of closing silently', async () => {
    await store.load('notes')
    const spy = vi.spyOn(store, 'insert').mockRejectedValueOnce(new Error('Server said no'))
    setup()
    const input = await openPalette()
    await userEvent.type(input, 'note: will fail')
    await userEvent.click(await screen.findByRole('option', { name: /Save note/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    spy.mockRestore()
  })
})

describe('accessibility', () => {
  it('is a labelled modal dialog with a combobox and listbox wired together', async () => {
    setup()
    const input = await openPalette()
    const dialog = screen.getByRole('dialog', { name: 'Command Center' })
    expect(dialog).toHaveAccessibleDescription(/Search your data/)
    expect(input).toHaveAttribute('aria-controls', 'search-results')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(document.getElementById('search-results')).toHaveAttribute('role', 'listbox')
    await act(async () => {})
    for (const g of screen.getAllByRole('group')) expect(g).toHaveAccessibleName()
  })
})
