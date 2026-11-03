// Lab measurement of first-load cost: JS transferred + FCP/LCP with 4x CPU slowdown and slow-4G.
//   node scripts/measure-perf.mjs            (builds both variants itself)
// "login"     = production-style build with Supabase credentials (a placeholder project; the login page needs no network).
// "dashboard" = the local-mode build the E2E suite uses, which opens straight on the dashboard.
// These are LAB numbers on this machine, not field data; compare runs against each other, not against a real device.
import { execSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { gzipSync } from 'node:zlib'
import { existsSync } from 'node:fs'

const sandboxChromium = '/opt/pw-browsers/chromium'
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(sandboxChromium) ? sandboxChromium : undefined)

const sh = (cmd, env = {}) => execSync(cmd, { stdio: 'ignore', env: { ...process.env, ...env } })
const PORT = 4199
async function measure(label, env, runs = 5) {
  sh('npx vite build --outDir dist-perf --emptyOutDir', env)
  const srv = spawn('npx', ['vite', 'preview', '--outDir', 'dist-perf', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 2500))
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  const out = []
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
    let js = 0,
      jsGz = 0
    page.on('response', async (r) => {
      if (/\.js(\?|$)/.test(r.url())) {
        try {
          const b = await r.body()
          js += b.length
          jsGz += gzipSync(b).length
        } catch {
          // a response without a readable body (redirect, aborted) simply is not counted
        }
      }
    })
    await page.addInitScript(() => {
      window.__m = { lcp: 0, fcp: 0, cls: 0 }
      new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__m.cls += e.value))).observe({
        type: 'layout-shift',
        buffered: true,
      })
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__m.lcp = e.startTime))).observe({
        type: 'largest-contentful-paint',
        buffered: true,
      })
      new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => e.name === 'first-contentful-paint' && (window.__m.fcp = e.startTime)),
      ).observe({ type: 'paint', buffered: true })
    })
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const m = await page.evaluate(() => ({
      ...window.__m,
      // JS that had finished downloading by first paint: what actually gates the first screen
      jsBeforeFcp: performance
        .getEntriesByType('resource')
        .filter((e) => /\.js(\?|$)/.test(e.name) && e.responseEnd <= window.__m.fcp)
        .reduce((a, e) => a + e.decodedBodySize, 0),
    }))
    out.push({ js, jsGz, fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), cls: m.cls, pre: m.jsBeforeFcp })
    await ctx.close()
  }
  await browser.close()
  srv.kill()
  const med = (k) => out.map((o) => o[k]).sort((a, b) => a - b)[Math.floor(out.length / 2)]
  console.log(
    `${label.padEnd(10)} JS ${(med('js') / 1024).toFixed(0)} KB (gzip ${(med('jsGz') / 1024).toFixed(0)} KB)  JS-before-FCP ${(med('pre') / 1024).toFixed(0)} KB  FCP ${med('fcp')} ms  LCP ${med('lcp')} ms  CLS ${med('cls').toFixed(3)}   [median of ${runs}]`,
  )
}
await measure('login', { VITE_SUPABASE_URL: 'https://placeholder.supabase.co', VITE_SUPABASE_ANON_KEY: 'placeholder', VITE_LOCAL_MODE: '' })
await measure('dashboard', { VITE_LOCAL_MODE: 'true' })
