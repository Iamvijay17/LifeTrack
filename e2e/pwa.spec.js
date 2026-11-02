import { test, expect } from '@playwright/test'

test('PWA: manifest is valid and installable assets exist; service worker registers', async ({ page, request }) => {
  await page.goto('/login')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const manifest = await (await request.get(href)).json()
  expect(manifest).toMatchObject({ name: 'LifeTrack', display: 'standalone', start_url: '/', theme_color: '#09090B' })
  for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).ok()).toBeTruthy()
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration()
    return !!r || !!(await navigator.serviceWorker.ready)
  })
  expect(sw).toBe(true)
})
