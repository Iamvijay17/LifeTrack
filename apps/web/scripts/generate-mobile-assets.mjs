// Renders the native app assets for apps/mobile from the brand mark (same approach as generate-icons.mjs). Run: node scripts/generate-mobile-assets.mjs
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = new URL('../../mobile/assets/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const MARK = (stroke) => `<g fill="none" stroke="${stroke}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -4)">
  <path d="M406 262A150 150 0 1 1 292 126"/><path d="M185 275L235 325L400 160"/><path d="M342 160H400V218"/></g>`
const GRAD = '<defs><linearGradient id="g" x1="420" y1="100" x2="90" y2="440" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#A78BFA"/><stop offset=".5" stop-color="#7C3AED"/><stop offset="1" stop-color="#5B21B6"/></linearGradient></defs>'
// The mark occupies roughly x 66–446, y 80–440 of a 512 box. `scale` sizes it inside the canvas; centred on the glyph's visual centre.
const svg = ({ size, scale, bg, stroke }) => {
  const c = 256, vc = { x: 256, y: 258 }
  const t = `translate(${size / 2} ${size / 2}) scale(${scale * size / 512}) translate(${-vc.x} ${-vc.y})`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${GRAD}${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}<g transform="${t}">${MARK(stroke)}</g></svg>`
}

const ASSETS = [
  // iOS app icon: full-bleed square, no transparency (the OS applies the rounded mask)
  { file: 'icon.png', size: 1024, scale: 0.92, bg: '#09090B', stroke: 'url(#g)', opaque: true },
  // Android adaptive icon: foreground lives inside the central 66% safe zone; background colour comes from app.config
  { file: 'adaptive-icon.png', size: 1024, scale: 0.78, stroke: 'url(#g)' },
  // Android 13+ themed icon: single-colour silhouette
  { file: 'adaptive-icon-monochrome.png', size: 1024, scale: 0.78, stroke: '#FFFFFF' },
  // Splash mark (expo-splash-screen centres it at imageWidth)
  { file: 'splash-icon.png', size: 1024, scale: 0.95, stroke: 'url(#g)' },
  // Android status-bar notification icon: white on transparent (Android tints it)
  { file: 'notification-icon.png', size: 96, scale: 1.0, stroke: '#FFFFFF' },
]

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const shot = async (html, w, h, omitBackground = true) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${html}`)
  const buf = await page.screenshot({ omitBackground })
  await page.close()
  return buf
}
for (const a of ASSETS) {
  const buf = await shot(svg(a), a.size, a.size, !a.opaque)
  writeFileSync(OUT + a.file, buf)
  console.log('wrote', a.file)
}

// Preview sheet (not shipped): how the assets look under the real platform masks and on light/dark splash.
const b64 = (f) => 'data:image/png;base64,' + readFileSync(OUT + f).toString('base64')
const PREVIEW = process.env.PREVIEW_OUT
if (PREVIEW) {
  const cell = (label, inner) => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;font:13px system-ui;color:#ddd">${inner}<span>${label}</span></div>`
  const box = (size, radius, bg, img, extra = '') => `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:${bg};overflow:hidden;display:grid;place-items:center">${img.replace('<img', `<img style="width:${size}px;height:${size}px;${extra}"`)}</div>`
  const img = (f) => `<img src="${b64(f)}">`
  const html = `<body style="margin:0;background:#1c1c1f;padding:24px;display:flex;flex-wrap:wrap;gap:28px;width:980px">
    ${cell('iOS icon (rounded mask)', box(140, '31px', '#000', img('icon.png')))}
    ${cell('Android adaptive (circle mask)', box(140, '50%', '#09090B', img('adaptive-icon.png')))}
    ${cell('Android adaptive (squircle)', box(140, '34px', '#09090B', img('adaptive-icon.png')))}
    ${cell('Android themed (monochrome)', box(140, '50%', '#4b3a7a', img('adaptive-icon-monochrome.png')))}
    ${cell('Notification icon (status bar)', box(48, '8px', '#333', img('notification-icon.png')))}
    ${cell('Splash — dark', `<div style="width:130px;height:260px;border-radius:18px;background:#09090B;display:grid;place-items:center">${img('splash-icon.png').replace('<img', '<img style="width:90px"')}</div>`)}
    ${cell('Splash — light', `<div style="width:130px;height:260px;border-radius:18px;background:#FAFAFA;display:grid;place-items:center">${img('splash-icon.png').replace('<img', '<img style="width:90px"')}</div>`)}
    ${cell('Home screen (small, dark)', box(60, '14px', '#000', img('icon.png')))}
  </body>`
  const page = await browser.newPage({ viewport: { width: 1030, height: 520 } })
  await page.setContent(html)
  writeFileSync(PREVIEW, await page.screenshot())
}
await browser.close()
