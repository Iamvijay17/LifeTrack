import '@testing-library/jest-dom/vitest'
import { pickOption } from './pickers'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, renderHook, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
  const toast = Object.assign(mocks.toast, { success: vi.fn(), error: vi.fn() })
  return { toast }
})

import { ReminderDialog } from '@/features/notifications/ReminderDialog'
import { InboxTab } from '@/features/notifications/InboxTab'
import { RemindersTab } from '@/features/notifications/RemindersTab'
import { PreferencesTab } from '@/features/notifications/PreferencesTab'
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
        active: true,
        last_fired_on: null,
      }),
    )
    await waitFor(() => expect(mocks.fireDue).toHaveBeenCalledTimes(1))
    expect(mocks.fireDue.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(mocks.fireDue.mock.calls[0][1]).toMatch(/^\d{2}:\d{2}$/)
    expect(mocks.fireDue.mock.calls[0][2]).toEqual({ bill: false })
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
    open({ reminder: R({ id: 'r9', title: 'Gym', kind: 'workout', repeat: 'weekly', remind_time: '18:30:00' }) })
    expect(screen.getByLabelText(/^Time/)).toHavePickerValue('18:30')
    expect(screen.getByLabelText('Repeat')).toHavePickerValue('weekly')
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

describe('InboxTab', () => {
  const tab = (p = {}) =>
    render(
      <MemoryRouter>
        <InboxTab
          inbox={[]}
          unread={0}
          readingAll={false}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
          onDelete={vi.fn()}
          onClearRead={vi.fn()}
          onCreateReminder={vi.fn()}
          {...p}
        />
      </MemoryRouter>,
    )
  it('empty inbox invites you to set a reminder', async () => {
    const user = userEvent.setup()
    const onCreateReminder = vi.fn()
    tab({ onCreateReminder })
    await user.click(screen.getByRole('button', { name: 'Set a reminder' }))
    expect(onCreateReminder).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Mark all read/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear read' })).toBeDisabled()
  })
  it('unread rows are marked and can be read; read rows have no "Mark read"', async () => {
    const user = userEvent.setup()
    const onRead = vi.fn()
    const a = N({ id: 'a', title: 'Unread one' })
    tab({ inbox: [a, N({ id: 'b', title: 'Old one', read_at: 'x' })], unread: 1, onRead })
    expect(screen.getByLabelText('unread')).toBeInTheDocument()
    expect(screen.getByLabelText('read')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mark read' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Mark read' }))
    expect(onRead).toHaveBeenCalledWith(a)
  })
  it('opening a linked notification marks it read', async () => {
    const user = userEvent.setup()
    const onRead = vi.fn()
    const n = N({ link: '/finance' })
    tab({ inbox: [n], unread: 1, onRead })
    await user.click(screen.getByRole('link', { name: 'Open' }))
    expect(onRead).toHaveBeenCalledWith(n)
  })
  it('clearing read notifications asks first and keeps them if declined', async () => {
    const user = userEvent.setup()
    const onClearRead = vi.fn()
    tab({ inbox: [N({ read_at: 'x' })], onClearRead })
    mocks.confirm.mockResolvedValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Clear read' }))
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    expect(onClearRead).not.toHaveBeenCalled()
    mocks.confirm.mockResolvedValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Clear read' }))
    await waitFor(() => expect(onClearRead).toHaveBeenCalledTimes(1))
    expect(mocks.confirm.mock.calls[0][0].description).toBe('Unread ones are kept.')
  })
})

describe('RemindersTab and PreferencesTab', () => {
  it('shows kind, date, time and repeat; inactive reminders say "done"; the switch toggles', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const r = R({ repeat: 'weekly' })
    const { rerender } = render(<RemindersTab reminders={[r]} onCreate={() => {}} onEdit={() => {}} onToggle={onToggle} />)
    const row = screen.getByText('Pay rent').closest('li')
    expect(row).toHaveTextContent('Bill')
    expect(row).toHaveTextContent('Thu, 5 Nov 2026 · 09:00 · weekly')
    expect(row).not.toHaveTextContent('done')
    await user.click(screen.getByRole('switch', { name: 'Disable Pay rent' }))
    expect(onToggle).toHaveBeenCalledWith(r)
    rerender(<RemindersTab reminders={[R({ active: false })]} onCreate={() => {}} onEdit={() => {}} onToggle={onToggle} />)
    expect(screen.getByText('Pay rent').closest('li')).toHaveTextContent('· done')
    expect(screen.getByRole('switch', { name: 'Enable Pay rent' })).toBeInTheDocument()
  })
  it('delete asks first', async () => {
    const user = userEvent.setup()
    mocks.confirm.mockResolvedValue(true)
    render(<RemindersTab reminders={[R()]} onCreate={() => {}} onEdit={() => {}} onToggle={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Actions for Pay rent' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('reminders', 'r1'))
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ title: 'Delete this reminder?', description: 'Pay rent' })
  })
  it('empty state offers to create one', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<RemindersTab reminders={[]} onCreate={onCreate} onEdit={() => {}} onToggle={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'New reminder' }))
    expect(onCreate).toHaveBeenCalled()
  })
  it('preferences: every kind has a switch, on unless switched off, and reports changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PreferencesTab prefs={{ bill: false }} onChange={onChange} />)
    expect(screen.getAllByRole('switch')).toHaveLength(6)
    expect(screen.getByRole('switch', { name: 'Bill reminders' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Task reminders' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('switch', { name: 'Bill reminders' }))
    expect(onChange).toHaveBeenCalledWith('bill', true)
    await user.click(screen.getByRole('switch', { name: 'Task reminders' }))
    expect(onChange).toHaveBeenCalledWith('task', false)
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
    expect(mocks.fireDue).toHaveBeenLastCalledWith('2026-11-02', '09:28', { bill: false }) // 04:00 UTC = 09:30 IST, minus the 2-minute grace the server job gets first
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
  it('tells you when reminders fired, and survives a failed check', async () => {
    mocks.fireDue.mockResolvedValueOnce(2).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(0)
    renderHook(() => useReminderRunner())
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.toast).toHaveBeenCalledWith('2 new reminders', expect.anything())
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
