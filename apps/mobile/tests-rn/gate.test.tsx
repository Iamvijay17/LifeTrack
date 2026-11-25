import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { SecurityValue } from '../src/features/security/SecurityProvider'

// The root layout's Gate: the app is shown only when the server says this session is unlocked. While the server has not answered, or says "locked", or cannot be
// asked, the app (every screen, the realtime channel, the reminder runner) is not mounted at all. expo-router is replaced by a stand-in that renders the screens
// whose Stack.Protected guard is open, so "mounted" can be seen.

const mockPush = jest.fn()
const mockHide = jest.fn(() => Promise.resolve())
const mockTakePending = jest.fn((): string | null => null)
const g = globalThis as any

jest.mock('expo-router', () => {
  const { Text, View } = require('react-native')
  const Stack: any = ({ children }: any) => <View testID="stack">{children}</View>
  Stack.Protected = ({ guard, children }: any) => (guard ? <>{children}</> : null)
  Stack.Screen = ({ name }: any) => <Text>{`screen:${name}`}</Text>
  return { Stack, useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }), useSegments: () => [] }
})
// The real provider renders nothing until the native side reports the insets, which never happens under Jest.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linking', () => ({ useLinkingURL: () => null, createURL: (p: string) => `lifetrack://${p}` }))
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(() => Promise.resolve()), hideAsync: () => mockHide() }))
jest.mock('../src/lib/deepLinks', () => ({ pathFromUrl: () => null, rememberPending: jest.fn(), takePending: () => mockTakePending() }))
jest.mock('../src/lib/supabase', () => ({
  isConfigured: true, supabase: null, authService: { signIn: jest.fn() },
  db: { list: async () => [], rpc: async () => null, insert: async () => [], update: async () => [], upsert: async () => [], remove: async () => {}, removeMany: async () => {} },
}))
jest.mock('../src/lib/security', () => ({ security: null }))
jest.mock('../src/lib/signOut', () => ({ signOutCleanly: jest.fn(async () => {}) }))
jest.mock('../src/lib/haptics', () => ({ haptics: { success: jest.fn(), tap: jest.fn(), warning: jest.fn() } }))
jest.mock('../src/providers/AuthProvider', () => ({
  AuthProvider: ({ children }: any) => children,
  useAuth: () => (globalThis as any).__auth,
}))
// Keep the real context, hook and activity wrapper; supply the lock's state from the test.
jest.mock('../src/features/security/SecurityProvider', () => {
  const actual = jest.requireActual('../src/features/security/SecurityProvider')
  const { createElement } = require('react')
  return { ...actual, SecurityProvider: ({ children }: any) => createElement(actual.SecurityContext.Provider, { value: (globalThis as any).__sec }, children) }
})

import Root from '../app/_layout'

const STATE = { appLockEnabled: true, pinLength: 4, pinSetAt: null, autoLockSeconds: 300, biometricEnabled: false, passkeyCount: 0, locked: false, lockoutSeconds: 0, failedAttempts: 0, sessionId: 's' }
const sec = (over: Partial<SecurityValue> = {}): SecurityValue => ({
  status: 'ready', state: STATE, error: null, locked: false, enabled: true,
  biometrics: { support: null, enrolledHere: false, broken: false, keyId: null },
  refresh: jest.fn(async () => STATE), retry: jest.fn(), lockNow: jest.fn(async () => {}),
  unlockWithPin: jest.fn(async () => ({ ok: true, reason: null, triesLeft: null, lockoutSeconds: 0, signedOut: false, failedAttempts: 0 })),
  unlockWithBiometrics: jest.fn(), finishUnlock: jest.fn(async () => STATE), refreshBiometrics: jest.fn(async () => {}), noteActivity: jest.fn(),
  api: null, deviceKeys: null, userId: 'u1', ...over,
})
const signedIn = { session: { user: { id: 'u1' } }, loading: false, email: 'ann@example.com', displayName: 'Ann' }
const signedOut = { session: null, loading: false, email: '', displayName: '' }
const show = async () => render(<Root />)

beforeEach(() => {
  mockPush.mockClear(); mockHide.mockClear(); mockTakePending.mockReset(); mockTakePending.mockReturnValue(null)
  g.__auth = signedIn
  g.__sec = sec()
})
afterEach(() => cleanup())

describe('Gate: the app is mounted only for an unlocked session', () => {
  it('unlocked: the app', async () => {
    await show()
    expect(screen.getByText('screen:(app)')).toBeTruthy()
    expect(screen.queryByText('screen:(auth)')).toBeNull()
    expect(screen.queryByLabelText('LifeTrack is locked')).toBeNull()
    expect(mockHide).toHaveBeenCalled()
  })
  it('locked: the lock screen and NOTHING of the app', async () => {
    g.__sec = sec({ locked: true, state: { ...STATE, locked: true } })
    await show()
    expect(screen.getByLabelText('LifeTrack is locked')).toBeTruthy()
    expect(screen.getByText('Welcome back, Ann')).toBeTruthy()
    expect(screen.queryByTestId('stack')).toBeNull() // the navigator itself is gone, so no screen can be mounted behind the lock
    expect(screen.queryByText('screen:(app)')).toBeNull()
    expect(mockHide).toHaveBeenCalled() // the splash goes: the lock screen is what the person sees
  })
  it('before the server has answered: nothing at all, and the splash stays up (a flash of the app would be a leak)', async () => {
    for (const status of ['idle', 'loading'] as const) {
      g.__sec = sec({ status, state: null, enabled: false })
      mockHide.mockClear()
      const r = await show()
      expect(screen.queryByTestId('stack')).toBeNull()
      expect(screen.queryByLabelText('LifeTrack is locked')).toBeNull()
      expect(screen.queryByText('screen:(app)')).toBeNull()
      expect(mockHide).not.toHaveBeenCalled()
      await r.unmount()
    }
  })
  it('when the server cannot be asked: LifeTrack stays closed, and says how to try again', async () => {
    const retry = jest.fn()
    g.__sec = sec({ status: 'error', state: null, enabled: false, error: 'Network request failed', retry })
    await show()
    expect(screen.getByText("Can't check your security settings")).toBeTruthy()
    expect(screen.getByText(/Network request failed/)).toBeTruthy()
    expect(screen.queryByText('screen:(app)')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
  it('a database without the security migration simply opens the app, as before', async () => {
    g.__sec = sec({ status: 'unsupported', state: null, enabled: false })
    await show()
    expect(screen.getByText('screen:(app)')).toBeTruthy()
  })
  it('signed out: the sign-in screens, whatever the lock says (there is no session to lock)', async () => {
    g.__auth = signedOut
    g.__sec = sec({ status: 'idle', state: null, enabled: false })
    await show()
    expect(screen.getByText('screen:(auth)')).toBeTruthy()
    expect(screen.queryByText('screen:(app)')).toBeNull()
    expect(mockHide).toHaveBeenCalled()
  })
  it('does not render while the stored session is still being read', async () => {
    g.__auth = { ...signedIn, loading: true }
    await show()
    expect(screen.queryByTestId('stack')).toBeNull()
    expect(mockHide).not.toHaveBeenCalled()
  })
  it('a link waiting for sign-in is followed only once the app is unlocked', async () => {
    mockTakePending.mockReturnValue('/module/finance')
    g.__sec = sec({ locked: true, state: { ...STATE, locked: true } })
    const r = await show()
    await act(async () => { await new Promise((res) => setTimeout(res, 20)) })
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockTakePending).not.toHaveBeenCalled() // and it is not thrown away while locked
    g.__sec = sec()
    r.rerender(<Root />)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/module/finance'))
  })
  it('every touch in the unlocked app counts as activity, and the touch still reaches the screen underneath', async () => {
    const noteActivity = jest.fn()
    g.__sec = sec({ noteActivity })
    await show()
    const wrapper = screen.getByTestId('stack').parent!
    const handler = (wrapper.props as any).onStartShouldSetResponderCapture
    expect(typeof handler).toBe('function')
    expect(handler()).toBe(false) // returns false: it only listens
    expect(noteActivity).toHaveBeenCalledTimes(1)
  })
})
