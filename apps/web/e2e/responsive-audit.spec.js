import { test, expect } from '@playwright/test'
import { register } from './helpers'

const LONG_TITLE = 'Review pull requests from the design-system team and leave comments before the morning standup meeting'

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const addLongTask = async (page) => {
  await page.goto('/planner')
  await page.getByRole('button', { name: 'New task' }).click()
  await page.getByLabel('Title').fill(LONG_TITLE)
  await page.getByRole('dialog').getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByText(LONG_TITLE).first()).toBeVisible()
}

test('phone: a long task title truncates instead of widening the page', async ({ page }) => {
  await register(page)
  await addLongTask(page)
  expect(await overflow(page), 'planner').toBeLessThanOrEqual(1)
  await page.goto('/')
  await expect(page.getByText(LONG_TITLE).first()).toBeVisible()
  expect(await overflow(page), 'dashboard').toBeLessThanOrEqual(1)
})

test('phone: the fitness weekly plan and tabs fit the screen', async ({ page }) => {
  await register(page)
  await page.goto('/fitness')
  await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(1)
})

test("phone: a form's buttons stay on screen, and its calendar is fully visible", async ({ page }) => {
  await register(page)
  await page.goto('/planner')
  await page.getByRole('button', { name: 'New task' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Add task' })).toBeInViewport({ ratio: 1 })
  await dialog.getByLabel('Due date').click()
  const calendar = page.getByRole('dialog', { name: 'Choose date' })
  await expect(calendar.getByRole('button', { name: 'Previous month' })).toBeInViewport({ ratio: 1 })
  await expect(calendar.getByRole('button', { name: 'Today' })).toBeInViewport({ ratio: 1 })
})

test('phone: finance filters are collapsed until asked for', async ({ page }) => {
  await register(page)
  await page.goto('/finance')
  await expect(page.getByRole('button', { name: 'Type' })).toBeHidden()
  await page.getByRole('button', { name: /Filters/ }).click()
  await expect(page.getByLabel('Type')).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(1)
})

test('phone: touch targets for the main task actions are at least 40px', async ({ page }) => {
  await register(page)
  await addLongTask(page)
  for (const button of [
    page.getByRole('button', { name: /^Complete "/ }).first(),
    page.getByRole('button', { name: /^Actions for/ }).first(),
  ]) {
    const box = await button.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(40)
    expect(box.width).toBeGreaterThanOrEqual(40)
  }
})
