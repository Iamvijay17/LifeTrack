// Appearance preferences: accent colour, text size, spacing, motion and sidebar layout.
// Pure functions first (colour maths, validation); `applyAppearance` is the one place that touches the document.
//
// Where it lives: `user_settings.appearance_prefs` (follows the account) with a copy in this browser (`lifetrack:appearance`) so the
// first paint is already right. The theme (dark / light / system) keeps its own existing column and key.

export const ACCENTS = [
  { key: 'violet', label: 'Violet', hex: '#7C3AED' },
  { key: 'blue', label: 'Blue', hex: '#2563EB' },
  { key: 'emerald', label: 'Emerald', hex: '#059669' },
  { key: 'rose', label: 'Rose', hex: '#E11D48' },
  { key: 'orange', label: 'Orange', hex: '#EA580C' },
  { key: 'cyan', label: 'Cyan', hex: '#0891B2' },
]
export const FONT_SIZES = [
  { value: 'small', label: 'Small', pct: 93.75 },
  { value: 'default', label: 'Default', pct: 100 },
  { value: 'large', label: 'Large', pct: 112.5 },
]
export const DENSITIES = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]
export const MOTIONS = [
  { value: 'system', label: 'Follow my device' },
  { value: 'reduced', label: 'Reduce motion' },
]

export const DEFAULT_APPEARANCE = Object.freeze({
  accent: 'violet',
  custom_accent: '#7C3AED',
  font_size: 'default',
  density: 'comfortable',
  motion: 'system',
  sidebar: Object.freeze({ collapsed: false, order: Object.freeze([]), pinned: Object.freeze([]) }),
})

const HEX = /^#[0-9a-f]{6}$/i
const oneOf = (list, v, fallback) => (list.some((o) => (o.value ?? o.key) === v) ? v : fallback)
const paths = (v) =>
  Array.isArray(v) ? [...new Set(v.filter((p) => typeof p === 'string' && p.startsWith('/') && p.length < 60))].slice(0, 40) : []

/** Anything stored (older versions, hand-edited, another device) becomes a complete, valid preference object. */
export function normalizeAppearance(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const sb = r.sidebar && typeof r.sidebar === 'object' ? r.sidebar : {}
  return {
    accent: r.accent === 'custom' ? 'custom' : oneOf(ACCENTS, r.accent, DEFAULT_APPEARANCE.accent),
    custom_accent: HEX.test(r.custom_accent) ? r.custom_accent.toUpperCase() : DEFAULT_APPEARANCE.custom_accent,
    font_size: oneOf(FONT_SIZES, r.font_size, 'default'),
    density: oneOf(DENSITIES, r.density, 'comfortable'),
    motion: oneOf(MOTIONS, r.motion, 'system'),
    sidebar: { collapsed: sb.collapsed === true, order: paths(sb.order), pinned: paths(sb.pinned).slice(0, 4) },
  }
}

export const isDefaultAppearance = (p) => JSON.stringify(normalizeAppearance(p)) === JSON.stringify(normalizeAppearance({}))

// ------------------------------------------------------------------ colour maths (WCAG 2.x)
export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
export const rgbToHex = (rgb) =>
  '#' +
  rgb
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t)
const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

/** Move `rgb` toward `toward` in small steps until it reaches `ratio` against `against` (or can go no further). */
function until(rgb, toward, against, ratio) {
  let out = rgb
  for (let t = 0; t <= 1.0001 && contrast(out, against) < ratio; t += 0.04) out = mix(rgb, toward, t)
  return out
}

const BG = { light: [248, 248, 250], dark: [9, 9, 11] }
const triplet = (rgb) => rgb.map((c) => Math.round(c)).join(' ')

/**
 * The colour tokens an accent produces in one theme, each checked for contrast:
 *  - primary-solid: a button background that white text reads on (>= 4.5:1), darkened if the chosen colour is too light
 *  - primary: the accent used as text, icons and rings on the page background (>= 4.5:1 in light mode, >= 3:1 non-text in dark)
 */
export function accentTokens(hex, mode) {
  const base = hexToRgb(hex)
  const solid = until(base, BLACK, WHITE, 4.5)
  const text = mode === 'dark' ? until(base, WHITE, BG.dark, 4.5) : until(base, BLACK, BG.light, 4.5)
  const second = mode === 'dark' ? mix(text, WHITE, 0.3) : mix(text, BLACK, 0.14)
  return {
    '--primary': triplet(text),
    '--primary-solid': triplet(solid),
    '--primary-solid-2': triplet(mix(solid, [99, 102, 241], 0.28)),
    '--primary-foreground': '255 255 255',
    '--secondary': triplet(second),
    ...(mode === 'light' ? { '--accent': triplet(mix(base, WHITE, 0.9)) } : {}),
    '--c-primary': rgbToHex(text),
    '--c-secondary': rgbToHex(second),
    // The dashboard (and anything outside a module) takes the accent too; every other module keeps its own colour.
    '--mod': triplet(mode === 'dark' ? mix(base, WHITE, 0.1) : base),
    '--mod-2': triplet(mix(base, [99, 102, 241], 0.35)),
    '--mod-text': triplet(text),
  }
}
export const accentHex = (p) => (p.accent === 'custom' ? p.custom_accent : (ACCENTS.find((a) => a.key === p.accent)?.hex ?? ACCENTS[0].hex))

// ---------------------------------------------------------------------------- the document
const STORE = 'lifetrack:appearance'
const VARS_STORE = 'lifetrack:appearance-vars'
const MODULE_KEYS = ['--mod', '--mod-2', '--mod-text']
const ALL_KEYS = [
  '--primary',
  '--primary-solid',
  '--primary-solid-2',
  '--primary-foreground',
  '--secondary',
  '--accent',
  '--c-primary',
  '--c-secondary',
]

export function readStoredAppearance() {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(STORE) ?? 'null'))
  } catch {
    return normalizeAppearance({})
  }
}

let styleEl
/** The dashboard's own colour is set from a stylesheet rule (not inline) so that other modules' `[data-module]` colours still apply on <html>. */
function setModuleRule(vars, dark) {
  if (!vars) {
    styleEl?.remove()
    styleEl = null
    return
  }
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'lt-accent'
    document.head.appendChild(styleEl)
  }
  const body = MODULE_KEYS.map((k) => `${k}:${vars[k]}`).join(';')
  const sel = dark
    ? "html.dark:not([data-module]), html.dark[data-module='dashboard'], .dark [data-module='dashboard']"
    : "html:not([data-module]), html[data-module='dashboard'], [data-module='dashboard']"
  styleEl.textContent = `${sel}{${body}}`
}

/** Writes the preferences onto <html>. `dark` is the resolved theme. Returns nothing; safe to call repeatedly. */
export function applyAppearance(prefs, dark) {
  const p = normalizeAppearance(prefs)
  const root = document.documentElement
  const mode = dark ? 'dark' : 'light'
  const custom = accentHex(p).toUpperCase() !== ACCENTS[0].hex
  for (const k of ALL_KEYS) root.style.removeProperty(k)
  let vars = null
  if (custom) {
    vars = accentTokens(accentHex(p), mode)
    for (const k of ALL_KEYS) if (vars[k]) root.style.setProperty(k, vars[k])
  }
  setModuleRule(vars, dark)
  const pct = FONT_SIZES.find((f) => f.value === p.font_size).pct
  root.style.fontSize = pct === 100 ? '' : `${pct}%`
  root.dataset.density = p.density
  root.dataset.motion = p.motion
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#09090B' : '#FAFAFA')
  try {
    localStorage.setItem(STORE, JSON.stringify(p))
    // Both themes' tokens are kept so the first paint (public/theme-init.js) can apply the right set before any script has loaded.
    localStorage.setItem(
      VARS_STORE,
      JSON.stringify(custom ? { light: accentTokens(accentHex(p), 'light'), dark: accentTokens(accentHex(p), 'dark') } : null),
    )
  } catch {
    /* device cache only */
  }
}

/** Whether animation is reduced: the account/device choice, or the operating system's. */
export const reducedMotion = (prefs) =>
  normalizeAppearance(prefs).motion === 'reduced' ||
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
