import { expect, test } from '@playwright/test'
import { addTask, register } from './helpers'

test('demo mode shows sample data, never mixes it with real data, and exit restores yours', async ({ page }) => {
  await register(page)
  await page.goto('/planner')
  await addTask(page, 'My real task')

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Start demo' }).click()
  await expect(page.getByTestId('demo-banner')).toBeVisible()

  // Navigate inside the app: a full page load would end the demo (it lives in this tab's memory).
  await page.getByRole('link', { name: 'Daily Planner' }).click()
  await expect(page.getByText('Review pull request for the billing service')).toBeVisible()
  await expect(page.getByText('My real task')).toHaveCount(0)

  // Delete-account is unavailable while the demo runs.
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('button', { name: /Delete account/ })).toBeDisabled()

  await page.getByTestId('demo-banner').getByRole('button', { name: 'Exit demo' }).click()
  await expect(page.getByTestId('demo-banner')).toHaveCount(0)
  await page.getByRole('link', { name: 'Daily Planner' }).click()
  await expect(page.getByText('My real task')).toBeVisible()
  await expect(page.getByText('Review pull request for the billing service')).toHaveCount(0)
})

test('reloading the page ends the demo', async ({ page }) => {
  await register(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Start demo' }).click()
  await expect(page.getByTestId('demo-banner')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('demo-banner')).toHaveCount(0)
})
