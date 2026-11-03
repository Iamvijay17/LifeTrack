import { test, expect } from '@playwright/test'
import { register } from './helpers'

const addTxn = async (page, { type, amount, note }) => {
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  const dlg = page.getByRole('dialog')
  if (type) await dlg.getByRole('tab', { name: type }).click()
  await dlg.getByLabel(/Amount/).fill(amount)
  if (note) await dlg.getByLabel('Note').fill(note)
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(dlg).toHaveCount(0)
}

test.describe('finance', () => {
  test('switching type shows (and saves) a category that belongs to that type', async ({ page }) => {
    await register(page)
    await page.goto('/finance')
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.getByRole('tab', { name: 'Income' }).click()
    // Regression: the dropdown used to display "Other" while "Salary" was what got saved.
    await expect(dlg.getByLabel('Category')).toHaveValue('Salary')
    await dlg.getByLabel(/Amount/).fill('50000')
    await dlg.getByRole('button', { name: 'Save' }).click()
    const row = page.getByRole('listitem').filter({ hasText: 'Salary' })
    await expect(row).toContainText('+₹50,000')
  })

  test('budget: empty → set → used percentage; invalid input is rejected inline', async ({ page }) => {
    await register(page)
    await page.goto('/finance')
    await expect(page.getByText('No budget')).toBeVisible()
    await addTxn(page, { amount: '2500', note: 'Groceries' })
    await page.getByText('Budget left').click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Monthly expense budget').fill('abc')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(dlg.getByText('Enter a valid amount, e.g. 25000')).toBeVisible()
    await dlg.getByLabel('Monthly expense budget').fill('10000')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('₹7,500')).toBeVisible() // 10,000 budget − 2,500 spent
    await expect(page.getByText('of ₹10,000')).toBeVisible()
  })

  test('edit and delete a transaction; month navigation', async ({ page }) => {
    await register(page)
    await page.goto('/finance')
    await addTxn(page, { amount: '300', note: 'Coffee beans' })
    const row = page.getByRole('listitem').filter({ hasText: 'Coffee beans' })
    await row.getByRole('button', { name: 'Transaction actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page
      .getByRole('dialog')
      .getByLabel(/Amount/)
      .fill('450.50')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Coffee beans' })).toContainText('₹450.50')

    await page.getByRole('button', { name: 'Previous month' }).click()
    await expect(page.getByText('No transactions this month')).toBeVisible()
    await page.getByRole('button', { name: 'This month' }).click()

    await page.getByRole('listitem').filter({ hasText: 'Coffee beans' }).getByRole('button', { name: 'Transaction actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Coffee beans')).toHaveCount(0)
  })

  test('savings goal: create, add funds, delete', async ({ page }) => {
    await register(page)
    await page.goto('/finance')
    await page.getByRole('button', { name: 'Create a savings goal' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(dlg.getByText('Name the goal')).toBeVisible()
    await dlg.getByLabel('What are you saving for?').fill('Trip')
    await dlg.getByLabel('Target amount').fill('20000')
    await dlg.getByRole('button', { name: 'Save' }).click()
    const goal = page.getByTestId('savings-goal')
    await goal.getByRole('button', { name: 'Actions for Trip' }).click()
    await page.getByRole('menuitem', { name: 'Add funds' }).click()
    await page.getByRole('dialog').getByLabel('Amount').fill('5000')
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click()
    await expect(goal.getByText('25%')).toBeVisible()
    await goal.getByRole('button', { name: 'Actions for Trip' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByTestId('savings-goal')).toHaveCount(0)
  })
})
