import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { notificationSettings } from '@lifetrack/core/notifications'
import { zonedToMs } from '@lifetrack/utils'

const TZ = 'Asia/Kolkata'
const at = (day, time) => zonedToMs(day, time, TZ)
const iso = (ms) => new Date(ms).toISOString()

const mocks = vi.hoisted(() => ({
  rows: [],
  toast: vi.fn(),
  navigate: vi.fn(),
  system: vi.fn(),
  raise: vi.fn(),
  tables: {},
  ready: new Set(),
  load: vi.fn(),
  settings: null,
}))

vi.mock('sonner', () => ({
  toast: Object.assign((...a) => mocks.toast('info', ...a), {
    warning: (...a) => mocks.toast('warning', ...a),
    error: (...a) => mocks.toast('error', ...a),
  }),
}))
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => mocks.navigate }))
vi.mock('@/hooks/store', () => ({
  useTable: () => ({ rows: mocks.rows }),
  load: (t) => mocks.load(t),
  isReady: (t) => mocks.ready.has(t),
  peek: (t) => mocks.tables[t] ?? [],
}))
vi.mock('@/features/notifications/browserNotifications', () => ({ showSystemNotification: (o) => mocks.system(o) }))
vi.mock('@/services/api', () => ({ raiseNotification: (o) => mocks.raise(o) }))
vi.mock('@/features/notifications/useNotificationSettings', () => ({ useNotificationSettings: () => mocks.settings }))

import { useNotificationDelivery } from '@/features/notifications/useNotificationDelivery'
import { useSmartNotifications } from '@/features/notifications/useSmartNotifications'

const NOW = at('2026-11-11', '10:00')
const settingsFor = (o = {}) => ({
  settings: notificationSettings(o.settings),
  prefs: o.prefs ?? {},
  tz: TZ,
  userId: 'u1',
  calendarBrowser: o.calendarBrowser ?? false,
  userSettings: { week_starts_on: 1, workout_plan: {}, currency: 'INR', monthly_budget_paise: 0, ...o.user },
})
const N = (o = {}) => ({
  id: `n${Math.random().toString(36).slice(2)}`,
  kind: 'custom',
  title: 'Pay rent',
  body: '',
  link: '/finance',
  priority: 'normal',
  read_at: null,
  dismissed_at: null,
  snoozed_until: null,
  created_at: iso(NOW - 20_000),
  ...o,
})
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))
const focus = (inFront) => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(inFront)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(inFront ? 'visible' : 'hidden')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  Object.assign(mocks, { rows: [], tables: {}, ready: new Set(), settings: settingsFor() })
  for (const f of [mocks.toast, mocks.navigate, mocks.system, mocks.raise, mocks.load]) f.mockReset()
  mocks.system.mockResolvedValue(true)
  mocks.raise.mockResolvedValue({})
  mocks.load.mockResolvedValue(undefined)
  focus(true)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useNotificationDelivery', () => {
  it('tells you about a new notification once, and not again on later checks or after a refresh', async () => {
    mocks.rows = [N({ title: 'Pay rent', body: 'Flat 4B' })]
    const { unmount } = renderHook(() => useNotificationDelivery())
    await tick()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      'info',
      'Pay rent',
      expect.objectContaining({ description: 'Flat 4B', action: expect.objectContaining({ label: 'View' }) }),
    )
    await tick(60_000)
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    unmount()
    renderHook(() => useNotificationDelivery()) // the page was refreshed: the same row is still fresh, but this device already announced it
    await tick()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
  })

  it('the View button opens what the notification is about', async () => {
    mocks.rows = [N({ link: '/finance' })]
    renderHook(() => useNotificationDelivery())
    await tick()
    mocks.toast.mock.calls[0][2].action.onClick()
    expect(mocks.navigate).toHaveBeenCalledWith('/finance')
  })

  it('does not replay old notifications when you open the app long after they arrived', async () => {
    mocks.rows = [N({ created_at: iso(NOW - 3_600_000) }), N({ created_at: iso(NOW - 86_400_000) })]
    renderHook(() => useNotificationDelivery())
    await tick()
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.system).not.toHaveBeenCalled()
  })

  it('ignores read, dismissed and snoozed notifications and categories you switched off', async () => {
    mocks.settings = settingsFor({ prefs: { bill: false } })
    mocks.rows = [N({ read_at: iso(NOW) }), N({ dismissed_at: iso(NOW) }), N({ snoozed_until: iso(NOW + 600_000) }), N({ kind: 'bill' })]
    renderHook(() => useNotificationDelivery())
    await tick()
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('picks up a notification that arrives later, straight away', async () => {
    const { rerender } = renderHook(() => useNotificationDelivery())
    await tick()
    expect(mocks.toast).not.toHaveBeenCalled()
    mocks.rows = [N({ title: 'From another device' })]
    rerender()
    await tick()
    expect(mocks.toast).toHaveBeenCalledWith('info', 'From another device', expect.anything())
  })

  it('urgent and high priority notifications are shown more firmly, and stay longer', async () => {
    mocks.rows = [N({ priority: 'urgent', title: 'A' }), N({ priority: 'high', title: 'B' })]
    renderHook(() => useNotificationDelivery())
    await tick()
    expect(mocks.toast).toHaveBeenCalledWith('error', 'A', expect.objectContaining({ duration: 12_000 }))
    expect(mocks.toast).toHaveBeenCalledWith('warning', 'B', expect.objectContaining({ duration: 8_000 }))
  })

  it('a burst becomes one summary instead of a pile of toasts', async () => {
    mocks.rows = Array.from({ length: 5 }, (_, i) => N({ title: `T${i}` }))
    renderHook(() => useNotificationDelivery())
    await tick()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast.mock.calls[0][1]).toBe('5 new notifications')
  })

  describe('desktop notifications', () => {
    it('when the page is in front there is a toast and no browser notification', async () => {
      mocks.settings = settingsFor({ settings: { desktop: true } })
      mocks.rows = [N()]
      renderHook(() => useNotificationDelivery())
      await tick()
      expect(mocks.toast).toHaveBeenCalled()
      expect(mocks.system).not.toHaveBeenCalled()
    })
    it('when the page is in the background and you turned them on, you get a browser notification (tagged so tabs never stack duplicates)', async () => {
      focus(false)
      mocks.settings = settingsFor({ settings: { desktop: true } })
      mocks.rows = [N({ title: 'Pay rent', body: 'Flat 4B', priority: 'urgent' })]
      renderHook(() => useNotificationDelivery())
      await tick()
      expect(mocks.toast).not.toHaveBeenCalled()
      expect(mocks.system).toHaveBeenCalledTimes(1)
      expect(mocks.system).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Pay rent', body: 'Flat 4B', tag: expect.stringContaining('@'), urgent: true }),
      )
    })
    it('and nothing at all if you have not turned them on', async () => {
      focus(false)
      mocks.rows = [N()]
      renderHook(() => useNotificationDelivery())
      await tick()
      expect(mocks.system).not.toHaveBeenCalled()
    })
    it('calendar users who turned browser notifications on in Calendar settings still get them for events only', async () => {
      focus(false)
      mocks.settings = settingsFor({ calendarBrowser: true })
      mocks.rows = [N({ kind: 'event', title: 'Standup in 10 minutes' }), N({ kind: 'bill', title: 'Rent' })]
      renderHook(() => useNotificationDelivery())
      await tick()
      expect(mocks.system.mock.calls.map((c) => c[0].title)).toEqual(['Standup in 10 minutes'])
    })
  })

  describe('quiet hours', () => {
    const quiet = { quiet: { enabled: true, from: '22:00', to: '07:00' } }
    it('hold the interruption but not the notification, then sum up what was missed when they end', async () => {
      vi.setSystemTime(at('2026-11-11', '23:00'))
      mocks.settings = settingsFor({ settings: quiet })
      mocks.rows = [
        N({ title: 'One', created_at: iso(at('2026-11-11', '23:00') - 5000) }),
        N({ title: 'Two', created_at: iso(at('2026-11-11', '23:00') - 4000) }),
      ]
      renderHook(() => useNotificationDelivery())
      await tick()
      expect(mocks.toast).not.toHaveBeenCalled() // held
      vi.setSystemTime(at('2026-11-12', '07:01'))
      await tick(10_000)
      expect(mocks.toast).toHaveBeenCalledTimes(1)
      expect(mocks.toast.mock.calls[0][1]).toBe('2 notifications while you were away')
      await tick(60_000)
      expect(mocks.toast).toHaveBeenCalledTimes(1) // said once
    })
    it('an urgent notification still comes through', async () => {
      vi.setSystemTime(at('2026-11-11', '23:00'))
      mocks.settings = settingsFor({ settings: quiet })
      mocks.rows = [N({ priority: 'urgent', title: 'Server down', created_at: iso(at('2026-11-11', '23:00') - 5000) })]
      renderHook(() => useNotificationDelivery())
      await tick()
      expect(mocks.toast).toHaveBeenCalledWith('error', 'Server down', expect.anything())
    })
    it('what was held survives a refresh', async () => {
      vi.setSystemTime(at('2026-11-11', '23:00'))
      mocks.settings = settingsFor({ settings: quiet })
      mocks.rows = [N({ title: 'Late one', created_at: iso(at('2026-11-11', '23:00') - 5000) })]
      const first = renderHook(() => useNotificationDelivery())
      await tick()
      first.unmount()
      vi.setSystemTime(at('2026-11-12', '07:30'))
      renderHook(() => useNotificationDelivery())
      await tick()
      expect(mocks.toast).toHaveBeenCalledWith('info', 'Late one', expect.anything()) // a single held notification is shown as itself
    })
  })

  it('a snoozed notification that comes back is announced again, once', async () => {
    const n = N({ created_at: iso(NOW - 86_400_000), snoozed_until: iso(NOW + 30_000), title: 'Stretch' })
    mocks.rows = [n]
    renderHook(() => useNotificationDelivery())
    await tick()
    expect(mocks.toast).not.toHaveBeenCalled() // still asleep
    await tick(40_000)
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith('info', 'Stretch', expect.anything())
    await tick(60_000)
    expect(mocks.toast).toHaveBeenCalledTimes(1)
  })

  it('does nothing until the account has loaded', async () => {
    mocks.settings = { ...settingsFor(), userId: null }
    mocks.rows = [N()]
    renderHook(() => useNotificationDelivery())
    await tick(30_000)
    expect(mocks.toast).not.toHaveBeenCalled()
  })
})

describe('useSmartNotifications', () => {
  const D = '2026-11-11'
  const task = (o = {}) => ({
    id: 't1',
    title: 'File taxes',
    status: 'pending',
    priority: 'high',
    due_date: D,
    created_at: '2026-11-01T00:00:00Z',
    ...o,
  })
  const allReady = () => {
    mocks.ready = new Set([
      'notifications',
      'tasks',
      'habits',
      'habit_logs',
      'workouts',
      'routines',
      'interview_events',
      'job_applications',
      'recurring_rules',
      'transactions',
      'budgets',
      'learning_topics',
      'goals',
      'milestones',
    ])
  }
  beforeEach(() => {
    vi.setSystemTime(at(D, '09:00'))
    allReady()
    mocks.tables = { tasks: [task()], notifications: [] }
  })
  const run = async () => {
    const hook = renderHook(() => useSmartNotifications())
    await tick(2_000) // the first check waits a moment so it does not compete with the page that opened
    return hook
  }

  it('waits a moment after the app opens before loading anything', async () => {
    renderHook(() => useSmartNotifications())
    await tick(1_500)
    expect(mocks.load).not.toHaveBeenCalled()
    await tick(1_000)
    expect(mocks.load).toHaveBeenCalled()
  })

  it('turns what is due today into one summary notification, with a key for the day', async () => {
    await run()
    expect(mocks.raise).toHaveBeenCalledTimes(1)
    expect(mocks.raise).toHaveBeenCalledWith({
      key: `src:tasks-today:${D}`,
      kind: 'task',
      title: 'Due today: File taxes',
      body: '',
      link: '/planner',
      priority: 'high',
    })
  })

  it('waits for the morning time, then raises it', async () => {
    vi.setSystemTime(at(D, '07:00'))
    await run()
    expect(mocks.raise).not.toHaveBeenCalled()
    vi.setSystemTime(at(D, '08:01'))
    await tick(60_000)
    expect(mocks.raise).toHaveBeenCalledTimes(1)
  })

  it('raises each one once: not on the next tick, not after a refresh, not even if you deleted it', async () => {
    const first = await run()
    await tick(180_000)
    expect(mocks.raise).toHaveBeenCalledTimes(1)
    first.unmount()
    await run() // refreshed; the notification was deleted from the history meanwhile, so it is not in the loaded rows
    expect(mocks.raise).toHaveBeenCalledTimes(1)
  })

  it('does not raise one that already exists (another device made it)', async () => {
    mocks.tables.notifications = [{ id: 'x', dedupe_key: `src:tasks-today:${D}` }]
    await run()
    expect(mocks.raise).not.toHaveBeenCalled()
  })

  it('tries again on the next tick if saving failed', async () => {
    mocks.raise.mockRejectedValueOnce(new Error('offline'))
    await run()
    expect(mocks.raise).toHaveBeenCalledTimes(1)
    await tick(60_000)
    expect(mocks.raise).toHaveBeenCalledTimes(2)
  })

  it('makes nothing for a category you switched off, and does not load that category’s tables', async () => {
    mocks.settings = settingsFor({ prefs: { task: false } })
    await run()
    expect(mocks.raise).not.toHaveBeenCalled()
    expect(mocks.load).not.toHaveBeenCalledWith('tasks')
    expect(mocks.load).toHaveBeenCalledWith('habits') // the other categories are still watched
  })

  it('makes nothing, and loads nothing, when smart notifications are off', async () => {
    mocks.settings = settingsFor({ settings: { smart: false } })
    await run()
    expect(mocks.raise).not.toHaveBeenCalled()
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('never treats a table that has not loaded as empty: no "3 habits left" while the habit log is still on its way', async () => {
    mocks.tables = {
      habits: [
        { id: 'h1', name: 'Read', frequency: 'daily', start_date: '2026-01-01', days_of_week: [], weekly_target: 3, archived_at: null },
      ],
      habit_logs: [],
      notifications: [],
    }
    vi.setSystemTime(at(D, '21:00'))
    mocks.ready.delete('habit_logs')
    await run()
    expect(mocks.raise).not.toHaveBeenCalled()
    mocks.ready.add('habit_logs')
    await tick(60_000)
    expect(mocks.raise).toHaveBeenCalledWith(expect.objectContaining({ key: `src:habits:${D}`, title: '1 habit left today' }))
  })

  it('waits until the notifications themselves have loaded, so it cannot repeat one it has not seen yet', async () => {
    mocks.ready.delete('notifications')
    await run()
    expect(mocks.raise).not.toHaveBeenCalled()
  })

  it('does nothing until the account has loaded', async () => {
    mocks.settings = { ...settingsFor(), userId: null }
    await run()
    expect(mocks.raise).not.toHaveBeenCalled()
  })
})
