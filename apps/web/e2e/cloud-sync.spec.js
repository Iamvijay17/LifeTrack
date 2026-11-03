import { test, expect } from '@playwright/test'
import { register, addTask } from './helpers'

// Real cross-device test. Requires a Supabase project: build WITH VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY,
// disable email confirmation (or use E2E_EMAIL / E2E_PASSWORD of an existing user), then:
//   E2E_CLOUD=1 npm run test:e2e -- cloud-sync
test.skip(!process.env.E2E_CLOUD, 'Set E2E_CLOUD=1 and build with Supabase env vars to run the real two-device test.')

test('task created on device A appears on device B (two independent browser contexts, same account)', async ({ browser }) => {
  const ctxA = await browser.newContext(),
    ctxB = await browser.newContext()
  const a = await ctxA.newPage(),
    b = await ctxB.newPage()
  let creds
  if (process.env.E2E_EMAIL) {
    creds = { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }
    for (const p of [a, b]) {
      await p.goto('/login')
      await p.getByLabel('Email').fill(creds.email)
      await p.getByLabel('Password').fill(creds.password)
      await p.getByRole('button', { name: 'Sign in' }).click()
      await expect(p).toHaveURL(/\/$/)
    }
  } else {
    creds = await register(a)
    await b.goto('/login')
    await b.getByLabel('Email').fill(creds.email)
    await b.getByLabel('Password').fill(creds.password)
    await b.getByRole('button', { name: 'Sign in' }).click()
    await expect(b).toHaveURL(/\/$/)
  }
  await a.goto('/planner')
  await b.goto('/planner')
  const title = `Cross-device ${Date.now()}`
  await addTask(a, title)
  await expect(b.getByText(title)).toBeVisible({ timeout: 15_000 }) // delivered by Supabase Realtime, no reload
  await b.getByRole('button', { name: `Complete "${title}"` }).click()
  await expect(a.getByRole('button', { name: `Mark "${title}" as not done` })).toBeVisible({ timeout: 15_000 })
})
