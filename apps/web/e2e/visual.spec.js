import { expect, test } from '@playwright/test'
import { register } from './helpers'

// Screenshot regression for the main screens: desktop and phone, dark and light. Run with `pnpm test:visual`; regenerate the baselines on purpose with
// `pnpm test:visual:update` (review the images before committing). Baselines are per platform (the file name ends in -darwin / -linux), because fonts
// and anti-aliasing differ; CI compares against the Linux ones (see .github/workflows/visual-baselines.yml).
//
// What keeps them from flaking: the clock is frozen to one instant, animations and transitions are off, the caret is hidden, an account is created
// fresh for every test (so the screens show empty states, not whatever data a person has), and the few live readouts are hidden.
const NOW = new Date('2026-11-24T10:00:00Z')

test.use({
  storageState: {
    cookies: [],
    origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'lifetrack:onboarding:skip', value: '1' }] }],
  },
  reducedMotion: 'reduce',
  timezoneId: 'Asia/Kolkata',
  locale: 'en-IN',
})

const HIDE = `
  [data-testid="save-status"], [data-testid="sync-pill"], [data-live], .lt-ambient, [data-sonner-toaster] { visibility: hidden !important; }
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }
`
async function ready(page) {
  await page.addStyleTag({ content: HIDE })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
}
async function signedIn(page, theme) {
  await page.clock.setFixedTime(NOW)
  await register(page, { name: 'Sam Visual' })
  if (theme === 'light') {
    // The way a person does it, so the choice is saved to the account like in real use.
    await page.getByRole('button', { name: /Profile menu/ }).click()
    await page.getByRole('menuitem', { name: 'Light theme' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  }
}
// The sidebar shows the test account's (generated) email: masked, so the pictures never depend on it.
const shot = (page, name, opts = {}) =>
  expect(page).toHaveScreenshot(`${name}.png`, {
    maxDiffPixelRatio: 0.01,
    fullPage: false,
    mask: [page.locator('aside').getByText(/^u\d{6,}/)],
    ...opts,
  })

for (const theme of ['dark', 'light']) {
  test.describe(`${theme} theme`, () => {
    test(`dashboard and navigation (${theme})`, async ({ page }) => {
      await signedIn(page, theme)
      await ready(page)
      await shot(page, `dashboard-${theme}`)
    })
    test(`settings (${theme})`, async ({ page }) => {
      await signedIn(page, theme)
      await page.goto('/settings')
      await ready(page)
      await shot(page, `settings-${theme}`)
    })
  })
}

test.describe('module screens (dark)', () => {
  for (const [name, path] of [
    ['planner', '/planner'],
    ['finance', '/finance'],
    ['fitness', '/fitness'],
    ['learning', '/learning'],
    ['calendar', '/calendar'],
    ['shortcuts', '/shortcuts'],
    ['integrations', '/integrations'],
  ]) {
    test(name, async ({ page }) => {
      await signedIn(page, 'dark')
      await page.goto(path)
      await ready(page)
      await shot(page, name)
    })
  }
})

test.describe('forms and dialogs (dark)', () => {
  test('quick add menu and a task form', async ({ page }) => {
    await signedIn(page, 'dark')
    await page.goto('/planner')
    await ready(page)
    await page.getByRole('button', { name: /New task/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await shot(page, 'task-dialog')
  })
  test('command palette', async ({ page }) => {
    await signedIn(page, 'dark')
    await ready(page)
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await shot(page, 'command-palette')
  })
  test('login page', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await page.goto('/login')
    await ready(page)
    await shot(page, 'login')
  })
})

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  for (const [name, path] of [
    ['dashboard', '/'],
    ['planner', '/planner'],
    ['finance', '/finance'],
  ]) {
    test(`${name} on a phone`, async ({ page }) => {
      await signedIn(page, 'dark')
      if (path !== '/') await page.goto(path)
      await ready(page)
      await shot(page, `phone-${name}`)
    })
  }
})
