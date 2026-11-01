import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// The sandbox ships a Chromium build; use it when present, otherwise Playwright's own download.
const sandboxChromium = '/opt/pw-browsers/chromium'
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(sandboxChromium) ? sandboxChromium : undefined)

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  projects: [
    { name: 'desktop', testIgnore: /responsive/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive/ },
  ],
  // Builds in DEV mode (no Supabase env) so the suite is hermetic.
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
})
