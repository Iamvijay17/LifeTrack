import { test, expect } from '@playwright/test'
import { register } from './helpers'

const ROUTES = [
  '/',
  '/planner',
  '/calendar',
  '/focus',
  '/habits',
  '/notes',
  '/learning',
  '/jobs',
  '/goals',
  '/fitness',
  '/health',
  '/nutrition',
  '/finance',
  '/analytics',
  '/reports',
  '/notifications',
  '/settings',
  '/security',
  '/export',
  '/help',
]
const SIZES = [
  { name: 'phone 320', width: 320, height: 640 },
  { name: 'phone 414', width: 414, height: 800 },
  { name: 'tablet 768', width: 768, height: 1024 },
  { name: 'laptop 1280', width: 1280, height: 800 },
]
const DEFAULT_VIOLET = '124 58 237'
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test('every page fits every screen width without sideways scrolling', async ({ page }) => {
  test.setTimeout(240_000)
  await register(page)
  const bad = []
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height })
    for (const route of ROUTES) {
      await page.goto(route)
      await page.locator('main').waitFor()
      await page.waitForLoadState('networkidle')
      const over = await overflow(page)
      if (over > 1) bad.push(`${size.name} ${route} (+${over}px)`)
    }
  }
  expect(bad).toEqual([])
})

test('appearance: accent, text size, spacing and motion apply at once, persist, and reset', async ({ page }) => {
  await register(page)
  await page.goto('/settings')
  const root = page.locator('html')
  const primary = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-solid').trim())

  await page.getByRole('radio', { name: 'Emerald' }).click()
  expect(await primary()).not.toBe(DEFAULT_VIOLET)
  await page.getByRole('tab', { name: 'Large' }).click()
  await expect(root).toHaveCSS('font-size', '18px')
  await page.getByRole('tab', { name: 'Compact' }).click()
  await expect(root).toHaveAttribute('data-density', 'compact')
  await page.getByRole('tab', { name: 'Reduce motion' }).click()
  await expect(root).toHaveAttribute('data-motion', 'reduced')

  await page.reload()
  await page.locator('main').waitFor()
  await expect(root).toHaveAttribute('data-density', 'compact') // same device: the first paint already has it
  expect(await primary()).not.toBe(DEFAULT_VIOLET)

  await page.getByRole('button', { name: 'Reset appearance' }).click()
  await expect(root).toHaveAttribute('data-density', 'comfortable')
  expect(await primary()).toBe(DEFAULT_VIOLET)
})

test('navigation: a pinned page leads the sidebar and fills the phone bar; order can be changed', async ({ page }) => {
  await register(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Pin Gym & Fitness' }).click()
  const side = page.getByRole('navigation', { name: 'Main' })
  await expect(side.locator('p', { hasText: 'Pinned' })).toBeVisible()
  await expect(side.getByRole('link').first()).toHaveText(/Gym/)
  await page.getByRole('button', { name: 'Move Calendar up' }).click()
  const productivity = side.getByRole('link', { name: /Calendar|Daily Planner/ })
  await expect(productivity.first()).toHaveText(/Calendar/)

  await page.setViewportSize({ width: 390, height: 800 })
  const bar = page.getByRole('navigation', { name: 'Mobile' })
  await expect(bar.getByRole('link', { name: /Gym/ })).toBeVisible()
  await expect(bar.getByRole('link', { name: /Finance/ })).toBeHidden() // pinned favourites replace the standard four

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Restore default navigation' }).click()
  await expect(side.locator('p', { hasText: 'Pinned' })).toBeHidden()
})

test('PWA: installable manifest with maskable icon and shortcuts; private data is never cached', async ({ page, request }) => {
  await page.goto('/login')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const manifest = await (await request.get(href)).json()
  expect(manifest).toMatchObject({ display: 'standalone', id: '/', background_color: '#09090B' })
  expect(manifest.icons.some((i) => i.purpose === 'maskable' && i.src !== 'icon-512.png')).toBe(true)
  expect(manifest.shortcuts.length).toBeGreaterThan(0)
  for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).ok()).toBeTruthy()
  const sw = await (await request.get('/sw.js')).text()
  // The one rule that names the API is NetworkOnly (never cached, never answered from a cache), added by the offline layer.
  expect(sw).not.toMatch(/\/rest\/v1|\/auth\/v1/)
  expect(sw).toMatch(/supabase\\\.\(co\|in\).{0,80}NetworkOnly/)
  expect(sw).toMatch(/exercise-images/) // the only runtime cache is static exercise photos
})

test('an action that fails is rolled back and says so', async ({ page }) => {
  await register(page)
  await page.goto('/planner')
  await page.getByRole('button', { name: 'New task' }).click()
  await page.getByLabel('Title').fill('Stay or go')
  await page.getByRole('dialog').getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByText('Stay or go', { exact: true })).toBeVisible()
  // Break the backend's storage so the next write cannot succeed, then try to complete the task.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('db'))
    window.__broken = key
    Storage.prototype.setItem = () => {
      throw new Error('disk full')
    }
  })
  await page.getByRole('button', { name: /^Complete "Stay or go"/ }).click()
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible() // the failure is reported
  await expect(page.getByRole('button', { name: /^Complete "Stay or go"/ })).toBeVisible() // and the task is back to not completed
})
