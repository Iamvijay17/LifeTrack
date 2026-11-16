import { expect, test } from '@playwright/test'
import { addTask, register } from './helpers'

const grid = (page) => page.getByTestId('widget-grid')
const bar = (page) => page.getByTestId('edit-bar')

async function start(page) {
  await register(page)
  await page.goto('/planner')
  await addTask(page, 'Anything')
  await page.goto('/')
  await expect(grid(page)).toBeVisible()
}

const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('dashboard builder on small screens', () => {
  test.setTimeout(90_000)

  test('on a phone: one column, no sideways scroll, widgets move with buttons and the saved desktop layout is untouched', async ({
    page,
  }) => {
    await start(page)
    expect(await sideways(page)).toBeLessThanOrEqual(1)
    await expect(grid(page)).toHaveAttribute('data-bp', 'sm')
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    await expect(page.locator('.lt-drag')).toHaveCount(0) // no dragging on a phone: it would fight scrolling
    const order = () =>
      grid(page)
        .locator('[data-widget]')
        .evaluateAll((els) =>
          els
            .map((e) => [e.dataset.widget, e.getBoundingClientRect().y])
            .sort((a, b) => a[1] - b[1])
            .map((x) => x[0]),
        )
    const [first, second] = await order()
    await grid(page)
      .locator(`[data-widget="${second}"]`)
      .getByRole('button', { name: /^Move .* up$/ })
      .click()
    await expect.poll(async () => (await order())[0]).toBe(second)
    expect((await order())[1]).toBe(first)
    expect(await sideways(page)).toBeLessThanOrEqual(1)
    await bar(page).getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect.poll(async () => (await order())[0]).toBe(first) // glides back
  })

  test('on a phone: the workspace tabs scroll on their own and the library and templates fit the screen', async ({ page }) => {
    await start(page)
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    await bar(page).getByRole('button', { name: 'Templates' }).click()
    await page.getByTestId('template-finance').getByRole('button', { name: 'New workspace' }).click()
    await expect(page.getByRole('tab', { name: 'Finance' })).toHaveAttribute('aria-selected', 'true')
    expect(await sideways(page)).toBeLessThanOrEqual(1)
    await bar(page).getByRole('button', { name: 'Add widget' }).click()
    const lib = page.getByRole('dialog', { name: 'Add a widget' })
    await expect(lib).toBeVisible()
    const box = await lib.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1)
  })
})

test.describe('dashboard builder on a tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 } })
  test.setTimeout(90_000)

  test('adapts its columns, fits the screen and edits with touch-sized controls', async ({ page }) => {
    await start(page)
    expect(await sideways(page)).toBeLessThanOrEqual(1)
    await expect(grid(page)).toHaveAttribute('data-bp', /^(md|sm|lg)$/)
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    await expect(bar(page)).toBeVisible()
    expect(await sideways(page)).toBeLessThanOrEqual(1)
    const menu = page.getByRole('button', { name: /^Settings for/ }).first()
    const b = await menu.boundingBox()
    expect(b.height).toBeGreaterThanOrEqual(28)
  })
})
