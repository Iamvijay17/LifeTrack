import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { addTask, register } from './helpers'

const grid = (page) => page.getByTestId('widget-grid')
const widget = (page, key) => grid(page).locator(`[data-widget="${key}"]`)
const bar = (page) => page.getByTestId('edit-bar')
const box = async (loc) => (await loc.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
// Position inside the grid, so scrolling does not change it.
const rel = async (page, key) => {
  const g = await box(grid(page))
  const b = await box(widget(page, key))
  return { x: Math.round(b.x - g.x), y: Math.round(b.y - g.y), w: Math.round(b.width) }
}

async function start(page) {
  await register(page)
  await page.goto('/planner')
  await addTask(page, 'Anything')
  await page.goto('/')
  await expect(grid(page)).toBeVisible()
}

test.describe('dashboard builder', () => {
  test.setTimeout(90_000)
  test('edit mode is obvious, drag and resize work, Cancel keeps the saved layout and Save persists', async ({ page }) => {
    await start(page)
    await expect(bar(page)).toHaveCount(0)
    await expect(page.locator('.lt-drag')).toHaveCount(0) // a clean dashboard has no handles

    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    await expect(bar(page)).toBeVisible()
    await expect(bar(page)).toContainText('Editing dashboard')

    // Drag Goal progress to the top-left of the grid.
    const before = await rel(page, 'goals')
    const handle = widget(page, 'goals').locator('.lt-drag')
    await handle.scrollIntoViewIfNeeded()
    const h = await box(handle)
    const target = await box(grid(page))
    await page.mouse.move(h.x + 10, h.y + 10)
    await page.mouse.down()
    await page.mouse.move(target.x + 40, target.y + 40, { steps: 12 })
    await page.mouse.up()
    await expect(bar(page)).toContainText('Unsaved changes')
    const after = await rel(page, 'goals')
    expect(after.y).toBeLessThan(before.y)

    // Cancel: nothing was saved.
    await bar(page).getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(bar(page)).toHaveCount(0)
    await expect.poll(async () => Math.abs((await rel(page, 'goals')).y - before.y), { timeout: 5000 }).toBeLessThan(40) // glides back to where it was

    // Resize Habits wider with its corner handle, save, reload.
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    const habits = widget(page, 'habits')
    await habits.scrollIntoViewIfNeeded()
    const w0 = (await box(habits)).width
    const corner = await box(habits.locator('.react-resizable-handle-se'))
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
    await page.mouse.down()
    await page.mouse.move(corner.x + 400, corner.y + corner.height / 2, { steps: 12 })
    await page.mouse.up()
    expect((await box(habits)).width).toBeGreaterThan(w0)
    await page.waitForTimeout(500) // the card snaps to the grid and settles
    const w1 = (await box(habits)).width
    await bar(page).getByRole('button', { name: 'Save' }).click()
    await expect(bar(page)).toHaveCount(0)
    await page.reload()
    await expect(widget(page, 'habits')).toBeVisible()
    expect(Math.abs((await box(widget(page, 'habits'))).width - w1)).toBeLessThan(2)
  })

  test('the widget library adds widgets from real modules, removing one leaves the data alone', async ({ page }) => {
    await start(page)
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    await bar(page).getByRole('button', { name: 'Add widget' }).click()
    const lib = page.getByRole('dialog', { name: 'Add a widget' })
    await lib.getByRole('textbox', { name: 'Search widgets' }).fill('calendar')
    await lib.getByRole('button', { name: 'Add Mini calendar' }).click()
    await expect(lib.getByRole('button', { name: 'Add Mini calendar' })).toBeDisabled() // only one of those
    await lib.getByRole('textbox', { name: 'Search widgets' }).fill('notes')
    await lib.getByRole('button', { name: 'Add Quick notes' }).click()
    await expect(lib.getByRole('button', { name: 'Add another Quick notes' })).toBeEnabled() // this one allows several
    await page.keyboard.press('Escape')
    await expect(widget(page, 'calendar')).toBeVisible()
    await expect(widget(page, 'notes')).toBeVisible()

    // Remove Today's tasks: the card goes, the task stays.
    await page.getByRole('button', { name: 'Settings for Today’s tasks' }).click()
    await page.getByRole('menuitem', { name: 'Remove widget' }).click()
    await page.getByRole('button', { name: 'Remove widget' }).click()
    await expect(widget(page, 'priorities')).toHaveCount(0)
    await bar(page).getByRole('button', { name: 'Save' }).click()
    await expect(bar(page)).toHaveCount(0)
    await page.reload()
    await expect(widget(page, 'calendar')).toBeVisible()
    await expect(widget(page, 'priorities')).toHaveCount(0)
    await page.goto('/planner')
    await expect(page.getByText('Anything', { exact: true })).toBeVisible()
  })

  test('workspaces: create from a template, switch without reload, rename, default, delete; each keeps its own widgets', async ({
    page,
  }) => {
    await start(page)
    const tabs = page.getByRole('tablist', { name: 'Dashboard workspaces' })
    await expect(tabs.getByRole('tab', { name: /My Daily Life/ })).toHaveAttribute('aria-selected', 'true')

    // Template -> new workspace
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    await bar(page).getByRole('button', { name: 'Templates' }).click()
    await page.getByTestId('template-finance').getByRole('button', { name: 'New workspace' }).click()
    await expect(tabs.getByRole('tab', { name: 'Finance' })).toHaveAttribute('aria-selected', 'true')
    await expect(widget(page, 'budget')).toBeVisible()
    await expect(widget(page, 'today')).toHaveCount(0) // its own widgets, not the daily ones
    await bar(page).getByRole('button', { name: 'Save' }).click()
    await expect(bar(page)).toHaveCount(0)

    // Switch back and forth with no reload (the marker survives)
    await page.evaluate(() => (window.__noReload = true))
    await tabs.getByRole('tab', { name: /My Daily Life/ }).click()
    await expect(widget(page, 'today')).toBeVisible()
    await expect(widget(page, 'budget')).toHaveCount(0)
    await tabs.getByRole('tab', { name: 'Finance' }).click()
    await expect(widget(page, 'budget')).toBeVisible()
    expect(await page.evaluate(() => window.__noReload)).toBe(true)

    // Rename and make default
    await page.getByRole('button', { name: 'Manage Finance' }).click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Money')
    await page.getByRole('button', { name: 'Rename' }).click()
    await expect(tabs.getByRole('tab', { name: /Money/ })).toBeVisible()
    await page.getByRole('button', { name: 'Manage Money' }).click()
    await page.getByRole('menuitem', { name: 'Make default' }).click()
    await page.reload()
    await expect(tabs.getByRole('tab', { name: /Money/ })).toBeVisible()

    // Delete the default: another becomes the default; the last one cannot be deleted
    await page.getByRole('button', { name: 'Manage Money' }).click()
    await page.getByRole('menuitem', { name: 'Delete workspace' }).click()
    await page.getByRole('button', { name: 'Delete workspace' }).click()
    await expect(tabs.getByRole('tab', { name: /Money/ })).toHaveCount(0)
    await expect(tabs.getByRole('tab', { name: /My Daily Life/ })).toBeVisible()
    await page.getByRole('button', { name: 'Manage My Daily Life' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete workspace' })).toHaveCount(0)
  })

  test('a template can be applied, and the current layout saved as a template', async ({ page }) => {
    await start(page)
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    await bar(page).getByRole('button', { name: 'Templates' }).click()
    await page.getByTestId('template-minimal').getByRole('button', { name: 'Apply here' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(widget(page, 'calendar')).toBeVisible()
    await expect(widget(page, 'priorities')).toBeVisible()
    await expect(widget(page, 'score')).toHaveCount(0)
    await bar(page).getByRole('button', { name: 'Templates' }).click()
    await page.getByPlaceholder('Template name').fill('My minimal')
    await page.getByRole('button', { name: 'Save template' }).click()
    await expect(page.getByText('My minimal')).toBeVisible()
    await page.keyboard.press('Escape')
    await bar(page).getByRole('button', { name: 'Save' }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    await bar(page).getByRole('button', { name: 'Templates' }).click()
    await expect(page.getByText('My minimal')).toBeVisible() // saved with the account
  })

  test('edit mode, the library and the templates have no serious accessibility violations', async ({ page }) => {
    await start(page)
    const scan = async () =>
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()).violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact),
      )
    const show = (vs) =>
      vs
        .map(
          (v) =>
            `${v.id}: ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        )
        .join('\n')
    await page.getByRole('button', { name: 'Edit dashboard' }).click()
    let v = await scan()
    expect(v, show(v)).toEqual([])
    await bar(page).getByRole('button', { name: 'Add widget' }).click()
    await expect(page.getByRole('dialog', { name: 'Add a widget' })).toBeVisible()
    v = await scan()
    expect(v, show(v)).toEqual([])
    await page.keyboard.press('Escape')
    await bar(page).getByRole('button', { name: 'Templates' }).click()
    await expect(page.getByRole('dialog', { name: 'Dashboard templates' })).toBeVisible()
    v = await scan()
    expect(v, show(v)).toEqual([])
  })
})
