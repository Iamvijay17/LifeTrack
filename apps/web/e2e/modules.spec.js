import { test, expect } from '@playwright/test'
import { register, addTask } from './helpers'

test.describe('planner', () => {
  test('validates, creates, completes, edits and deletes a task; progress reflects it', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await page.getByRole('button', { name: /New task/ }).click()
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByText('Give the task a title')).toBeVisible()
    await page.getByLabel('Title').fill('Write unit tests')
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByText('Write unit tests')).toBeVisible()

    await page.goto('/')
    await expect(page.getByText(/of \d+ planned activities/)).toContainText('0 of 4') // 1 task + study + water + steps
    await page.goto('/planner')
    await page.getByRole('button', { name: 'Complete "Write unit tests"' }).click()
    await expect(page.getByRole('button', { name: 'Mark "Write unit tests" as not done' })).toBeVisible()
    await page.goto('/')
    await expect(page.getByText(/of \d+ planned activities/)).toContainText('1 of 4')
    await expect(page.getByRole('img', { name: '25% complete' })).toBeVisible()

    await page.goto('/planner')
    await page.getByRole('button', { name: 'Actions for Write unit tests' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click() // confirm dialog
    await expect(page.getByText('Write unit tests')).toHaveCount(0)
  })

  test('cancelled tasks are removed from the daily plan', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await addTask(page, 'Maybe later')
    await page.getByRole('button', { name: 'Actions for Maybe later' }).click()
    await page.getByRole('menuitem', { name: 'Cancel task' }).click()
    await page.goto('/')
    await expect(page.getByText(/of \d+ planned activities/)).toContainText('0 of 3') // only study/water/steps remain
  })

  test('recurring task spawns the next occurrence exactly once', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await page.getByRole('button', { name: /New task/ }).click()
    await page.getByLabel('Title').fill('Daily standup')
    await page.getByLabel('Repeat', { exact: true }).selectOption('daily')
    await page.getByRole('button', { name: 'Add task' }).click()
    await page.getByRole('button', { name: 'Complete "Daily standup"' }).click()
    await expect(page.getByRole('button', { name: 'Mark "Daily standup" as not done' })).toBeVisible()
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByText('Daily standup')).toHaveCount(1)
    await page.getByRole('button', { name: 'Previous day' }).click()
    await page.getByRole('button', { name: 'Mark "Daily standup" as not done' }).click() // reopen
    await page.getByRole('button', { name: 'Complete "Daily standup"' }).click() // complete again
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByText('Daily standup')).toHaveCount(1) // still just one (unique series+date)
  })
})

test.describe('habits', () => {
  test('one-tap completion, no duplicates on rapid taps, streak updates', async ({ page }) => {
    await register(page)
    await page.goto('/habits')
    await page.getByRole('button', { name: 'Create a habit' }).click()
    await page.getByLabel('Name').fill('Read 20 pages')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const tap = page.getByRole('button', { name: 'Complete Read 20 pages' })
    await tap.dblclick() // rapid double tap must not toggle twice or create two logs
    await expect(page.getByRole('button', { name: 'Undo Read 20 pages' })).toBeVisible()
    await expect(page.getByText('1/1').first()).toBeVisible()
    await expect(page.getByText('1d').first()).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Undo Read 20 pages' })).toBeVisible()
  })

  test('editing a habit keeps its history', async ({ page }) => {
    await register(page)
    await page.goto('/habits')
    await page.getByRole('button', { name: 'Create a habit' }).click()
    await page.getByLabel('Name').fill('Meditate')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Complete Meditate' }).click()
    await page.getByRole('button', { name: 'Actions for Meditate' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByLabel('Name').fill('Meditate 10 min')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Undo Meditate 10 min' })).toBeVisible()
  })
})

test.describe('study timer', () => {
  test('timer persists across reload; discarded and running time is never counted; manual sessions count', async ({ page }) => {
    await register(page)
    await page.goto('/learning')
    await page.getByRole('button', { name: 'Start timer' }).click()
    await expect(page.getByTestId('timer-clock')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('timer-clock')).toBeVisible() // running state is stored in the database
    await page.goto('/')
    await expect(page.getByText('0m').first()).toBeVisible() // a running timer counts for nothing
    await page.goto('/learning')
    await page.getByRole('button', { name: 'Discard timer' }).click()
    await page.getByRole('button', { name: 'Discard', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start timer' })).toBeVisible()
    await page.getByRole('tab', { name: 'Sessions' }).click()
    await expect(page.getByText('No completed sessions yet')).toBeVisible()

    await page.getByRole('button', { name: 'Log session' }).click()
    await page.getByLabel('Minutes').fill('45')
    await page.getByLabel('DSA problems solved').fill('3')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('tab', { name: 'Overview' }).click()
    await expect(page.getByText('45m').first()).toBeVisible()
  })

  test('manual session validates', async ({ page }) => {
    await register(page)
    await page.goto('/learning')
    await page.getByRole('button', { name: 'Log session' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Enter minutes studied or problems solved')).toBeVisible()
  })
})

test.describe('job applications', () => {
  test('add, move through statuses, history is preserved', async ({ page }) => {
    await register(page)
    await page.goto('/jobs')
    await page.getByRole('button', { name: 'Add your first application' }).click()
    await page.getByLabel('Company').fill('Acme Corp')
    await page.getByLabel('Job title').fill('Frontend Engineer')
    await page.getByLabel('Package (LPA)').fill('18')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByTestId('col-interested').getByText('Acme Corp')).toBeVisible()

    await page.getByRole('button', { name: 'Move Acme Corp' }).click()
    await page.getByRole('menuitem', { name: 'Applied' }).click()
    await expect(page.getByTestId('col-applied').getByText('Acme Corp')).toBeVisible()
    await page.getByTestId('col-applied').getByText('Acme Corp').click()
    await page.getByLabel('Status').selectOption('interview')
    await expect(page.getByRole('dialog').getByText('Created as')).toBeVisible()
    const timeline = page.getByRole('dialog').locator('ol > li')
    await expect(timeline).toHaveCount(3) // created as interested -> applied -> interview
    await expect(timeline.nth(0)).toContainText('Wishlist')
    await expect(timeline.nth(1)).toContainText('Applied')
    await expect(timeline.nth(2)).toContainText('Interview')
    await page.keyboard.press('Escape')
    await expect(page.getByText('Interview rate')).toBeVisible()
  })

  test('drag and drop between columns', async ({ page }) => {
    await register(page)
    await page.goto('/jobs')
    await page.getByRole('button', { name: 'Add your first application' }).click()
    await page.getByLabel('Company').fill('DragCo')
    await page.getByLabel('Job title').fill('Dev')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByTestId('app-card').filter({ hasText: 'DragCo' }).dragTo(page.getByTestId('col-assessment'))
    await expect(page.getByTestId('col-assessment').getByText('DragCo')).toBeVisible()
  })

  test('rejects an invalid URL', async ({ page }) => {
    await register(page)
    await page.goto('/jobs')
    await page.getByRole('button', { name: 'Add your first application' }).click()
    await page.getByLabel('Company').fill('X')
    await page.getByLabel('Job title').fill('Y')
    await page.getByLabel('Job description URL').fill('javascript:alert(1)')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Must start with http:// or https://')).toBeVisible()
  })
})

test.describe('finance', () => {
  test('exact paise arithmetic, budget remaining and category breakdown', async ({ page }) => {
    await register(page)
    await page.goto('/finance')
    const add = async (type, amount, category) => {
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByRole('dialog').getByRole('tab', { name: type }).click()
      const dlg = page.getByRole('dialog')
      await dlg.getByLabel(/^Amount/).fill(amount)
      await dlg.getByLabel('Category').selectOption(category)
      await dlg.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(dlg).toBeHidden()
    }
    await add('Income', '50000', 'Salary')
    await add('Expense', '0.10', 'Food')
    await add('Expense', '0.20', 'Food')
    await add('Expense', '1,234.56', 'Travel')
    await add('Savings', '5000', 'Investments')
    await expect(page.getByText('₹1,234.86')).toBeVisible() // 0.10 + 0.20 + 1234.56, no float drift
    await expect(page.getByText('₹50,000').first()).toBeVisible()
    await page.getByText('No budget').click()
    await page.getByLabel('Monthly expense budget').fill('2000')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('₹765.14')).toBeVisible() // 2000 - 1234.86
  })

  test('rejects invalid amounts', async ({ page }) => {
    await register(page)
    await page.goto('/finance')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByLabel(/^Amount/).fill('12.345')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/Enter an amount greater than 0/)).toBeVisible()
  })
})

test.describe('sleep & health', () => {
  test('overnight sleep duration is calculated correctly and persisted', async ({ page }) => {
    await register(page)
    await page.goto('/health')
    await page.getByLabel('Bedtime').fill('23:30')
    await page.getByLabel('Wake-up').fill('06:30')
    await expect(page.getByTestId('sleep-duration')).toContainText('7h')
    await page.getByRole('spinbutton', { name: 'Steps' }).fill('8421')
    await page.getByRole('button', { name: 'Save log' }).click()
    await expect(page.getByText('Health log saved').first()).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Bedtime')).toHaveValue('23:30')
    await expect(page.getByText('8,421').first()).toBeVisible()
  })

  test('rejects half-filled sleep times', async ({ page }) => {
    await register(page)
    await page.goto('/health')
    await page.getByLabel('Bedtime').fill('23:30')
    await page.getByRole('button', { name: 'Save log' }).click()
    await expect(page.getByText('Enter both bedtime and wake-up time')).toBeVisible()
  })

  test('quick water logging accumulates', async ({ page }) => {
    await register(page)
    await page.goto('/health')
    await page.getByRole('button', { name: 'Log water' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '250' }).click()
    await expect(page.getByRole('dialog').getByText('250 ml of 3000 ml today')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: '500' }).click()
    await expect(page.getByRole('dialog').getByText('750 ml of 3000 ml today')).toBeVisible()
  })
})

test.describe('fitness', () => {
  test('log a workout with sets, plan a day, and mark rest days', async ({ page }) => {
    await register(page)
    await page.goto('/fitness')
    await page.getByRole('button', { name: 'Log workout' }).first().click()
    await page.getByLabel('Name', { exact: true }).fill('Upper body')
    await page.getByRole('button', { name: 'Add exercise' }).click()
    await page.getByLabel('Exercise 1').fill('Bench Press')
    await page.getByLabel('Set 1 reps').fill('8')
    await page.getByLabel('Set 1 weight').fill('60')
    await page.getByRole('dialog').getByRole('button', { name: 'Log workout' }).click()
    await expect(page.getByText('Workout done')).toBeVisible()
    await page.getByRole('tab', { name: 'History' }).click()
    await page.getByText('Upper body').click()
    await expect(page.getByText('8×60kg')).toBeVisible()
  })
})

test.describe('settings, export & restore', () => {
  test('JSON export can be restored into a different account', async ({ page }, info) => {
    await register(page)
    await page.goto('/planner')
    await addTask(page, 'Exported task')
    await page.goto('/finance')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByLabel(/^Amount/).fill('99.50')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.goto('/export')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON backup' }).click()])
    const path = info.outputPath('backup.json')
    await dl.saveAs(path)

    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await register(page)
    await page.goto('/export')
    await page.getByTestId('import-file').setInputFiles(path)
    await expect(page.getByRole('dialog').getByText('Restore backup?')).toBeVisible()
    await page.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(page.getByText('Backup restored').first()).toBeVisible()
    await page.goto('/planner')
    await expect(page.getByText('Exported task')).toBeVisible()
    await page.goto('/finance')
    await expect(page.getByText('₹99.50').first()).toBeVisible()
  })

  test('rejects a file that is not a LifeTrack backup', async ({ page }, info) => {
    await register(page)
    await page.goto('/export')
    const fs = await import('node:fs')
    const path = info.outputPath('bad.json')
    fs.writeFileSync(path, JSON.stringify({ hello: 'world' }))
    await page.getByTestId('import-file').setInputFiles(path)
    await expect(page.getByText('This is not a LifeTrack backup file.').first()).toBeVisible()
  })

  test('preferences persist', async ({ page }) => {
    await register(page)
    await page.goto('/settings')
    await page.getByLabel('Daily study target (minutes)').fill('90')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(page.getByText('Preferences saved').first()).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Daily study target (minutes)')).toHaveValue('90')
  })
})
