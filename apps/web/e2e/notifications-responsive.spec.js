import { test, expect } from '@playwright/test'
import { pickDate, pickOption, register } from './helpers'

// The notification centre on a phone (Pixel 7, touch): nothing scrolls sideways, the drawer is a bottom sheet, the actions are there without hovering,
// and a card can be swiped away.

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function pastReminder(page, title, priority) {
  await page.goto('/notifications?tab=reminders')
  await page.getByRole('button', { name: 'New reminder' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'New reminder' })
  await dlg.getByLabel('Remind me to').fill(title)
  if (priority) await pickOption(dlg.getByLabel('Priority'), priority)
  await pickDate(dlg.getByLabel('Date'), '2020-01-01')
  await dlg.getByRole('button', { name: 'Set reminder' }).click()
  await expect(dlg).toBeHidden()
}

test.beforeEach(async ({ page }) => {
  await register(page)
  await page.goto('/notifications?tab=prefs')
  await page.getByRole('switch', { name: 'Smart notifications' }).click()
  await pastReminder(page, 'Submit tax documents', 'urgent')
  await pastReminder(page, 'Water the plants')
})

test('mobile: every tab fits the screen with no horizontal scroll', async ({ page }) => {
  for (const tab of ['', '?tab=reminders', '?tab=history', '?tab=prefs']) {
    await page.goto(`/notifications${tab}`)
    await page.locator('main').waitFor()
    await page.waitForTimeout(300)
    expect(await overflow(page), `overflow on ${tab || 'inbox'}`).toBeLessThanOrEqual(1)
  }
})

test('mobile: the card actions are on the card without hovering, and big enough for a thumb', async ({ page }) => {
  await page.goto('/notifications')
  const card = page.getByTestId('notification').filter({ hasText: 'Submit tax documents' })
  for (const name of ['Dismiss Submit tax documents', 'Snooze Submit tax documents', 'Mark Submit tax documents as read']) {
    const box = await card.getByRole('button', { name }).boundingBox()
    expect(box, name).not.toBeNull()
    expect(box.height, name).toBeGreaterThanOrEqual(32)
    expect(box.width, name).toBeGreaterThanOrEqual(32)
  }
})

test('mobile: the drawer is a bottom sheet that closes with Escape and does not scroll the page sideways', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Notifications, 2 unread/ }).click()
  const drawer = page.getByRole('dialog', { name: 'Notifications' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByTestId('notification')).toHaveCount(2)
  await page.waitForTimeout(400) // let it finish rising
  const box = await drawer.boundingBox()
  const viewport = page.viewportSize()
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1) // edge to edge
  expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1) // anchored to the bottom
  expect(box.y).toBeGreaterThan(20) // with the page showing above it
  expect(await overflow(page)).toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
})

test('mobile: swiping a card to the right dismisses it', async ({ page }) => {
  await page.goto('/notifications')
  const card = page.getByTestId('notification').filter({ hasText: 'Water the plants' })
  const box = await card.boundingBox()
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 40, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 40 + i * 25, y)
  await page.mouse.up()
  await expect(page.getByTestId('notification').filter({ hasText: 'Water the plants' })).toHaveCount(0)
  await expect(page.getByText('Dismissed').first()).toBeVisible() // the toast, with its Undo
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByTestId('notification').filter({ hasText: 'Water the plants' })).toContainText('Dismissed')
})
