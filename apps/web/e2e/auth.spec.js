import { test, expect } from '@playwright/test'
import { register } from './helpers'

test.describe('authentication', () => {
  test('protected routes redirect to login, then back after signing in', async ({ page }) => {
    await page.goto('/planner')
    await expect(page).toHaveURL(/\/login/)
  })

  test('register, persist session across reload, sign out, sign in again', async ({ page }) => {
    const { email, password } = await register(page)
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening|night)|Still up/ })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/\/$/) // session persisted
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('registration validates input', async ({ page }) => {
    await page.goto('/register')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Enter your name')).toBeVisible()
    await page.getByLabel('Name').fill('A')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Password', { exact: true }).fill('short')
    await page.getByLabel('Confirm password').fill('different')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Enter a valid email')).toBeVisible()
    await expect(page.getByText('Use at least 8 characters')).toBeVisible()
  })

  test('data is isolated between accounts', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await page.getByRole('button', { name: /New task/ }).click()
    await page.getByLabel('Title').fill('Private to user one')
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByText('Private to user one')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await register(page)
    await page.goto('/planner')
    await expect(page.getByText('Private to user one')).toHaveCount(0)
  })
})
