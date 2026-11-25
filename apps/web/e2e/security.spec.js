import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { register, uniqueEmail } from './helpers'

// Real Chromium against the in-browser dev backend. The passkey tests drive Chromium's own WebAuthn virtual authenticator, so what the verifier
// checks here is genuine browser output (attestation objects, signatures, flags), not a hand-made imitation.

const PIN = '2486'
const lockScreen = (page) => page.getByRole('dialog', { name: 'LifeTrack is locked' })
const mainNav = (page) => page.getByRole('navigation', { name: 'Main' })

async function turnOnLock(page, pin = PIN) {
  await page.goto('/security')
  await page.getByRole('switch', { name: 'App lock' }).click()
  const dlg = page.getByRole('dialog', { name: 'Turn on app lock' })
  await expect(dlg.getByText('Choose a PIN')).toBeVisible()
  await page.keyboard.type(pin)
  await expect(dlg.getByText('Enter it again to confirm')).toBeVisible()
  await page.keyboard.type(pin)
  await expect(dlg).toBeHidden()
  await expect(page.getByRole('switch', { name: 'App lock' })).toHaveAttribute('aria-checked', 'true')
}

/** Gives the page a software fingerprint sensor through Chromium's DevTools WebAuthn domain. */
async function addSensor(page, { verified = true } = {}) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: false,
      hasUserVerification: true,
      isUserVerified: verified,
      automaticPresenceSimulation: true,
    },
  })
  return { cdp, authenticatorId, credentials: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials }
}

test.describe('app lock', () => {
  test('set a PIN, lock, get it wrong, get it right', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    await page.getByRole('button', { name: 'Lock now' }).click()
    await expect(lockScreen(page)).toBeVisible()
    await expect(mainNav(page)).toHaveCount(0) // the app is not behind the lock screen, it is gone
    await page.keyboard.type('1357')
    await expect(page.getByText('Wrong PIN. 4 tries left before a short lockout.')).toBeVisible()
    await expect(mainNav(page)).toHaveCount(0)
    await page.keyboard.type(PIN)
    await expect(mainNav(page)).toBeVisible()
    await expect(lockScreen(page)).toHaveCount(0)
  })

  test('a reload stays unlocked while active, but "Lock now" survives a reload', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    await page.reload()
    await expect(mainNav(page)).toBeVisible()
    await page.getByRole('button', { name: 'Lock now' }).click()
    await expect(lockScreen(page)).toBeVisible()
    await page.reload() // the sign-in is under a minute old, yet locking on purpose must hold
    await expect(lockScreen(page)).toBeVisible()
    await expect(mainNav(page)).toHaveCount(0)
  })

  test('five wrong PINs lock PIN entry and say for how long', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    await page.getByRole('button', { name: 'Lock now' }).click()
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type('1357')
      if (i < 4) await expect(page.getByRole('button', { name: '1', exact: true })).toBeEnabled()
    }
    await expect(page.getByText(/Too many wrong PINs\. Try again in/)).toBeVisible()
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled()
    await page.keyboard.type(PIN) // the right PIN is refused during the lockout
    await expect(lockScreen(page)).toBeVisible()
  })

  test('locks itself after the auto-lock time without activity', async ({ page }) => {
    await page.clock.install()
    await register(page)
    await turnOnLock(page)
    await page.getByLabel('Lock automatically').click()
    await page.locator('[role="listbox"] [role="option"][data-value="60"]').click()
    await page.goto('/')
    await expect(mainNav(page)).toBeVisible()
    await page.clock.runFor(40_000)
    await expect(lockScreen(page)).toHaveCount(0) // not yet
    await page.clock.runFor(30_000)
    await expect(lockScreen(page)).toBeVisible()
    await expect(mainNav(page)).toHaveCount(0)
  })

  test('activity keeps it open', async ({ page }) => {
    await page.clock.install()
    await register(page)
    await turnOnLock(page)
    await page.getByLabel('Lock automatically').click()
    await page.locator('[role="listbox"] [role="option"][data-value="60"]').click()
    await page.goto('/')
    await expect(mainNav(page)).toBeVisible()
    for (let i = 0; i < 4; i++) {
      await page.clock.runFor(30_000)
      await page.mouse.move(100 + i * 10, 200)
      await page.mouse.down()
      await page.mouse.up()
    }
    await expect(lockScreen(page)).toHaveCount(0)
  })

  test('"when I leave the app" locks as soon as the tab is hidden (a reload counts as leaving)', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    await page.getByLabel('Lock automatically').click()
    await page.locator('[role="listbox"] [role="option"][data-value="0"]').click()
    await expect(page.getByLabel('Lock automatically')).toContainText('When I leave the app')
    await expect(mainNav(page)).toBeVisible() // choosing it does not lock by itself
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(lockScreen(page)).toBeVisible()
    await page.keyboard.type(PIN)
    await expect(mainNav(page)).toBeVisible()
  })

  test('signing in with the password opens the lock without the PIN; "forgot PIN" works the same', async ({ page }) => {
    const { email, password } = await register(page)
    await turnOnLock(page)
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(mainNav(page)).toBeVisible()
    // lock again, then use "Forgot PIN?"
    await page.goto('/security')
    await page.getByRole('button', { name: 'Lock now' }).click()
    await page.getByRole('button', { name: /Forgot PIN/ }).click()
    await page.getByLabel('Account password').fill('wrong-password-1')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password.')
    await page.getByLabel('Account password').fill(password)
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(mainNav(page)).toBeVisible()
  })

  test('an easy PIN is refused', async ({ page }) => {
    await register(page)
    await page.goto('/security')
    await page.getByRole('switch', { name: 'App lock' }).click()
    await page.keyboard.type('1234')
    await expect(page.getByText('Avoid straight runs like 1234 or 4321.')).toBeVisible()
  })
})

test.describe('fingerprint & face unlock (WebAuthn)', () => {
  test('add a device, lock, and the sensor unlocks it by itself', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    const sensor = await addSensor(page)
    await page.reload()
    await page.getByRole('button', { name: /^Add$/ }).click()
    const dlg = page.getByRole('dialog', { name: 'Add fingerprint or face unlock' })
    await dlg.getByLabel('Name this device').fill('Test sensor')
    await dlg.getByRole('button', { name: 'Continue' }).click()
    await expect(dlg).toBeHidden({ timeout: 10_000 })
    await expect(page.getByText('Test sensor')).toBeVisible()
    expect(await sensor.credentials()).toHaveLength(1)
    await page.getByRole('button', { name: 'Lock now' }).click()
    await expect(lockScreen(page)).toBeVisible()
    await expect(mainNav(page)).toBeVisible({ timeout: 10_000 }) // the prompt appeared on its own and the signature verified
    const counts = (await sensor.credentials())[0].signCount
    expect(counts).toBeGreaterThanOrEqual(1)
  })

  test('a sensor that did not verify the user is refused, and the PIN is still there', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    const good = await addSensor(page)
    await page.reload()
    await page.getByRole('button', { name: /^Add$/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Fingerprint or face unlock is on')).toBeVisible({ timeout: 10_000 })
    // swap the sensor for one that only confirms presence (no fingerprint check)
    await good.cdp.send('WebAuthn.setUserVerified', { authenticatorId: good.authenticatorId, isUserVerified: false })
    await page.getByRole('button', { name: 'Lock now' }).click()
    await expect(page.getByText(/not accepted|Cancelled|Something went wrong/)).toBeVisible({ timeout: 10_000 })
    await expect(mainNav(page)).toHaveCount(0)
    await page.keyboard.type(PIN)
    await expect(mainNav(page)).toBeVisible()
  })

  test('removing the device turns the feature off', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    await addSensor(page)
    await page.reload()
    await page.getByRole('button', { name: /^Add$/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Fingerprint or face unlock is on')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /^Remove / }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('None yet.')).toBeVisible()
  })

  test('with no sensor in the browser it says so and offers the PIN', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    await page.addInitScript(() => {
      delete window.PublicKeyCredential
    })
    await page.reload()
    await expect(page.getByText('This browser does not support passkeys.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Add$/ })).toBeDisabled()
  })
})

test.describe('passwords', () => {
  test('changing it needs the current one and refuses a weak one', async ({ page }) => {
    const { password } = await register(page)
    await page.goto('/security')
    const form = page.getByRole('form', { name: 'Change password' })
    await form.getByLabel('Current password').fill(password)
    await form.getByLabel('New password', { exact: true }).fill('password123')
    await expect(form.getByText(/most common passwords/).first()).toBeVisible()
    await form.getByLabel('Confirm new password').fill('password123')
    await form.getByRole('button', { name: 'Change password' }).click()
    await expect(form.getByText(/most common passwords/).first()).toBeVisible()
    await form.getByLabel('Current password').fill('not-it-at-all-1')
    await form.getByLabel('New password', { exact: true }).fill('Sunrise-Meadow-88')
    await form.getByLabel('Confirm new password').fill('Sunrise-Meadow-88')
    await form.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Your current password is not correct.')).toBeVisible()
  })

  test('changes it, and the new one signs in', async ({ page }) => {
    const { email, password } = await register(page)
    await page.goto('/security')
    const form = page.getByRole('form', { name: 'Change password' })
    await form.getByLabel('Current password').fill(password)
    await form.getByLabel('New password', { exact: true }).fill('Sunrise-Meadow-88')
    await form.getByLabel('Confirm new password').fill('Sunrise-Meadow-88')
    await form.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText(/Password changed/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Sign out everywhere' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password.')
    await page.getByLabel('Password').fill('Sunrise-Meadow-88')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(mainNav(page)).toBeVisible()
  })

  test('sign-up refuses an easy password, and shows the strength as you type', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Name').fill('Vee')
    await page.getByLabel('Email').fill(uniqueEmail())
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await expect(page.getByText('Weak')).toBeVisible()
    await page.getByLabel('Confirm password').fill('password123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText(/most common passwords/).first()).toBeVisible()
    await expect(page).toHaveURL(/register/)
    await page.getByLabel('Password', { exact: true }).fill('Violet-Harbor-42')
    await expect(page.getByText(/very strong/i)).toBeVisible()
  })

  test('five wrong passwords lock sign-in for a minute, even for the right one', async ({ page }) => {
    const { email, password } = await register(page)
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(`wrong-password-${i}`)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('alert')).toContainText('Incorrect email or password.')
    }
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText(/Too many sign-in attempts/)
  })

  test('an account made before this update still signs in, and is upgraded', async ({ page }) => {
    await page.goto('/login')
    const email = uniqueEmail()
    await page.evaluate(
      async ({ email }) => {
        const hash = async (pw) =>
          [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lt:${pw}`)))]
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
        localStorage.setItem(
          'lifetrack-dev:users',
          JSON.stringify([{ id: 'legacy-user', email, name: 'Old Timer', hash: await hash('old-password-1') }]),
        )
      },
      { email },
    )
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('old-password-1')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(mainNav(page)).toBeVisible()
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifetrack-dev:users'))[0])
    expect(stored.hash).toBeUndefined()
    expect(stored.pw.algo).toBe('pbkdf2-sha256')
  })
})

test.describe('accessibility', () => {
  const scan = async (page) =>
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()).violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact),
    )
  const summary = (vs) =>
    vs
      .map(
        (v) =>
          `${v.id}: ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
      )
      .join('\n')

  test('the Security page and the lock screen have no serious violations', async ({ page }) => {
    await register(page)
    await turnOnLock(page)
    await expect(page.getByRole('heading', { name: 'Security & Privacy' })).toBeVisible()
    let v = await scan(page)
    expect(v, `security page\n${summary(v)}`).toEqual([])
    await page.getByRole('button', { name: 'Lock now' }).click()
    await expect(lockScreen(page)).toBeVisible()
    v = await scan(page)
    expect(v, `lock screen\n${summary(v)}`).toEqual([])
  })
})
