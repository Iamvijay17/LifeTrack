import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { todayStr } from '@/lib/dates'
import { db, freshBackend, renderApp, signedInUser } from '../components/helpers'

// Right-click menus through the real app and the in-browser backend: what a person does, and what ends up stored.
vi.setConfig({ testTimeout: 60_000 })
const TZ = 'Asia/Kolkata'
let TODAY
beforeEach(async () => {
  await freshBackend()
  await signedInUser()
  TODAY = todayStr(TZ)
})

const rightClick = (el, pos = { clientX: 200, clientY: 160 }) => fireEvent.contextMenu(el, pos)
const item = (name) => screen.findByRole('menuitem', { name })
const choice = (name) => screen.findByRole('menuitemradio', { name })
const rows = (table) => db.list(table)
const gone = () => waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
async function openPage(path, ready) {
  renderApp(path)
  return ready ? await ready() : null
}

describe('Tasks (Daily Planner)', () => {
  const taskRow = async (title) => (await screen.findByText(title, {}, { timeout: 40_000 })).closest('li')

  it('page menu adds a task for the viewed day; a row menu completes, reprioritises, re-dates, recategorises, duplicates, renames and deletes', async () => {
    const user = userEvent.setup()
    await db.insert('tasks', [{ title: 'Write report', due_date: TODAY, priority: 'medium', category: 'Personal' }])
    renderApp('/planner')
    const row = await taskRow('Write report')

    // page-level: empty space offers "New task"
    rightClick(screen.getByRole('main'))
    await user.click(await item(/New task for/))
    expect(await screen.findByRole('dialog', { name: 'New task' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // complete (and undo)
    rightClick(row)
    await user.click(await item('Mark complete'))
    await waitFor(async () => expect((await rows('tasks'))[0].status).toBe('done'))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await rows('tasks'))[0].status).toBe('pending'))

    // priority
    rightClick(await taskRow('Write report'))
    await user.click(await item('Priority'))
    await user.click(await choice('High'))
    await waitFor(async () => expect((await rows('tasks'))[0].priority).toBe('high'))

    // due date
    rightClick(await taskRow('Write report'))
    await user.click(await item('Due date'))
    await user.click(await item('Tomorrow'))
    await waitFor(async () => expect((await rows('tasks'))[0].due_date).not.toBe(TODAY))
    await user.click(await screen.findByRole('button', { name: 'Undo' })) // it left today's list; Undo brings it back
    await waitFor(async () => expect((await rows('tasks'))[0].due_date).toBe(TODAY))

    // category
    rightClick(await taskRow('Write report'))
    await user.click(await item('Move to category'))
    await user.click(await choice('Learning'))
    await waitFor(async () => expect((await rows('tasks'))[0].category).toBe('Learning'))

    // duplicate
    rightClick(await taskRow('Write report'))
    await user.click(await item('Duplicate'))
    await waitFor(async () => expect((await rows('tasks')).map((t) => t.title).sort()).toEqual(['Write report', 'Write report (copy)']))

    // rename
    rightClick(await taskRow('Write report (copy)'))
    await user.click(await item('Rename'))
    const dialog = await screen.findByRole('dialog', { name: 'Rename task' })
    await user.clear(within(dialog).getByLabelText('Title'))
    await user.type(within(dialog).getByLabelText('Title'), 'Second report')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await rows('tasks')).map((t) => t.title)).toContain('Second report'))

    // delete asks first
    rightClick(await taskRow('Second report'))
    await user.click(await item('Delete task'))
    const confirm = await screen.findByRole('dialog')
    expect((await rows('tasks')).length).toBe(2)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await rows('tasks')).map((t) => t.title)).toEqual(['Write report']))
  })

  it('several selected tasks get bulk actions', async () => {
    const user = userEvent.setup()
    await db.insert('tasks', [
      { title: 'One', due_date: TODAY },
      { title: 'Two', due_date: TODAY },
      { title: 'Three', due_date: TODAY },
    ])
    renderApp('/planner')
    const one = await taskRow('One')
    await user.keyboard('{Control>}')
    await user.click(one)
    await user.click(await taskRow('Two'))
    await user.keyboard('{/Control}')
    expect(await screen.findByText('2 tasks selected')).toBeInTheDocument()
    rightClick(await taskRow('Two'))
    await user.click(await item('Priority'))
    await user.click(await choice('Low'))
    await waitFor(async () =>
      expect(
        (await rows('tasks'))
          .filter((t) => t.priority === 'low')
          .map((t) => t.title)
          .sort(),
      ).toEqual(['One', 'Two']),
    )
    rightClick(await taskRow('One'))
    await user.click(await item('Delete 2 tasks'))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete 2' }))
    await waitFor(async () => expect((await rows('tasks')).map((t) => t.title)).toEqual(['Three']))
  })
})

describe('Dashboard', () => {
  it('empty-space menu refreshes, customises and manages widgets', async () => {
    const user = userEvent.setup()
    await db.insert('tasks', [{ title: 'Seed', due_date: TODAY }])
    renderApp('/')
    await screen.findByTestId('widget-grid', {}, { timeout: 40_000 })
    rightClick(screen.getByRole('main'))
    expect(await item('Refresh data')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Reset layout' })).toBeNull() // default layout: nothing to reset
    await user.click(screen.getByRole('menuitem', { name: 'Customize dashboard' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // a widget: hide it, then it comes back through Add widget
    const widget = within(screen.getByTestId('widget-grid')).getAllByText(/./, { selector: '[data-widget] *' })[0].closest('[data-widget]')
    const key = widget.dataset.widget
    rightClick(widget)
    await user.click(await item('Hide widget'))
    await waitFor(() => expect(screen.getByTestId('widget-grid').querySelector(`[data-widget="${key}"]`)).toBeNull())
    rightClick(screen.getByRole('main'))
    await user.click(await item('Add widget'))
    const sub = await screen.findByRole('menu', { name: 'Add widget' })
    await user.click(within(sub).getAllByRole('menuitem')[0])
    await waitFor(() => expect(screen.getByTestId('widget-grid').querySelector(`[data-widget="${key}"]`)).not.toBeNull())
    void gone
  })
})
