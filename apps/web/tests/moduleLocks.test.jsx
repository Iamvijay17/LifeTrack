import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createLocalSecurity } from '@/services/localSecurity'
import { security } from '@/services/security'
import { getUserId, setUserId } from '@/services/session'
import { auth } from '@/services/auth'
import { db, freshBackend, renderApp, signedInUser } from './components/helpers'

const PIN = '2486'
configure({ asyncUtilTimeout: 20_000 })
vi.setConfig({ testTimeout: 60_000 })

const today = () => new Date().toISOString().slice(0, 10)
const press = async (user, digits, scope = screen) => {
  for (const d of digits) await user.click(scope.getByRole('button', { name: d }))
}
const lockScreen = () => screen.queryByRole('dialog', { name: 'LifeTrack is locked' })

/** PIN on, only `modules` locked, and this browser locked again (as it is on the next visit). */
async function lockedModules(modules = ['finance']) {
  await security.setPin(PIN)
  await security.setLockModules('modules', modules)
  await security.lock()
}
/** A brand-new account sees the getting-started guide instead of module cards; one task makes it a used account. */
const usedAccount = () => db.insert('tasks', [{ title: 'Water the plants' }])
async function seedFinance() {
  await db.insert('transactions', [{ type: 'expense', amount_paise: 123400, category: 'Food', note: 'Secret lunch', txn_date: today() }])
}

describe('the dev backend', () => {
  let clock, sec, uid
  const advance = (s) => (clock += s * 1000)
  beforeEach(async () => {
    localStorage.clear()
    clock = Date.UTC(2026, 10, 11, 9, 0, 0)
    await auth.signUp('ann@example.com', 'Violet-Harbor-42', 'Ann')
    uid = (await auth.getSession()).user.id
    setUserId(uid)
    sec = createLocalSecurity({ endSession: vi.fn(), now: () => clock })
  })

  it('starts as the whole-app lock, exactly as before', async () => {
    expect(await sec.getState()).toMatchObject({ moduleLocksSupported: true, lockScope: 'app', lockedModules: [], sessionUnlocked: true })
    await sec.setPin(PIN)
    expect(await sec.getState()).toMatchObject({ appLockEnabled: true, lockScope: 'app', locked: false })
    await sec.lock()
    expect(await sec.getState()).toMatchObject({ locked: true, sessionUnlocked: false })
  })
  it('with module locks there is no lock screen, only closed modules', async () => {
    await sec.setPin(PIN)
    expect(await sec.setLockModules('modules', ['health', 'finance'])).toMatchObject({
      lockScope: 'modules',
      lockedModules: ['finance', 'health'],
      locked: false,
      sessionUnlocked: true,
    })
    await sec.lock()
    expect(await sec.getState()).toMatchObject({ locked: false, sessionUnlocked: false, lockedModules: ['finance', 'health'] })
    expect(await sec.verifyPin(PIN)).toMatchObject({ ok: true })
    expect(await sec.getState()).toMatchObject({ sessionUnlocked: true })
    advance(200) // past the 5 minute window? no: 200 s is inside it
    expect(await sec.touch()).toBe(true)
    advance(400)
    expect(await sec.touch()).toBe(false)
    expect(await sec.getState()).toMatchObject({ locked: false, sessionUnlocked: false })
  })
  it('refuses what the database refuses', async () => {
    await expect(sec.setLockModules('modules', ['finance'])).rejects.toThrow(/Turn on the app lock first/)
    await sec.setPin(PIN)
    await expect(sec.setLockModules('sideways', ['finance'])).rejects.toThrow(/whole app or some modules/)
    await expect(sec.setLockModules('modules', ['banking'])).rejects.toThrow(/cannot be locked/)
    await expect(sec.setLockModules('modules', [])).rejects.toThrow(/at least one/)
    await expect(sec.setLockModules('modules')).rejects.toThrow(/at least one/)
    await sec.setLockModules('modules', ['jobs', 'finance', 'jobs'])
    expect((await sec.getState()).lockedModules).toEqual(['finance', 'jobs'])
  })
  it('a locked session cannot edit the list', async () => {
    await sec.setPin(PIN)
    await sec.setLockModules('modules', ['finance'])
    await sec.lock()
    await expect(sec.setLockModules('app')).rejects.toMatchObject({ code: 'APP_LOCKED' })
  })
  it('remembers the list when going back to the whole app, and forgets it when the lock is turned off', async () => {
    await sec.setPin(PIN)
    await sec.setLockModules('modules', ['notes'])
    expect(await sec.setLockModules('app')).toMatchObject({ lockScope: 'app', lockedModules: ['notes'] })
    await sec.setLockModules('modules', ['notes'])
    expect((await sec.disableAppLock(PIN)).ok).toBe(true)
    expect(await sec.getState()).toMatchObject({ appLockEnabled: false, lockScope: 'app', lockedModules: [] })
  })
  it('a password sign-in opens the whole-app lock but not module locks', async () => {
    const { markLogin } = await import('@/services/localSecurity')
    await sec.setPin(PIN)
    await sec.setLockModules('modules', ['finance'])
    // forget the unlock the setup left behind, as a new browser would
    const key = `lifetrack-dev:security:${uid}`
    const rec = JSON.parse(localStorage.getItem(key))
    rec.unlock = null
    localStorage.setItem(key, JSON.stringify(rec))
    markLogin(uid, clock)
    expect(await sec.unlockAfterLogin()).toMatchObject({ sessionUnlocked: false })
  })
})

describe('the dashboard', () => {
  beforeEach(async () => {
    await freshBackend()
    await signedInUser('ann@example.com', 'Ann')
  })
  afterEach(() => vi.restoreAllMocks())

  it('opens as usual and shows a locked card instead of the Finance card, with no figure in the page', async () => {
    await usedAccount()
    await seedFinance()
    await lockedModules(['finance'])
    renderApp('/')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(lockScreen()).toBeNull() // no lock screen: the app is open
    const card = await screen.findByTestId('locked-finance')
    expect(within(card).getByText('Locked')).toBeInTheDocument()
    expect(screen.queryByTestId('finance-card')).toBeNull()
    expect(document.body.textContent).not.toMatch(/1,234|Secret lunch/)
    expect(screen.getByTestId('locked-stat-finance')).toBeInTheDocument() // the "Spent today" tile too
    expect(screen.getByTestId('locked-notice')).toHaveTextContent(/Finance is locked/)
    // other modules are untouched
    expect(screen.queryByTestId('locked-health')).toBeNull()
  })

  it('tapping the card asks for the PIN; the right one shows the data, and the notice goes', async () => {
    const user = userEvent.setup()
    await usedAccount()
    await seedFinance()
    await lockedModules(['finance'])
    renderApp('/')
    await user.click(within(await screen.findByTestId('locked-finance')).getByRole('button'))
    const dialog = await screen.findByRole('dialog', { name: 'Unlock Finance' })
    await press(user, PIN, within(dialog))
    expect(await screen.findByTestId('finance-card', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.queryByTestId('locked-finance')).toBeNull()
    expect(screen.queryByTestId('locked-notice')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Unlock Finance' })).toBeNull())
    expect(await screen.findByTestId('month-spend')).toHaveTextContent(/1,234/)
    expect((await security.getState()).sessionUnlocked).toBe(true)
  })

  it('a wrong PIN keeps it locked and says how many tries are left', async () => {
    const user = userEvent.setup()
    await usedAccount()
    await seedFinance()
    await lockedModules(['finance'])
    renderApp('/')
    await user.click(within(await screen.findByTestId('locked-finance')).getByRole('button'))
    const dialog = await screen.findByRole('dialog', { name: 'Unlock Finance' })
    await press(user, '1357', within(dialog))
    expect(await within(dialog).findByText('Wrong PIN. 4 tries left before a short lockout.')).toBeInTheDocument()
    expect(screen.getByTestId('locked-finance')).toBeInTheDocument()
    expect(screen.queryByTestId('finance-card')).toBeNull()
  })

  it('one unlock opens every locked module', async () => {
    const user = userEvent.setup()
    await usedAccount()
    await lockedModules(['finance', 'health', 'fitness'])
    renderApp('/')
    await user.click(within(await screen.findByTestId('locked-health')).getByRole('button'))
    const dialog = await screen.findByRole('dialog', { name: 'Unlock Health & sleep' })
    await press(user, PIN, within(dialog))
    await waitFor(() => expect(screen.queryByTestId('locked-health')).toBeNull(), { timeout: 8000 })
    expect(screen.queryByTestId('locked-finance')).toBeNull()
    expect(screen.queryByTestId('locked-fitness')).toBeNull()
    expect(screen.queryByTestId('locked-stat-health')).toBeNull()
  })

  it('closes the cards again when the session locks (here from another tab), and the data leaves the page', async () => {
    await usedAccount()
    await seedFinance()
    await security.setPin(PIN)
    await security.setLockModules('modules', ['finance'])
    renderApp('/')
    expect(await screen.findByTestId('finance-card')).toBeInTheDocument() // this session set it up, so it is unlocked
    expect(await screen.findByTestId('month-spend')).toHaveTextContent(/1,234/)
    await security.lock()
    window.dispatchEvent(new Event('focus')) // coming back to the tab: the page asks the server again
    expect(await screen.findByTestId('locked-finance')).toBeInTheDocument()
    expect(screen.queryByTestId('finance-card')).toBeNull()
    expect(document.body.textContent).not.toMatch(/1,234|Secret lunch/)
  })

  it('does nothing different for a person with no lock', async () => {
    await seedFinance()
    renderApp('/')
    expect(await screen.findByTestId('finance-card')).toBeInTheDocument()
    expect(screen.queryByTestId('locked-notice')).toBeNull()
    expect(screen.queryByTestId('nav-lock')).toBeNull()
  })

  it('the whole-app lock still shows the lock screen and no module cards', async () => {
    await security.setPin(PIN)
    await security.lock()
    renderApp('/')
    expect(await screen.findByRole('dialog', { name: 'LifeTrack is locked' })).toBeInTheDocument()
    expect(screen.queryByTestId('locked-finance')).toBeNull()
  })
})

describe('module pages and the rest of the app', () => {
  beforeEach(async () => {
    await freshBackend()
    await signedInUser('ann@example.com', 'Ann')
  })

  it('a locked module page shows the unlock pad instead of the page, then the page', async () => {
    const user = userEvent.setup()
    await lockedModules(['finance'])
    renderApp('/finance')
    const page = await screen.findByTestId('module-locked', {}, { timeout: 15_000 })
    expect(within(page).getByRole('heading', { name: /Finance is locked/ })).toBeInTheDocument()
    expect(screen.queryByText('Add transaction')).toBeNull()
    await press(user, PIN, within(page))
    expect(await screen.findByRole('heading', { name: 'Finance' }, { timeout: 15_000 })).toBeInTheDocument()
    expect(screen.queryByTestId('module-locked')).toBeNull()
  })

  it('pages of modules that are not locked open normally', async () => {
    await lockedModules(['finance'])
    renderApp('/habits')
    expect(await screen.findByRole('heading', { name: 'Habits' })).toBeInTheDocument()
    expect(screen.queryByTestId('module-locked')).toBeNull()
  })

  it('the sidebar marks a locked module', async () => {
    await lockedModules(['finance', 'jobs'])
    renderApp('/habits')
    await screen.findByRole('heading', { name: 'Habits' })
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByTestId('nav-lock')).toHaveLength(2)
    expect(within(nav).getByRole('link', { name: /Finance.*locked/ })).toBeInTheDocument()
  })

  it('Quick add asks to unlock instead of opening a form that would be refused', async () => {
    const user = userEvent.setup()
    await lockedModules(['finance'])
    renderApp('/habits')
    await screen.findByRole('heading', { name: 'Habits' })
    await user.click(screen.getAllByRole('button', { name: /Quick add/ })[0])
    await user.click(await screen.findByRole('button', { name: 'Add expense' }))
    expect(await screen.findByRole('dialog', { name: 'Unlock Finance' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /Add expense|expense/i })).toBeNull()
  })

  it('Data Export waits for everything to be unlocked, so a backup is never missing a module', async () => {
    const user = userEvent.setup()
    await lockedModules(['health'])
    renderApp('/export')
    const note = await screen.findByTestId('export-locked')
    expect(note).toHaveTextContent(/Health & sleep is locked/)
    expect(screen.queryByRole('heading', { name: /Back up|Backup/i })).toBeNull()
    await user.click(within(note).getByRole('button', { name: 'Unlock' }))
    const dialog = await screen.findByRole('dialog', { name: 'Unlock your private modules' })
    await press(user, PIN, within(dialog))
    await waitFor(() => expect(screen.queryByTestId('export-locked')).toBeNull(), { timeout: 15_000 })
  })
})

describe('choosing what to lock (Security & Privacy)', () => {
  beforeEach(async () => {
    await freshBackend()
    await signedInUser('ann@example.com', 'Ann')
  })

  it('offers the choice only once the app lock is on', async () => {
    renderApp('/security')
    await screen.findByText('App lock is off')
    expect(screen.queryByTestId('module-lock-settings')).toBeNull()
  })

  it('switches to "only some modules", starts with Finance and Journal, and saves each switch', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    renderApp('/security')
    const panel = await screen.findByTestId('module-lock-settings')
    expect(within(panel).getByRole('radio', { name: /The whole app/ })).toBeChecked()
    expect(within(panel).queryByRole('list', { name: 'Modules to lock' })).toBeNull()

    await user.click(within(panel).getByRole('radio', { name: /Only the modules I choose/ }))
    const list = await within(panel).findByRole('list', { name: 'Modules to lock' })
    await waitFor(async () =>
      expect(await security.getState()).toMatchObject({ lockScope: 'modules', lockedModules: ['finance', 'notes'] }),
    )
    expect(within(list).getByRole('switch', { name: 'Lock Finance' })).toBeChecked()
    expect(within(list).getByRole('switch', { name: 'Lock Health & sleep' })).not.toBeChecked()

    await user.click(within(list).getByRole('switch', { name: 'Lock Health & sleep' }))
    await waitFor(async () =>
      expect((await security.getState()).lockedModules).toEqual(
        ['finance', 'notes', 'health'].sort(
          (a, b) =>
            ['finance', 'notes', 'health', 'fitness', 'nutrition', 'jobs'].indexOf(a) -
            ['finance', 'notes', 'health', 'fitness', 'nutrition', 'jobs'].indexOf(b),
        ),
      ),
    )
    await user.click(within(list).getByRole('switch', { name: 'Lock Journal & notes' }))
    await waitFor(async () => expect((await security.getState()).lockedModules).toEqual(['finance', 'health']))
  })

  it('will not let the last module be switched off', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    await security.setLockModules('modules', ['jobs'])
    renderApp('/security')
    const list = await screen.findByRole('list', { name: 'Modules to lock' })
    const only = within(list).getByRole('switch', { name: 'Lock Job switch' })
    expect(only).toBeDisabled()
    await user.click(only)
    expect((await security.getState()).lockedModules).toEqual(['jobs'])
    expect(within(list).getByText(/Keep one locked/)).toBeInTheDocument()
  })

  it('goes back to the whole app and keeps the chosen list', async () => {
    const user = userEvent.setup()
    await security.setPin(PIN)
    await security.setLockModules('modules', ['health'])
    renderApp('/security')
    const panel = await screen.findByTestId('module-lock-settings')
    await user.click(within(panel).getByRole('radio', { name: /The whole app/ }))
    await waitFor(async () => expect(await security.getState()).toMatchObject({ lockScope: 'app', lockedModules: ['health'] }))
    expect(within(panel).queryByRole('list', { name: 'Modules to lock' })).toBeNull()
  })

  it('while the modules are locked it asks to unlock before anything can be changed', async () => {
    const user = userEvent.setup()
    await lockedModules(['finance'])
    renderApp('/security')
    const panel = await screen.findByTestId('module-lock-settings')
    expect(within(panel).getByText('Unlock to change what is locked.')).toBeInTheDocument()
    expect(within(panel).getByRole('radio', { name: /The whole app/ })).toBeDisabled()
    expect(within(panel).getByRole('switch', { name: 'Lock Finance' })).toBeDisabled()
    await user.click(within(panel).getByRole('button', { name: 'Unlock' }))
    const dialog = await screen.findByRole('dialog', { name: /Unlock/ })
    await press(user, PIN, within(dialog))
    await waitFor(() => expect(within(panel).queryByText('Unlock to change what is locked.')).toBeNull(), { timeout: 15_000 })
    expect(within(panel).getByRole('radio', { name: /The whole app/ })).toBeEnabled()
  })

  it('shows the locked modules as badges', async () => {
    await security.setPin(PIN)
    await security.setLockModules('modules', ['health', 'nutrition'])
    renderApp('/security')
    await screen.findByTestId('module-lock-settings')
    const badges = screen.getByText(/stay closed on the server too|would also stay closed/).closest('div')
    expect(within(badges).getByText('Health & sleep')).toBeInTheDocument()
    expect(within(badges).getByText('Food & nutrition')).toBeInTheDocument()
    expect(within(badges).queryByText('Finance')).toBeNull()
  })

  it('does not offer it against a database without migration 0015', async () => {
    await security.setPin(PIN)
    const real = await security.getState()
    vi.spyOn(security, 'getState').mockResolvedValue({ ...real, moduleLocksSupported: false })
    renderApp('/security')
    await screen.findByText('App lock is on')
    expect(screen.queryByTestId('module-lock-settings')).toBeNull()
    void getUserId
  })
})
