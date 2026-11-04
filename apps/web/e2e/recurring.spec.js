import { test, expect } from '@playwright/test'
import { pickDate, pickOption, register } from './helpers'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** A date relative to today, on the browser's clock. Used for the near future and for "a few days ago", neither of which depends on the month. */
const inDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

const openNewRule = async (page) => {
  await page.goto('/finance')
  await page.getByRole('button', { name: 'Add a recurring rule' }).click()
  return page.getByRole('dialog')
}
const save = async (dlg) => {
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(dlg).toHaveCount(0)
}
const ruleRow = (page) => page.getByTestId('recurring-rule')
const ruleMenu = async (page, title, item) => {
  await ruleRow(page)
    .filter({ hasText: title })
    .getByRole('button', { name: `Actions for ${title}` })
    .click()
  await page.getByRole('menuitem', { name: item }).click()
}
const txnRows = (page, text) =>
  page
    .getByRole('listitem')
    .filter({ hasText: text })
    .filter({ has: page.getByRole('button', { name: 'Transaction actions' }) })

test.describe('recurring transactions', () => {
  test('two tabs open when a rule falls due post it once', async ({ page, context }) => {
    await register(page)
    await page.goto('/finance')
    // A second device, simulated by a second tab on the same data: it hears about the rule as soon as it is saved, and tries to post it too.
    const other = await context.newPage()
    await other.goto('/finance')
    await expect(other.getByRole('button', { name: 'Add a recurring rule' })).toBeVisible()

    await page.bringToFront()
    await page.getByRole('button', { name: 'Add a recurring rule' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(dlg.getByText('Enter an amount greater than 0 (max 2 decimals)')).toBeVisible() // validated like any transaction
    await dlg.getByLabel(/Amount/).fill('25000')
    await dlg.getByLabel('Note').fill('Rent')
    await save(dlg)

    await expect(ruleRow(page)).toContainText('Rent')
    await expect(ruleRow(page)).toContainText('Monthly')
    await expect(ruleRow(page)).toContainText('−₹25,000')
    await expect(txnRows(page, 'Rent')).toHaveCount(1)
    await expect(txnRows(page, 'Rent')).toContainText('Recurring')

    await expect(ruleRow(other)).toContainText('Rent')
    await other.evaluate(() => window.dispatchEvent(new Event('focus'))) // a run from the other tab, with the rule already advanced
    for (const p of [page, other]) {
      await p.reload()
      await expect(ruleRow(p)).toContainText('Rent')
      await expect(txnRows(p, 'Rent')).toHaveCount(1)
    }
  })

  test('catches up on missed days, each on its own date', async ({ page }) => {
    await register(page)
    const dlg = await openNewRule(page)
    await dlg.getByLabel(/Amount/).fill('60')
    await pickOption(dlg.getByLabel('Repeats'), 'daily')
    await dlg.getByLabel('Note').fill('Milk')
    await pickDate(dlg.getByLabel('First date'), inDays(-2))
    await expect(dlg.getByText('Every charge from this date up to today is added when you save.')).toBeVisible()
    await save(dlg)
    await expect(ruleRow(page)).toContainText(/Next /)

    // Three charges in all; on the 1st or 2nd of a month, the older ones are on the previous month's page.
    const thisMonth = inDays(0).slice(0, 7)
    const count = [inDays(-2), inDays(-1), inDays(0)].filter((d) => d.startsWith(thisMonth)).length
    await expect(txnRows(page, 'Milk')).toHaveCount(count)
    await page.reload()
    await expect(ruleRow(page)).toContainText('Milk')
    await expect(txnRows(page, 'Milk')).toHaveCount(count) // reopening posts nothing new
  })

  test('shows in the dashboard Upcoming widget until it is paused', async ({ page }) => {
    await register(page)
    const dlg = await openNewRule(page)
    await dlg.getByLabel(/Amount/).fill('499')
    await dlg.getByLabel('Note').fill('Netflix')
    await pickDate(dlg.getByLabel('First date'), inDays(3))
    await save(dlg)
    await expect(txnRows(page, 'Netflix')).toHaveCount(0) // not due yet

    const upcoming = (p) => p.getByRole('link').filter({ hasText: 'Netflix' })
    await page.goto('/')
    await expect(upcoming(page)).toContainText('−₹499')

    await upcoming(page).click()
    await expect(page).toHaveURL(/\/finance$/)
    await ruleMenu(page, 'Netflix', 'Pause')
    await expect(ruleRow(page)).toContainText('Paused')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible()
    await expect(upcoming(page)).toHaveCount(0)
  })

  test('edit, pause, resume and delete; deleting keeps what it posted', async ({ page }) => {
    await register(page)
    const dlg = await openNewRule(page)
    await dlg.getByLabel(/Amount/).fill('1000')
    await dlg.getByLabel('Note').fill('EMI')
    await save(dlg)
    await expect(txnRows(page, 'EMI')).toHaveCount(1)

    await ruleMenu(page, 'EMI', 'Edit')
    const edit = page.getByRole('dialog')
    await expect(edit.getByLabel(/Amount/)).toHaveValue('1000')
    await edit.getByLabel(/Amount/).fill('1500')
    await edit.getByLabel('Note').fill('Car EMI')
    await save(edit)
    await expect(ruleRow(page)).toContainText('−₹1,500')
    await expect(txnRows(page, 'EMI')).toContainText('₹1,000') // what was already posted keeps its amount

    await ruleMenu(page, 'Car EMI', 'Pause')
    await expect(ruleRow(page)).toContainText('Paused')
    await ruleMenu(page, 'Car EMI', 'Resume')
    await expect(ruleRow(page)).toContainText(/Next /)

    await ruleMenu(page, 'Car EMI', 'Delete')
    await expect(page.getByText('Transactions it already added stay.')).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(ruleRow(page)).toHaveCount(0)
    await expect(page.getByText('No recurring transactions')).toBeVisible()
    await expect(txnRows(page, 'EMI')).toHaveCount(1)
  })
})
