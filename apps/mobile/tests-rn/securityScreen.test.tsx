import { Alert } from 'react-native'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '../src/providers/ThemeProvider'
import { SecurityContext, type SecurityValue } from '../src/features/security/SecurityProvider'
import Security from '../app/(app)/module/security'

const mockSignIn = jest.fn()
const mockSignOut = jest.fn(async () => {})
jest.mock('../src/lib/supabase', () => ({ authService: { signIn: (...a: unknown[]) => mockSignIn(...a) }, supabase: null, db: null, isConfigured: true }))
jest.mock('../src/lib/signOut', () => ({ signOutCleanly: () => mockSignOut() }))
jest.mock('../src/lib/haptics', () => ({ haptics: { success: jest.fn(), tap: jest.fn(), warning: jest.fn() } }))
jest.mock('../src/providers/AuthProvider', () => ({ useAuth: () => ({ session: {}, loading: false, email: 'ann@example.com', displayName: 'Ann' }) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }), useSegments: () => [] }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const STATE = { appLockEnabled: true, pinLength: 4, pinSetAt: '2026-11-01T10:00:00Z', autoLockSeconds: 300, biometricEnabled: false, passkeyCount: 0, locked: false, lockoutSeconds: 0, failedAttempts: 0, sessionId: 's' }
const OK_PIN = { ok: true, reason: null, triesLeft: null, lockoutSeconds: 0, signedOut: false, failedAttempts: 0 }
const WRONG_PIN = { ok: false, reason: 'wrong_pin', triesLeft: 4, lockoutSeconds: 0, signedOut: false, failedAttempts: 1 }
const FINGERPRINT = { support: { available: true, kind: 'fingerprint', label: 'Fingerprint', reason: null }, enrolledHere: false, broken: false, keyId: null }
const SESSIONS = [
  { id: 's1', createdAt: '2026-11-11T08:00:00Z', lastActiveAt: new Date().toISOString(), userAgent: 'okhttp/4.12', ip: '203.0.113.9', current: true, unlocked: true, trusted: false },
  { id: 's2', createdAt: '2026-11-10T08:00:00Z', lastActiveAt: '2026-11-10T09:00:00Z', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126 Safari/537', ip: '198.51.100.4', current: false, unlocked: false, trusted: true },
]

function fakeApi() {
  return {
    setPin: jest.fn(async () => STATE), changePin: jest.fn(async () => OK_PIN), disableAppLock: jest.fn(async () => OK_PIN), resetAppLock: jest.fn(async () => STATE), setAutoLock: jest.fn(async () => STATE),
    sessions: { list: jest.fn(async () => SESSIONS), revoke: jest.fn(async () => {}), untrust: jest.fn(async () => {}), signOutOthers: jest.fn(async () => {}), signOutEverywhere: jest.fn(async () => {}) },
    deviceKeys: { available: jest.fn(async () => true), list: jest.fn(async (): Promise<any[]> => []), rename: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
  }
}
const fakeKeys = () => ({ enroll: jest.fn(async () => ({ ok: true, id: 'k1' })), disable: jest.fn(async () => {}), reconcile: jest.fn(async () => {}), support: jest.fn(), localState: jest.fn(), unlock: jest.fn(), forget: jest.fn() })

function sec(over: Partial<SecurityValue> = {}): SecurityValue & { api: ReturnType<typeof fakeApi>; deviceKeys: ReturnType<typeof fakeKeys> } {
  const base: any = {
    status: 'ready', state: STATE, error: null, locked: false, enabled: true,
    biometrics: FINGERPRINT,
    refresh: jest.fn(async () => STATE), retry: jest.fn(), lockNow: jest.fn(async () => {}),
    unlockWithPin: jest.fn(async () => OK_PIN), unlockWithBiometrics: jest.fn(), finishUnlock: jest.fn(async () => STATE),
    refreshBiometrics: jest.fn(async () => {}), noteActivity: jest.fn(), api: fakeApi(), deviceKeys: fakeKeys(), userId: 'u1',
  }
  return { ...base, ...over }
}
const show = async (value: SecurityValue) => render(<ThemeProvider><SecurityContext.Provider value={value}><Security /></SecurityContext.Provider></ThemeProvider>)
const btn = (name: string) => screen.getByRole('button', { name })
const press = (name: string) => fireEvent.press(btn(name))
const tap = async (digits: string) => { for (const d of digits) await fireEvent.press(screen.getByRole('button', { name: d })) }
/** Answers the native confirmation dialog the way a person would. */
const answer = (label: string) => jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { (buttons as { text: string; onPress?: () => void }[] | undefined)?.find((b) => b.text === label)?.onPress?.() })

beforeEach(() => { mockSignIn.mockReset(); mockSignOut.mockClear() })
afterEach(() => { cleanup(); jest.restoreAllMocks() })

describe('Security & Privacy: app lock', () => {
  it('says what to run when the database has not had the security migration, and offers no lock', async () => {
    await show(sec({ status: 'unsupported', state: null, enabled: false }))
    expect(screen.getByText(/0012_security\.sql/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn on app lock' })).toBeNull()
    expect(screen.queryByText('Fingerprint & face unlock')).toBeNull()
  })
  it('with no lock: says so, and turns it on with a PIN chosen twice', async () => {
    const value = sec({ state: { ...STATE, appLockEnabled: false, pinLength: null }, enabled: false })
    await show(value)
    expect(screen.getByText('App lock is off')).toBeTruthy()
    expect(screen.getByText('Anyone who opens this phone can open LifeTrack.')).toBeTruthy()
    expect(screen.queryByText('Fingerprint & face unlock')).toBeNull() // nothing to unlock yet
    await press('Turn on app lock')
    expect(await screen.findByText('Choose a PIN')).toBeTruthy()
    await tap('2486')
    expect(await screen.findByText('Enter it again to confirm')).toBeTruthy()
    await tap('2486')
    await waitFor(() => expect(value.api.setPin).toHaveBeenCalledWith('2486'), { timeout: 3000 })
    await waitFor(() => expect(value.refresh).toHaveBeenCalled(), { timeout: 3000 })
  })
  it('refuses an easy PIN on the spot with the reason, and a confirmation that does not match', async () => {
    const value = sec({ state: { ...STATE, appLockEnabled: false, pinLength: null }, enabled: false })
    await show(value)
    await press('Turn on app lock')
    await tap('1234')
    expect(await screen.findByText('Avoid straight runs like 1234 or 4321.')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 650))
    await tap('2486')
    await screen.findByText('Enter it again to confirm')
    await tap('2487')
    expect(await screen.findByText('The PINs do not match. Start again.')).toBeTruthy()
    expect(value.api.setPin).not.toHaveBeenCalled()
  })
  it('can be six digits', async () => {
    const value = sec({ state: { ...STATE, appLockEnabled: false, pinLength: null }, enabled: false })
    await show(value)
    await press('Turn on app lock')
    await fireEvent.press(screen.getByRole('radio', { name: '6 digits' }))
    await tap('908142')
    await screen.findByText('Enter it again to confirm')
    await tap('908142')
    await waitFor(() => expect(value.api.setPin).toHaveBeenCalledWith('908142'), { timeout: 3000 })
  })
  it('shows the lock is on, since when, and the settings: automatic lock, lock now', async () => {
    const value = sec()
    await show(value)
    expect(screen.getByText('App lock is on')).toBeTruthy()
    expect(screen.getByText(/4-digit PIN · set /)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'After 5 minutes' })).toBeSelected()
    await press('After 15 minutes')
    await waitFor(() => expect(value.api.setAutoLock).toHaveBeenCalledWith(900))
    await waitFor(() => expect(value.refresh).toHaveBeenCalled())
    await press('Lock now')
    expect(value.lockNow).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Finance')).toBeTruthy()
    expect(screen.getByText('Journal & notes')).toBeTruthy()
  })
  it('changes the PIN only after the current one is checked by the server', async () => {
    const value = sec()
    await show(value)
    await press('Change PIN')
    expect(await screen.findByText('Enter your current PIN')).toBeTruthy()
    await tap('2486')
    expect(await screen.findByText('Choose a new PIN')).toBeTruthy()
    expect(value.unlockWithPin).toHaveBeenCalledWith('2486')
    await tap('7319')
    await screen.findByText('Enter it again to confirm')
    await tap('7319')
    await waitFor(() => expect(value.api.changePin).toHaveBeenCalledWith('2486', '7319'), { timeout: 3000 })
  })
  it('stays on the first step, with the server\'s count of tries, when the current PIN is wrong', async () => {
    const value = sec({ unlockWithPin: jest.fn(async () => WRONG_PIN as any) })
    await show(value)
    await press('Change PIN')
    await tap('1357')
    expect(await screen.findByText('Wrong PIN. 4 tries left before a short lockout.')).toBeTruthy()
    expect(screen.getByText('Enter your current PIN')).toBeTruthy()
    expect(value.api.changePin).not.toHaveBeenCalled()
  })
  it('turns the lock off only with the PIN', async () => {
    const value = sec()
    await show(value)
    await press('Turn off app lock…')
    expect(await screen.findByText('Enter your PIN to turn the lock off')).toBeTruthy()
    await tap('2486')
    await waitFor(() => expect(value.api.disableAppLock).toHaveBeenCalledWith('2486'), { timeout: 3000 })
  })
  it('a wrong PIN there is counted by the server and explained; too many ends the session', async () => {
    const value = sec()
    value.api.disableAppLock.mockResolvedValueOnce(WRONG_PIN as any)
    await show(value)
    await press('Turn off app lock…')
    await tap('1357')
    expect(await screen.findByText('Wrong PIN. 4 tries left before a short lockout.')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 650))
    value.api.disableAppLock.mockResolvedValueOnce({ ...WRONG_PIN, signedOut: true, lockoutSeconds: 60 } as any)
    await tap('1357')
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
  })
  it('"I forgot my PIN" takes the account password, then lets a new PIN be chosen', async () => {
    mockSignIn.mockResolvedValue(undefined)
    const value = sec()
    await show(value)
    await press('I forgot my PIN')
    expect(await screen.findByText('Reset your PIN')).toBeTruthy()
    expect(btn('Continue')).toBeDisabled()
    await fireEvent.changeText(screen.getByLabelText('Account password'), 'correct horse battery')
    await press('Continue')
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('ann@example.com', 'correct horse battery'))
    expect((await screen.findAllByText('Choose a new PIN', undefined, { timeout: 3000 })).length).toBeGreaterThan(0) // the sheet's title and its prompt
    await tap('7319')
    await screen.findByText('Enter it again to confirm')
    await tap('7319')
    await waitFor(() => expect(value.api.resetAppLock).toHaveBeenCalledWith('7319'), { timeout: 3000 })
  })
  it('"I forgot my PIN" shows why when the password is wrong', async () => {
    mockSignIn.mockRejectedValue(new Error('Incorrect email or password.'))
    await show(sec())
    await press('I forgot my PIN')
    await fireEvent.changeText(screen.getByLabelText('Account password'), 'nope')
    await press('Continue')
    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy()
  })
})

describe('Security & Privacy: fingerprint and face unlock for this phone', () => {
  it('is not there without an app lock, or while locked', async () => {
    const off = await show(sec({ state: { ...STATE, appLockEnabled: false }, enabled: false }))
    expect(screen.queryByText('Fingerprint & face unlock')).toBeNull()
    await off.unmount()
    await show(sec({ locked: true, state: { ...STATE, locked: true } }))
    expect(screen.queryByText('Fingerprint & face unlock')).toBeNull()
  })
  it('says what to run when the server cannot do it yet', async () => {
    const value = sec()
    value.api.deviceKeys.available.mockResolvedValue(false)
    await show(value)
    expect(await screen.findByText(/0014_device_keys\.sql/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn on/ })).toBeNull()
  })
  it('says why the phone cannot do it', async () => {
    await show(sec({ biometrics: { support: { available: false, kind: 'biometrics', label: 'Biometrics', reason: 'Add a fingerprint or face in your phone’s settings first.' }, enrolledHere: false, broken: false, keyId: null } }))
    expect(await screen.findByText('Add a fingerprint or face in your phone’s settings first.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn on/ })).toBeNull()
  })
  it('turns it on for this phone, then tells the person where it will appear', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const value = sec()
    await show(value)
    await waitFor(() => expect(btn('Turn on fingerprint unlock')).toBeEnabled())
    await press('Turn on fingerprint unlock')
    await waitFor(() => expect(value.deviceKeys.enroll).toHaveBeenCalledWith('u1'))
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Fingerprint unlock is on', expect.stringMatching(/lock screen/)))
    expect(value.api.deviceKeys.list.mock.calls.length).toBeGreaterThanOrEqual(2) // reloaded after
  })
  it('says nothing when the fingerprint prompt is dismissed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const value = sec()
    value.deviceKeys.enroll.mockResolvedValue({ ok: false, cancelled: true } as any)
    await show(value)
    await waitFor(() => expect(btn('Turn on fingerprint unlock')).toBeEnabled())
    await press('Turn on fingerprint unlock')
    await waitFor(() => expect(value.deviceKeys.enroll).toHaveBeenCalled())
    expect(alert).not.toHaveBeenCalled()
  })
  it('shows the reason when the server or the phone refuses', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const value = sec()
    value.deviceKeys.enroll.mockRejectedValue(new Error('Unlock LifeTrack first.'))
    await show(value)
    await waitFor(() => expect(btn('Turn on fingerprint unlock')).toBeEnabled())
    await press('Turn on fingerprint unlock')
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not turn it on', 'Unlock LifeTrack first.'))
  })
  it('on this phone: says it is on, lists the phones, and turns it off', async () => {
    const value = sec({ biometrics: { ...FINGERPRINT, enrolledHere: true, keyId: 'k1' } as any })
    value.api.deviceKeys.list.mockResolvedValue([
      { id: 'k1', label: 'Pixel 8', platform: 'android', createdAt: '2026-11-10T10:00:00Z', lastUsedAt: null },
      { id: 'k2', label: 'iPad', platform: 'ios', createdAt: '2026-11-01T10:00:00Z', lastUsedAt: '2026-11-09T10:00:00Z' },
    ])
    await show(value)
    expect(await screen.findByText('Fingerprint is on for this phone')).toBeTruthy()
    expect(await screen.findByText('Pixel 8')).toBeTruthy()
    expect(screen.getAllByText('This phone').length).toBeGreaterThanOrEqual(1) // the badge on its key (and this phone's own session below)
    expect(screen.getByText('iPad')).toBeTruthy()
    expect(value.deviceKeys.reconcile).toHaveBeenCalledWith('u1', expect.arrayContaining([expect.objectContaining({ id: 'k1' })]))
    await press('Turn off fingerprint unlock')
    await waitFor(() => expect(value.deviceKeys.disable).toHaveBeenCalledWith('u1'))
  })
  it('renames a phone, removes another one after asking, and removes this one through the phone itself', async () => {
    const value = sec({ biometrics: { ...FINGERPRINT, enrolledHere: true, keyId: 'k1' } as any })
    value.api.deviceKeys.list.mockResolvedValue([
      { id: 'k1', label: 'Pixel 8', platform: 'android', createdAt: '2026-11-10T10:00:00Z', lastUsedAt: null },
      { id: 'k2', label: 'iPad', platform: 'ios', createdAt: '2026-11-01T10:00:00Z', lastUsedAt: null },
    ])
    await show(value)
    await screen.findByText('iPad')
    const renames = screen.getAllByRole('button', { name: 'Rename' })
    await fireEvent.press(renames[1])
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Family iPad')
    await press('Save')
    await waitFor(() => expect(value.api.deviceKeys.rename).toHaveBeenCalledWith('k2', 'Family iPad'))
    const removes = screen.getAllByRole('button', { name: 'Remove' })
    answer('Remove')
    await fireEvent.press(removes[1])
    await waitFor(() => expect(value.api.deviceKeys.remove).toHaveBeenCalledWith('k2'))
    await fireEvent.press(screen.getAllByRole('button', { name: 'Remove' })[0])
    await waitFor(() => expect(value.deviceKeys.disable).toHaveBeenCalledWith('u1')) // this phone: its own key goes too
  })
  it('does not remove anything when the question is declined', async () => {
    const value = sec()
    value.api.deviceKeys.list.mockResolvedValue([{ id: 'k2', label: 'iPad', platform: 'ios', createdAt: '2026-11-01T10:00:00Z', lastUsedAt: null }])
    await show(value)
    await screen.findByText('iPad')
    answer('Cancel')
    await press('Remove')
    await new Promise((r) => setTimeout(r, 50))
    expect(value.api.deviceKeys.remove).not.toHaveBeenCalled()
  })
  it('explains that fingerprints changed on this phone, and offers to set it up again', async () => {
    await show(sec({ biometrics: { ...FINGERPRINT, broken: true } as any }))
    expect(await screen.findByText(/fingerprints or face changed on this phone/)).toBeTruthy()
    expect(btn('Turn on fingerprint unlock')).toBeTruthy()
  })
  it('shows a failure to load the phones instead of hiding it', async () => {
    const value = sec()
    value.api.deviceKeys.list.mockRejectedValue(new Error('Security features are not installed in your database yet. Run supabase/migrations/0014_device_keys.sql in the SQL Editor.'))
    await show(value)
    expect(await screen.findByText(/0014_device_keys\.sql in the SQL Editor/)).toBeTruthy()
  })
})

describe('Security & Privacy: where you are signed in', () => {
  it('lists the sessions: this phone first, others described from their user agent, trust and lock state shown', async () => {
    await show(sec())
    expect(await screen.findByText('Chrome on Windows')).toBeTruthy()
    expect(screen.getByText('Trusted: no PIN')).toBeTruthy()
    expect(screen.getByText('This device')).toBeTruthy()
    expect(screen.getByText('Unlocked')).toBeTruthy()
    expect(screen.getByText(/198\.51\.100\.4 · active /)).toBeTruthy()
  })
  it('takes back a "trusted" mark, so that device asks for the PIN again', async () => {
    const value = sec()
    await show(value)
    await screen.findByText('Chrome on Windows')
    await press('Ask for PIN')
    await waitFor(() => expect(value.api.sessions.untrust).toHaveBeenCalledWith('s2'))
  })
  it('signs another device out only after asking', async () => {
    const value = sec()
    await show(value)
    await screen.findByText('Chrome on Windows')
    answer('Cancel')
    await press('Sign out')
    expect(value.api.sessions.revoke).not.toHaveBeenCalled()
    jest.restoreAllMocks()
    answer('Sign out')
    await press('Sign out')
    await waitFor(() => expect(value.api.sessions.revoke).toHaveBeenCalledWith('s2'))
  })
  it('signs out the other devices, and everywhere after asking', async () => {
    const value = sec()
    await show(value)
    await screen.findByText('Chrome on Windows')
    await press('Sign out other devices')
    await waitFor(() => expect(value.api.sessions.signOutOthers).toHaveBeenCalledTimes(1))
    answer('Sign out everywhere')
    await press('Sign out everywhere')
    await waitFor(() => expect(value.api.sessions.signOutEverywhere).toHaveBeenCalledTimes(1))
  })
  it('has nobody else to sign out when this is the only session', async () => {
    const value = sec()
    value.api.sessions.list.mockResolvedValue([SESSIONS[0]])
    await show(value)
    await screen.findByText('This phone')
    expect(btn('Sign out other devices')).toBeDisabled()
  })
  it('says why when the sessions cannot be loaded', async () => {
    const value = sec()
    value.api.sessions.list.mockRejectedValue(new Error('LifeTrack is locked. Enter your PIN first.'))
    await show(value)
    expect(await screen.findByText('LifeTrack is locked. Enter your PIN first.')).toBeTruthy()
  })
  it('is not shown on a database without the lock', async () => {
    await show(sec({ status: 'unsupported', state: null, enabled: false }))
    expect(screen.queryByText("Where you're signed in")).toBeNull()
  })
})
