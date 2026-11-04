import { test, expect } from '@playwright/test'
import { register, pickDate } from './helpers'

test.describe('notifications', () => {
  test('"New reminder" has a single icon (it used to render two)', async ({ page }) => {
    await register(page)
    await page.goto('/notifications')
    await page.getByRole('tab', { name: 'Reminders' }).click()
    await expect(page.getByRole('button', { name: 'New reminder' }).first().locator('svg')).toHaveCount(1)
  })

  test('preference switches persist to the account', async ({ page }) => {
    await register(page)
    await page.goto('/notifications')
    await page.getByRole('tab', { name: 'Preferences' }).click()
    const sw = page.getByRole('switch', { name: 'Habit reminders' })
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await page.reload()
    await page.getByRole('tab', { name: 'Preferences' }).click()
    await expect(page.getByRole('switch', { name: 'Habit reminders' })).toHaveAttribute('aria-checked', 'false')
  })

  test('mark all read and clear read', async ({ page }) => {
    await register(page)
    await page.goto('/notifications')
    await page.getByRole('tab', { name: 'Reminders' }).click()
    await page.getByRole('button', { name: 'New reminder' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Remind me to').fill('Stretch')
    await pickDate(dlg.getByLabel('Date'), '2020-01-01')
    await dlg.getByRole('button', { name: 'Set reminder' }).click()
    await expect(page.getByTestId('unread-count')).toHaveText('1')
    await page.getByRole('tab', { name: /Inbox/ }).click()
    await page.getByRole('button', { name: /Mark all read/ }).click()
    await expect(page.getByTestId('unread-count')).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear read' }).click()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(page.getByText('No notifications')).toBeVisible()
  })
})
