import '@testing-library/jest-dom/vitest'
import { pickOption, pickTime } from './pickers'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, renderHook, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { kindLabel, repeatLabel, isKindEnabled, sortInbox, sortReminders, togglePatch, unreadCount } from '@/domain/reminders'
import { relativeTime } from '@/lib/format'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  fireDue: vi.fn(),
  toast: vi.fn(),
  settings: { timezone: 'Asia/Kolkata', notification_prefs: { bill: false }, week_starts_on: 1 },
  row: { id: 'r' },
}))
vi.mock('@/hooks/store', () => ({ insert: mocks.insert, update: mocks.update, remove: mocks.remove }))
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: mocks.settings, row: mocks.row }) }))
vi.mock('@/services/api', () => ({ fireDueReminders: mocks.fireDue }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('sonner', () => {
  const toast = Object.assign(mocks.toast, { success: vi.fn(), error: vi.fn(), warning: vi.fn() })
  return { toast }
})

import { ReminderDialog } from '@/features/notifications/ReminderDialog'
import { RemindersTab } from '@/features/notifications/RemindersTab'
import { PreferencesTab } from '@/features/notifications/PreferencesTab'
import { notificationSettings } from '@lifetrack/core/notifications'
import { useReminderRunner } from '@/features/notifications/useReminderRunner'

const TODAY = '2026-11-02'
const N = (o) => ({
  id: Math.random().toString(36).slice(2),
  kind: 'bill',
  title: 'Pay rent',
  link: '',
  read_at: null,
  created_at: '2026-11-02T08:00:00Z',
  ...o,
})
const R = (o) => ({
  id: 'r1',
  kind: 'bill',
  title: 'Pay rent',
  remind_date: '2026-11-05',
  remind_time: '09:00:00',
  repeat: 'none',
  active: true,
  ...o,
})

beforeEach(() => {
  Object.values(mocks).forEach((m) => m?.mockReset?.())
  for (const k of ['success', 'error', 'warning']) mocks.toast[k].mockReset()
  mocks.settings = { timezone: 'Asia/Kolkata', notification_prefs: { bill: false }, week_starts_on: 1 }
  mocks.row = { id: 'r' }
  mocks.insert.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
  mocks.remove.mockResolvedValue(undefined)
  mocks.fireDue.mockResolvedValue(0)
})

describe('notification domain', () => {
  it('relative time: just now, minutes, hours, days', () => {
    const now = Date.parse('2026-11-02T12:00:00Z')
    const ago = (ms) => new Date(now - ms).toISOString()
    expect([
      relativeTime(ago(20_000), now),
      relativeTime(ago(5 * 60_000), now),
      relativeTime(ago(59 * 60_000), now),
      relativeTime(ago(3 * 3600_000), now),
      relativeTime(ago(49 * 3600_000), now),
    ]).toEqual(['just now', '5m ago', '59m ago', '3h ago', '2d ago'])
  })
  it('labels kinds and repeats', () => {
    expect(kindLabel('bill')).toBe('Bill')
    expect(repeatLabel('weekly')).toBe('Weekly')
    expect(kindLabel('nope')).toBeUndefined()
  })
  it('a kind is enabled unless explicitly switched off (new kinds default to on)', () => {
    expect([
      isKindEnabled({ bill: false }, 'bill'),
      isKindEnabled({ bill: true }, 'bill'),
      isKindEnabled({}, 'bill'),
      isKindEnabled(undefined, 'task'),
    ]).toEqual([false, true, true, true])
  })
  it('sorts the inbox newest first and reminders active-first then by time; does not mutate', () => {
    const inbox = [N({ id: 'a', created_at: '2026-11-01T00:00:00Z' }), N({ id: 'b', created_at: '2026-11-02T00:00:00Z' })]
    expect(sortInbox(inbox).map((n) => n.id)).toEqual(['b', 'a'])
    expect(inbox[0].id).toBe('a')
    const rs = [
      R({ id: 'done', active: false, remind_date: '2026-11-01' }),
      R({ id: 'late', remind_date: '2026-11-09' }),
      R({ id: 'soon', remind_date: '2026-11-03', remind_time: '08:00:00' }),
      R({ id: 'soon2', remind_date: '2026-11-03', remind_time: '07:00:00' }),
    ]
    expect(sortReminders(rs).map((r) => r.id)).toEqual(['soon2', 'soon', 'late', 'done'])
  })
  it('re-enabling a reminder re-arms it; disabling does not touch last_fired_on', () => {
    expect(togglePatch(R({ active: false }))).toEqual({ active: true, last_fired_on: null })
    expect(togglePatch(R({ active: true }))).toEqual({ active: false })
  })
  it('counts unread', () => {
    expect(unreadCount([N(), N({ read_at: 'x' }), N()])).toBe(2)
  })
})

describe('ReminderDialog', () => {
  const open = (p = {}) => render(<ReminderDialog open onOpenChange={() => {}} today={TODAY} {...p} />)
  it('needs a title and a time', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Set reminder' }))
    expect(await screen.findByText('What should we remind you about?')).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('creates an armed reminder and immediately checks whether it is already due', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Remind me to'), '  Pay rent  ')
    await pickOption(user, screen.getByLabelText('Type'), 'bill')
    await pickOption(user, screen.getByLabelText('Repeat'), 'monthly')
    await user.click(screen.getByRole('button', { name: 'Set reminder' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith('reminders', {
        kind: 'bill',
        title: 'Pay rent',
        remind_date: TODAY,
        remind_time: '09:00',
        repeat: 'monthly',
        priority: 'normal',
        body: '',
        active: true,
        last_fired_on: null,
      }),
    )
    await waitFor(() => expect(mocks.fireDue).toHaveBeenCalledTimes(1))
    expect(mocks.fireDue.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(mocks.fireDue.mock.calls[0][1]).toMatch(/^\d{2}:\d{2}$/)
    expect(mocks.fireDue.mock.calls[0][2]).toEqual({ bill: false })
    expect(mocks.fireDue.mock.calls[0][3]).toEqual({ tz: 'Asia/Kolkata' }) // so the notification can say when it was due
  })
  it('saves a priority, a note and the new repeat choices', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Remind me to'), 'Standup notes')
    await pickOption(user, screen.getByLabelText('Priority'), 'urgent')
    await pickOption(user, screen.getByLabelText('Repeat'), 'weekdays')
    await user.type(screen.getByLabelText('Note (optional)'), '  Share in the channel  ')
    await user.click(screen.getByRole('button', { name: 'Set reminder' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'reminders',
        expect.objectContaining({ title: 'Standup notes', priority: 'urgent', repeat: 'weekdays', body: 'Share in the channel' }),
      ),
    )
  })
  it('refuses a note over 500 characters, and warns (without blocking) when the time has already passed', async () => {
    const user = userEvent.setup()
    open({ today: '2020-01-01' })
    expect(screen.getByText(/already passed, so you’ll be notified right away/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Remind me to'), 'x')
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'n'.repeat(501) } })
    await user.click(screen.getByRole('button', { name: 'Set reminder' }))
    expect(await screen.findByText('Keep the note under 500 characters')).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('a failure while firing never breaks saving', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mocks.fireDue.mockRejectedValue(new Error('offline'))
    open({ onOpenChange })
    await user.type(screen.getByLabelText('Remind me to'), 'x')
    await user.click(screen.getByRole('button', { name: 'Set reminder' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mocks.insert).toHaveBeenCalled()
  })
  it('editing pre-fills (time without seconds) and re-arms the reminder', async () => {
    const user = userEvent.setup()
    open({
      reminder: R({
        id: 'r9',
        title: 'Gym',
        kind: 'workout',
        repeat: 'weekly',
        remind_time: '18:30:00',
        priority: 'high',
        body: 'Leg day',
      }),
    })
    expect(screen.getByLabelText(/^Time/)).toHavePickerValue('18:30')
    expect(screen.getByLabelText('Repeat')).toHavePickerValue('weekly')
    expect(screen.getByLabelText('Priority')).toHavePickerValue('high')
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Leg day')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        'reminders',
        'r9',
        expect.objectContaining({ title: 'Gym', active: true, last_fired_on: null }),
      ),
    )
  })
  it('does not wipe typed text on re-render', async () => {
    const user = userEvent.setup()
    const { rerender } = open()
    await user.type(screen.getByLabelText('Remind me to'), 'Keep')
    rerender(<ReminderDialog open onOpenChange={() => {}} today={TODAY} />)
    expect(screen.getByLabelText('Remind me to')).toHaveValue('Keep')
  })
})

describe('RemindersTab and PreferencesTab', () => {
  const tab = (p = {}) =>
    render(
      <RemindersTab
        reminders={[R()]}
        today={TODAY}
        nowTime="10:00"
        onCreate={() => {}}
        onEdit={() => {}}
        onReschedule={() => {}}
        onToggle={() => {}}
        {...p}
      />,
    )
  it('shows kind, date, time and repeat; inactive reminders say "done"; the switch toggles', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const r = R({ repeat: 'weekly' })
    const { rerender } = tab({ reminders: [r], onToggle })
    const row = screen.getByText('Pay rent').closest('li')
    expect(row).toHaveTextContent('Bill')
    expect(row).toHaveTextContent('Thu, 5 Nov 2026 · 09:00 · weekly')
    expect(row).not.toHaveTextContent('done')
    await user.click(screen.getByRole('switch', { name: 'Disable Pay rent' }))
    expect(onToggle).toHaveBeenCalledWith(r)
    rerender(
      <RemindersTab
        reminders={[R({ active: false })]}
        today={TODAY}
        nowTime="10:00"
        onCreate={() => {}}
        onEdit={() => {}}
        onReschedule={() => {}}
        onToggle={onToggle}
      />,
    )
    expect(screen.getByText('Pay rent').closest('li')).toHaveTextContent('· done')
    expect(screen.getByRole('switch', { name: 'Enable Pay rent' })).toBeInTheDocument()
  })
  it('shows priority and the note, and flags a reminder whose time has passed as overdue', () => {
    tab({
      reminders: [
        R({ id: 'a', title: 'Call bank', remind_date: TODAY, remind_time: '09:00:00', priority: 'urgent', body: 'Ask about the card' }),
        R({ id: 'b', title: 'Later', remind_date: TODAY, remind_time: '18:00:00' }),
      ],
    })
    const overdue = screen.getByText('Call bank').closest('li')
    expect(overdue).toHaveTextContent('Urgent')
    expect(overdue).toHaveTextContent('Overdue')
    expect(overdue).toHaveTextContent('Ask about the card')
    expect(screen.getByText('Later').closest('li')).not.toHaveTextContent('Overdue')
    expect(screen.getByText('Later').closest('li')).not.toHaveTextContent('Normal') // normal is the quiet default
  })
  it('offers to reschedule, edit and delete from the row menu', async () => {
    const user = userEvent.setup()
    const onReschedule = vi.fn()
    const r = R()
    tab({ reminders: [r], onReschedule })
    await user.click(screen.getByRole('button', { name: 'Actions for Pay rent' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Reschedule…', 'Delete'])
    await user.click(screen.getByRole('menuitem', { name: 'Reschedule…' }))
    expect(onReschedule).toHaveBeenCalledWith(r)
  })
  it('delete asks first', async () => {
    const user = userEvent.setup()
    mocks.confirm.mockResolvedValue(true)
    tab()
    await user.click(screen.getByRole('button', { name: 'Actions for Pay rent' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('reminders', 'r1'))
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ title: 'Delete this reminder?', description: 'Pay rent' })
  })
  it('empty state offers to create one', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    tab({ reminders: [], onCreate })
    await user.click(screen.getByRole('button', { name: 'New reminder' }))
    expect(onCreate).toHaveBeenCalled()
  })

  describe('preferences', () => {
    const prefsTab = (p = {}) => {
      const onSettings = vi.fn()
      const onCategory = vi.fn()
      render(
        <PreferencesTab
          settings={notificationSettings({})}
          prefs={{ bill: false }}
          tz="Asia/Kolkata"
          onSettings={onSettings}
          onCategory={onCategory}
          {...p}
        />,
      )
      return { onSettings, onCategory }
    }
    it('every category has a switch, on unless switched off, and reports changes', async () => {
      const user = userEvent.setup()
      const { onCategory } = prefsTab()
      for (const name of ['Reminders', 'Tasks', 'Calendar', 'Habits', 'Fitness', 'Finance', 'Learning', 'Jobs', 'Goals'])
        expect(screen.getByRole('switch', { name })).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: 'Finance' })).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByRole('switch', { name: 'Tasks' })).toHaveAttribute('aria-checked', 'true')
      await user.click(screen.getByRole('switch', { name: 'Finance' }))
      expect(onCategory).toHaveBeenCalledWith('bill', true)
      await user.click(screen.getByRole('switch', { name: 'Tasks' }))
      expect(onCategory).toHaveBeenCalledWith('task', false)
      await user.click(screen.getByRole('switch', { name: 'Calendar' }))
      expect(onCategory).toHaveBeenCalledWith('event', false)
    })
    it('quiet hours show their times once on, save valid changes, and explain (not save) an invalid one', async () => {
      const user = userEvent.setup()
      const { onSettings } = prefsTab()
      expect(screen.queryByLabelText('From')).toBeNull()
      await user.click(screen.getByRole('switch', { name: 'Quiet hours' }))
      expect(onSettings).toHaveBeenCalledWith({ quiet: { enabled: true, from: '22:00', to: '07:00', allow_urgent: true } })
      expect(screen.getByLabelText('From')).toHavePickerValue('22:00')
      expect(screen.getByLabelText('Until')).toHavePickerValue('07:00')
      await user.click(screen.getByRole('switch', { name: 'Let urgent notifications through' }))
      expect(onSettings).toHaveBeenLastCalledWith({ quiet: { enabled: true, from: '22:00', to: '07:00', allow_urgent: false } })
    })
    it('quiet hours that start and end together are explained and never saved', async () => {
      const user = userEvent.setup()
      const { onSettings } = prefsTab({ settings: notificationSettings({ quiet: { enabled: true, from: '22:00', to: '07:00' } }) })
      await pickTime(user, screen.getByLabelText('Until'), '22:00')
      expect(await screen.findByText(/can’t start and end at the same time/)).toBeInTheDocument()
      expect(onSettings).not.toHaveBeenCalled()
      await pickTime(user, screen.getByLabelText('Until'), '06:00')
      await waitFor(() =>
        expect(onSettings).toHaveBeenCalledWith({ quiet: { enabled: true, from: '22:00', to: '06:00', allow_urgent: true } }),
      )
    })
    it('the evening check-in has to be later than the morning summary', async () => {
      const user = userEvent.setup()
      const { onSettings } = prefsTab()
      await pickTime(user, screen.getByLabelText(/Evening check-in/), '07:00')
      expect(await screen.findByText(/has to be later than the morning one/)).toBeInTheDocument()
      expect(onSettings).not.toHaveBeenCalled()
    })
    it('smart notifications can be switched off, which hides their times', async () => {
      const user = userEvent.setup()
      const { onSettings } = prefsTab()
      expect(screen.getByLabelText(/Morning summary/)).toBeInTheDocument()
      await user.click(screen.getByRole('switch', { name: 'Smart notifications' }))
      expect(onSettings).toHaveBeenCalledWith({ smart: false })
    })
  })
})

describe('desktop notifications permission', () => {
  const real = window.Notification
  afterEach(() => {
    if (real === undefined)
      delete window.Notification // jsdom has none; `= undefined` would still make 'Notification' in window true
    else window.Notification = real
  })
  const stub = (permission, requestResult = permission) => {
    const shown = []
    window.Notification = class {
      static permission = permission
      static requestPermission = vi.fn(async () => {
        window.Notification.permission = requestResult
        return requestResult
      })
      constructor(title, o) {
        shown.push({ title, ...o })
      }
    }
    return shown
  }
  const prefsTab = (settings = {}) => {
    const onSettings = vi.fn()
    render(
      <PreferencesTab
        settings={notificationSettings(settings)}
        prefs={{}}
        tz="Asia/Kolkata"
        onSettings={onSettings}
        onCategory={() => {}}
      />,
    )
    return onSettings
  }
  it('asks only when the switch is clicked, and turns on if the person allows it', async () => {
    const user = userEvent.setup()
    stub('default', 'granted')
    const onSettings = prefsTab()
    expect(window.Notification.requestPermission).not.toHaveBeenCalled() // never on load
    expect(screen.getByText('Not asked yet')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Show desktop notifications' }))
    expect(window.Notification.requestPermission).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onSettings).toHaveBeenCalledWith({ desktop: true }))
  })
  it('stays off, and says why, when the person says no', async () => {
    const user = userEvent.setup()
    stub('default', 'denied')
    const onSettings = prefsTab()
    await user.click(screen.getByRole('switch', { name: 'Show desktop notifications' }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Permission wasn’t granted/)))
    expect(onSettings).not.toHaveBeenCalled()
  })
  it('does not ask again once the browser has blocked the site, and explains how to allow it', async () => {
    const user = userEvent.setup()
    stub('denied')
    const onSettings = prefsTab()
    expect(screen.getByText('Blocked in this browser')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Show desktop notifications' }))
    expect(window.Notification.requestPermission).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/blocked for this site/))
    expect(onSettings).not.toHaveBeenCalled()
  })
  it('says so when the browser has no notifications at all', async () => {
    const user = userEvent.setup()
    delete window.Notification
    const onSettings = prefsTab()
    expect(screen.getByText('Not supported here')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Show desktop notifications' }))
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/can’t show desktop notifications/))
    expect(onSettings).not.toHaveBeenCalled()
  })
  it('shows as on only while the browser still allows it, and can send a test', async () => {
    const user = userEvent.setup()
    const shown = stub('granted')
    prefsTab({ desktop: true })
    expect(screen.getByRole('switch', { name: 'Show desktop notifications' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Send a test notification' }))
    await waitFor(() => expect(shown).toHaveLength(1))
    expect(shown[0]).toMatchObject({ title: 'LifeTrack notifications are on', tag: 'lifetrack-test' })
    cleanup()
    stub('denied')
    prefsTab({ desktop: true }) // turned on in the account, but this browser has since blocked it
    expect(screen.getByRole('switch', { name: 'Show desktop notifications' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/isn’t allowing them/)).toBeInTheDocument()
  })
})

describe('useReminderRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-02T04:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())
  it("checks on mount, every minute, and on window focus, with the user's timezone date/time and prefs", async () => {
    renderHook(() => useReminderRunner())
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.fireDue).toHaveBeenCalledTimes(1)
    expect(mocks.fireDue).toHaveBeenLastCalledWith('2026-11-02', '09:28', { bill: false }, { tz: 'Asia/Kolkata' }) // 04:00 UTC = 09:30 IST, minus the 2-minute grace the server job gets first
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.fireDue).toHaveBeenCalledTimes(2)
    fireEvent(window, new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.fireDue).toHaveBeenCalledTimes(3)
  })
  it('does nothing until the settings row has loaded', async () => {
    mocks.row = null
    renderHook(() => useReminderRunner())
    await vi.advanceTimersByTimeAsync(120_000)
    expect(mocks.fireDue).not.toHaveBeenCalled()
  })
  it('leaves announcing to the notification centre, and survives a failed check', async () => {
    mocks.fireDue.mockResolvedValueOnce(2).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(0)
    renderHook(() => useReminderRunner())
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.toast).not.toHaveBeenCalled() // the notification it created is announced once, by useNotificationDelivery
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.fireDue).toHaveBeenCalledTimes(3) // the rejected check did not stop the loop
  })
  it('never runs two checks at once, and stops when unmounted', async () => {
    let release
    mocks.fireDue.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r
        }),
    )
    const { unmount } = renderHook(() => useReminderRunner())
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.fireDue).toHaveBeenCalledTimes(1) // still busy with the first
    release(0)
    await vi.advanceTimersByTimeAsync(0)
    unmount()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(mocks.fireDue).toHaveBeenCalledTimes(1)
  })
})
