import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { AppError } from '@lifetrack/data'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SecurityContext, type SecurityValue } from '../src/features/security/SecurityProvider'
import { LockScreen, SecurityUnavailable } from '../src/features/security/LockScreen'
import { PinDots, PinKeypad } from '../src/features/security/PinKeypad'

const mockSignIn = jest.fn()
const mockSignOut = jest.fn(async () => {})
jest.mock('../src/lib/supabase', () => ({ authService: { signIn: (...a: unknown[]) => mockSignIn(...a) }, supabase: null, db: null, isConfigured: true }))
jest.mock('../src/lib/signOut', () => ({ signOutCleanly: () => mockSignOut() }))
jest.mock('../src/lib/haptics', () => ({ haptics: { success: jest.fn(), tap: jest.fn(), warning: jest.fn() } }))
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => ({ session: {}, loading: false, email: 'ann@example.com', displayName: 'Ann' }) }))
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const STATE = { appLockEnabled: true, pinLength: 4, pinSetAt: null, autoLockSeconds: 300, biometricEnabled: false, passkeyCount: 0, locked: true, lockoutSeconds: 0, failedAttempts: 0, sessionId: 's' }
const OK = { ok: true, reason: null, triesLeft: null, lockoutSeconds: 0, signedOut: false, failedAttempts: 0 }
const WRONG = { ok: false, reason: 'wrong_pin', triesLeft: 4, lockoutSeconds: 0, signedOut: false, failedAttempts: 1 }
const FINGERPRINT = { support: { available: true, kind: 'fingerprint', label: 'Fingerprint', reason: null }, enrolledHere: true, broken: false, keyId: 'k1' }
const FAILURE = { ok: false, cancelled: false, message: '', lockoutSeconds: 0, signedOut: false, gone: false }

const sec = (over: Partial<SecurityValue> = {}): SecurityValue => ({
  status: 'ready', state: STATE, error: null, locked: true, enabled: true,
  biometrics: { support: null, enrolledHere: false, broken: false, keyId: null },
  refresh: jest.fn(async () => STATE), retry: jest.fn(), lockNow: jest.fn(async () => {}),
  unlockWithPin: jest.fn(async () => OK as any), unlockWithBiometrics: jest.fn(async () => ({ ok: true }) as any),
  finishUnlock: jest.fn(async () => STATE), refreshBiometrics: jest.fn(async () => {}), noteActivity: jest.fn(),
  api: null, deviceKeys: null, userId: 'u1', ...over,
})
const show = async (value: SecurityValue) => render(<SafeAreaProvider><SecurityContext.Provider value={value}><LockScreen /></SecurityContext.Provider></SafeAreaProvider>)
const tap = async (digits: string) => { for (const d of digits) await fireEvent.press(screen.getByRole('button', { name: d })) }
const dots = () => screen.getByRole('progressbar')

beforeEach(() => { mockSignIn.mockReset(); mockSignOut.mockClear() })
afterEach(() => cleanup())

describe('the PIN pad', () => {
  it('shows the digits, a delete key and what has been typed so far, never the digits themselves', async () => {
    const onDigit = jest.fn(), onBackspace = jest.fn(), onClear = jest.fn()
    await render(<PinKeypad onDigit={onDigit} onBackspace={onBackspace} onClear={onClear} />)
    for (const d of '1234567890') await fireEvent.press(screen.getByRole('button', { name: d }))
    expect(onDigit.mock.calls.map((c) => c[0]).join('')).toBe('1234567890')
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }))
    expect(onBackspace).toHaveBeenCalledTimes(1)
    await fireEvent(screen.getByRole('button', { name: 'Delete' }), 'longPress')
    expect(onClear).toHaveBeenCalledTimes(1)
  })
  it('ignores the keys while it is busy', async () => {
    const onDigit = jest.fn()
    await render(<PinKeypad onDigit={onDigit} onBackspace={jest.fn()} disabled />)
    await fireEvent.press(screen.getByRole('button', { name: '5' }))
    expect(onDigit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled()
  })
  it('has room for the fingerprint button in the corner', async () => {
    const { Text } = require('react-native')
    await render(<PinKeypad onDigit={jest.fn()} onBackspace={jest.fn()} leftSlot={<Text>slot</Text>} size="sm" />)
    expect(screen.getByText('slot')).toBeTruthy()
  })
  it('describes the dots for a screen reader, in every state', async () => {
    const { rerender } = await render(<PinDots length={6} filled={2} />)
    expect(screen.getByRole('progressbar', { name: '2 of 6 digits entered' })).toHaveAccessibilityValue({ min: 0, max: 6, now: 2 })
    await rerender(<PinDots length={4} filled={0} status="error" />)
    expect(screen.getByRole('progressbar', { name: '0 of 4 digits entered' })).toBeTruthy()
    await rerender(<PinDots length={4} filled={4} status="success" />)
    expect(screen.getByRole('progressbar', { name: '4 of 4 digits entered' })).toBeTruthy()
  })
})

describe('the lock screen', () => {
  it('greets the person and asks for their PIN, with no fingerprint button when none is set up', async () => {
    await show(sec())
    expect(screen.getByLabelText('LifeTrack is locked')).toBeTruthy()
    expect(screen.getByText('Welcome back, Ann')).toBeTruthy()
    expect(screen.getByText('Enter your 4-digit PIN.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
    expect(dots()).toHaveAccessibilityValue({ min: 0, max: 4, now: 0 })
  })
  it('follows the length of the PIN that was set (6 digits)', async () => {
    await show(sec({ state: { ...STATE, pinLength: 6 } }))
    expect(screen.getByText('Enter your 6-digit PIN.')).toBeTruthy()
    expect(dots()).toHaveAccessibilityValue({ min: 0, max: 6, now: 0 })
  })
  it('sends the whole PIN to the server once, after the last digit, and not before', async () => {
    const value = sec()
    await show(value)
    await tap('248')
    expect(value.unlockWithPin).not.toHaveBeenCalled()
    expect(dots()).toHaveAccessibilityValue({ min: 0, max: 4, now: 3 })
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }))
    await tap('86')
    await waitFor(() => expect(value.unlockWithPin).toHaveBeenCalledTimes(1))
    expect(value.unlockWithPin).toHaveBeenCalledWith('2486')
  })
  it('opens only after the server says so: the success tick, then the app asks the server again', async () => {
    const value = sec()
    await show(value)
    await tap('2486')
    await waitFor(() => expect(value.finishUnlock).toHaveBeenCalledTimes(1), { timeout: 3000 })
  })
  it('says how many tries are left after a wrong PIN, and clears the pad', async () => {
    const value = sec({ unlockWithPin: jest.fn(async () => WRONG as any) })
    await show(value)
    await tap('1357')
    expect(await screen.findByText('Wrong PIN. 4 tries left before a short lockout.')).toBeTruthy()
    expect(value.finishUnlock).not.toHaveBeenCalled()
    await waitFor(() => expect(dots()).toHaveAccessibilityValue({ min: 0, max: 4, now: 0 }))
  })
  it('during a lockout says how long to wait, and the keys do nothing', async () => {
    const value = sec({ unlockWithPin: jest.fn(async () => ({ ...WRONG, reason: 'wrong_pin', triesLeft: 0, lockoutSeconds: 30 }) as any) })
    await show(value)
    await tap('1357')
    expect(await screen.findByText('Too many wrong PINs. Try again in 30 s.')).toBeTruthy()
    await tap('1111')
    expect(value.unlockWithPin).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled()
  })
  it('starts in a lockout the server already told it about', async () => {
    await show(sec({ state: { ...STATE, lockoutSeconds: 90 } }))
    expect(screen.getByText('Too many wrong PINs. Try again in 1 min 30 s.')).toBeTruthy()
  })
  it('says so when the server ended the session for too many wrong PINs', async () => {
    await show(sec({ unlockWithPin: jest.fn(async () => ({ ...WRONG, signedOut: true, lockoutSeconds: 60 }) as any) }))
    await tap('1357')
    expect(await screen.findByText('Too many wrong PINs. For your safety you have been signed out.')).toBeTruthy()
  })
  it('shows what went wrong when the server cannot be reached', async () => {
    await show(sec({ unlockWithPin: jest.fn(async () => { throw new AppError('The server said no.') }) }))
    await tap('1357')
    expect(await screen.findByText('The server said no.')).toBeTruthy()
  })
  it('lets the app go on when there turns out to be no lock any more', async () => {
    const value = sec({ unlockWithPin: jest.fn(async () => ({ ...WRONG, reason: 'not_enabled' }) as any) })
    await show(value)
    await tap('1357')
    await waitFor(() => expect(value.finishUnlock).toHaveBeenCalledTimes(1))
  })
  it('offers sign-out, which signs out cleanly', async () => {
    await show(sec())
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })
})

describe('"Forgot PIN?"', () => {
  it('unlocks with the account password, by signing in again (which is a fresh session the server opens without the PIN)', async () => {
    mockSignIn.mockResolvedValue(undefined)
    const value = sec()
    await show(value)
    await fireEvent.press(screen.getByRole('button', { name: 'Forgot PIN?' }))
    expect(screen.getByText('Unlock with your password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled()
    await fireEvent.changeText(screen.getByLabelText('Account password'), 'correct horse battery')
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('ann@example.com', 'correct horse battery'))
    expect(value.unlockWithPin).not.toHaveBeenCalled()
  })
  it('shows the reason when the password is wrong, and can go back to the PIN pad', async () => {
    mockSignIn.mockRejectedValue(new Error('Incorrect email or password.'))
    await show(sec())
    await fireEvent.press(screen.getByRole('button', { name: 'Forgot PIN?' }))
    await fireEvent.changeText(screen.getByLabelText('Account password'), 'nope')
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Back to PIN' }))
    expect(screen.getByText('Enter your 4-digit PIN.')).toBeTruthy()
  })
})

describe('fingerprint and face unlock on the lock screen', () => {
  it('is offered only when this phone has a key, the sensor can be used, and the lock is on', async () => {
    for (const biometrics of [
      { support: null, enrolledHere: false, broken: false, keyId: null },
      { ...FINGERPRINT, enrolledHere: false },
      { ...FINGERPRINT, support: { available: false, kind: 'fingerprint', label: 'Fingerprint', reason: 'No sensor' } },
    ]) {
      const r = await show(sec({ biometrics: biometrics as any }))
      expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
      await r.unmount()
    }
    const on = await show(sec({ biometrics: FINGERPRINT as any }))
    expect(screen.getByRole('button', { name: 'Use fingerprint' })).toBeTruthy()
    expect(screen.getByText('Use fingerprint or your PIN.')).toBeTruthy()
    await on.unmount()
  })
  it('offers the sensor straight away, once, like a phone does; a cancelled prompt leaves the PIN pad ready', async () => {
    const value = sec({ biometrics: FINGERPRINT as any, unlockWithBiometrics: jest.fn(async () => ({ ...FAILURE, cancelled: true })) })
    await show(value)
    await waitFor(() => expect(value.unlockWithBiometrics).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(await screen.findByText('Cancelled. Use your PIN, or tap the sensor to try again.')).toBeTruthy()
    await tap('1')
    expect(dots()).toHaveAccessibilityValue({ min: 0, max: 4, now: 1 })
    await new Promise((r) => setTimeout(r, 700))
    expect(value.unlockWithBiometrics).toHaveBeenCalledTimes(1) // not again by itself
  })
  it('does not offer it from the background: a sensor prompt cannot be shown there', async () => {
    const previous = AppState.currentState
    ;(AppState as any).currentState = 'background'
    try {
      const value = sec({ biometrics: FINGERPRINT as any })
      await show(value)
      await new Promise((r) => setTimeout(r, 700))
      expect(value.unlockWithBiometrics).not.toHaveBeenCalled()
    } finally { (AppState as any).currentState = previous }
  })
  it('does not offer it during a PIN lockout', async () => {
    const value = sec({ biometrics: FINGERPRINT as any, state: { ...STATE, lockoutSeconds: 30 } })
    await show(value)
    await new Promise((r) => setTimeout(r, 700))
    expect(value.unlockWithBiometrics).not.toHaveBeenCalled()
  })
  it('the sensor button tries again, and a success opens the app after the tick', async () => {
    const unlockWithBiometrics = jest.fn()
      .mockResolvedValueOnce({ ...FAILURE, cancelled: true })
      .mockResolvedValueOnce({ ok: true })
    const value = sec({ biometrics: FINGERPRINT as any, unlockWithBiometrics })
    await show(value)
    await screen.findByText('Cancelled. Use your PIN, or tap the sensor to try again.')
    await fireEvent.press(screen.getByRole('button', { name: 'Use fingerprint' }))
    await waitFor(() => expect(value.finishUnlock).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(unlockWithBiometrics).toHaveBeenCalledTimes(2)
  })
  it('shows why when the server or the sensor refused, and the lockout it caused', async () => {
    const value = sec({ biometrics: FINGERPRINT as any, unlockWithBiometrics: jest.fn(async () => ({ ...FAILURE, message: 'That did not work. Try again, or use your PIN.', lockoutSeconds: 30 })) })
    await show(value)
    expect(await screen.findByText('Too many wrong PINs. Try again in 30 s.')).toBeTruthy()
    expect(value.finishUnlock).not.toHaveBeenCalled()
  })
  it('shows the message from the phone when it says what is wrong', async () => {
    const value = sec({ biometrics: FINGERPRINT as any, unlockWithBiometrics: jest.fn(async () => ({ ...FAILURE, message: 'Your fingerprints or face changed on this phone, so fingerprint and face unlock was turned off.', gone: true })) })
    await show(value)
    expect(await screen.findByText(/fingerprints or face changed/)).toBeTruthy()
  })
  it('uses the right words and icon for a face on an iPhone', async () => {
    const face = { support: { available: true, kind: 'face', label: 'Face ID', reason: null }, enrolledHere: true, broken: false, keyId: 'k' }
    await show(sec({ biometrics: face as any, unlockWithBiometrics: jest.fn(async () => ({ ...FAILURE, cancelled: true })) }))
    expect(screen.getByRole('button', { name: 'Use face id' })).toBeTruthy()
    expect(screen.getByText('Use face id or your PIN.')).toBeTruthy()
  })
})

describe('when the server cannot be asked', () => {
  it('says so, offers to try again or to sign out, and never shows the app', async () => {
    const onRetry = jest.fn()
    await render(<SafeAreaProvider><SecurityUnavailable message={null} onRetry={onRetry} /></SafeAreaProvider>)
    expect(screen.getByText("Can't check your security settings")).toBeTruthy()
    expect(screen.getByText(/Check your connection and try again\. LifeTrack stays closed until it can\./)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })
})
