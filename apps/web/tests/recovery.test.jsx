import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, todayStr, zonedToMs } from '@/lib/dates'
import { freshBackend, renderApp, signedInUser, db } from './components/helpers'
import { pickTime } from './pickers'

// Smart Recovery through the real app and the in-browser backend: what a person sees and does, and what ends up stored.
vi.setConfig({ testTimeout: 60_000 })

const TZ = 'Asia/Kolkata'
let TODAY
beforeEach(async () => {
  await freshBackend()
  await signedInUser()
  TODAY = todayStr(TZ)
})

const open = async (path = '/recovery') => {
  const utils = renderApp(path)
  await screen.findByRole('heading', { name: 'Smart Recovery' }, { timeout: 40_000 })
  await waitFor(() => expect(screen.queryByRole('status', { name: /loading/i })).toBeNull())
  return utils
}
const task = async (title, priority, daysAgo, extra = {}) =>
  (await db.insert('tasks', [{ title, priority, due_date: addDays(TODAY, -daysAgo), ...extra }]))[0]
const cards = () => screen.queryAllByTestId('suggestion')
const iso = (d, t) => new Date(zonedToMs(d, t, TZ)).toISOString()

describe('Smart Recovery page', () => {
  it('says so when nothing slipped, and still offers settings and the load view', async () => {
    await open()
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Settings/ })).toBeInTheDocument()
    expect(screen.getAllByTestId('day-load').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Review & apply/ })).toBeDisabled()
  })

  it('lists slipped tasks most important first, with the reasons', async () => {
    await task('Low chore', 'low', 9)
    await task('Ship the report', 'urgent', 3)
    await task('Done already', 'high', 4, { status: 'done' })
    await task('Future task', 'high', -2)
    await open()
    await waitFor(() => expect(cards()).toHaveLength(2))
    const [first, second] = cards()
    expect(within(first).getByRole('heading', { name: 'Ship the report' })).toBeInTheDocument()
    expect(within(first).getByText('3 days overdue')).toBeInTheDocument()
    expect(within(first).getByText('Urgent priority')).toBeInTheDocument()
    expect(within(second).getByRole('heading', { name: 'Low chore' })).toBeInTheDocument()
    expect(screen.getByText('Slipped tasks').previousSibling).toHaveTextContent('2')
  })

  it('Accept moves the task onto a free time, records history, and Undo puts it back', async () => {
    const user = userEvent.setup()
    const t = await task('Ship the report', 'urgent', 3)
    await open()
    await waitFor(() => expect(cards()).toHaveLength(1))
    await user.click(within(cards()[0]).getByRole('button', { name: /Accept/ }))
    await waitFor(() => expect(cards()).toHaveLength(0))
    const [moved] = await db.list('tasks')
    expect(moved.due_date >= TODAY).toBe(true)
    expect(moved.start_time).toBeTruthy()
    const [h] = await db.list('task_reschedules')
    expect(h).toMatchObject({
      task_id: t.id,
      action: 'rescheduled',
      source: 'recovery',
      from_date: addDays(TODAY, -3),
      title: 'Ship the report',
    })
    const history = await screen.findByTestId('history')
    expect(within(history).getByText('Ship the report')).toBeInTheDocument()
    await user.click(within(history).getByRole('button', { name: /Undo/ }))
    await waitFor(async () => expect((await db.list('tasks'))[0].due_date).toBe(addDays(TODAY, -3)))
    expect((await db.list('tasks'))[0].start_time).toBeNull()
    await waitFor(() => expect(cards()).toHaveLength(1)) // slipped again, so it is suggested again
    expect((await db.list('task_reschedules'))[0].undone_at).toBeTruthy()
  })

  it('"Not now" hides the suggestion and the history can bring it back', async () => {
    const user = userEvent.setup()
    await task('Maybe later', 'medium', 2)
    await open()
    await waitFor(() => expect(cards()).toHaveLength(1))
    await user.click(within(cards()[0]).getByRole('button', { name: /Not now/ }))
    await waitFor(() => expect(cards()).toHaveLength(0))
    expect(await screen.findByText('Everything left is on hold')).toBeInTheDocument()
    const [row] = await db.list('task_reschedules')
    expect(row).toMatchObject({ action: 'dismissed', hide_until: addDays(TODAY, 3) })
    expect((await db.list('tasks'))[0].due_date).toBe(addDays(TODAY, -2)) // untouched
    await user.click(await screen.findByRole('button', { name: 'Show again' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
  })

  it('previews every change before anything is saved, then applies them together', async () => {
    const user = userEvent.setup()
    await task('One', 'high', 2)
    await task('Two', 'medium', 3)
    await open()
    await waitFor(() => expect(cards()).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: /Review & apply \(2\)/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Review changes' })
    expect(within(dialog).getByRole('list', { name: 'Changes to apply' }).children).toHaveLength(2)
    expect((await db.list('task_reschedules')).length).toBe(0) // nothing yet
    await user.click(within(dialog).getByRole('button', { name: 'Apply 2 changes' }))
    expect(await screen.findByText('2 tasks rescheduled')).toBeInTheDocument()
    const rows = await db.list('task_reschedules')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.batch_id)).size).toBe(1)
    const [a, b] = (await db.list('tasks')).map((t) => [t.due_date, t.start_time, t.end_time])
    expect(a[0] === b[0] ? a[1] !== b[1] : true).toBe(true) // never the same slot
    await user.click(within(dialog).getByRole('button', { name: /Undo all/ }))
    await waitFor(async () =>
      expect((await db.list('tasks')).map((t) => t.due_date).sort()).toEqual([addDays(TODAY, -3), addDays(TODAY, -2)]),
    )
  })

  it('a task left out of the selection is not applied', async () => {
    const user = userEvent.setup()
    await task('Keep', 'high', 2)
    await task('Skip', 'medium', 3)
    await open()
    await waitFor(() => expect(cards()).toHaveLength(2))
    await user.click(screen.getByRole('checkbox', { name: /Include Skip/ }))
    await user.click(screen.getByRole('button', { name: /Review & apply \(1\)/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Review changes' })
    await user.click(within(dialog).getByRole('button', { name: 'Apply 1 change' }))
    await screen.findByText('1 task rescheduled')
    const byTitle = Object.fromEntries((await db.list('tasks')).map((t) => [t.title, t]))
    expect(byTitle.Keep.start_time).toBeTruthy()
    expect(byTitle.Skip.due_date).toBe(addDays(TODAY, -3))
  })

  it('never suggests a time that clashes with a repeating event, and blocks a manual choice that does', async () => {
    const user = userEvent.setup()
    // a daily 14:00-15:00 series, started a week ago, so every day of the window has it
    await db.insert('calendar_events', [
      {
        title: 'Daily sync',
        starts_at: iso(addDays(TODAY, -7), '14:00'),
        ends_at: iso(addDays(TODAY, -7), '15:00'),
        timezone: TZ,
        rrule: { freq: 'daily' },
      },
    ])
    await task('Write', 'high', 1)
    await open()
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(within(cards()[0]).queryByText(/Free:/)).toBeNull()
    await user.click(within(cards()[0]).getByRole('button', { name: /Adjust/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose a time' })
    await pickTime(user, within(dialog).getByLabelText('Start time'), '14:30')
    expect(await within(dialog).findByText(/Overlaps Daily sync/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Use this time' })).toBeDisabled()
    await pickTime(user, within(dialog).getByLabelText('Start time'), '16:30')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Use this time' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: 'Use this time' }))
    await waitFor(() => expect(within(cards()[0]).getByText('Your choice')).toBeInTheDocument())
    await user.click(within(cards()[0]).getByRole('button', { name: /Accept/ }))
    await waitFor(async () => expect((await db.list('tasks'))[0].start_time).toMatch(/^16:30/))
    expect((await db.list('task_reschedules'))[0].source).toBe('manual')
    expect(await db.list('calendar_events')).toHaveLength(1) // the series itself is never touched
  })

  it('saves working hours in the calendar settings', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: /Settings/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Recovery settings' })
    await pickTime(user, within(dialog).getByLabelText('Day starts'), '08:00')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(async () =>
      expect((await db.list('user_settings'))[0].calendar_prefs).toMatchObject({
        recovery_work_start: '08:00',
        recovery_work_end: '18:00',
      }),
    )
  })
})

describe('Planner banner', () => {
  it('appears only when tasks slipped and leads to the recovery page', async () => {
    const user = userEvent.setup()
    renderApp('/planner')
    await screen.findByRole('heading', { name: 'Daily Planner' }, { timeout: 40_000 })
    expect(screen.queryByText(/slipped\./)).toBeNull()
    await task('Late', 'medium', 2)
    await task('Later', 'low', 4)
    const banner = await screen.findByRole('link', { name: /2 tasks slipped/ })
    await user.click(banner)
    expect(await screen.findByRole('heading', { name: 'Smart Recovery' })).toBeInTheDocument()
  })
})
