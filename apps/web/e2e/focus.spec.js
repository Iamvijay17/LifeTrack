import { test, expect } from '@playwright/test'
import { register } from './helpers'

const injectTimer = (page, endsInMs) =>
  page.evaluate((ms) => {
    const userId = JSON.parse(localStorage.getItem('lifetrack-dev:session')).userId
    localStorage.setItem(
      `lifetrack:focus-timer:${userId}`,
      JSON.stringify({
        mode: 'focus',
        plannedMinutes: 25,
        endsAt: Date.now() + ms,
        pausedLeft: null,
        taskId: null,
        topicId: null,
        label: 'Two-tab test',
        startedAt: 1700000000000,
      }),
    )
  }, endsInMs)

test.describe('focus: robustness', () => {
  test('a block that finishes while open in TWO tabs is saved once', async ({ page, context }) => {
    await register(page)
    await page.goto('/focus')
    await injectTimer(page, 4000)
    const second = await context.newPage()
    await page.reload()
    await second.goto('/focus')
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect(second.getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect(page.getByText('1 completed block')).toBeVisible({ timeout: 15_000 })
    await second.reload() // let the second tab read the final state from the database
    await expect(second.getByText('1 completed block')).toBeVisible()
    await expect(second.getByText('Two-tab test')).toHaveCount(1) // not two sessions
    await expect(second.getByRole('listitem').filter({ hasText: '25 of 25 min' })).toHaveCount(1)
  })

  test('another account on the same browser does not inherit a running timer', async ({ page }) => {
    await register(page)
    await page.goto('/focus')
    await injectTimer(page, 600_000)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await register(page)
    await page.goto('/focus')
    await expect(page.getByRole('button', { name: /Start focus/ })).toBeVisible() // fresh account: idle timer
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0)
  })

  test('deleting a session asks for confirmation first', async ({ page }) => {
    await register(page)
    await page.goto('/focus')
    await injectTimer(page, 1500)
    await page.reload()
    await expect(page.getByText('1 completed block')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Delete session' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('1 completed block')).toBeVisible()
    await page.getByRole('button', { name: 'Delete session' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('No focus sessions yet today')).toBeVisible()
  })
})
