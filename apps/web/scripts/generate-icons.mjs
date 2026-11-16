// Renders the PWA PNG icons from the SVG logo using the installed Chromium. Run: npm run icons
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const svg = readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})
// `inset` shrinks the logo toward the centre. A maskable icon may be cropped to a circle by the launcher, so its artwork stays inside the middle 80%.
for (const [name, size, inset = 0] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['icon-maskable-512.png', 512, 0.14],
]) {
  if (process.argv[2] && !name.includes(process.argv[2])) continue // e.g. `node scripts/generate-icons.mjs maskable`
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const art = Math.round(size * (1 - inset * 2))
  await page.setContent(
    `<style>html,body{margin:0;background:#09090B;display:grid;place-items:center;height:100%}svg{display:block;width:${art}px;height:${art}px}</style>${svg}`,
  )
  writeFileSync(`public/${name}`, await page.screenshot({ omitBackground: false }))
}
await browser.close()
console.log('icons written')
