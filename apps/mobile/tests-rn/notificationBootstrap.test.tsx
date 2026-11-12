import { cleanup, render } from '@testing-library/react-native'

// The app lock unmounts the signed-in app while locked, so NotificationsBootstrap is mounted again after every unlock. expo-notifications keeps returning the
// same "last notification response" for the life of the process, so a tap must be acted on once, not once per unlock.

const mockPush = jest.fn()
const mockUpdate = jest.fn(async (..._args: unknown[]) => {})
let mockLast: unknown = null

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  useLastNotificationResponse: () => mockLast,
  setBadgeCountAsync: jest.fn(async () => {}),
}))
jest.mock('../src/data/client', () => ({ api: { fireDueReminders: jest.fn(async () => {}) }, store: { update: (...a: unknown[]) => mockUpdate(...a) } }))
jest.mock('../src/data/useTable', () => ({ useTable: () => ({ rows: [] }) }))
jest.mock('../src/hooks/useSettings', () => ({ useSettings: () => ({ settings: { notification_prefs: {}, timezone: 'Asia/Kolkata' }, row: null }) }))
jest.mock('../src/features/notifications/index', () => ({ ensureChannels: jest.fn(async () => {}), pushService: { refresh: jest.fn(async () => {}) } }))
jest.mock('../src/features/notifications/timerNotifier', () => ({ presentationFor: () => ({}) }))

import { NotificationsBootstrap } from '../src/features/notifications/Bootstrap'

const tap = (id: string, link = '/finance') => ({
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: { request: { identifier: id, content: { data: { link, notification_id: 'n-1' } } } },
})

beforeEach(() => { mockPush.mockClear(); mockUpdate.mockClear(); jest.useFakeTimers() })
afterEach(async () => { await cleanup(); jest.useRealTimers() })

describe('NotificationsBootstrap and the app lock', () => {
  it('opens the screen of a tapped notification once, even though the app is mounted again after every unlock', async () => {
    mockLast = tap('push-1')
    const first = await render(<NotificationsBootstrap />)
    jest.advanceTimersByTime(10)
    expect(mockPush).toHaveBeenCalledTimes(1)
    await first.unmount() // the app locks…
    await render(<NotificationsBootstrap />) // …and opens again: the same "last response" comes back
    jest.advanceTimersByTime(10)
    expect(mockPush).toHaveBeenCalledTimes(1) // not yanked to that screen again
  })
  it('still acts on a new tap', async () => {
    mockLast = tap('push-2', '/habits')
    const first = await render(<NotificationsBootstrap />)
    jest.advanceTimersByTime(10)
    await first.unmount()
    mockLast = tap('push-3', '/planner')
    await render(<NotificationsBootstrap />)
    jest.advanceTimersByTime(10)
    expect(mockPush).toHaveBeenCalledTimes(2)
  })
  it('follows a notification that was tapped while the app was locked, once it opens', async () => {
    mockLast = tap('push-4', '/finance') // the person tapped it on the lock screen: nothing was mounted to act on it
    await render(<NotificationsBootstrap />) // the unlock mounts the app
    jest.advanceTimersByTime(10)
    expect(mockPush).toHaveBeenCalledTimes(1)
  })
})
