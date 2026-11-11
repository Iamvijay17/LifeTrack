import { test, expect } from '@playwright/test'
import { register } from './helpers'

// Phone-sized viewport (the `mobile` project runs every *responsive* spec): the lock screen and the Security page must fit and be easy to hit.

const PIN = '2486'

test('mobile: the Security page has no horizontal overflow and every control is a comfortable target', async ({ page }) => {
  await register(page)
  await page.goto('/security')
  await expect(page.getByRole('heading', { name: 'Security & Privacy' })).toBeVisible()
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  for (const name of ['Change password']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box.height, name).toBeGreaterThanOrEqual(40)
  }
})

test('mobile: the PIN pad fits the screen, its keys are at least 44px, and it works by touch', async ({ page }) => {
  await register(page)
  await page.goto('/security')
  await page.getByRole('switch', { name: 'App lock' }).click()
  const dlg = page.getByRole('dialog', { name: 'Turn on app lock' })
  await expect(dlg).toBeVisible()
  for (const d of ['1', '5', '0']) {
    const box = await dlg.getByRole('button', { name: d, exact: true }).boundingBox()
    expect(box.width, `key ${d}`).toBeGreaterThanOrEqual(44)
    expect(box.height, `key ${d}`).toBeGreaterThanOrEqual(44)
  }
  for (const d of PIN) await dlg.getByRole('button', { name: d, exact: true }).tap()
  await expect(dlg.getByText('Enter it again to confirm')).toBeVisible()
  for (const d of PIN) await dlg.getByRole('button', { name: d, exact: true }).tap()
  await expect(dlg).toBeHidden()
})

test('mobile: the lock screen fits without scrolling sideways, shows the whole pad, and unlocks by touch', async ({ page }) => {
  await register(page)
  await page.goto('/security')
  await page.getByRole('switch', { name: 'App lock' }).click()
  await page.keyboard.type(PIN)
  await page.keyboard.type(PIN)
  await page.getByRole('button', { name: 'Lock now' }).click()
  const lock = page.getByRole('dialog', { name: 'LifeTrack is locked' })
  await expect(lock).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  const vp = page.viewportSize()
  for (const d of ['1', '9', '0']) {
    const box = await lock.getByRole('button', { name: d, exact: true }).boundingBox()
    expect(box.width, `key ${d}`).toBeGreaterThanOrEqual(44)
    expect(box.x, `key ${d}`).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, `key ${d}`).toBeLessThanOrEqual(vp.width)
  }
  // the dialog scrolls inside itself if a short screen needs it, so the last row and the links are always reachable
  await lock.getByRole('button', { name: 'Sign out' }).scrollIntoViewIfNeeded()
  await expect(lock.getByRole('button', { name: 'Sign out' })).toBeInViewport()
  await lock.getByRole('button', { name: '0', exact: true }).scrollIntoViewIfNeeded()
  for (const d of PIN) await lock.getByRole('button', { name: d, exact: true }).tap()
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible()
})
