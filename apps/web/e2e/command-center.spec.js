import { expect, test } from '@playwright/test'
import { addTask, register } from './helpers'

const widget = (page, key) => page.locator(`[data-testid="widget-grid"] > [data-widget="${key}"]`)

test.describe('life command center', () => {
  test('a new account sees the guide; the key numbers and module widgets arrive with the first entry', async ({ page }) => {
    await register(page)
    await expect(page.getByTestId('getting-started')).toBeVisible()
    await expect(page.getByTestId('kpi-strip')).toHaveCount(0)
    await expect(page.getByTestId('learning-card')).toHaveCount(0)

    await page.goto('/planner')
    await addTask(page, 'Plan the week')
    await page.goto('/')
    const strip = page.getByTestId('kpi-strip')
    await expect(strip).toBeVisible()
    await expect(strip.getByText('0/1')).toBeVisible() // tasks today: none done yet
    await expect(strip.getByText('1 pending')).toBeVisible()
    for (const id of ['learning-card', 'jobs-card', 'fitness-card', 'sleep-card', 'habits-card', 'finance-card'])
      await expect(page.getByTestId(id)).toBeVisible()
    // Nothing is logged in these modules yet, so each says so rather than showing zeros.
    await expect(page.getByTestId('learning-card').getByText(/Log a study session/)).toBeVisible()
    await expect(page.getByTestId('jobs-card').getByText(/Track applications and interviews/)).toBeVisible()
    await expect(page.getByTestId('sleep-card').getByText('No sleep recorded yet.')).toBeVisible()
    await expect(page.getByTestId('habits-card').getByText('Habits you build will be tracked here.')).toBeVisible()
  })

  test('widgets can be resized, hidden and restored, and the layout survives a reload', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await addTask(page, 'Anything')
    await page.goto('/')
    await expect(widget(page, 'learning')).toHaveAttribute('data-size', 'md')

    await page.getByRole('button', { name: 'Customize' }).click()
    await page.getByRole('radio', { name: 'Career & learning: Large' }).click()
    await page.getByRole('switch', { name: 'Food & nutrition' }).click()
    await page.getByRole('button', { name: 'Move Quick actions up' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(widget(page, 'learning')).toHaveAttribute('data-size', 'lg')
    await expect(widget(page, 'nutrition')).toHaveCount(0)

    await page.reload() // saved to the account, not just this render
    await expect(widget(page, 'learning')).toHaveAttribute('data-size', 'lg')
    await expect(widget(page, 'nutrition')).toHaveCount(0)
    const order = await page.locator('[data-testid="widget-grid"] > [data-widget]').evaluateAll((els) => els.map((e) => e.dataset.widget))
    expect(order.indexOf('quick')).toBe(order.length - 2) // moved up one place, above Recent activity

    await page.getByRole('button', { name: 'Customize' }).click()
    await page.getByRole('button', { name: /Restore default layout/ }).click()
    await expect(widget(page, 'learning')).toHaveAttribute('data-size', 'md')
    await expect(widget(page, 'nutrition')).toHaveCount(1)
    await page.getByRole('button', { name: 'Undo' }).click() // the toast offers to take the reset back
    await expect(widget(page, 'learning')).toHaveAttribute('data-size', 'lg')
    await page.reload()
    await expect(widget(page, 'learning')).toHaveAttribute('data-size', 'lg')
  })

  test('the Life Score covers today, 7 and 30 days, and the trend chart rolls up by day, week and month', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await addTask(page, 'Pay rent')
    await page.getByRole('button', { name: 'Complete "Pay rent"' }).click()
    await page.goto('/')
    const card = page.getByTestId('score-card')
    await expect(card.getByTestId('score-value')).toHaveText('100') // only one day has anything, and it was done: others are not counted as zero
    await expect(card.getByText(/Average of 1 day with something planned or logged \(of 7\)/)).toBeVisible()
    await card.getByRole('tab', { name: '30 days' }).click()
    await expect(card.getByTestId('score-value')).toHaveText('100')
    await card.getByRole('tab', { name: 'Today' }).click()
    await expect(card.getByTestId('score-value')).toHaveText('100')
    await expect(card.getByText('not tracked').first()).toBeVisible() // categories with nothing planned are left out, not scored 0

    const trend = page.getByTestId('trend-card')
    await expect(trend.getByText('Average 100 over 1 day with data')).toBeVisible()
    await trend.getByRole('tab', { name: 'Weekly' }).click()
    await expect(trend.getByText('Average 100 over 1 week with data')).toBeVisible()
    await trend.getByRole('tab', { name: 'Monthly' }).click()
    await expect(trend.getByText('Average 100 over 1 month with data')).toBeVisible()
  })
})
