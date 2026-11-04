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
  if (extra.priority) await pickOption(page.getByLabel('Priority'), extra.priority)
  await page.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
}

/** Choose an option of our custom Select (replaces Playwright's selectOption, which needs a native <select>). */
export async function pickOption(trigger, value) {
  await trigger.click()
  await trigger.page().locator(`[role="listbox"] [role="option"][data-value="${value}"]`).click()
}

/** Set one of our date pickers to 'yyyy-MM-dd' by walking its calendar. */
export async function pickDate(trigger, value) {
  const page = trigger.page()
  await trigger.click()
  const cal = page.getByRole('dialog', { name: 'Choose date' })
  const [y, m] = value.split('-').map(Number)
  const shown = new Date(`1 ${await cal.locator('[aria-live]').innerText()}`)
  let diff = (y - shown.getFullYear()) * 12 + (m - 1 - shown.getMonth())
  while (Math.abs(diff) >= 12) {
    await cal.getByRole('button', { name: diff > 0 ? 'Next year' : 'Previous year' }).click()
    diff -= Math.sign(diff) * 12
  }
  for (let i = 0; i < Math.abs(diff); i++) await cal.getByRole('button', { name: diff > 0 ? 'Next month' : 'Previous month' }).click()
  const d = new Date(`${value}T00:00:00`)
  const label = `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })} ${y}`
  await cal.getByRole('button', { name: label }).click()
}
