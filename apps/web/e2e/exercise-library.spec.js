import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { register } from './helpers'

const openDatabase = async (page) => {
  await page.goto('/fitness')
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.getByRole('tab', { name: 'Exercise database' }).click()
  await expect(page.getByText('876 exercises')).toBeVisible()
}

test.describe('exercise library (Free Exercise DB)', () => {
  test('browse, search, filter, open an exercise with start/end images, add it to my exercises', async ({ page }) => {
    await register(page)
    await openDatabase(page)

    // Thumbnails really load from our own origin, in one frame shape.
    const first = page.getByRole('list', { name: 'Exercises' }).getByRole('img').first()
    await expect(first).toBeVisible()
    await expect.poll(() => first.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true)
    expect(await first.getAttribute('src')).toMatch(/^\/exercises\/.+\/0\.jpg$/)

    await page.getByRole('button', { name: /^Cardio/ }).click()
    await expect(page.getByTestId('result-count')).toHaveText('14 exercises')
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('treadmill')
    await expect(page.getByTestId('result-count')).toHaveText('3 exercises')
    await expect(page).toHaveURL(/cat=Cardio/)

    await page.getByRole('link', { name: /Running, Treadmill/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Running, Treadmill' })).toBeVisible()
    const start = page.getByAltText(/start position/)
    const end = page.getByAltText(/end position/)
    for (const img of [start, end]) await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true)
    expect(await start.getAttribute('src')).toBe('/exercises/Running_Treadmill/0.jpg')
    expect(await end.getAttribute('src')).toBe('/exercises/Running_Treadmill/1.jpg')
    await expect(page.getByText(/Unlicense \(public domain\)/)).toBeVisible()

    await page.getByRole('button', { name: 'Add to my exercises' }).click()
    await expect(page.getByText('In your exercises')).toBeVisible()

    // Back keeps the search; the new exercise is in "My exercises" and links back to its demonstration.
    await page.getByRole('button', { name: 'Exercise database' }).click()
    await expect(page.getByRole('searchbox', { name: 'Search exercises' })).toHaveValue('treadmill')
    await expect(page.getByTestId('result-count')).toHaveText('3 exercises')
    await page.getByRole('tab', { name: 'My exercises' }).click()
    await expect(page.getByRole('link', { name: 'See how to do Running, Treadmill' })).toBeVisible()
  })

  test('an exercise without images shows the fallback instead of a broken picture', async ({ page }) => {
    await register(page)
    await page.goto('/fitness/exercises/Kettlebell_Halo')
    await expect(page.getByRole('heading', { level: 1, name: 'Kettlebell Halo' })).toBeVisible()
    await expect(page.getByRole('img', { name: /no demonstration images/i })).toBeVisible()
    await expect(page.locator('main img')).toHaveCount(0)
  })

  test('a missing file falls back and the frame keeps its shape', async ({ page }) => {
    await register(page)
    await page.route('**/exercises/Plank/1.jpg', (route) => route.fulfill({ status: 404, body: 'gone' }))
    await page.goto('/fitness/exercises/Plank')
    await expect(page.getByRole('img', { name: 'No end image' })).toBeVisible()
    const boxes = await page
      .getByTestId('exercise-frame')
      .evaluateAll((els) => els.map((e) => Math.round((e.getBoundingClientRect().width / e.getBoundingClientRect().height) * 100)))
    expect(new Set(boxes)).toEqual(new Set([150])) // both frames 3:2
  })

  test('unrelated routes still work: the old exercise list and an unknown exercise id', async ({ page }) => {
    await register(page)
    await page.goto('/fitness/exercises/Nope')
    await expect(page.getByText('Exercise not found')).toBeVisible()
    await page.goto('/fitness')
    await page.getByRole('tab', { name: 'Exercises' }).click()
    await page.getByRole('button', { name: 'New exercise' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Name').fill('Zercher Squat')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Zercher Squat')).toBeVisible()
  })

  test('no horizontal scroll on a phone and the frames share one size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await register(page)
    await openDatabase(page)
    const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }))
    expect(m.scroll).toBeLessThanOrEqual(m.inner)
    await page.getByRole('list', { name: 'Exercises' }).getByRole('link').first().click()
    await expect(page).toHaveURL(/\/fitness\/exercises\//)

    await expect(page.getByTestId('exercise-frame')).toHaveCount(2)
    const sizes = await page
      .getByTestId('exercise-frame')
      .evaluateAll((els) =>
        els.map((e) => `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
      )
    expect(new Set(sizes).size).toBe(1)
  })
})

test('Log workout: exercise suggestions show a photo next to each name and still accept free text', async ({ page }) => {
  await register(page)
  await page.goto('/fitness')
  await page.getByRole('button', { name: 'Log workout' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: 'Add exercise' }).click()
  const field = dlg.getByLabel('Exercise 1')
  await field.fill('plank')
  const list = page.getByRole('listbox', { name: 'Exercise suggestions' })
  const plank = list.getByRole('option', { name: /^Plank/ }).first()
  await expect(plank).toBeVisible()
  const img = plank.locator('img')
  await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true)
  await plank.click()
  await expect(field).toHaveValue('Plank')
  await expect(list).toHaveCount(0)
  await expect(dlg).toBeVisible()
  // A name that is in neither list is kept as typed and logs as before.
  await dlg.getByRole('button', { name: 'Add exercise' }).click()
  await dlg.getByLabel('Exercise 2').fill('Zercher squat')
  await expect(dlg.getByLabel('Exercise 2')).toHaveValue('Zercher squat')
  await page.keyboard.press('Escape')
  await dlg.getByLabel('Set 1 weight').first().fill('20')
  await dlg.getByRole('button', { name: 'Log workout' }).click()
  await expect(page.getByText('Workout logged').first()).toBeVisible()
})

test('the exercise database and an exercise page have no serious accessibility violations', async ({ page }) => {
  await register(page)
  await openDatabase(page)
  const scan = async () =>
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()).violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact),
    )
  expect((await scan()).map((v) => v.id)).toEqual([])
  await page.goto('/fitness/exercises/Plank')
  await expect(page.getByTestId('exercise-frame')).toHaveCount(2)
  expect((await scan()).map((v) => v.id)).toEqual([])
})
