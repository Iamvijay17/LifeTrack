import { cleanup, fireEvent, render, screen } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '../src/data/client'
import { ThemeProvider } from '../src/providers/ThemeProvider'
import { Accent, moduleForSegment } from '../src/ui/accent'
import { LifeTabBar } from '../src/ui/TabBar'
import Dashboard from '../app/(app)/(tabs)/index'
import Habits from '../app/(app)/(tabs)/habits'
import Finance from '../app/(app)/(tabs)/finance'
import Planner from '../app/(app)/(tabs)/planner'
import More from '../app/(app)/(tabs)/more'
import Fitness from '../app/(app)/module/fitness'
import Health from '../app/(app)/module/health'
import Learning from '../app/(app)/module/learning'
import Jobs from '../app/(app)/module/jobs'
import Focus from '../app/(app)/module/focus'
import Goals from '../app/(app)/module/goals'
import Notes from '../app/(app)/module/notes'
import Analytics from '../app/(app)/module/analytics'
import Notifications from '../app/(app)/module/notifications'
import Settings from '../app/(app)/module/settings'
import SignIn from '../app/(auth)/sign-in'

// Every screen, rendered for real through the same data path as the app: a shared realistic account, then a brand-new empty one.
// These catch what a type check can't: a screen that throws as soon as it meets real rows, or no rows at all.
let mockTables: Record<string, any[]> = {}

jest.mock('../src/lib/supabase', () => ({
  db: {
    list: async (t: string) => mockTables[t] ?? [],
    rpc: async () => null,
    insert: async () => [], update: async () => [], upsert: async () => [], remove: async () => {}, removeMany: async () => {},
  },
  supabase: null,
  authService: null,
}))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
  Link: ({ children }: { children: React.ReactNode }) => {
    const { Text } = require('react-native')
    return <Text>{children}</Text>
  },
}))
jest.mock('../src/lib/haptics', () => ({ haptics: { success: jest.fn(), tap: jest.fn(), warning: jest.fn() } }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../src/features/notifications', () => ({
  askForTimerNotificationsOnce: jest.fn(),
  timerNotifier: { sync: jest.fn(async () => {}), cancel: jest.fn(async () => {}) },
}))
jest.mock('../src/features/notifications/PushDeviceCard', () => ({ PushDeviceCard: () => null }))
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => ({ session: {}, loading: false, email: 'ann@example.com', displayName: 'Ann Lee' }) }))

const { TABLES, SETTINGS } = require('../../../packages/core/tests/fixtures/dataset.js')

const SCREENS: [string, React.ComponentType, string, string][] = [
  ['Dashboard', Dashboard, 'index', 'Customize'],
  ['Habits', Habits, 'habits', 'Habits'],
  ['Finance', Finance, 'finance', 'Finance'],
  ['Planner', Planner, 'planner', 'Planner'],
  ['More', More, 'more', 'More'],
  ['Fitness', Fitness, 'fitness', 'Gym & Fitness'],
  ['Health', Health, 'health', 'Sleep & Health'],
  ['Learning', Learning, 'learning', 'Career & Learning'],
  ['Jobs', Jobs, 'jobs', 'Job Switch'],
  ['Focus', Focus, 'focus', 'Focus Timer'],
  ['Goals', Goals, 'goals', 'Goals & Milestones'],
  ['Notes', Notes, 'notes', 'Notes & Journal'],
  ['Analytics', Analytics, 'analytics', 'Analytics'],
  ['Notifications', Notifications, 'notifications', 'Notifications'],
  ['Settings', Settings, 'settings', 'Settings'],
]

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }
const show = (Screen: React.ComponentType, segment: string) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <Accent module={moduleForSegment(segment)}>
            <Screen />
          </Accent>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )

afterEach(async () => {
  await cleanup()
  queryClient.clear()
})
// Entrance animations run on real timers; let the last ones finish before Jest tears the environment down.
afterAll(() => new Promise((done) => setTimeout(done, 1200)))

describe.each([
  ['with a realistic account', () => ({ ...TABLES, user_settings: [{ id: 's', user_id: 'u', ...SETTINGS }] })],
  ['with a brand-new account', () => ({})],
])('%s', (_name, tables) => {
  beforeEach(() => {
    mockTables = tables()
  })
  it.each(SCREENS)('%s renders', async (_screen, Screen, segment, heading) => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    await show(Screen, segment)
    await screen.findByText(heading, {}, { timeout: 8000 })
    // Let the screen load its rows and render its real content, not only the skeleton.
    await new Promise((r) => setTimeout(r, 50))
    const crashes = errors.mock.calls.filter(([m]) => /error|undefined|not a function/i.test(String(m)) && !/not wrapped in act/i.test(String(m)))
    errors.mockRestore()
    expect(crashes).toEqual([])
  }, 20000)
})

describe('sign-in', () => {
  it('shows the brand and the form', async () => {
    await render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><SignIn /></ThemeProvider></SafeAreaProvider>)
    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(screen.getByText('Life')).toBeTruthy()
  })
})

describe('LifeTabBar', () => {
  const route = (name: string) => ({ key: name, name })
  const routes = ['index', 'planner', 'habits', 'finance', 'more'].map(route)
  const descriptors = Object.fromEntries(routes.map((r) => [r.key, { options: { title: r.name === 'index' ? 'Dashboard' : r.name, tabBarIcon: () => null } }]))
  it('marks the active tab and navigates to another one', async () => {
    // expo-router passes the navigator's emitter and navigateToTab (no `navigation`), so the test mirrors exactly that.
    const emitter = { emit: jest.fn(() => ({ defaultPrevented: false })) }
    const navigateToTab = jest.fn()
    await render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><LifeTabBar state={{ index: 2, routes }} descriptors={descriptors} emitter={emitter} navigateToTab={navigateToTab} insets={{ top: 0, right: 0, bottom: 0, left: 0 }} /></ThemeProvider></SafeAreaProvider>)
    expect(screen.getByRole('tab', { name: 'habits' })).toBeSelected()
    await fireEvent.press(screen.getByRole('tab', { name: 'finance' }))
    expect(navigateToTab).toHaveBeenCalledWith('finance')
  })
})
