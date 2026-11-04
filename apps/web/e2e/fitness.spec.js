import { test, expect } from '@playwright/test'
import { register, pickOption } from './helpers'

const createRoutine = async (page, name = 'Push day') => {
  await page.getByRole('tab', { name: 'Routines' }).click()
  await page.getByRole('button', { name: 'Create routine' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Name', { exact: true }).fill(name)
  await dlg.getByLabel('Exercise 1 name').fill('Bench Press')
  await dlg.getByLabel('Weight kg').fill('60')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

test.describe('fitness', () => {
  test('routine: invalid values show a message instead of failing silently', async ({ page }) => {
    await register(page)
    await page.goto('/fitness')
    await page.getByRole('tab', { name: 'Routines' }).click()
    await page.getByRole('button', { name: 'Create routine' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(dlg.getByText('Name the routine')).toBeVisible()
    await dlg.getByLabel('Name', { exact: true }).fill('Legs')
    await dlg.getByLabel('Exercise 1 name').fill('Squat')
    await dlg.getByLabel('Sets').fill('99')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(dlg.getByText('Sets is too large')).toBeVisible() // used to be silent
    await dlg.getByLabel('Sets').fill('4')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Legs', { exact: true })).toBeVisible()
  })

  test('start a workout from a routine, log it, see it in history and the weekly numbers', async ({ page }) => {
    await register(page)
    await page.goto('/fitness')
    await createRoutine(page)
    await page.getByRole('button', { name: 'Actions for Push day' }).click()
    await page.getByRole('menuitem', { name: 'Start workout' }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByLabel('Name', { exact: true })).toHaveValue('Push day')
    await expect(dlg.getByLabel('Exercise 1')).toHaveValue('Bench Press')
    await expect(dlg.getByLabel('Set 3 weight')).toHaveValue('60') // 3 default sets, pre-filled
    await dlg.getByLabel('Duration (min)').fill('50')
    await dlg.getByRole('button', { name: 'Log workout' }).click()
    await expect(page.getByText('Workout logged').first()).toBeVisible()
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByText(/50 min · 3 sets · 1,?800 kg/)).toBeVisible() // default routine: 3 sets × 10 reps × 60 kg
  })

  test('today: mark rest, undo, plan a day', async ({ page }) => {
    await register(page)
    await page.goto('/fitness')
    await page.getByRole('button', { name: 'Rest day' }).click()
    await expect(page.locator('p', { hasText: /^Rest day$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible()
    await pickOption(page.getByLabel('Plan for Monday'), 'rest')
    await expect(page.getByText('Plan updated').first()).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Plan for Monday')).toHaveValue('rest') // persisted to the account
  })

  test('body: weight logged from the dialog shows in the stats; empty entries are refused', async ({ page }) => {
    await register(page)
    await page.goto('/fitness')
    await page.getByRole('tab', { name: 'Body' }).click()
    await page.getByRole('button', { name: 'Log', exact: true }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Enter at least one measurement.').first()).toBeVisible()
    await dlg.getByLabel('Weight (kg)').fill('78.4')
    await dlg.getByLabel('Waist (cm)').fill('81')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('78.4 kg').first()).toBeVisible()
    await expect(page.getByText('Waist 81')).toBeVisible()
  })

  test('exercise library: add and remove', async ({ page }) => {
    await register(page)
    await page.goto('/fitness')
    await page.getByRole('tab', { name: 'Exercises' }).click()
    await page.getByRole('button', { name: 'New exercise' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill('Zercher Squat')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Zercher Squat')).toBeVisible()
    await page.getByText('Zercher Squat').hover()
    await page.getByRole('button', { name: 'Remove Zercher Squat' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Zercher Squat')).toHaveCount(0)
  })
})
