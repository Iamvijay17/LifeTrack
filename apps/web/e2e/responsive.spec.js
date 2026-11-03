import { test, expect } from '@playwright/test'
import { register } from './helpers'

const PAGES = ['/', '/planner', '/learning', '/jobs', '/fitness', '/health', '/finance', '/habits', '/analytics', '/settings']

test('mobile: bottom nav + quick-add button, no horizontal overflow on any page', async ({ page }) => {
  await register(page)
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quick add' })).toBeVisible()
  for (const path of PAGES) {
    await page.goto(path)
    await page.waitForTimeout(400)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1)
  }
})

test('mobile: quick add creates a task and "More" reaches every page', async ({ page }) => {
  await register(page)
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.getByLabel('Title').fill('From the FAB')
  await page.getByRole('dialog').getByRole('button', { name: 'Add task' }).click()
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Planner' }).click()
  await expect(page.getByText('From the FAB')).toBeVisible()
  await page.getByRole('button', { name: 'More pages' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Analytics' }).click()
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
})

test('mobile: job table renders as cards', async ({ page }) => {
  await register(page)
  await page.goto('/jobs')
  await page.getByRole('button', { name: 'Add your first application' }).click()
  await page.getByLabel('Company').fill('CardCo')
  await page.getByLabel('Job title').fill('Dev')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('tab', { name: 'Table' }).click()
  await expect(page.locator('table')).toBeHidden()
  await expect(page.getByText('CardCo').and(page.locator(':visible'))).toHaveCount(1)
})
