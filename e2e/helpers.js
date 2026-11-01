import { expect } from '@playwright/test'

export const uniqueEmail = () => `u${Date.now()}${Math.floor(Math.random() * 1e4)}@test.dev`

export async function register(page, { email = uniqueEmail(), password = 'password123', name = 'Test User' } = {}) {
  await page.goto('/register')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/$/)
  return { email, password }
}

export async function addTask(page, title, extra = {}) {
  await page.getByRole('button', { name: /New task/ }).click()
  await page.getByLabel('Title').fill(title)
  if (extra.priority) await page.getByLabel('Priority').selectOption(extra.priority)
  await page.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
}
