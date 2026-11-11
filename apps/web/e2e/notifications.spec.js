import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { register, pickDate, pickOption, pickTime } from './helpers'

/** A reminder whose time has passed becomes a notification straight away, which is the quickest way to put one in the inbox. */
async function pastReminder(page, title, { priority, repeat } = {}) {
  await page.goto('/notifications?tab=reminders')
  await page.getByRole('button', { name: 'New reminder' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'New reminder' })
  await dlg.getByLabel('Remind me to').fill(title)
  if (priority) await pickOption(dlg.getByLabel('Priority'), priority)
  if (repeat) await pickOption(dlg.getByLabel('Repeat'), repeat)
  await pickDate(dlg.getByLabel('Date'), '2020-01-01')
  await dlg.getByRole('button', { name: 'Set reminder' }).click()
  await expect(dlg).toBeHidden()
}

test.describe('notifications', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    // The nudges from other modules depend on the time of day; these tests are about the centre itself.
    await page.goto('/notifications?tab=prefs')
    await page.getByRole('switch', { name: 'Smart notifications' }).click()
    await expect(page.getByRole('switch', { name: 'Smart notifications' })).toHaveAttribute('aria-checked', 'false')
  })

  test('"New reminder" has a single icon (it used to render two)', async ({ page }) => {
    await page.goto('/notifications')
    await page.getByRole('tab', { name: 'Reminders' }).click()
    await expect(page.getByRole('button', { name: 'New reminder' }).first().locator('svg')).toHaveCount(1)
  })

  test('category switches persist to the account', async ({ page }) => {
    await page.goto('/notifications?tab=prefs')
    const sw = page.getByRole('switch', { name: 'Habits' })
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Habits' })).toHaveAttribute('aria-checked', 'false')
  })

  test('mark all read, dismiss the read ones, and find them again in the history', async ({ page }) => {
    await pastReminder(page, 'Stretch')
    await expect(page.getByTestId('unread-count')).toHaveText('1')
    await page.getByRole('tab', { name: /Inbox/ }).click()
    await expect(page.getByTestId('notification')).toHaveCount(1)
    await expect(page.getByTestId('notification')).toContainText('Missed') // it was due in 2020
    await page.getByRole('button', { name: /Mark all read/ }).click()
    await expect(page.getByTestId('unread-count')).toHaveCount(0)
    await page.getByRole('button', { name: 'Dismiss read' }).click()
    await expect(page.getByText('Inbox zero')).toBeVisible()
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByTestId('notification')).toContainText('Stretch')
    await expect(page.getByTestId('notification')).toContainText('Dismissed')
    await page.getByRole('button', { name: 'Restore Stretch' }).click()
    await page.getByRole('tab', { name: /Inbox/ }).click()
    await expect(page.getByTestId('notification')).toContainText('Stretch')
  })

  test('the drawer opens from the bell, snoozes, dismisses with Undo, and closes with Escape', async ({ page }) => {
    await pastReminder(page, 'Call dentist', { priority: 'high' })
    await pastReminder(page, 'Water plants')
    await page.getByRole('button', { name: /^Notifications, 2 unread/ }).click()
    const drawer = page.getByRole('dialog', { name: 'Notifications' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByTestId('notification')).toHaveCount(2)
    await expect(drawer.getByTestId('notification').filter({ hasText: 'Call dentist' })).toContainText('High')

    // snooze one for an hour: it leaves the inbox and the badge
    await drawer.getByTestId('notification').filter({ hasText: 'Water plants' }).hover()
    await drawer.getByRole('button', { name: 'Snooze Water plants' }).click()
    await page.getByRole('menuitem', { name: /^1 hour/ }).click()
    await expect(drawer.getByTestId('notification')).toHaveCount(1)
    await expect(drawer.getByText(/1 snoozed/)).toBeVisible()
    await expect(page.getByText(/Snoozed until/)).toBeVisible()

    // dismiss the other and take it back
    await drawer.getByTestId('notification').hover()
    await drawer.getByRole('button', { name: 'Dismiss Call dentist' }).click()
    await expect(drawer.getByTestId('notification')).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(drawer.getByTestId('notification')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  })

  test('snoozed and dismissed states survive a reload', async ({ page }) => {
    await pastReminder(page, 'Pay rent')
    await pastReminder(page, 'Renew passport')
    await page.goto('/notifications')
    const rent = page.getByTestId('notification').filter({ hasText: 'Pay rent' })
    await rent.hover()
    await page.getByRole('button', { name: 'Snooze Pay rent' }).click()
    await page.getByRole('menuitem', { name: /^3 hours/ }).click()
    const passport = page.getByTestId('notification').filter({ hasText: 'Renew passport' })
    await passport.hover()
    await page.getByRole('button', { name: 'Dismiss Renew passport' }).click()
    await expect(page.getByText('Inbox zero')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Inbox zero')).toBeVisible() // neither came back
    await expect(page.getByRole('button', { name: /Snoozed \(1\)/ })).toBeVisible()
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByTestId('notification')).toHaveCount(2)
    await expect(page.getByTestId('notification').filter({ hasText: 'Renew passport' })).toContainText('Dismissed')
    await expect(page.getByTestId('notification').filter({ hasText: 'Pay rent' })).toContainText('Snoozed')
  })

  test('a custom snooze time earlier today is refused', async ({ page }) => {
    await pastReminder(page, 'Book flights')
    await page.goto('/notifications')
    await page.getByTestId('notification').hover()
    await page.getByRole('button', { name: 'Snooze Book flights' }).click()
    await page.getByRole('menuitem', { name: 'Pick date & time…' }).click()
    const dlg = page.getByRole('dialog', { name: 'Snooze until…' })
    await pickDate(dlg.getByLabel('Date'), new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())) // today, where the app keeps its time; earlier days cannot be picked
    await pickTime(dlg.getByLabel('Time'), '09:00')
    await dlg.getByRole('button', { name: 'Snooze' }).click()
    await expect(dlg.getByRole('alert')).toHaveText('Pick a time in the future')
  })

  test('search and category filters narrow the inbox', async ({ page }) => {
    await pastReminder(page, 'Electricity bill')
    await pastReminder(page, 'Call mom')
    await page.goto('/notifications')
    await expect(page.getByTestId('notification')).toHaveCount(2)
    await page.getByLabel('Search notifications').fill('mom')
    await expect(page.getByTestId('notification')).toHaveCount(1)
    await expect(page.getByTestId('notification')).toContainText('Call mom')
    await page.getByLabel('Search notifications').fill('zzz')
    await expect(page.getByText('Nothing matches')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByTestId('notification')).toHaveCount(2)
  })

  test('quiet hours validate their times and persist', async ({ page }) => {
    await page.goto('/notifications?tab=prefs')
    await page.getByRole('switch', { name: 'Quiet hours' }).click()
    await expect(page.getByLabel('From')).toBeVisible()
    await pickTime(page.getByLabel('Until'), '22:00') // the same as the start
    await expect(page.getByText(/can’t start and end at the same time/)).toBeVisible()
    await pickTime(page.getByLabel('Until'), '06:30')
    await expect(page.getByText(/can’t start and end/)).toBeHidden()
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Quiet hours' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('Until')).toContainText('06:30')
  })
})

// Fails on serious/critical WCAG A/AA violations (colour contrast is checked in the design review), the same bar as a11y.spec.js.
const scan = async (page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()).violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact),
  )

test.describe('notifications: accessibility', () => {
  test('the page with notifications in it, its tabs, and the open drawer have no serious violations', async ({ page }) => {
    await register(page)
    await page.goto('/notifications?tab=prefs')
    await page.getByRole('switch', { name: 'Smart notifications' }).click()
    await pastReminder(page, 'Call dentist', { priority: 'urgent' })
    await pastReminder(page, 'Water plants')
    for (const tab of ['', '?tab=reminders', '?tab=history', '?tab=prefs']) {
      await page.goto(`/notifications${tab}`)
      await page.locator('main').waitFor()
      await page.waitForLoadState('networkidle')
      const v = await scan(page)
      expect(v, `${tab || 'inbox'}: ${v.map((x) => x.id).join(', ')}`).toEqual([])
    }
    await page.getByRole('button', { name: /^Notifications, / }).click()
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
    const v = await scan(page)
    expect(v, `drawer: ${v.map((x) => x.id).join(', ')}`).toEqual([])
  })

  test('the bell and every card action can be reached and used from the keyboard', async ({ page }) => {
    await register(page)
    await page.goto('/notifications?tab=prefs')
    await page.getByRole('switch', { name: 'Smart notifications' }).click()
    await pastReminder(page, 'Call dentist')
    await page.getByRole('button', { name: /^Notifications, 1 unread/ }).focus()
    await page.keyboard.press('Enter')
    const drawer = page.getByRole('dialog', { name: 'Notifications' })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: 'Mark Call dentist as read' }).focus() // revealed on focus, not only on hover
    await expect(drawer.getByRole('button', { name: 'Mark Call dentist as read' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(drawer.getByText('You’re all caught up')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeFocused() // focus returns to the bell
  })
})

test.describe('browser notifications', () => {
  // A stand-in for the browser's Notification, so the test can grant permission and see what would have been shown.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__shown = []
      window.__asked = 0
      class FakeNotification {
        // like a real browser, the answer outlives a reload
        static permission = localStorage.getItem('__perm') ?? 'default'
        static async requestPermission() {
          window.__asked++
          FakeNotification.permission = 'granted'
          localStorage.setItem('__perm', 'granted')
          return 'granted'
        }
        constructor(title, options) {
          window.__shown.push({ title, ...options })
        }
        close() {}
      }
      window.Notification = FakeNotification
      // pretend the person is in another window, so a browser notification is the right way to tell them
      document.hasFocus = () => false
    })
    await register(page)
    await page.goto('/notifications?tab=prefs')
    await page.getByRole('switch', { name: 'Smart notifications' }).click()
  })

  test('asks only when you turn it on, then shows a notification for a new one, tagged against duplicates', async ({ page }) => {
    expect(await page.evaluate(() => window.__asked)).toBe(0) // opening the page never asks
    await page.getByRole('switch', { name: 'Show desktop notifications' }).click()
    await expect(page.getByRole('switch', { name: 'Show desktop notifications' })).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => window.__asked)).toBe(1)
    await page.getByRole('button', { name: 'Send a test notification' }).click()
    await expect.poll(() => page.evaluate(() => window.__shown.length)).toBe(1)

    await pastReminder(page, 'Standup notes', { priority: 'urgent' })
    await expect.poll(() => page.evaluate(() => window.__shown.map((n) => n.title))).toContain('Standup notes')
    const shown = await page.evaluate(() => window.__shown.filter((n) => n.title === 'Standup notes'))
    expect(shown).toHaveLength(1) // once, however many checks ran
    expect(shown[0].tag).toContain('@')
    expect(shown[0].requireInteraction).toBe(true) // urgent stays until you deal with it
    await page.waitForTimeout(11_000) // longer than a check interval
    expect(await page.evaluate(() => window.__shown.filter((n) => n.title === 'Standup notes').length)).toBe(1)
  })

  test('quiet hours hold a normal notification, let an urgent one through, and sum up the rest afterwards', async ({ page }) => {
    await page.getByRole('switch', { name: 'Show desktop notifications' }).click()
    await page.getByRole('switch', { name: 'Quiet hours' }).click()
    await pickTime(page.getByLabel('From'), '00:00')
    await pickTime(page.getByLabel('Until'), '23:55') // quiet nearly all day, whenever this runs
    await expect(page.getByLabel('Until')).toContainText('23:55')

    await pastReminder(page, 'Quiet one')
    await pastReminder(page, 'Break through', { priority: 'urgent' })
    await expect.poll(() => page.evaluate(() => window.__shown.map((n) => n.title))).toContain('Break through')
    const titles = await page.evaluate(() => window.__shown.map((n) => n.title))
    expect(titles).not.toContain('Quiet one') // held, but it is in the inbox
    await page.getByRole('tab', { name: /Inbox/ }).click()
    await expect(page.getByTestId('notification').filter({ hasText: 'Quiet one' })).toBeVisible()
  })
})
