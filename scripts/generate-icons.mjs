// Renders the PWA PNG icons from the SVG logo using the installed Chromium. Run: npm run icons
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const svg = readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>html,body{margin:0;background:#09090B}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  writeFileSync(`public/${name}`, await page.screenshot({ omitBackground: false }))
}
await browser.close()
console.log('icons written')
