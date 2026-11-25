import { test, expect } from '@playwright/test'
import { pickOption, register } from './helpers'

// The calendar on a phone (Pixel 7, touch). Same rules as every other page: nothing scrolls sideways, and the controls are reachable by thumb.

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const today = (page) => page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))

test.beforeEach(async ({ page }) => {
  await register(page)
})

test('mobile: every view fits the screen with no horizontal scroll', async ({ page }) => {
  for (const view of ['day', 'week', 'month', 'agenda']) {
    await page.goto(`/calendar?view=${view}`)
    await expect(page.getByTestId('calendar')).toBeVisible()
    await page.waitForTimeout(300)
    expect(await overflow(page), `overflow in ${view}`).toBeLessThanOrEqual(1)
  }
})

test('mobile: month is compact, with a day schedule under it that opens on tap', async ({ page }) => {
  await page.goto('/calendar?view=month')
  await page.getByRole('button', { name: /^New/ }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('tab', { name: 'Task' }).click()
  await dlg.getByLabel('Title').fill('Phone task')
  await dlg.getByRole('button', { name: 'Add task' }).click()
  await expect(dlg).toHaveCount(0)
  const t = await today(page)
  const cell = page.getByTestId(`cell-${t}`)
  const box = await cell.boundingBox()
  expect(box.width).toBeLessThan(70) // seven columns on a phone
  await expect(cell.locator('span.rounded-full').last()).toBeVisible() // a dot, not a chip
  await cell.click()
  const panel = page.getByTestId('day-panel')
  await expect(panel.getByRole('button', { name: /Task: Phone task/ })).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(1)
})

test('mobile: the new-event form is a bottom sheet', async ({ page }) => {
  await page.goto('/calendar?view=day')
  await page.getByRole('button', { name: /^New/ }).first().click()
  const dlg = page.getByRole('dialog', { name: 'New event' })
  await expect(dlg).toBeVisible()
  await page.waitForTimeout(400)
  const b = await dlg.boundingBox()
  const vp = page.viewportSize()
  expect(b.y + b.height).toBeGreaterThan(vp.height - 4) // sits on the bottom edge
  expect(b.width).toBeGreaterThanOrEqual(vp.width - 2) // full width
  await dlg.getByLabel('Title').fill('From the sheet')
  await pickOption(dlg.getByLabel('Start time'), '09:00')
  await pickOption(dlg.getByLabel('End time'), '09:30')
  await dlg.getByRole('button', { name: 'Add event' }).click()
  await expect(page.getByRole('button', { name: /Event: From the sheet, 9:00 AM – 9:30 AM/ })).toBeVisible()
})

/** Scrolls the grid so the item sits in the middle of it (a touch can only land on what is on screen). */
const reveal = (loc) => loc.evaluate((el) => el.scrollIntoView({ block: 'center' }))

async function addTimedEvent(page, title) {
  await page.getByRole('button', { name: /^New/ }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Title').fill(title)
  await pickOption(dlg.getByLabel('Start time'), '10:00')
  await pickOption(dlg.getByLabel('End time'), '11:00')
  await dlg.getByRole('button', { name: 'Add event' }).click()
  const block = page.getByRole('button', { name: new RegExp(`Event: ${title}`) })
  await expect(block).toBeVisible()
  await reveal(block)
  return block
}

test('mobile: press and hold picks an event up; dragging moves it and it persists', async ({ page, context }) => {
  await page.goto('/calendar?view=day')
  const block = await addTimedEvent(page, 'Touch me')
  const cdp = await context.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  const b = await block.boundingBox()
  const x = b.x + b.width / 2
  const y = b.y + 14
  await touch('touchStart', x, y)
  await page.waitForTimeout(500) // the long press
  await expect(page.locator('html')).toHaveClass(/lt-dragging/) // picked up
  for (let i = 1; i <= 8; i++) await touch('touchMove', x, y + i * 14)
  const shown = await page.getByTestId('drop-preview').innerText() // where it says it will land
  await touch('touchEnd', x, y + 112)
  expect(shown).not.toContain('10:00 AM')
  await expect(page.getByRole('button', { name: new RegExp(`Event: Touch me, ${shown}`) })).toBeVisible()
  await page.reload()
  expect(await page.getByRole('button', { name: /Event: Touch me/ }).getAttribute('aria-label')).toContain(shown)
})

test('mobile: a finger that scrolls the day scrolls it, and does not pick events up', async ({ page, context }) => {
  await page.goto('/calendar?view=day')
  const block = await addTimedEvent(page, 'Do not move me')
  const cdp = await context.newCDPSession(page)
  const scroller = page.getByTestId('calendar-scroller')
  const before = await scroller.evaluate((el) => el.scrollTop)
  const b = await block.boundingBox()
  const x = b.x + b.width / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: b.y + 20, id: 1 }] })
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: b.y + 20 - i * 18, id: 1 }] }) // swipe up: scroll down
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(300)
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(before) // the grid scrolled
  await expect(page.locator('html')).not.toHaveClass(/lt-dragging/)
  await expect(page.getByRole('button', { name: /Event: Do not move me, 10:00 AM – 11:00 AM/ })).toBeVisible() // and the event stayed put
})

test('mobile: the toolbar controls are touch sized', async ({ page }) => {
  await page.goto('/calendar?view=week')
  for (const name of ['Previous', 'Next', 'Calendar settings']) {
    const box = await page.getByRole('button', { name }).first().boundingBox()
    expect(box.width, name).toBeGreaterThanOrEqual(36)
    expect(box.height, name).toBeGreaterThanOrEqual(36)
  }
})
