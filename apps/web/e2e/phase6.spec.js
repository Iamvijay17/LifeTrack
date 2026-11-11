import { test, expect } from '@playwright/test'
import { register, addTask, pickOption, pickDate } from './helpers'

test.describe('navigation, search, dashboard', () => {
  test('sidebar is grouped and every page loads without errors', async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await register(page)
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const g of ['Overview', 'Productivity', 'Growth', 'Wellness', 'Money', 'Insights', 'System'])
      await expect(nav.getByText(g, { exact: true })).toBeVisible()
    for (const [path, heading] of [
      ['/focus', 'Focus Mode'],
      ['/notes', 'Notes & Journal'],
      ['/goals', 'Goals & Milestones'],
      ['/reports', 'Reports'],
      ['/notifications', 'Notifications'],
      ['/export', 'Data Export'],
      ['/analytics', 'Analytics'],
      ['/settings', 'Settings'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test('global search finds tasks and pages; Ctrl+K opens it', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await addTask(page, 'Prepare quarterly review')
    await page.keyboard.press('Control+k')
    await page.getByLabel('Search everything').fill('quarterly')
    await expect(page.getByRole('option', { name: /Prepare quarterly review/ })).toBeVisible()
    await page.getByLabel('Search everything').fill('goals')
    await page.getByRole('option', { name: /Goals & Milestones/ }).click()
    await expect(page).toHaveURL(/\/goals$/)
  })

  test('Today lists the day in one place and tasks can be ticked from it', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await addTask(page, 'Call the bank')
    await page.goto('/')
    const today = page.getByRole('list', { name: 'Anytime today' })
    await expect(today.getByText('Call the bank')).toBeVisible()
    await page.getByRole('button', { name: 'Complete Call the bank' }).first().click()
    await expect(page.getByRole('list', { name: 'Done today' }).getByText('Call the bank')).toBeVisible()
    await expect(page.getByText('1 of 1 done')).toBeVisible()
    await page.getByRole('button', { name: 'Mark not done Call the bank' }).click()
    await expect(today.getByText('Call the bank')).toBeVisible()
  })

  test('daily score reflects real data, explains itself, and widgets can be hidden', async ({ page }) => {
    await register(page)
    await expect(page.getByTestId('getting-started')).toBeVisible() // a new account sees the guide, not rows of zeros
    await expect(page.getByTestId('score-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'Dismiss the getting started guide' }).click()
    await expect(page.getByTestId('score-value')).toHaveText('—') // nothing planned or logged yet: no score rather than a zero
    await page.goto('/planner')
    await addTask(page, 'Apply to 3 companies')
    await page.getByRole('button', { name: 'Actions for Apply to 3 companies' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await pickOption(page.getByLabel('Category'), 'Job Search')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.getByRole('button', { name: 'Complete "Apply to 3 companies"' }).click()
    await page.goto('/')
    await expect(page.getByTestId('score-value')).toHaveText('100') // only Career applies: the study target waits until you study
    await page.getByRole('button', { name: 'How is this calculated?' }).click()
    await expect(page.getByText(/Career 100\.0 = 100/)).toBeVisible() // the 7-day Life Score: points per category
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Today' }).click()
    await page.getByRole('button', { name: 'How is this calculated?' }).click()
    await expect(page.getByText(/Career 100% × 100%/)).toBeVisible() // today's score: fraction × weight
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Customize' }).click()
    await page.getByRole('switch', { name: 'Life Score', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('score-card')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('score-card')).toHaveCount(0) // persisted to the account
  })
})

test.describe('notes', () => {
  test('create with markdown + tags, search, pin, delete', async ({ page }) => {
    await register(page)
    await page.goto('/notes')
    await page.getByRole('button', { name: 'New note' }).first().click()
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.getByText('Write a title or some content')).toBeVisible()
    await page.getByLabel('Title').fill('Sprint retro')
    await page.getByLabel('Content (Markdown)').fill('# Wins\n- shipped **v1**')
    await page.getByLabel('Tags').fill('Work, retro')
    await page.getByRole('tab', { name: 'Preview' }).click()
    await expect(page.locator('strong', { hasText: 'v1' })).toBeVisible()
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.getByRole('heading', { name: 'Sprint retro' })).toBeVisible()
    await expect(page.getByRole('button', { name: '#retro' })).toBeVisible()
    await page.getByLabel('Search notes').fill('nothing-matches')
    await expect(page.getByText('No notes match your search.')).toBeVisible()
    await page.getByLabel('Search notes').fill('shipped')
    await page.getByRole('button', { name: 'Actions for Sprint retro' }).click()
    await page.getByRole('menuitem', { name: 'Pin' }).click()
    await expect(page.getByLabel('pinned')).toBeVisible()
    await page.getByRole('button', { name: 'Actions for Sprint retro' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Sprint retro')).toHaveCount(0)
  })

  test('daily journal saves and reloads', async ({ page }) => {
    await register(page)
    await page.goto('/notes')
    await page.getByRole('tab', { name: 'Daily journal' }).click()
    await page.getByLabel('Reflection').fill('Productive day')
    await page.getByRole('button', { name: 'Save entry' }).click()
    await expect(page.locator('#main').getByText('Saved', { exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: 'Daily journal' }).click()
    await expect(page.getByLabel('Reflection')).toHaveValue('Productive day')
  })
})

test.describe('goals', () => {
  test('milestones drive progress; complete and reopen', async ({ page }) => {
    await register(page)
    await page.goto('/goals')
    await page.getByRole('button', { name: 'New goal' }).first().click()
    await page.getByRole('button', { name: 'Create goal' }).click()
    await expect(page.getByText('Name the goal')).toBeVisible()
    await page.getByLabel('Goal', { exact: true }).fill('Launch portfolio')
    await pickDate(page.getByLabel('Start date'), '2026-12-10')
    await pickDate(page.getByLabel('Target date'), '2026-12-01')
    await page.getByRole('button', { name: 'Create goal' }).click()
    await expect(page.getByText('Target date must be on or after the start date')).toBeVisible()
    await pickDate(page.getByLabel('Target date'), '2026-12-31')
    await page.getByRole('button', { name: 'Create goal' }).click()
    const card = page.getByTestId('goal-card').filter({ hasText: 'Launch portfolio' })
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /Milestones/ }).click()
    for (const m of ['Design', 'Build']) {
      await card.getByLabel('New milestone').fill(m)
      await card.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(card.getByText(m, { exact: true })).toBeVisible()
    }
    await card.getByRole('button', { name: 'Mark done: Design' }).click()
    await expect(card.getByText('50%')).toBeVisible()
    await card.getByRole('button', { name: 'Actions for Launch portfolio' }).click()
    await page.getByRole('menuitem', { name: 'Mark completed' }).click()
    await expect(page.getByTestId('goal-card')).toHaveCount(0)
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByTestId('goal-card').filter({ hasText: 'Launch portfolio' }).getByText('100%')).toBeVisible()
  })
})

test.describe('reminders & notifications', () => {
  test('a due reminder becomes one notification, can be read, and respects preferences', async ({ page }) => {
    await register(page)
    await page.goto('/notifications')
    await page.getByRole('tab', { name: 'Reminders' }).click()
    await page.getByRole('button', { name: 'New reminder' }).first().click()
    await page.getByLabel('Remind me to').fill('Pay electricity bill')
    await pickOption(page.getByLabel('Type'), 'bill')
    await pickDate(page.getByLabel('Date'), '2020-01-01') // already due
    await page.getByRole('button', { name: 'Set reminder' }).click()
    await expect(page.getByTestId('unread-count')).toHaveText('1')
    await page.getByRole('tab', { name: /Inbox/ }).click()
    await expect(page.getByTestId('notification').filter({ hasText: 'Pay electricity bill' })).toHaveCount(1) // (the toast that announced it says the same words)
    await page.reload() // must not fire again
    await expect(page.getByTestId('unread-count')).toHaveText('1')
    await page.getByTestId('notification').hover()
    await page.getByRole('button', { name: 'Mark Pay electricity bill as read' }).click()
    await expect(page.getByTestId('unread-count')).toHaveCount(0)
    // silence bill reminders, add another, expect no new notification
    await page.getByRole('tab', { name: 'Preferences' }).click()
    await page.getByRole('switch', { name: 'Finance' }).click() // bills are the Finance category
    await page.getByRole('tab', { name: 'Reminders' }).click()
    await page.getByRole('button', { name: 'New reminder' }).first().click()
    await page.getByLabel('Remind me to').fill('Pay water bill')
    await pickOption(page.getByLabel('Type'), 'bill')
    await pickDate(page.getByLabel('Date'), '2020-01-02')
    await page.getByRole('button', { name: 'Set reminder' }).click()
    await expect(page.getByText('Pay water bill')).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByTestId('unread-count')).toHaveCount(0)
  })
})

test.describe('focus mode', () => {
  test('runs a timer, stops early and records the session', async ({ page }) => {
    await register(page)
    await page.goto('/focus')
    await expect(page.getByRole('timer')).toHaveAccessibleName('25:00 remaining')
    await page.getByRole('tab', { name: 'Custom' }).click()
    await page.getByLabel('Minutes').fill('0')
    await expect(page.getByRole('button', { name: /Start focus/ })).toBeDisabled()
    await page.getByLabel('Minutes').fill('30')
    await page.getByLabel('Note (optional)').fill('Deep work')
    await page.getByRole('button', { name: /Start focus/ }).click()
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.getByRole('button', { name: 'Resume' }).click()
    await page.reload() // the running timer survives a reload
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await page.getByRole('button', { name: /Stop & save/ }).click()
    await expect(page.getByText('Stopped and saved').first()).toBeVisible()
  })

  test('manual record of a completed block shows in the totals', async ({ page }) => {
    await register(page)
    await page.goto('/focus')
    await page.evaluate(() => {
      // the running timer is stored per account
      const userId = JSON.parse(localStorage.getItem('lifetrack-dev:session')).userId
      localStorage.setItem(
        `lifetrack:focus-timer:${userId}`,
        JSON.stringify({
          mode: 'focus',
          plannedMinutes: 25,
          endsAt: Date.now() + 1500,
          pausedLeft: null,
          taskId: null,
          topicId: null,
          label: 'Reading',
          startedAt: Date.now() - 1500000,
        }),
      )
    })
    await page.reload()
    await expect(page.getByText('Focus session complete')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('1 completed block')).toBeVisible()
    await expect(page.getByText(/25 of 25 min/)).toBeVisible()
  })
})

test.describe('finance additions', () => {
  test('payment method filter and savings goals', async ({ page }) => {
    await register(page)
    await page.goto('/finance')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByLabel(/Amount/).fill('250')
    await pickOption(page.getByRole('dialog').getByLabel('Payment method'), 'Cash')
    await page.getByLabel('Note').fill('Lunch')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByLabel(/Amount/).fill('900')
    await pickOption(page.getByRole('dialog').getByLabel('Payment method'), 'UPI')
    await page.getByLabel('Note').fill('Groceries')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0) // the form animates out; until then the page's filter has a namesake in it
    await pickOption(page.getByLabel('Payment method'), 'Cash')
    await expect(page.getByText('Lunch')).toBeVisible()
    await expect(page.getByText('Groceries')).toHaveCount(0)
    await page.getByRole('button', { name: 'Create a savings goal' }).click()
    await page.getByLabel('What are you saving for?').fill('Laptop')
    await page.getByLabel('Target amount').fill('50000')
    await page.getByRole('button', { name: 'Save' }).click()
    const g = page.getByTestId('savings-goal')
    await expect(g.getByText('0%')).toBeVisible()
    await g.getByRole('button', { name: 'Actions for Laptop' }).click()
    await page.getByRole('menuitem', { name: 'Add funds' }).click()
    await page.getByLabel('Amount').fill('10000')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(g.getByText('20%')).toBeVisible()
  })
})

test.describe('jobs & export', () => {
  test('Wishlist and Offer columns exist', async ({ page }) => {
    await register(page)
    await page.goto('/jobs')
    await page.getByRole('button', { name: 'Add your first application' }).click()
    await expect(page.getByLabel('Status')).toContainText('Wishlist')
    await page.getByLabel('Status').click()
    await expect(page.getByRole('option', { name: 'Offer' })).toBeVisible()
  })

  test('CSV export for a module, and typed-confirmation erase', async ({ page }) => {
    await register(page)
    await page.goto('/planner')
    await addTask(page, 'Export me')
    await page.goto('/export')
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Tasks', exact: true }).click()
    expect((await dl).suggestedFilename()).toBe('lifetrack-tasks.csv')
    await page.getByRole('button', { name: /Erase all data…/ }).click()
    await expect(page.getByRole('button', { name: 'Erase everything' })).toBeDisabled()
    await page.getByLabel('Type ERASE to confirm').fill('ERASE')
    await page.getByRole('button', { name: 'Erase everything' }).click()
    await expect(page.getByText(/All your data was erased/)).toBeVisible()
    await page.goto('/planner')
    await expect(page.getByText('Export me')).toHaveCount(0)
  })
})

test.describe('reports', () => {
  test('shows real numbers and exports CSV', async ({ page }) => {
    await register(page)
    await page.goto('/reports')
    await expect(page.getByText('No scored days in this range yet.')).toBeVisible()
    await page.goto('/planner')
    await addTask(page, 'Report task')
    await page.goto('/reports')
    await expect(page.getByText('Daily activity summary')).toBeVisible()
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'CSV' }).click()
    expect((await dl).suggestedFilename()).toMatch(/^lifetrack-report-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
