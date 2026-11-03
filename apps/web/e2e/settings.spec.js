import { test, expect } from '@playwright/test'
import { register } from './helpers'

test.describe('settings', () => {
  test('saving one card does not wipe unsaved edits in another', async ({ page }) => {
    await register(page)
    await page.goto('/settings')
    await page.getByLabel('Learning', { exact: true }).fill('40') // unsaved edit in the score-weights card
    await page.getByLabel('Water goal (ml)').fill('3500')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(page.getByText('Preferences saved').first()).toBeVisible()
    await expect(page.getByLabel('Learning', { exact: true })).toHaveValue('40') // used to be reset to 25
    await expect(page.getByRole('button', { name: 'Save weights' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save weights' }).click()
    await expect(page.getByText('Score weights saved').first()).toBeVisible()
  })

  test('validation messages appear at the field', async ({ page }) => {
    await register(page)
    await page.goto('/settings')
    await page.getByLabel('Short break (min)').fill('99')
    await page.getByLabel('Short break (min)').press('Enter')
    await expect(page.getByText('Short break: 1–60 minutes.')).toBeVisible()
    await page.getByLabel('New password').fill('short')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Use at least 8 characters.')).toBeVisible()
  })

  test('delete-account needs the typed word', async ({ page }) => {
    await register(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: /Delete account/ }).click()
    await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled()
    await page.getByLabel('Type DELETE to confirm').fill('delete')
    await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled()
    await page.getByRole('button', { name: 'Cancel' }).click()
  })
})
