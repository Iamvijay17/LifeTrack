import { test, expect } from '@playwright/test'
import { register } from './helpers'

// Every signed-in route on a brand-new (empty) account at the widths the app supports: nothing may widen the page, nothing inside <main> may run
// past the right edge unless a scroll or clip container holds it, and no page may throw. Empty accounts matter: empty states are what a new
// person sees first, and the earlier manual sweep used seeded data only. Routes that need an id are left out.
const ROUTES = [
  '/',
  '/planner',
  '/calendar',
  '/habits',
  '/challenges',
  '/learning',
  '/jobs',
  '/fitness',
  '/fitness?tab=exercises',
  '/health',
  '/nutrition',
  '/finance',
  '/focus',
  '/notes',
  '/goals',
  '/map',
  '/recovery',
  '/analytics',
  '/insights',
  '/reports',
  '/search',
  '/notifications',
  '/automation',
  '/automation/history',
  '/integrations',
  '/export',
  '/security',
  '/settings',
  '/shortcuts',
  '/help',
  '/audit',
  '/developers',
  '/system',
  '/features',
]
const WIDTHS = [360, 390, 768, 1024, 1440, 1920]

/** Elements inside main/dialogs whose right edge passes the viewport, unless an ancestor scrolls or clips horizontally. */
const offenders = (page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true
      }
      return false
    }
    const out = []
    for (const el of document.querySelectorAll('main *, [role="dialog"] *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.right > vw + 1 && !clipped(el))
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} right=${Math.round(r.right)}`)
      if (out.length >= 3) break
    }
    return out
  })

test('every page fits every supported width on an empty account', async ({ page }) => {
  test.setTimeout(600_000)
  const errors = []
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`))
  await register(page)
  for (const route of ROUTES) {
    await page.goto(route)
    await page.locator('main').waitFor()
    await page.waitForLoadState('networkidle')
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      // Resizing in place: layout animations and ResizeObserver-driven widths take a moment to follow (a person loading the page at this width never
      // sees that), so give the page up to 1.5 s to settle before judging it.
      let wider = 0
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(150)
        wider = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        if (wider <= 1) break
      }
      expect.soft(wider, `${route} @${width}px: page is wider than the screen`).toBeLessThanOrEqual(1)
      expect.soft(await offenders(page), `${route} @${width}px: runs off the right edge`).toEqual([])
    }
  }
  expect(errors, 'uncaught page errors').toEqual([])
})
