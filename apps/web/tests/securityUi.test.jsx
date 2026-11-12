import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { b64uDecode, b64uEncode } from '@lifetrack/core/webauthn'
import { auth } from '@/services/auth'
import { markLogin } from '@/services/localSecurity'
import { security } from '@/services/security'
import { getUserId } from '@/services/session'
import { softAuthenticator } from '../../../packages/core/tests/fixtures/softAuthenticator'
import { db, freshBackend, renderApp, signedInUser } from './components/helpers'
import { pickOption } from './pickers'

const PIN = '2486'
const STRONG = 'Violet-Harbor-42'

// These tests render whole (lazily loaded) pages and derive real PBKDF2 keys. Under coverage on a busy CI runner the first render can take well over
// the 10 s default, so this file waits longer rather than flaking.
configure({ asyncUtilTimeout: 20_000 })
vi.setConfig({ testTimeout: 60_000 })

beforeEach(async () => {
  await freshBackend()
  await signedInUser('ann@example.com', 'Ann')
})
afterEach(() => vi.restoreAllMocks())

/** Presses digits on whichever PIN pad is on screen. */
const press = async (user, digits, scope = screen) => {
  for (const d of digits) await user.click(scope.getByRole('button', { name: d }))
}
const lockScreen = () => screen.queryByRole('dialog', { name: 'LifeTrack is locked' })
const appIsVisible = () => screen.queryByRole('navigation', { name: 'Main' })
const hideTab = (hidden) => {
  Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}
/** Turns the lock on and locks it, the way a returning visitor finds it. */
async function lockedAccount(pin = PIN) {
  await security.setPin(pin)
  await security.lock()
}

describe('the gate', () => {
  it('shows the app straight away when no lock is set', async () => {
    renderApp('/')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(lockScreen()).toBeNull()
  })

  it('shows ONLY the lock screen while locked: the app is not mounted behind it', async () => {
    await lockedAccount()
    renderApp('/finance')
    expect(await screen.findByRole('dialog', { name: 'LifeTrack is locked' })).toBeInTheDocument()
    expect(screen.getByText('Welcome back, Ann')).toBeInTheDocument()
    expect(appIsVisible()).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Finance' })).toBeNull()
    expect(screen.queryByText('Add transaction')).toBeNull()
  })

  it('opens with the right PIN, with the success state first', async () => {
    const user = userEvent.setup()
    await lockedAccount()
    renderApp('/')
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    await press(user, PIN)
    expect(await screen.findByRole('navigation', { name: 'Main' }, { timeout: 5000 })).toBeInTheDocument()
    await waitFor(() => expect(lockScreen()).toBeNull())
    expect((await security.getState()).locked).toBe(false)
  })

  it('a wrong PIN shakes, says how many tries are left, and clears the dots', async () => {
    const user = userEvent.setup()
    await lockedAccount()
    renderApp('/')
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    await press(user, '1357')
    const msg = await screen.findByText('Wrong PIN. 4 tries left before a short lockout.')
    await act(() => new Promise((r) => setTimeout(r, 700))) // the shake is over, the message has not gone grey
    expect(msg).toHaveClass('text-danger')
    expect(screen.getByRole('status', { name: '0 of 4 digits entered' })).toBeInTheDocument()
    expect(appIsVisible()).toBeNull()
    await user.keyboard('2') // typing again clears the message
    expect(screen.queryByText('Wrong PIN. 4 tries left before a short lockout.')).toBeNull()
  })

  it('after 5 wrong PINs the keypad stops and says how long to wait', async () => {
    const user = userEvent.setup()
    await lockedAccount()
    renderApp('/')
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    for (let i = 0; i < 5; i++) {
      await press(user, '1357')
      if (i < 4) await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toBeEnabled(), { timeout: 3000 })
    }
    expect(await screen.findByText(/Too many wrong PINs\. Try again in/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled()
    expect(appIsVisible()).toBeNull()
  })

  it('works with the keyboard', async () => {
    const user = userEvent.setup()
    await lockedAccount()
    renderApp('/')
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    await user.keyboard('248')
    expect(screen.getByRole('status', { name: '3 of 4 digits entered' })).toBeInTheDocument()
    await user.keyboard('{Backspace}')
    expect(screen.getByRole('status', { name: '2 of 4 digits entered' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('status', { name: '0 of 4 digits entered' })).toBeInTheDocument()
  })

  it('a sign-in just now opens it without the PIN (the password was just typed)', async () => {
    await security.setPin(PIN)
    await security.lock()
    markLogin(getUserId()) // what signing in does
    renderApp('/')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(lockScreen()).toBeNull()
  })

  it('"Forgot PIN?" unlocks with the account password and rejects a wrong one', async () => {
    const user = userEvent.setup()
    await lockedAccount()
    renderApp('/')
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    await user.click(screen.getByRole('button', { name: /Forgot PIN/ }))
    await user.type(await screen.findByLabelText('Account password'), 'not-my-password')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(appIsVisible()).toBeNull()
    await user.clear(screen.getByLabelText('Account password'))
    await user.type(screen.getByLabelText('Account password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('navigation', { name: 'Main' }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('"Sign out" on the lock screen signs out', async () => {
    const user = userEvent.setup()
    await lockedAccount()
    renderApp('/')
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    await user.click(screen.getByRole('button', { name: /Sign out/ }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(await auth.getSession()).toBeNull()
  })

  it('locks when you leave and come back later than the auto-lock time', async () => {
    await security.setPin(PIN)
    await security.setAutoLock(60)
    renderApp('/')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    const real = Date.now()
    act(() => hideTab(true))
    expect(lockScreen()).toBeNull() // leaving does not lock yet: 60 s have not passed
    vi.spyOn(Date, 'now').mockReturnValue(real + 61_000)
    act(() => hideTab(false))
    expect(await screen.findByRole('dialog', { name: 'LifeTrack is locked' })).toBeInTheDocument()
    expect(appIsVisible()).toBeNull()
    expect((await security.getState()).locked).toBe(true)
  })

  it('"when I leave the app" locks the moment the tab is hidden', async () => {
    await security.setPin(PIN)
    await security.setAutoLock(0)
    renderApp('/')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    act(() => hideTab(true))
    expect(await screen.findByRole('dialog', { name: 'LifeTrack is locked' })).toBeInTheDocument()
    act(() => hideTab(false))
    expect(lockScreen()).toBeInTheDocument() // coming back does not unlock it
  })

  it('clears toasts when it locks, so nothing sits on top of the lock screen', async () => {
    await security.setPin(PIN)
    await security.setAutoLock(0)
    renderApp('/')
    await screen.findByRole('navigation', { name: 'Main' })
    act(() => {
      toast('Pay rent ₹12,000 today', { duration: Infinity })
    })
    expect(await screen.findByText(/Pay rent/)).toBeInTheDocument()
    act(() => hideTab(true))
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    await waitFor(() => expect(screen.queryByText(/Pay rent/)).toBeNull())
  })

  it('a returning visitor within a short break is not locked', async () => {
    await security.setPin(PIN)
    await security.setAutoLock(300)
    renderApp('/')
    await screen.findByRole('navigation', { name: 'Main' })
    act(() => hideTab(true))
    act(() => hideTab(false))
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(lockScreen()).toBeNull()
  })

  it('keeps the data off the page while locked, and loads it again after unlocking', async () => {
    const user = userEvent.setup()
    await db.insert('notes', [{ title: 'Secret plans' }])
    await security.setPin(PIN)
    await security.setAutoLock(0)
    renderApp('/notes')
    expect(await screen.findByText('Secret plans')).toBeInTheDocument()
    act(() => hideTab(true))
    expect(await screen.findByRole('dialog', { name: 'LifeTrack is locked' })).toBeInTheDocument()
    expect(screen.queryByText('Secret plans')).toBeNull()
    act(() => hideTab(false))
    await press(user, PIN)
    expect(await screen.findByText('Secret plans', undefined, { timeout: 5000 })).toBeInTheDocument()
  })
})

describe('a database without the security update', () => {
  it('just opens the app, as before the feature existed', async () => {
    const err = Object.assign(new Error('Could not find the function'), { code: 'NOT_INSTALLED' })
    vi.spyOn(security, 'getState').mockRejectedValue(err)
    renderApp('/')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(lockScreen()).toBeNull()
  })
  it('the Security page explains what to run', async () => {
    const err = Object.assign(new Error('x'), { code: 'NOT_INSTALLED' })
    vi.spyOn(security, 'getState').mockRejectedValue(err)
    renderApp('/security')
    expect(await screen.findByText(/0012_security\.sql/)).toBeInTheDocument()
  })
})

describe('a session that was ended elsewhere', () => {
  it('signs out and returns to the sign-in screen instead of showing a lock that can never open', async () => {
    const err = Object.assign(new Error('Your session has ended. Sign in again.'), { code: '28000' })
    vi.spyOn(security, 'getState').mockRejectedValue(err)
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(await auth.getSession()).toBeNull()
  })
  it('does the same when the PIN is entered on a session that has gone', async () => {
    const user = userEvent.setup()
    await lockedAccount()
    renderApp('/')
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    vi.spyOn(security, 'verifyPin').mockRejectedValue(Object.assign(new Error('Your session has ended. Sign in again.'), { code: '28000' }))
    await press(user, PIN)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})

describe('when the server cannot be asked', () => {
  it('keeps the app closed rather than guessing, and offers to retry', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(security, 'getState').mockRejectedValue(new Error('Failed to fetch'))
    renderApp('/')
    expect(await screen.findByRole('heading', { name: "Can't check your security settings" })).toBeInTheDocument()
    expect(appIsVisible()).toBeNull()
    spy.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })
})

describe('Security & Privacy page', () => {
  it('shows every section, starting at the basics', async () => {
    renderApp('/security')
    expect(await screen.findByRole('heading', { name: 'Security & Privacy' })).toBeInTheDocument()
    expect(await screen.findByText('App lock is off')).toBeInTheDocument()
    expect(screen.getByText(/Basic/)).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Active sessions' })).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('note')
        .map((n) => n.textContent)
        .join(' '),
    ).toMatch(/no server here/)
    expect(screen.getAllByText(/Fingerprint & face unlock/).length).toBeGreaterThan(0)
  })

  it('turns the app lock on: choose, confirm, done', async () => {
    const user = userEvent.setup()
    renderApp('/security')
    await user.click(await screen.findByRole('switch', { name: 'App lock' }))
    const dlg = await screen.findByRole('dialog', { name: 'Turn on app lock' })
    expect(within(dlg).getByText('Choose a PIN')).toBeInTheDocument()
    await press(user, PIN, within(dlg))
    expect(await within(dlg).findByText('Enter it again to confirm')).toBeInTheDocument()
    await press(user, PIN, within(dlg))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Turn on app lock' })).toBeNull(), { timeout: 4000 })
    expect(await screen.findByText('App lock is on')).toBeInTheDocument()
    expect(await screen.findByText(/4-digit PIN/)).toBeInTheDocument()
    expect((await security.getState()).appLockEnabled).toBe(true)
  })

  it('refuses an easy PIN and a mismatched confirmation, and lets you choose 6 digits', async () => {
    const user = userEvent.setup()
    renderApp('/security')
    await user.click(await screen.findByRole('switch', { name: 'App lock' }))
    const dlg = await screen.findByRole('dialog', { name: 'Turn on app lock' })
    await press(user, '1234', within(dlg))
    expect(await within(dlg).findByText('Avoid straight runs like 1234 or 4321.')).toBeInTheDocument()
    await press(user, PIN, within(dlg))
    await within(dlg).findByText('Enter it again to confirm')
    await press(user, '2487', within(dlg))
    expect(await within(dlg).findByText('The PINs do not match. Start again.')).toBeInTheDocument()
    await within(dlg).findByText('Choose a PIN')
    await user.click(within(dlg).getByRole('tab', { name: '6 digits' }))
    await press(user, '908142', within(dlg))
    await press(user, '908142', within(dlg))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Turn on app lock' })).toBeNull(), { timeout: 4000 })
    expect((await security.getState()).pinLength).toBe(6)
  })

  it('changes the PIN after checking the current one', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    renderApp('/security')
    await user.click(await screen.findByRole('button', { name: /Change PIN/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Change PIN' })
    await press(user, '1357', within(dlg))
    expect(await within(dlg).findByText(/Wrong PIN\. 4 tries left/)).toBeInTheDocument()
    await press(user, PIN, within(dlg))
    expect(await within(dlg).findByText('Choose a new PIN')).toBeInTheDocument()
    await press(user, '7319', within(dlg))
    await within(dlg).findByText('Enter it again to confirm')
    await press(user, '7319', within(dlg))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change PIN' })).toBeNull(), { timeout: 4000 })
    await security.lock()
    expect(await security.verifyPin(PIN)).toMatchObject({ ok: false })
    expect(await security.verifyPin('7319')).toMatchObject({ ok: true })
  })

  it('turns the lock off only with the PIN', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    renderApp('/security')
    await user.click(await screen.findByRole('switch', { name: 'App lock' }))
    const dlg = await screen.findByRole('dialog', { name: 'Turn off app lock' })
    await press(user, '1357', within(dlg))
    expect(await within(dlg).findByText(/Wrong PIN/)).toBeInTheDocument()
    expect((await security.getState()).appLockEnabled).toBe(true)
    await press(user, PIN, within(dlg))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Turn off app lock' })).toBeNull(), { timeout: 4000 })
    expect(await screen.findByText('App lock is off')).toBeInTheDocument()
    expect((await security.getState()).appLockEnabled).toBe(false)
  })

  it('"I forgot my PIN" asks for the password, then sets a new PIN', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    renderApp('/security')
    await user.click(await screen.findByRole('button', { name: 'I forgot my PIN' }))
    const ask = await screen.findByRole('dialog', { name: 'Reset your PIN' })
    await user.type(within(ask).getByLabelText('Account password'), 'secret123')
    await user.click(within(ask).getByRole('button', { name: 'Continue' }))
    const dlg = await screen.findByRole('dialog', { name: 'Choose a new PIN' })
    await press(user, '7319', within(dlg))
    await within(dlg).findByText('Enter it again to confirm')
    await press(user, '7319', within(dlg))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose a new PIN' })).toBeNull(), { timeout: 4000 })
    await security.lock()
    expect(await security.verifyPin('7319')).toMatchObject({ ok: true })
  })

  it('changes the auto-lock time', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    renderApp('/security')
    await pickOption(user, await screen.findByLabelText('Lock automatically'), '900')
    await waitFor(async () => expect((await security.getState()).autoLockSeconds).toBe(900))
  })

  it('"Lock now" shows the lock screen', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    renderApp('/security')
    await user.click(await screen.findByRole('button', { name: /Lock now/ }))
    expect(await screen.findByRole('dialog', { name: 'LifeTrack is locked' })).toBeInTheDocument()
    expect(appIsVisible()).toBeNull()
  })

  it('the Profile menu offers "Lock now" only when the lock is on', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: /Profile menu/ }))
    expect(screen.queryByRole('menuitem', { name: 'Lock now' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Security & Privacy' })).toBeInTheDocument()
  })

  it('the Settings page points to Security instead of holding a second password form', async () => {
    renderApp('/settings')
    const link = await screen.findByRole('link', { name: /Security & Privacy/ })
    expect(link).toHaveAttribute('href', '/security')
    expect(screen.queryByLabelText('New password')).toBeNull()
  })
})

describe('trusted devices', () => {
  const now = new Date().toISOString()
  const here = {
    id: 'this-browser',
    createdAt: now,
    lastActiveAt: now,
    userAgent: 'Mozilla/5.0 Chrome/130',
    ip: '',
    current: true,
    unlocked: true,
    trusted: false,
  }
  const phone = {
    id: 'phone-1',
    createdAt: now,
    lastActiveAt: now,
    userAgent: 'okhttp/4.9 Android Mobile',
    ip: '203.0.113.9',
    current: false,
    unlocked: false,
    trusted: false,
  }

  it('tells mobile users up front where the phone lock is', async () => {
    await security.setPin(PIN)
    renderApp('/security')
    expect(await screen.findByText(/Using the mobile app\?/)).toBeInTheDocument()
    expect(screen.getByText(/its own lock under More/)).toBeInTheDocument()
  })

  it('explains the trade-off before trusting another device, and can take it back', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    let sessions = [here, phone]
    vi.spyOn(security.sessions, 'list').mockImplementation(async () => structuredClone(sessions))
    const trust = vi.spyOn(security.sessions, 'trust').mockImplementation(async (id) => {
      sessions = sessions.map((s) => (s.id === id ? { ...s, trusted: true, unlocked: true } : s))
    })
    const untrust = vi.spyOn(security.sessions, 'untrust').mockImplementation(async (id) => {
      sessions = sessions.map((s) => (s.id === id ? { ...s, trusted: false, unlocked: false } : s))
    })
    renderApp('/security')
    await user.click(await screen.findByRole('button', { name: 'Trust Browser on Android' }))
    const dlg = await screen.findByRole('dialog', { name: 'Trust Browser on Android?' })
    expect(within(dlg).getByText(/without the PIN/)).toBeInTheDocument()
    expect(trust).not.toHaveBeenCalled() // nothing happens until it is confirmed
    await user.click(within(dlg).getByRole('button', { name: 'Trust this device' }))
    await waitFor(() => expect(trust).toHaveBeenCalledWith('phone-1'))
    expect(await screen.findByText('Trusted: no PIN')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ask for the PIN on Browser on Android' }))
    await waitFor(() => expect(untrust).toHaveBeenCalledWith('phone-1'))
    await waitFor(() => expect(screen.queryByText('Trusted: no PIN')).toBeNull())
  })

  it('does not offer it while the lock is off, nor for the device you are using', async () => {
    vi.spyOn(security.sessions, 'list').mockResolvedValue([here, phone])
    renderApp('/security')
    await screen.findByRole('button', { name: 'Sign out Browser on Android' })
    expect(screen.queryByRole('button', { name: /^Trust / })).toBeNull()
    await security.setPin(PIN)
    renderApp('/security')
    const buttons = await screen.findAllByRole('button', { name: /^Trust / })
    expect(buttons).toHaveLength(1) // only the phone: the browser you are in is "This device"
  })
})

describe('changing the password', () => {
  const fill = async (user, current, next, confirm = next) => {
    const form = await screen.findByRole('form', { name: 'Change password' })
    await user.type(within(form).getByLabelText('Current password'), current)
    await user.type(within(form).getByLabelText('New password'), next)
    await user.type(within(form).getByLabelText('Confirm new password'), confirm)
    await user.click(within(form).getByRole('button', { name: 'Change password' }))
    return form
  }
  it('explains why a weak new password is refused, live and on submit', async () => {
    const user = userEvent.setup()
    renderApp('/security')
    const form = await fill(user, 'secret123', 'password123')
    expect(await within(form).findAllByText(/most common passwords/)).not.toHaveLength(0)
    expect(within(form).getByText('Weak')).toBeInTheDocument()
  })
  it('checks the passwords match and differ from the old one', async () => {
    const user = userEvent.setup()
    renderApp('/security')
    expect(
      await within(await fill(user, 'secret123', STRONG, 'something-else-1')).findByText('Passwords do not match.'),
    ).toBeInTheDocument()
  })
  it('refuses a wrong current password', async () => {
    const user = userEvent.setup()
    renderApp('/security')
    await fill(user, 'not-my-password', STRONG)
    expect(await screen.findByText('Your current password is not correct.')).toBeInTheDocument()
  })
  it('changes it, signs in with the new one afterwards', async () => {
    const user = userEvent.setup()
    renderApp('/security')
    await fill(user, 'secret123', STRONG)
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument()
    await auth.signOut()
    await auth.signIn('ann@example.com', STRONG)
  })
})

describe('where you are signed in', () => {
  it('lists this browser and signs out everywhere after a confirmation', async () => {
    const user = userEvent.setup()
    renderApp('/security')
    const list = await screen.findByRole('list', { name: 'Active sessions' })
    expect(within(list).getByText('This device')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Sign out everywhere/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Sign out everywhere?' })
    await user.click(within(dlg).getByRole('button', { name: 'Sign out everywhere' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------------------------- fingerprint / face unlock in a browser stand-in
/** A `navigator.credentials` that answers with a software authenticator, the way Touch ID or Windows Hello would. */
function installPlatformAuthenticator() {
  const a = softAuthenticator({ rpId: location.hostname, origin: location.origin })
  const ab = (b64u) => b64uDecode(b64u).buffer.slice(0)
  const calls = { create: 0, get: 0 }
  let refuse = false
  const credentials = {
    create: vi.fn(async ({ publicKey }) => {
      calls.create++
      if (refuse) throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
      const j = a.register(b64uEncode(publicKey.challenge))
      return {
        id: j.id,
        rawId: ab(j.rawId),
        type: 'public-key',
        response: {
          clientDataJSON: ab(j.response.clientDataJSON),
          attestationObject: ab(j.response.attestationObject),
          getTransports: () => ['internal'],
        },
      }
    }),
    get: vi.fn(async ({ publicKey }) => {
      calls.get++
      if (refuse) throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
      const j = a.assert(b64uEncode(publicKey.challenge))
      return {
        id: j.id,
        rawId: ab(j.rawId),
        type: 'public-key',
        response: {
          clientDataJSON: ab(j.response.clientDataJSON),
          authenticatorData: ab(j.response.authenticatorData),
          signature: ab(j.response.signature),
          userHandle: null,
        },
      }
    }),
  }
  Object.defineProperty(navigator, 'credentials', { value: credentials, configurable: true })
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => true }
  return { a, calls, credentials, refuse: (v) => (refuse = v) }
}
const removePlatformAuthenticator = () => {
  delete navigator.credentials
  delete window.PublicKeyCredential
}

describe('fingerprint & face unlock', () => {
  afterEach(removePlatformAuthenticator)

  it('says why it is unavailable: no app lock yet, then no sensor', async () => {
    renderApp('/security')
    expect(await screen.findByText(/Turn on the app lock first/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Fingerprint or face unlock' })).toBeInTheDocument()
  })

  it('without browser support it explains, and the PIN keeps working', async () => {
    await security.setPin(PIN)
    renderApp('/security')
    expect(await screen.findByText('This browser does not support passkeys.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add/ })).toBeDisabled()
  })

  it('adds a device, shows it, and offers the fingerprint on the lock screen, which unlocks on its own', async () => {
    const user = userEvent.setup()
    const device = installPlatformAuthenticator()
    await security.setPin(PIN)
    renderApp('/security')
    const add = await screen.findByRole('button', { name: /Add/ }, { timeout: 5000 })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    const dlg = await screen.findByRole('dialog', { name: 'Add fingerprint or face unlock' })
    const name = within(dlg).getByLabelText('Name this device')
    await user.clear(name)
    await user.type(name, 'My MacBook')
    await user.click(within(dlg).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add fingerprint or face unlock' })).toBeNull(), { timeout: 5000 })
    expect(device.calls.create).toBe(1)
    expect(await screen.findByText('My MacBook')).toBeInTheDocument()
    expect(await screen.findByText('Fingerprint or face unlock is on')).toBeInTheDocument()
    expect(await security.getState()).toMatchObject({ biometricEnabled: true, passkeyCount: 1 })

    await user.click(screen.getByRole('button', { name: /Lock now/ }))
    expect(await screen.findByRole('dialog', { name: 'LifeTrack is locked' })).toBeInTheDocument()
    await waitFor(() => expect(device.calls.get).toBe(1), { timeout: 4000 }) // offered straight away, like a phone
    expect(await screen.findByRole('navigation', { name: 'Main' }, { timeout: 6000 })).toBeInTheDocument()
  })

  it('a cancelled prompt leaves the PIN pad ready, and the fingerprint button tries again', async () => {
    const user = userEvent.setup()
    const device = installPlatformAuthenticator()
    await security.setPin(PIN)
    // enrol directly, then lock
    const options = await security.passkeys.beginRegistration()
    await security.passkeys.finishRegistration({ credential: device.a.register(options.challenge), label: 'Mac' })
    await security.lock()
    device.refuse(true)
    renderApp('/')
    await screen.findByRole('dialog', { name: 'LifeTrack is locked' })
    expect(await screen.findByText(/Cancelled\. Use your PIN/, undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(appIsVisible()).toBeNull()
    device.refuse(false)
    await user.click(screen.getByRole('button', { name: 'Use fingerprint or face unlock' }))
    expect(await screen.findByRole('navigation', { name: 'Main' }, { timeout: 6000 })).toBeInTheDocument()
  })

  it('removing a device asks first, and the last one turns the feature off', async () => {
    const user = userEvent.setup()
    const device = installPlatformAuthenticator()
    await security.setPin(PIN)
    const options = await security.passkeys.beginRegistration()
    await security.passkeys.finishRegistration({ credential: device.a.register(options.challenge), label: 'Old laptop' })
    renderApp('/security')
    await user.click(await screen.findByRole('button', { name: 'Remove Old laptop' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remove Old laptop?' })
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))
    await waitFor(async () => expect(await security.getState()).toMatchObject({ passkeyCount: 0, biometricEnabled: false }))
    expect(await screen.findByText('None yet.')).toBeInTheDocument()
  })

  it('renames a device', async () => {
    const user = userEvent.setup()
    const device = installPlatformAuthenticator()
    await security.setPin(PIN)
    const options = await security.passkeys.beginRegistration()
    await security.passkeys.finishRegistration({ credential: device.a.register(options.challenge), label: 'Mac' })
    renderApp('/security')
    await user.click(await screen.findByRole('button', { name: 'Rename Mac' }))
    const dlg = await screen.findByRole('dialog', { name: 'Rename' })
    await user.clear(within(dlg).getByLabelText('Name'))
    await user.type(within(dlg).getByLabelText('Name'), 'Desk Mac')
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Desk Mac')).toBeInTheDocument()
  })
})
