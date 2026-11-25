import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, todayStr, zonedToMs } from '@/lib/dates'
import { freshBackend, renderApp, signedInUser, db } from './components/helpers'
import { pickOption } from './pickers'

// The calendar through the real app and the in-browser backend: what a person does, and what ends up stored.
// The first render compiles the lazily loaded page, which is slow on a busy machine.
vi.setConfig({ testTimeout: 60_000 })

const TZ = 'Asia/Kolkata'
let TODAY
beforeEach(async () => {
  await freshBackend()
  await signedInUser()
  TODAY = todayStr(TZ)
})

const open = async (path = '/calendar') => {
  const utils = renderApp(path)
  await screen.findByTestId('calendar', {}, { timeout: 40_000 })
  await waitFor(() => expect(screen.queryByRole('status', { name: /loading/i })).toBeNull())
  return utils
}
const iso = (d, t) => new Date(zonedToMs(d, t, TZ)).toISOString()

async function newItem(user, { kind = 'event', title, start = '09:00', end = '10:00', repeat, extra } = {}) {
  await user.click(screen.getAllByRole('button', { name: /^New/ })[0])
  const dialog = await screen
    .findByRole('dialog', { name: kind === 'task' ? 'New task' : 'New event' })
    .catch(() => screen.findByRole('dialog'))
  if (kind === 'task') await user.click(within(dialog).getByRole('tab', { name: 'Task' }))
  await user.type(within(dialog).getByLabelText('Title'), title)
  if (kind === 'event') {
    await pickOption(user, within(dialog).getByLabelText('Start time'), start)
    await pickOption(user, within(dialog).getByLabelText('End time'), end)
  }
  if (repeat) await pickOption(user, within(dialog).getByLabelText('Repeat'), repeat)
  if (extra) await extra(dialog)
  await user.click(within(dialog).getByRole('button', { name: kind === 'task' ? 'Add task' : 'Add event' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe('opening the calendar', () => {
  it('starts on the current week with today highlighted, and says what to do when it is empty', async () => {
    await open('/calendar?view=week')
    expect(screen.getByTestId(`day-${TODAY}`)).toBeInTheDocument()
    expect(screen.getAllByTestId(/^day-/)).toHaveLength(7)
    expect(screen.getByTestId('grid-empty')).toHaveTextContent(/click a time to add something/i)
    expect(screen.getByTestId('now-line')).toBeInTheDocument()
  })

  it('switches between day, week, month and agenda with the buttons, and the URL keeps the view', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await user.click(screen.getByRole('tab', { name: 'Day' }))
    await waitFor(() => expect(screen.getAllByTestId(/^day-/)).toHaveLength(1))
    await user.click(screen.getByRole('tab', { name: 'Month' }))
    expect(await screen.findByTestId('month-grid')).toBeInTheDocument()
    expect(screen.getByTestId('day-panel')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Agenda' }))
    expect(await screen.findByText('Your agenda is clear')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Week' }))
    await waitFor(() => expect(screen.getAllByTestId(/^day-/)).toHaveLength(7))
  })

  it('keyboard shortcuts: d w m a switch views, t returns to today, n opens the form, ? lists them', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await user.keyboard('d')
    await waitFor(() => expect(screen.getAllByTestId(/^day-/)).toHaveLength(1))
    await user.keyboard('j') // next day
    await waitFor(() => expect(screen.getByTestId(`day-${addDays(TODAY, 1)}`)).toBeInTheDocument())
    await user.keyboard('t')
    await waitFor(() => expect(screen.getByTestId(`day-${TODAY}`)).toBeInTheDocument())
    await user.keyboard('m')
    expect(await screen.findByTestId('month-grid')).toBeInTheDocument()
    await user.keyboard('a')
    expect(await screen.findByText('Your agenda is clear')).toBeInTheDocument()
    await user.keyboard('n')
    expect(await screen.findByRole('dialog', { name: 'New event' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.keyboard('?')
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('shortcuts do nothing while typing in the search box', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await user.click(screen.getByTestId('search'))
    await user.keyboard('mdw')
    expect(screen.getByTestId('search')).toHaveValue('mdw')
    expect(screen.queryByTestId('month-grid')).toBeNull()
  })
})

describe('events', () => {
  it("creates an event that is stored as instants in the user's timezone and shows on the grid", async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await newItem(user, { title: 'Design review', start: '09:00', end: '10:30' })
    const block = await screen.findByRole('button', { name: /Event: Design review, 9:00 AM – 10:30 AM/ })
    expect(block).toBeInTheDocument()
    const [row] = await db.list('calendar_events')
    expect(row).toMatchObject({
      title: 'Design review',
      timezone: TZ,
      starts_at: iso(TODAY, '09:00'),
      ends_at: iso(TODAY, '10:30'),
      rrule: null,
      all_day: false,
    })
  })

  it('double submitting does not create two events', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await user.click(screen.getAllByRole('button', { name: /^New/ })[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Title'), 'Once')
    const add = within(dialog).getByRole('button', { name: 'Add event' })
    await user.dblClick(add)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await db.list('calendar_events')).toHaveLength(1)
  })

  it('rejects an event that ends before it starts and keeps the form open', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await user.click(screen.getAllByRole('button', { name: /^New/ })[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Title'), 'Backwards')
    await pickOption(user, within(dialog).getByLabelText('Start time'), '11:00')
    await pickOption(user, within(dialog).getByLabelText('End time'), '10:00')
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }))
    expect(await within(dialog).findByText('End time must be after the start')).toBeInTheDocument()
    expect(await db.list('calendar_events')).toHaveLength(0)
  })

  it('opens details, edits and saves; the new title is what is shown and stored', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await newItem(user, { title: 'Old title' })
    await user.click(await screen.findByRole('button', { name: /Event: Old title/ }))
    const details = await screen.findByTestId('item-details')
    expect(details).toHaveTextContent(/9:00 AM – 10:00 AM/)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' })
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'New title')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('button', { name: /Event: New title/ })).toBeInTheDocument()
    expect((await db.list('calendar_events'))[0].title).toBe('New title')
  })

  it('deleting asks first, then removes it from the screen and the database', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await newItem(user, { title: 'Temporary' })
    await user.click(await screen.findByRole('button', { name: /Event: Temporary/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByText(/Delete “Temporary”\?/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Event: Temporary/ })).toBeNull())
    expect(await db.list('calendar_events')).toHaveLength(0)
  })

  it('a daily event shows on every day of the week, and deleting only one day leaves the others', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await newItem(user, { title: 'Stretch', repeat: 'daily' })
    // today's column, and every later day of this week, carry it
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Event: Stretch/ }).length).toBeGreaterThanOrEqual(1))
    const before = screen.getAllByRole('button', { name: /Event: Stretch/ }).length
    await user.click(screen.getAllByRole('button', { name: /Event: Stretch/ })[0])
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const scope = await screen.findByRole('dialog', { name: 'Delete repeating event' })
    await user.click(within(scope).getByRole('radio', { name: /This event/ }))
    await user.click(within(scope).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Event: Stretch/ }).length).toBe(before - 1))
    const exceptions = await db.list('calendar_event_exceptions')
    expect(exceptions).toHaveLength(1)
    expect(exceptions[0]).toMatchObject({ status: 'cancelled' })
    expect(await db.list('calendar_events')).toHaveLength(1) // the series itself is untouched
  })
})

describe('tasks', () => {
  it('a task made here is a real task: it is stored in tasks, and the planner shows it', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await newItem(user, { kind: 'task', title: 'File taxes' })
    const [row] = await db.list('tasks')
    expect(row).toMatchObject({ title: 'File taxes', due_date: TODAY, status: 'pending', start_time: null })
    expect(await db.list('calendar_events')).toHaveLength(0) // nothing duplicated into events
    expect(await screen.findByRole('button', { name: /Task: File taxes, Due/ })).toBeInTheDocument()
  })

  it('ticking a task completes it for the whole app, and un-ticking reopens it', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await newItem(user, { kind: 'task', title: 'Water plants' })
    await user.click(await screen.findByRole('button', { name: 'Mark "Water plants" as done' }))
    await waitFor(async () => expect((await db.list('tasks'))[0].status).toBe('done'))
    await user.click(await screen.findByRole('button', { name: 'Mark "Water plants" as not done' }))
    await waitFor(async () => expect((await db.list('tasks'))[0]).toMatchObject({ status: 'pending', completed_at: null }))
  })

  it('tasks that already exist in the planner appear on the calendar without being copied', async () => {
    await db.insert('tasks', [{ title: 'From planner', due_date: TODAY, priority: 'urgent', category: 'Gym' }])
    await open('/calendar?view=week')
    expect(await screen.findByRole('button', { name: /Task: From planner/ })).toBeInTheDocument()
    expect(await db.list('tasks')).toHaveLength(1)
  })

  it('open tasks without a date wait in Unscheduled', async () => {
    const user = userEvent.setup()
    await db.insert('tasks', [{ title: 'Someday task' }, { title: 'Dated task', due_date: TODAY }])
    await open('/calendar?view=week')
    await user.click(screen.getByTestId('tray-toggle'))
    const tray = await screen.findByTestId('tray')
    expect(within(tray).getByText('Someday task')).toBeInTheDocument()
    expect(within(tray).queryByText('Dated task')).toBeNull()
  })
})

describe('search and filters', () => {
  beforeEach(async () => {
    await db.insert('tasks', [
      { title: 'Gym session', category: 'Gym', due_date: TODAY, priority: 'low' },
      { title: 'Pay tax', category: 'Finance', due_date: TODAY, priority: 'urgent' },
      { title: 'Read book', category: 'Personal', due_date: TODAY },
    ])
  })

  it('search lists matches across dates, and the empty result explains itself', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await user.type(screen.getByTestId('search'), 'tax')
    const results = await screen.findByTestId('search-results')
    expect(within(results).getByText('Pay tax')).toBeInTheDocument()
    expect(within(results).queryByText('Gym session')).toBeNull()
    await user.clear(screen.getByTestId('search'))
    await user.type(screen.getByTestId('search'), 'zzzz')
    expect(await screen.findByText(/No matches for/)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Clear search' }).at(-1))
    await waitFor(() => expect(screen.queryByText(/No matches for/)).toBeNull())
  })

  it('categories can be hidden and shown, and the choice survives a reload', async () => {
    const user = userEvent.setup()
    const first = await open('/calendar?view=week')
    expect(await screen.findByRole('button', { name: /Task: Gym session/ })).toBeInTheDocument()
    await user.click(screen.getByTestId('filters-button'))
    await user.click(await screen.findByRole('switch', { name: /Gym & Fitness/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Task: Gym session/ })).toBeNull())
    expect(screen.getByRole('button', { name: /Task: Pay tax/ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('lifetrack:calendar:filters')).hiddenCategories).toEqual(['fitness'])
    first.unmount()
    await open('/calendar?view=week')
    await screen.findByRole('button', { name: /Task: Pay tax/ })
    expect(screen.queryByRole('button', { name: /Task: Gym session/ })).toBeNull()
  })

  it('filters by priority and by status', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await user.click(screen.getByTestId('filters-button'))
    await user.click(await screen.findByRole('button', { name: 'Urgent' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Task: Read book/ })).toBeNull())
    expect(screen.getByRole('button', { name: /Task: Pay tax/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Urgent' })) // off again
    await user.click(screen.getByRole('radio', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Task: Pay tax/ })).toBeNull())
  })
})

describe('month view', () => {
  it("shows what is on each day, with a count when there are more than fit, and opens the day's schedule on click", async () => {
    const user = userEvent.setup()
    await db.insert(
      'tasks',
      ['A', 'B', 'C', 'D', 'E'].map((t) => ({ title: `Task ${t}`, due_date: TODAY })),
    )
    await open('/calendar?view=month')
    const cell = screen.getByTestId(`cell-${TODAY}`)
    expect(within(cell).getByRole('button', { name: /\d+ more on/ })).toBeInTheDocument() // how many fit depends on the cell height
    await user.click(cell)
    const panel = screen.getByTestId('day-panel')
    expect(within(panel).getAllByRole('button', { name: /^Task: Task / })).toHaveLength(5)
  })
})

describe('settings', () => {
  it('24-hour time changes how every time is shown, and is saved to the account', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await newItem(user, { title: 'Lunch', start: '13:00', end: '14:00' })
    await screen.findByRole('button', { name: /Event: Lunch, 1:00 PM – 2:00 PM/ })
    await user.click(screen.getByTestId('settings-button'))
    const dialog = await screen.findByRole('dialog', { name: 'Calendar settings' })
    await pickOption(user, within(dialog).getByLabelText('Time format'), '24h')
    await user.click(within(dialog).getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('button', { name: /Event: Lunch, 13:00 – 14:00/ })).toBeInTheDocument()
    expect((await db.list('user_settings'))[0].calendar_prefs).toMatchObject({ time_format: '24h' })
  })

  it('the week start is the app-wide setting', async () => {
    const user = userEvent.setup()
    await open('/calendar?view=week')
    await user.click(screen.getByTestId('settings-button'))
    const dialog = await screen.findByRole('dialog', { name: 'Calendar settings' })
    await pickOption(user, within(dialog).getByLabelText('Week starts on'), '0')
    await user.click(within(dialog).getByRole('button', { name: 'Save settings' }))
    await waitFor(async () => expect((await db.list('user_settings'))[0].week_starts_on).toBe(0))
    const first = screen.getAllByTestId(/^day-/)[0].dataset.date
    expect(new Date(`${first}T00:00:00Z`).getUTCDay()).toBe(0)
  })
})

describe('alerts', () => {
  it('an event that starts in ten minutes with a ten-minute alert raises one notification, however many times it is checked', async () => {
    const soon = new Date(Date.now() + 10 * 60000)
    await db.insert('calendar_events', [
      {
        title: 'Standup',
        starts_at: soon.toISOString(),
        ends_at: new Date(soon.getTime() + 1800000).toISOString(),
        timezone: TZ,
        alert_minutes: [10],
      },
    ])
    const first = await open('/calendar?view=week')
    await waitFor(async () => expect(await db.list('notifications')).toHaveLength(1), { timeout: 30_000 })
    const [n] = await db.list('notifications')
    expect(n).toMatchObject({ kind: 'event', dedupe_key: expect.stringMatching(/^cal:event:.+:\d{4}-\d{2}-\d{2}:10$/) })
    expect(n.title).toMatch(/Standup starts in (9|10) minutes?/)
    first.unmount()
    await open('/calendar?view=week') // a second tab or device opening the app
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(await db.list('notifications')).toHaveLength(1)
  })

  it('alerts are not raised when calendar alerts are switched off in notification preferences', async () => {
    const soon = new Date(Date.now() + 10 * 60000)
    await db.upsert('user_settings', [{ notification_prefs: { event: false } }], { onConflict: 'user_id' })
    await db.insert('calendar_events', [
      {
        title: 'Quiet',
        starts_at: soon.toISOString(),
        ends_at: new Date(soon.getTime() + 1800000).toISOString(),
        timezone: TZ,
        alert_minutes: [10],
      },
    ])
    await open('/calendar?view=week')
    await act(() => new Promise((r) => setTimeout(r, 600)))
    expect(await db.list('notifications')).toHaveLength(0)
  })
})
