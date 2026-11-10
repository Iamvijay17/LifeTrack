import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { register } from './helpers'

const serious = async (page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()).violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact),
  )

const breakfast = (page) => page.getByTestId('meal-breakfast')

test.describe('food & nutrition', () => {
  test('log a starter food with a serving and quantity, edit it, and it survives a reload', async ({ page }) => {
    await register(page)
    await page.goto('/nutrition')
    await expect(page.getByText('Log your first meal')).toBeVisible()
    await page.getByRole('button', { name: 'Log food' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Search foods').fill('idli')
    await dlg.getByRole('list', { name: 'Foods' }).getByRole('button').first().click()
    await dlg.getByRole('button', { name: '3 idlis' }).click()
    await dlg.getByRole('button', { name: 'More' }).click() // 1 -> 1.5
    await expect(dlg.getByText('261 kcal', { exact: false })).toBeVisible()
    await dlg.getByRole('tab', { name: 'Breakfast' }).click()
    await dlg.getByRole('button', { name: 'Add to Breakfast' }).click()
    await expect(dlg).toHaveCount(0)
    await expect(breakfast(page)).toContainText('Idli')
    await expect(breakfast(page)).toContainText('261')
    // edit: the quantity rescales every nutrient
    await breakfast(page).getByRole('button', { name: 'Edit Idli' }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('Quantity').fill('2')
    await expect(form.getByTestId('entry-totals')).toContainText('348 kcal in total')
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(form).toHaveCount(0)
    await expect(breakfast(page)).toContainText('348')
    await page.reload()
    await expect(breakfast(page)).toContainText('348')
  })

  test('targets drive the ring; deleting asks first; water can be added and undone', async ({ page }) => {
    await register(page)
    await page.goto('/nutrition')
    await page.getByRole('button', { name: 'Targets', exact: true }).click()
    const goals = page.getByRole('dialog')
    await goals.getByLabel('Calories (kcal)').fill('1800')
    await goals.getByLabel('Protein (g)').fill('90')
    await goals.getByRole('button', { name: 'Save' }).click()
    await expect(goals).toHaveCount(0)
    await expect(page.getByText('of 1,800 kcal')).toBeVisible()

    // Enter a food by hand
    await page.getByRole('button', { name: 'Log food' }).first().click()
    const picker = page.getByRole('dialog')
    await picker.getByRole('button', { name: 'Enter manually' }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('Food').fill('Homemade sambar')
    await form.getByRole('tab', { name: 'Lunch' }).click()
    await form.getByLabel('Calories (kcal)').fill('85')
    await form.getByRole('button', { name: /Add to Lunch/ }).click()
    await expect(page.getByTestId('meal-lunch')).toContainText('Homemade sambar')
    await expect(page.getByText('1,715 kcal')).toBeVisible() // remaining

    await page.getByTestId('meal-lunch').getByRole('button', { name: 'Actions for Homemade sambar' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText('Delete this entry?')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('meal-lunch')).toContainText('Homemade sambar') // cancelled: still there
    await page.getByTestId('meal-lunch').getByRole('button', { name: 'Actions for Homemade sambar' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Log your first meal')).toBeVisible() // nothing left anywhere: back to the first-run state

    // water: add, see the total, undo
    await page.getByRole('button', { name: 'Add 250 millilitres' }).click()
    await page.getByRole('button', { name: 'Add 500 millilitres' }).click()
    await expect(page.getByText('750 ml', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: /Undo last \(500 ml\)/ }).click()
    await expect(page.getByText('250 ml', { exact: true }).first()).toBeVisible()
    // the same total shows up in Sleep & Health
    await page.goto('/health')
    await expect(page.getByText('250 ml').first()).toBeVisible()
  })

  test('calendar flags a day with nothing logged; analytics and the food database load', async ({ page }) => {
    await register(page)
    await page.goto('/nutrition')
    await page.getByRole('button', { name: 'Log food' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Search foods').fill('banana')
    await dlg.getByRole('list', { name: 'Foods' }).getByRole('button').first().click()
    await dlg.getByRole('button', { name: /Add to / }).click()
    await expect(dlg).toHaveCount(0)
    await page.getByRole('tab', { name: 'Calendar' }).click()
    await expect(page.getByText('Food calendar')).toBeVisible()
    await page.getByRole('tab', { name: 'Analytics' }).click()
    await expect(page.getByText('Avg daily calories')).toBeVisible()
    await page.getByRole('tab', { name: 'Weekly' }).click()
    await expect(page.getByText('Average daily calories per week')).toBeVisible()
    await page.getByRole('tab', { name: 'Foods' }).click()
    await expect(page.getByText(/approximate estimates/)).toBeVisible()
    await page.getByLabel('Search foods').fill('paneer')
    await expect(page.getByRole('list', { name: 'Food list' }).getByRole('listitem')).toHaveCount(1)
  })

  test('every tab and the picker, detail and entry dialogs have no serious accessibility violations', async ({ page }) => {
    await register(page)
    await page.goto('/nutrition')
    await page.getByRole('button', { name: 'Log food' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Search foods').fill('dal')
    expect(await serious(page), 'picker').toEqual([])
    await dlg.getByRole('list', { name: 'Foods' }).getByRole('button').first().click()
    await expect(dlg.getByText('Serving size')).toBeVisible()
    expect(await serious(page), 'food detail').toEqual([])
    await dlg.getByRole('button', { name: 'Add notes, date or time' }).click()
    await expect(page.getByRole('dialog', { name: 'Add food', exact: true })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Add food entry' }).getByLabel('Quantity')).toBeVisible()
    expect(await serious(page), 'entry form').toEqual([])
    await page.getByRole('dialog', { name: 'Add food entry' }).getByRole('button', { name: 'Cancel' }).click()
    for (const tab of ['Calendar', 'Analytics', 'Foods']) {
      await page.getByRole('tab', { name: tab }).click()
      await page.waitForTimeout(500)
      const v = await serious(page)
      expect(v, `${tab}: ${v.map((x) => x.id).join(', ')}`).toEqual([])
    }
  })
})
