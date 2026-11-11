import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, todayStr, zonedToMs } from '@/lib/dates'
import { freshBackend, renderApp, signedInUser, db } from './components/helpers'
import { pickDate, pickOption, pickTime } from './pickers'

// The notification centre through the real app and the in-browser backend: what a person does, and what ends up stored.
// The first render compiles the lazily loaded page, which is slow on a busy machine.
vi.setConfig({ testTimeout: 60_000 })

const TZ = 'Asia/Kolkata'
const MIN = 60_000
const iso = (ms) => new Date(ms).toISOString()

const seed = (...rows) =>
  db.insert(
    'notifications',
    rows.map((r, i) => ({ kind: 'custom', body: '', link: '', priority: 'normal', created_at: iso(Date.now() - (30 + i) * MIN), ...r })), // older than the 3 minutes in which a device announces an arrival
  )
const stored = async () => db.list('notifications')
const byTitle = async (title) => (await stored()).find((n) => n.title === title)

beforeEach(async () => {
  await freshBackend()
  await signedInUser()
  // Nudges from the other modules depend on the time of day, which would make these tests depend on when they run. They have their own test below.
  await db.upsert('user_settings', [{ notification_settings: { smart: false } }], { onConflict: 'user_id' })
})
afterEach(() => vi.useRealTimers())

const open = async (path = '/notifications') => {
  const utils = renderApp(path)
  // The Notifications page has tabs; other pages are ready once the bell is there.
  if (path.startsWith('/notifications')) await screen.findByRole('tab', { name: /Inbox/ }, { timeout: 40_000 })
  else await screen.findByRole('button', { name: /^Notifications/ }, { timeout: 40_000 })
  await waitFor(() => expect(screen.queryByRole('status', { name: /loading/i })).toBeNull())
  return utils
}
// A toast with the same words can be on screen too, so find the card itself.
const card = (title) =>
  screen
    .getAllByText(title)
    .map((e) => e.closest('[data-testid="notification"]'))
    .find(Boolean)
const cards = () => screen.queryAllByTestId('notification').map((c) => c.querySelector('p').textContent.replace(/^Unread: /, ''))
const tab = (name) => screen.getByRole('tab', { name })

describe('the inbox', () => {
  it('lists what needs attention, newest first, with unread, priority and missed markers, and counts the unread', async () => {
    await seed(
      { title: 'Submit tax documents', priority: 'urgent' },
      { title: 'Pay electricity bill', kind: 'bill', due_at: iso(Date.now() - 6 * 3600_000), created_at: iso(Date.now() - 10 * MIN) },
      { title: 'Read chapter 3', kind: 'study', read_at: iso(Date.now()), created_at: iso(Date.now() - 50 * MIN) },
      { title: 'Old news', dismissed_at: iso(Date.now()), read_at: iso(Date.now()) },
      { title: 'Stretch', snoozed_until: iso(Date.now() + 3600_000) },
    )
    await open()
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(cards()).toEqual(['Pay electricity bill', 'Submit tax documents', 'Read chapter 3']) // newest first; dismissed and snoozed are not here
    expect(tab(/Inbox/)).toHaveTextContent('Inbox (2)') // two unread
    expect(card('Submit tax documents')).toHaveTextContent('Urgent')
    expect(card('Submit tax documents')).toHaveAttribute('data-unread', 'true')
    expect(card('Pay electricity bill')).toHaveTextContent(/Missed · was due/)
    expect(card('Pay electricity bill')).toHaveTextContent('Finance')
    expect(card('Read chapter 3')).not.toHaveAttribute('data-unread')
    expect(screen.getByText(/unread/, { selector: 'p[aria-live]' })).toHaveTextContent('2 unread · 1 snoozed')
    expect(screen.getByTestId('unread-count')).toHaveTextContent('2') // the bell agrees
  })

  it('an empty inbox invites you to set a reminder', async () => {
    const user = userEvent.setup()
    await open()
    expect(await screen.findByText('No notifications')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Set a reminder' }))
    expect(await screen.findByRole('dialog', { name: 'New reminder' })).toBeInTheDocument()
  })

  it('marks one read and unread, all read, and dismisses all the read ones', async () => {
    const user = userEvent.setup()
    await seed({ title: 'A' }, { title: 'B' }, { title: 'C' })
    await open()
    await waitFor(() => expect(cards()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Mark A as read' }))
    await waitFor(() => expect(tab(/Inbox/)).toHaveTextContent('Inbox (2)'))
    expect((await byTitle('A')).read_at).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Mark A as unread' }))
    await waitFor(() => expect(tab(/Inbox/)).toHaveTextContent('Inbox (3)'))
    expect((await byTitle('A')).read_at).toBeNull()
    await user.click(screen.getByRole('button', { name: /Mark all read/ }))
    await waitFor(() => expect(screen.queryByTestId('unread-count')).toBeNull())
    await waitFor(async () => expect((await stored()).every((n) => n.read_at)).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Dismiss read' }))
    await waitFor(() => expect(screen.getByText('Inbox zero')).toBeInTheDocument())
    expect((await stored()).every((n) => n.dismissed_at)).toBe(true) // moved to the history, not deleted
  })
})

describe('dismiss, snooze and restore', () => {
  it('dismissing moves a notification to the history, with an Undo', async () => {
    const user = userEvent.setup()
    await seed({ title: 'Call mom' }, { title: 'Water plants' })
    await open()
    await waitFor(() => expect(cards()).toEqual(['Call mom', 'Water plants']))
    await user.click(screen.getByRole('button', { name: 'Dismiss Call mom' }))
    await waitFor(() => expect(cards()).toEqual(['Water plants']))
    const dismissed = await byTitle('Call mom')
    expect(dismissed.dismissed_at).toBeTruthy()
    expect(dismissed.read_at).toBeTruthy() // dismissing counts as seeing it
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect((await byTitle('Call mom')).dismissed_at).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Dismiss Call mom' }))
    await user.click(tab('History'))
    await waitFor(() => expect(within(card('Call mom')).getByText('Dismissed')).toBeInTheDocument())
    expect(cards().sort()).toEqual(['Call mom', 'Water plants']) // the history keeps everything
    await user.click(screen.getByRole('button', { name: 'Restore Call mom' }))
    await waitFor(async () => expect((await byTitle('Call mom')).dismissed_at).toBeNull())
  })

  it('snoozing hides it until the time, makes it unread again, and it can be brought back early', async () => {
    const user = userEvent.setup()
    await seed({ title: 'Stretch', read_at: iso(Date.now() - 10 * MIN) })
    await open()
    await waitFor(() => expect(cards()).toEqual(['Stretch']))
    const before = Date.now()
    await user.click(screen.getByRole('button', { name: 'Snooze Stretch' }))
    await user.click(await screen.findByRole('menuitem', { name: /^1 hour/ }))
    await waitFor(() => expect(screen.getByText('Inbox zero')).toBeInTheDocument())
    const n = await byTitle('Stretch')
    expect(Date.parse(n.snoozed_until)).toBeGreaterThanOrEqual(before + 60 * MIN)
    expect(Date.parse(n.snoozed_until)).toBeLessThan(Date.now() + 61 * MIN)
    expect(n.read_at).toBeNull() // unread again, so it is noticed when it returns
    expect(screen.getByText(/Snoozed \(1\)/)).toBeInTheDocument()
    expect(screen.queryByTestId('unread-count')).toBeNull() // hidden notifications are not in the badge
    await user.click(screen.getByRole('button', { name: /Snoozed \(1\)/ }))
    await user.click(await screen.findByRole('button', { name: 'Bring back Stretch' }))
    await waitFor(() => expect(cards()).toEqual(['Stretch']))
    expect((await byTitle('Stretch')).snoozed_until).toBeNull()
  })

  it('a snoozed notification comes back on its own when its time arrives', async () => {
    await seed({ title: 'Wake me', snoozed_until: iso(Date.now() + 20_000) })
    await open()
    expect(await screen.findByText('Inbox zero')).toBeInTheDocument()
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60_000 }) // a minute passes
    await waitFor(() => expect(cards()).toEqual(['Wake me']), { timeout: 20_000 })
    expect(tab(/Inbox/)).toHaveTextContent('Inbox (1)')
  })

  it('"Pick date & time" refuses a time in the past and saves a good one', async () => {
    const user = userEvent.setup()
    await seed({ title: 'Renew passport' })
    await open()
    await waitFor(() => expect(cards()).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Snooze Renew passport' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Pick date & time…' }))
    const dlg = await screen.findByRole('dialog', { name: 'Snooze until…' })
    const today = todayStr(TZ)
    await pickDate(user, within(dlg).getByLabelText('Date'), today)
    await pickTime(user, within(dlg).getByLabelText('Time'), '00:00')
    await user.click(within(dlg).getByRole('button', { name: 'Snooze' }))
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Pick a time in the future')
    expect((await byTitle('Renew passport')).snoozed_until).toBeNull()
    const nextWeek = addDays(today, 7)
    await pickDate(user, within(dlg).getByLabelText('Date'), nextWeek)
    await pickTime(user, within(dlg).getByLabelText('Time'), '09:30')
    await user.click(within(dlg).getByRole('button', { name: 'Snooze' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(Date.parse((await byTitle('Renew passport')).snoozed_until)).toBe(zonedToMs(nextWeek, '09:30', TZ))
  })
})

describe('finding things', () => {
  it('narrows by search, category and priority, and says so when nothing matches', async () => {
    const user = userEvent.setup()
    await seed(
      { title: 'Electricity bill due', kind: 'bill', priority: 'high' },
      { title: '3 tasks due today', kind: 'task', body: 'File taxes · Call plumber' },
      { title: '2 habits left today', kind: 'habit' },
      { title: 'Rent is due', kind: 'bill' },
    )
    await open()
    await waitFor(() => expect(cards()).toHaveLength(4))
    await user.type(screen.getByLabelText('Search notifications'), 'plumber')
    await waitFor(() => expect(cards()).toEqual(['3 tasks due today'])) // found in the body
    await user.clear(screen.getByLabelText('Search notifications'))
    await user.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: /^Finance/ }))
    await waitFor(() => expect(cards().sort()).toEqual(['Electricity bill due', 'Rent is due']))
    await pickOption(user, screen.getByLabelText('Priority'), 'high')
    await waitFor(() => expect(cards()).toEqual(['Electricity bill due']))
    await user.type(screen.getByLabelText('Search notifications'), 'zzz')
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(cards()).toHaveLength(4))
  })

  it('the history keeps everything, filters by status, and deletes dismissed ones only after asking', async () => {
    const user = userEvent.setup()
    await seed(
      { title: 'Unread one' },
      { title: 'Read one', read_at: iso(Date.now()) },
      { title: 'Snoozed one', snoozed_until: iso(Date.now() + 3600_000) },
      { title: 'Dismissed one', dismissed_at: iso(Date.now()), read_at: iso(Date.now()) },
    )
    await open('/notifications?tab=history')
    await waitFor(() => expect(cards()).toHaveLength(4))
    await pickOption(user, screen.getByLabelText('Status'), 'dismissed')
    await waitFor(() => expect(cards()).toEqual(['Dismissed one']))
    await pickOption(user, screen.getByLabelText('Status'), 'snoozed')
    await waitFor(() => expect(cards()).toEqual(['Snoozed one']))
    await pickOption(user, screen.getByLabelText('Status'), 'all')
    await waitFor(() => expect(cards()).toHaveLength(4))
    await user.click(screen.getByRole('button', { name: 'Delete dismissed' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await stored()).toHaveLength(4) // declined: nothing was deleted
    await user.click(screen.getByRole('button', { name: 'Delete dismissed' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await stored()).map((n) => n.title).sort()).toEqual(['Read one', 'Snoozed one', 'Unread one']))
  })
})

describe('the drawer', () => {
  it('opens from the bell, shows the inbox, acts on it, and closes with Escape or when you go somewhere', async () => {
    const user = userEvent.setup()
    await seed({ title: 'Pay rent', kind: 'bill', link: '/finance', priority: 'high' }, { title: 'Call dentist' })
    await open('/')
    await user.click(await screen.findByRole('button', { name: /Notifications, 2 unread/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(within(drawer).getByText('2 unread')).toBeInTheDocument()
    expect(within(drawer).getAllByTestId('notification')).toHaveLength(2)
    await user.type(within(drawer).getByLabelText('Search notifications'), 'dentist')
    await waitFor(() => expect(within(drawer).getAllByTestId('notification')).toHaveLength(1))
    await user.clear(within(drawer).getByLabelText('Search notifications'))
    await user.click(within(drawer).getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(within(drawer).getByText('You’re all caught up')).toBeInTheDocument())
    await user.click(within(drawer).getByRole('tab', { name: 'Unread' }))
    expect(await within(drawer).findByText('No unread notifications')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    const again = await screen.findByRole('dialog', { name: 'Notifications' })
    await user.click(within(again).getByRole('link', { name: 'Open Pay rent' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull()) // going to /finance closes it
    expect(await screen.findByRole('heading', { name: 'Finance' })).toBeInTheDocument()
  })

  it('its footer goes to the Notification Center, and "New reminder" opens the form there', async () => {
    const user = userEvent.setup()
    await open('/')
    await user.click(await screen.findByRole('button', { name: 'Notifications' }))
    const drawer = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(within(drawer).getByText('No notifications')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('link', { name: 'New reminder' }))
    expect(await screen.findByRole('dialog', { name: 'New reminder' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Reminders', hidden: true })).toHaveAttribute('aria-selected', 'true') // hidden: the open dialog hides the page behind it
  })
})

describe('reminders', () => {
  it('a reminder already past becomes a missed notification carrying its priority and note, and a repeating one moves on', async () => {
    const user = userEvent.setup()
    await open('/notifications?tab=reminders')
    await user.click((await screen.findAllByRole('button', { name: 'New reminder' }))[0])
    const dlg = await screen.findByRole('dialog', { name: 'New reminder' })
    await user.type(within(dlg).getByLabelText('Remind me to'), 'Pay credit card')
    await pickOption(user, within(dlg).getByLabelText('Type'), 'bill')
    await pickOption(user, within(dlg).getByLabelText('Priority'), 'urgent')
    await pickOption(user, within(dlg).getByLabelText('Repeat'), 'weekdays')
    await user.type(within(dlg).getByLabelText('Note (optional)'), 'Full amount')
    await pickDate(user, within(dlg).getByLabelText('Date'), addDays(todayStr(TZ), -3))
    await user.click(within(dlg).getByRole('button', { name: 'Set reminder' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(async () => expect(await stored()).toHaveLength(1))
    const [n] = await stored()
    expect(n).toMatchObject({ title: 'Pay credit card', kind: 'bill', priority: 'urgent', body: 'Full amount', link: '/finance' })
    expect(n.due_at).toBe(iso(zonedToMs(addDays(todayStr(TZ), -3), '09:00', TZ))) // when it was meant to go off
    const [r] = await db.list('reminders')
    expect(r).toMatchObject({ active: true, last_fired_on: todayStr(TZ), repeat: 'weekdays', priority: 'urgent' })
    expect(r.remind_date > todayStr(TZ)).toBe(true) // moved on to the next weekday
    await user.click(tab(/Inbox/))
    await waitFor(() => expect(card('Pay credit card')).toHaveTextContent(/Missed · was due/))
    expect(card('Pay credit card')).toHaveTextContent('Urgent')
  })

  it('reschedules a reminder to a new time, and refuses the past', async () => {
    const user = userEvent.setup()
    const day = addDays(todayStr(TZ), 2)
    await db.insert('reminders', [
      { title: 'Renew licence', kind: 'custom', remind_date: day, remind_time: '09:00', repeat: 'none', active: false, last_fired_on: day },
    ])
    await open('/notifications?tab=reminders')
    await user.click(await screen.findByRole('button', { name: 'Actions for Renew licence' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reschedule…' }))
    const dlg = await screen.findByRole('dialog', { name: 'Reschedule reminder' })
    await pickDate(user, within(dlg).getByLabelText('Date'), todayStr(TZ))
    await pickTime(user, within(dlg).getByLabelText('Time'), '00:00')
    await user.click(within(dlg).getByRole('button', { name: 'Reschedule' }))
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Pick a time in the future')
    const later = addDays(todayStr(TZ), 10)
    await pickDate(user, within(dlg).getByLabelText('Date'), later)
    await pickTime(user, within(dlg).getByLabelText('Time'), '17:30')
    await user.click(within(dlg).getByRole('button', { name: 'Reschedule' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [r] = await db.list('reminders')
    expect(r).toMatchObject({ remind_date: later, remind_time: '17:30', active: true, last_fired_on: null }) // armed again
  })
})

describe('preferences', () => {
  it('category switches, quiet hours and smart notifications persist to the account', async () => {
    const user = userEvent.setup()
    await open('/notifications?tab=prefs')
    await user.click(await screen.findByRole('switch', { name: 'Habits' }))
    await waitFor(async () => expect((await db.list('user_settings'))[0].notification_prefs.habit).toBe(false))
    await user.click(screen.getByRole('switch', { name: 'Quiet hours' }))
    await waitFor(async () =>
      expect((await db.list('user_settings'))[0].notification_settings.quiet).toMatchObject({
        enabled: true,
        from: '22:00',
        to: '07:00',
        allow_urgent: true,
      }),
    )
    await pickTime(user, screen.getByLabelText('Until'), '06:30')
    await waitFor(async () => expect((await db.list('user_settings'))[0].notification_settings.quiet.to).toBe('06:30'))
    expect(screen.getByLabelText('Until')).toHavePickerValue('06:30')
    await user.click(screen.getByRole('switch', { name: 'Smart notifications' }))
    await waitFor(async () => expect((await db.list('user_settings'))[0].notification_settings.smart).toBe(true)) // beforeEach turned it off
    // and it all survives a reload
    document.body.innerHTML = ''
  })
})

describe('notifications from the other modules', () => {
  it('a task due today becomes one summary notification, once, however many times the app is opened', async () => {
    const day = todayStr(TZ)
    await db.upsert('user_settings', [{ notification_settings: { smart: true, morning: '00:00', evening: '23:59' } }], {
      onConflict: 'user_id',
    }) // already past, whatever time this runs
    await db.insert('tasks', [
      { title: 'File taxes', due_date: day, priority: 'high' },
      { title: 'Call plumber', due_date: day, priority: 'low' },
    ])
    const first = await open()
    await waitFor(() => expect(cards()).toContain('2 tasks due today'), { timeout: 20_000 })
    const n = (await stored()).find((x) => x.title === '2 tasks due today')
    expect(n).toMatchObject({ kind: 'task', priority: 'high', link: '/planner', dedupe_key: `src:tasks-today:${day}` })
    expect(card('2 tasks due today')).toHaveTextContent('File taxes · Call plumber')
    first.unmount()
    await open()
    await act(() => new Promise((r) => setTimeout(r, 500)))
    expect((await stored()).filter((x) => x.dedupe_key === `src:tasks-today:${day}`)).toHaveLength(1)
  })

  it('switching the category off stops it', async () => {
    const day = todayStr(TZ)
    await db.upsert(
      'user_settings',
      [{ notification_settings: { smart: true, morning: '00:00', evening: '23:59' }, notification_prefs: { task: false } }],
      { onConflict: 'user_id' },
    )
    await db.insert('tasks', [{ title: 'File taxes', due_date: day }])
    await open()
    await act(() => new Promise((r) => setTimeout(r, 3500))) // longer than the pause before the first check
    expect(await stored()).toHaveLength(0)
  })
})

describe('being told', () => {
  it('a notification that arrives while you are in the app is announced with a toast, once', async () => {
    const user = userEvent.setup()
    await open('/')
    await db.insert('notifications', [{ title: 'Server says hello', kind: 'custom', link: '/finance' }]) // another device made it; it appears through Realtime
    const toast = await screen.findByText('Server says hello', { selector: '[data-sonner-toast] *' }, { timeout: 20_000 })
    expect(toast).toBeInTheDocument()
    await act(() => new Promise((r) => setTimeout(r, 1500))) // several checks go by
    expect(screen.getAllByText('Server says hello', { selector: '[data-sonner-toast] *' })).toHaveLength(1) // told once, not once per check
    await user.click(within(toast.closest('[data-sonner-toast]')).getByRole('button', { name: 'View' }))
    expect(await screen.findByRole('heading', { name: 'Finance' })).toBeInTheDocument()
  })
})
