import { test, expect } from '@playwright/test'
import { register, addTask } from './helpers'

// In DEV mode there is no cloud, so "another device" is simulated with a second tab of the SAME browser profile
// (shared storage + BroadcastChannel stand in for Supabase Realtime). With real Supabase credentials, see
// e2e/cloud-sync.spec.js for the two-independent-browser-context test.
test('a task created in one tab appears in another without reloading (dev-mode realtime emulation)', async ({ context }) => {
  const a = await context.newPage()
  await register(a)
  await a.goto('/planner')
  const b = await context.newPage()
  await b.goto('/planner')
  await expect(b.getByText('Nothing planned for this day')).toBeVisible()
  await addTask(a, 'Created on device A')
  await expect(b.getByText('Created on device A')).toBeVisible({ timeout: 10_000 })
  await b.getByRole('button', { name: 'Complete "Created on device A"' }).click()
  await expect(a.getByRole('button', { name: 'Mark "Created on device A" as not done' })).toBeVisible({ timeout: 10_000 })
})

test('a running study timer is visible on the other tab', async ({ context }) => {
  const a = await context.newPage()
  await register(a)
  await a.goto('/learning')
  const b = await context.newPage()
  await b.goto('/learning')
  await a.getByRole('button', { name: 'Start timer' }).click()
  await expect(b.getByTestId('timer-clock')).toBeVisible({ timeout: 10_000 })
})
