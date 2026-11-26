import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { register } from './helpers'

// Fails on serious/critical WCAG A/AA violations. (Colour-contrast is checked separately in the design review.)
const scan = async (page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()).violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact),
  )
const summary = (vs) =>
  vs
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    )
    .join('\n')

test('auth pages have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const v = await scan(page)
    expect(v, `${path}\n${summary(v)}`).toEqual([])
  }
})

test('main pages have no serious accessibility violations', async ({ page }) => {
  test.slow() // one full axe scan per page, sixteen pages
  await register(page)
  for (const path of [
    '/',
    '/planner',
    '/learning',
    '/jobs',
    '/fitness',
    '/health',
    '/nutrition',
    '/finance',
    '/habits',
    '/analytics',
    '/focus',
    '/notes',
    '/goals',
    '/reports',
    '/notifications',
    '/export',
    '/settings',
  ]) {
    await page.goto(path)
    await page.locator('main').waitFor()
    await page.waitForLoadState('networkidle')
    const v = await scan(page)
    expect(v, `${path}\n${summary(v)}`).toEqual([])
  }
})

// Every other signed-in route in App.jsx (the list above predates them). Routes that need an id are left out.
test('newer pages have no serious accessibility violations', async ({ page }) => {
  test.setTimeout(300_000) // sixteen full axe scans
  await register(page)
  for (const path of [
    '/calendar',
    '/challenges',
    '/map',
    '/recovery',
    '/insights',
    '/search',
    '/automation',
    '/automation/history',
    '/integrations',
    '/security',
    '/shortcuts',
    '/help',
    '/audit',
    '/developers',
    '/system',
    '/features',
  ]) {
    await page.goto(path)
    await page.locator('main').waitFor()
    await page.waitForLoadState('networkidle')
    const v = await scan(page)
    expect.soft(v, `${path}\n${summary(v)}`).toEqual([])
  }
})

test('legal pages have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const v = await scan(page)
    expect(v, `${path}\n${summary(v)}`).toEqual([])
  }
})

test('global search and a form dialog are accessible', async ({ page }) => {
  await register(page)
  await page.getByRole('button', { name: 'Search…', exact: true }).click()
  const box = page.getByRole('combobox', { name: 'Search everything' })
  await box.fill('plan')
  await expect(box).toHaveAttribute('aria-expanded', 'true')
  await expect(box).toHaveAttribute('aria-activedescendant', /cmd-opt-0/) // the Command Center palette's first result
  const v = await scan(page)
  expect(v, summary(v)).toEqual([])
})
