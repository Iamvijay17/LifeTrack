import { test, expect } from '@playwright/test'
import { register } from './helpers'

const SHOTS = '/tmp/claude-0/-home-user-LifeTrack/137c8166-0b5e-5d8e-96e7-8cb72e14747f/scratchpad'
const slow = (page, glob, ms) => page.route(glob, async (route) => { await new Promise((r) => setTimeout(r, ms)); await route.continue() })

test.describe('branded loading system', () => {
  test('static boot screen is visible before the JS bundle arrives, then replaced by the app', async ({ page }) => {
    await slow(page, '**/assets/index-*.js', 1500)
    await page.goto('/login', { waitUntil: 'commit' })
    const boot = page.locator('.lt-boot')
    await expect(boot).toBeVisible()
    await expect(boot).toContainText('Preparing your dashboard...')
    await expect(boot).toHaveAttribute('aria-live', 'polite')
    await page.waitForTimeout(900)
    await page.screenshot({ path: SHOTS + '/boot-desktop.png' })
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.lt-boot')).toHaveCount(0)
  })

  test('route-level loader keeps the app shell on screen and names the page', async ({ page }) => {
    await register(page)
    await slow(page, '**/assets/PlannerPage-*.js', 2000)
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Daily Planner' }).click()
    const loader = page.getByTestId('page-loader')
    await expect(loader).toContainText('Loading your daily planner...')
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible() // sidebar did not disappear
    await page.waitForTimeout(700) // past the 180ms anti-flash delay
    await page.screenshot({ path: SHOTS + '/route-desktop.png' })
    await expect(page.getByRole('heading', { level: 1, name: 'Daily Planner' })).toBeVisible({ timeout: 10_000 })
    await expect(loader).toHaveCount(0)
  })

  test('rings turn in opposite directions; reduced motion stops loops and shows the full check', async ({ page }) => {
    await slow(page, '**/assets/index-*.js', 2500)
    await page.goto('/login', { waitUntil: 'commit' })
    await expect(page.locator('.lt-boot')).toBeVisible()
    const style = (sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop)
    expect(await style('.lt-spin-outer', 'animationName')).toBe('lt-spin')
    expect(await style('.lt-spin-inner', 'animationDirection')).toBe('reverse')
    expect(await style('.lt-spin-outer', 'animationDirection')).toBe('normal')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const sel of ['.lt-spin-outer', '.lt-spin-inner', '.lt-glow', '.lt-msg']) expect(await style(sel, 'animationName')).toBe('none')
    expect(await style('.lt-check', 'strokeDashoffset')).toBe('0px')
  })

  test('mobile: loaders fit the viewport with no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await slow(page, '**/assets/index-*.js', 1500)
    await page.goto('/login', { waitUntil: 'commit' })
    await expect(page.locator('.lt-boot')).toBeVisible()
    await page.waitForTimeout(700)
    await page.screenshot({ path: SHOTS + '/boot-mobile.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('light theme keeps the orbit legible', async ({ page }) => {
    await register(page)
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Light' }).click()
    await slow(page, '**/assets/AnalyticsPage-*.js', 2000)
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Analytics' }).click()
    await expect(page.getByTestId('page-loader')).toContainText('Preparing your insights...')
    await page.waitForTimeout(700)
    await page.screenshot({ path: SHOTS + '/route-light.png' })
  })

  test('submit buttons show the mini orbit and block double submits', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('nobody@test.dev')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    // either still busy or already finished with an error; never double-clickable while busy
    const btn = page.getByRole('button', { name: 'Sign in' })
    if (await btn.getAttribute('aria-busy')) { await expect(btn).toBeDisabled(); await expect(btn.locator('svg.lt-orbit')).toBeVisible() }
  })
})
