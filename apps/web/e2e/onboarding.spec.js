import { expect, test } from '@playwright/test'
import { uniqueEmail } from './helpers'

// The only spec that sees the welcome setup: the config sets the automation skip flag for everything else.
test.use({ storageState: { cookies: [], origins: [] } })

async function signUp(page) {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Sam')
  await page.getByLabel('Email').fill(uniqueEmail())
  await page.getByLabel('Password', { exact: true }).fill('Violet-Harbor-42')
  await page.getByLabel('Confirm password').fill('Violet-Harbor-42')
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('a new account is welcomed, can skip, put it off, and resume from Settings', async ({ page }) => {
  await signUp(page)
  const dialog = page.getByRole('dialog', { name: 'Welcome to LifeTrack' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /get started/i }).click()
  await expect(page.getByRole('dialog', { name: 'About you' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: /do this later/i }).click()
  await expect(page.getByTestId('onboarding')).toHaveCount(0)

  await page.goto('/settings')
  await page.getByRole('button', { name: /continue setup/i }).click()
  await expect(page.getByRole('dialog', { name: 'What do you want to track?' })).toBeVisible()
})

test('a tour highlights the page and records that it was skipped', async ({ page }) => {
  await signUp(page)
  await page.getByRole('button', { name: /do this later/i }).click()
  await page.goto('/settings')
  await page.getByRole('list', { name: 'Guided tours' }).getByRole('button', { name: 'Start' }).first().click()
  await expect(page.getByTestId('tour')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tour')).toHaveCount(0)
  // Starting the dashboard tour took us to the dashboard; its result is on the Settings card.
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Guided tours' }).getByText('Skipped')).toBeVisible()
})
