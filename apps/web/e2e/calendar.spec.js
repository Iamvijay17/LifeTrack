import { test, expect } from '@playwright/test'
import { pickOption, register } from './helpers'

// The calendar in a real browser with real pointer input. The drags below use the mouse exactly as a person would, then reload the page:
// what is checked is what came back from storage, not what was on screen a moment before.

const HOUR = 56 // px per hour in the grid (HOUR_PX)

/** Creates an event today from 'start' to 'end' (HH:mm) through the form. */
async function addEvent(page, title, { start = '10:00', end = '11:00', repeat } = {}) {
  await page.getByRole('button', { name: /^New/ }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Title').fill(title)
  await pickOption(dlg.getByLabel('Start time'), start)
  await pickOption(dlg.getByLabel('End time'), end)
  if (repeat) await pickOption(dlg.getByLabel('Repeat'), repeat)
  await dlg.getByRole('button', { name: 'Add event' }).click()
  await expect(dlg).toHaveCount(0)
}

/** The date of every visible day column, and which one is today. */
async function columns(page) {
  const cols = page.locator('[data-testid^="day-"]')
  const dates = await cols.evaluateAll((els) => els.map((e) => e.dataset.date))
  return { cols, dates }
}
const dayCol = (page, date) => page.getByTestId(`day-${date}`)
const todayDate = (page) => page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))

/** Scrolls the grid so the item sits in the middle of it. The mouse can only reach what is on screen, and the grid opens near the current time. */
const reveal = (loc) => loc.evaluate((el) => el.scrollIntoView({ block: 'center' }))

/** Moves the mouse from the middle of `from` to (x, y) in small steps, like a hand, and lets go. */
async function dragTo(page, from, x, y) {
  const b = await from.boundingBox()
  const sx = b.x + b.width / 2
  const sy = b.y + 12
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 3, sy + 3)
  await page.mouse.move((sx + x) / 2, (sy + y) / 2, { steps: 4 })
  await page.mouse.move(x, y, { steps: 6 })
  await page.mouse.up()
  return { sx, sy }
}

test.describe('calendar: drag, resize, persistence', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await page.goto('/calendar?view=week')
    await expect(page.getByTestId('calendar')).toBeVisible()
  })

  test('an event dragged to another day and time stays there after a reload', async ({ page }) => {
    await addEvent(page, 'Design review', { start: '10:00', end: '11:00' })
    const today = await todayDate(page)
    const { dates } = await columns(page)
    const target = dates[(dates.indexOf(today) + 1) % 7] // a different day of the same week
    const block = page.getByRole('button', { name: /Event: Design review/ })
    await expect(block).toBeVisible()
    await reveal(block)

    // Pick the block up, carry it to the next day a little lower, and read where the calendar says it will land BEFORE letting go.
    const bb = await block.boundingBox()
    const col = await dayCol(page, target).boundingBox()
    const sx = bb.x + bb.width / 2
    const sy = bb.y + 12
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(sx + 3, sy + 3)
    await page.mouse.move(col.x + col.width / 2, sy + 70, { steps: 10 })
    const shown = await dayCol(page, target).getByTestId('drop-preview').innerText() // e.g. "11:15 AM – 12:15 PM"
    expect(shown).toMatch(/^\d{1,2}:\d{2} [AP]M – \d{1,2}:\d{2} [AP]M$/)
    await page.mouse.up()

    await expect(dayCol(page, target).locator('[data-cal-item]')).toHaveCount(1)
    await expect(dayCol(page, today).getByRole('button', { name: /Design review/ })).toHaveCount(0)
    await page.reload()
    const moved = dayCol(page, target).getByRole('button', { name: /Event: Design review/ })
    await expect(moved).toBeVisible()
    expect(await moved.getAttribute('aria-label')).toContain(shown) // what was promised is what was saved, after a reload
    const [from, to] = shown.split(' – ')
    const mins = (t) => {
      const [h, m] = t.split(' ')[0].split(':').map(Number)
      return ((h % 12) + (t.endsWith('PM') ? 12 : 0)) * 60 + m
    }
    expect(mins(to) - mins(from)).toBe(60) // still an hour long
    expect(mins(from) % 15).toBe(0) // snapped to a quarter hour
  })

  test('dragging the bottom edge makes an event longer, and it persists', async ({ page }) => {
    await addEvent(page, 'Workshop', { start: '10:00', end: '11:00' })
    const block = page.getByRole('button', { name: /Event: Workshop, 10:00 AM – 11:00 AM/ })
    await expect(block).toBeVisible()
    await reveal(block)
    const b = await block.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 3) // on the bottom grip
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 10, { steps: 3 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 3 + HOUR, { steps: 6 }) // one hour lower
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /Event: Workshop, 10:00 AM – 12:00 PM/ })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: /Event: Workshop, 10:00 AM – 12:00 PM/ })).toBeVisible()
  })

  test('dragging the top edge moves the start, and the event never gets shorter than 15 minutes', async ({ page }) => {
    await addEvent(page, 'Short one', { start: '10:00', end: '11:00' })
    const block = page.getByRole('button', { name: /Event: Short one/ })
    await reveal(block)
    const b = await block.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + 14, { steps: 3 })
    await page.mouse.move(b.x + b.width / 2, b.y + HOUR * 3, { steps: 8 }) // dragged far past the bottom edge
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /Event: Short one, 10:45 AM – 11:00 AM/ })).toBeVisible()
  })

  test('a repeating event asks how far a drag reaches; "this event" moves one day only', async ({ page }) => {
    await addEvent(page, 'Daily standup', { start: '10:00', end: '10:30', repeat: 'daily' })
    const today = await todayDate(page)
    const { dates } = await columns(page)
    const idx = dates.indexOf(today)
    const later = dates.slice(idx) // today and the days after it carry the series
    test.skip(later.length < 3, 'needs at least three days of the series in view')
    const first = dayCol(page, later[0]).getByRole('button', { name: /Daily standup/ })
    await reveal(first)
    const bb = await first.boundingBox()
    const col = await dayCol(page, later[1]).boundingBox()
    await dragTo(page, first, col.x + col.width / 2, bb.y + 12 + 56)
    const prompt = page.getByRole('dialog', { name: 'Move repeating event' })
    await expect(prompt).toBeVisible()
    await prompt.getByRole('radio', { name: /This event/ }).click()
    await prompt.getByRole('button', { name: 'OK' }).click()
    await expect(prompt).toHaveCount(0)
    await expect(dayCol(page, later[0]).getByRole('button', { name: /Daily standup/ })).toHaveCount(0)
    await expect(dayCol(page, later[1]).getByRole('button', { name: /Daily standup/ })).toHaveCount(2) // its own, plus the moved one
    await expect(dayCol(page, later[2]).getByRole('button', { name: /Daily standup, 10:00 AM – 10:30 AM/ })).toHaveCount(1) // the rest untouched
    await page.reload()
    await expect(dayCol(page, later[1]).getByRole('button', { name: /Daily standup/ })).toHaveCount(2)
    await expect(dayCol(page, later[0]).getByRole('button', { name: /Daily standup/ })).toHaveCount(0)
  })

  test('Escape while dragging puts the event back', async ({ page }) => {
    await addEvent(page, 'Stay put', { start: '10:00', end: '11:00' })
    const block = page.getByRole('button', { name: /Event: Stay put/ })
    await reveal(block)
    const b = await block.boundingBox()
    await page.mouse.move(b.x + 20, b.y + 12)
    await page.mouse.down()
    await page.mouse.move(b.x + 40, b.y + 120, { steps: 5 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /Event: Stay put, 10:00 AM – 11:00 AM/ })).toBeVisible()
  })

  test('a task dragged from Unscheduled onto a day and time becomes scheduled, in the planner too', async ({ page }) => {
    await page.getByRole('button', { name: /^New/ }).first().click()
    let dlg = page.getByRole('dialog')
    await dlg.getByRole('tab', { name: 'Task' }).click()
    await dlg.getByLabel('Title').fill('Floating task')
    await dlg.getByLabel('Date').click()
    await page.getByRole('dialog', { name: 'Choose date' }).getByRole('button', { name: 'Clear' }).click()
    await dlg.getByRole('button', { name: 'Add task' }).click()
    await expect(dlg).toHaveCount(0)

    await page.getByTestId('tray-toggle').click()
    const chip = page.getByTestId('tray').getByText('Floating task')
    await expect(chip).toBeVisible()
    const today = await todayDate(page)
    const col = await dayCol(page, today).boundingBox()
    const scroller = await page.getByTestId('calendar-scroller').boundingBox()
    const c = await chip.boundingBox()
    await page.mouse.move(c.x + 20, c.y + c.height / 2)
    await page.mouse.down()
    await page.mouse.move(c.x + 40, c.y + c.height / 2 + 20, { steps: 3 })
    await page.mouse.move(col.x + col.width / 2, scroller.y + scroller.height / 2, { steps: 10 }) // the middle of the grid: no edge scrolling
    const shown = await dayCol(page, today).getByTestId('drop-preview').innerText()
    await page.mouse.up()

    await expect(dayCol(page, today).getByRole('button', { name: /Task: Floating task/ })).toBeVisible()
    await page.reload()
    const placed = dayCol(page, today).getByRole('button', { name: /Task: Floating task/ })
    await expect(placed).toBeVisible()
    expect(await placed.getAttribute('aria-label')).toContain(shown)
    await page.goto('/planner') // the very same task, now dated today
    await expect(page.getByText('Floating task')).toBeVisible()
  })

  test('month view: dragging a chip onto another date changes only the date', async ({ page }) => {
    await page.goto('/calendar?view=month')
    await page.getByRole('button', { name: /^New/ }).first().click()
    let dlg = page.getByRole('dialog')
    await dlg.getByRole('tab', { name: 'Task' }).click()
    await dlg.getByLabel('Title').fill('Pay rent')
    await dlg.getByRole('button', { name: 'Add task' }).click()
    await expect(dlg).toHaveCount(0)
    const today = await todayDate(page)
    const cells = await page.locator('[data-testid^="cell-"]').evaluateAll((els) => els.map((e) => e.dataset.date))
    const tomorrow = cells[cells.indexOf(today) + 1]
    const chip = page.getByTestId(`cell-${today}`).getByRole('button', { name: /Task: Pay rent/ })
    const target = await page.getByTestId(`cell-${tomorrow}`).boundingBox()
    await dragTo(page, chip, target.x + target.width / 2, target.y + target.height / 2)
    await expect(page.getByTestId(`cell-${tomorrow}`).getByRole('button', { name: /Task: Pay rent/ })).toBeVisible()
    await page.reload()
    await expect(page.getByTestId(`cell-${tomorrow}`).getByRole('button', { name: /Task: Pay rent/ })).toBeVisible()
    await expect(page.getByTestId(`cell-${today}`).getByRole('button', { name: /Task: Pay rent/ })).toHaveCount(0)
  })

  test('without a mouse: Alt + arrow keys move the focused item a day or 15 minutes', async ({ page }) => {
    await addEvent(page, 'Keyboard move', { start: '10:00', end: '11:00' })
    const block = page.getByRole('button', { name: /Event: Keyboard move/ })
    await block.focus()
    await page.keyboard.press('Alt+ArrowDown')
    await expect(page.getByRole('button', { name: /Event: Keyboard move, 10:15 AM – 11:15 AM/ })).toBeVisible()
    await page.getByRole('button', { name: /Event: Keyboard move/ }).focus()
    await page.keyboard.press('Shift+Alt+ArrowDown')
    await expect(page.getByRole('button', { name: /Event: Keyboard move, 10:15 AM – 11:30 AM/ })).toBeVisible()
  })

  test('overlapping events sit side by side instead of on top of each other', async ({ page }) => {
    await addEvent(page, 'First', { start: '10:00', end: '11:00' })
    await addEvent(page, 'Second', { start: '10:30', end: '11:30' })
    const a = await page.getByRole('button', { name: /Event: First/ }).boundingBox()
    const b = await page.getByRole('button', { name: /Event: Second/ }).boundingBox()
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1) // not overlapping horizontally
    expect(Math.abs(a.width - b.width)).toBeLessThan(2)
  })
})

test.describe('calendar: notifications and settings', () => {
  test('the browser is never asked for notification permission until you press the button', async ({ page }) => {
    await page.addInitScript(() => {
      window.__asked = 0
      const real = window.Notification
      window.Notification = Object.assign(function () {}, real, { requestPermission: () => (window.__asked++, Promise.resolve('default')) })
      Object.defineProperty(window.Notification, 'permission', { get: () => 'default' })
    })
    await register(page)
    await page.goto('/calendar?view=week')
    await addEvent(page, 'With alert')
    await page.getByTestId('settings-button').click()
    const dlg = page.getByRole('dialog', { name: 'Calendar settings' })
    await expect(dlg.getByTestId('browser-notify-status')).toContainText('Off')
    expect(await page.evaluate(() => window.__asked)).toBe(0) // opening the page, creating an event and opening settings asked nothing
    await dlg.getByRole('button', { name: 'Turn on browser notifications' }).click()
    expect(await page.evaluate(() => window.__asked)).toBe(1) // only the click did
  })

  test('the view, date and filters survive a reload', async ({ page }) => {
    await register(page)
    await page.goto('/calendar?view=month&date=2027-02-14')
    await expect(page.getByRole('button', { name: /February 2027/ })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('button', { name: /March 2027/ })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/view=month/)
    await expect(page.getByRole('button', { name: /March 2027/ })).toBeVisible()
  })
})
