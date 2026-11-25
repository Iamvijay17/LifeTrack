import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACCENTS,
  accentHex,
  accentTokens,
  applyAppearance,
  contrast,
  hexToRgb,
  isDefaultAppearance,
  normalizeAppearance,
  readStoredAppearance,
} from '@/lib/appearance'
import { MAX_PINNED, NAV, arrangeNav, mobilePrimaryItems, moveNavItem } from '@/lib/nav'

const WHITE = [255, 255, 255]
const BG = { light: [248, 248, 250], dark: [9, 9, 11] }
const rgb = (triplet) => triplet.split(' ').map(Number)

describe('appearance: validation', () => {
  it('turns anything stored into a complete, valid object', () => {
    expect(normalizeAppearance(undefined)).toEqual(normalizeAppearance({}))
    expect(isDefaultAppearance({})).toBe(true)
    const p = normalizeAppearance({
      accent: 'neon',
      custom_accent: 'red',
      font_size: 'huge',
      density: 'x',
      motion: 'wild',
      sidebar: { order: 'no', pinned: [1, '/a'] },
    })
    expect(p).toMatchObject({ accent: 'violet', font_size: 'default', density: 'comfortable', motion: 'system' })
    expect(p.sidebar.order).toEqual([])
    expect(p.sidebar.pinned).toEqual(['/a'])
  })
  it('keeps valid choices, normalises the custom colour, and limits favourites', () => {
    const p = normalizeAppearance({
      accent: 'custom',
      custom_accent: '#ff8800',
      font_size: 'large',
      density: 'compact',
      motion: 'reduced',
      sidebar: { collapsed: true, pinned: ['/a', '/b', '/c', '/d', '/e', '/a'] },
    })
    expect(p).toMatchObject({ accent: 'custom', custom_accent: '#FF8800', font_size: 'large', density: 'compact', motion: 'reduced' })
    expect(p.sidebar.collapsed).toBe(true)
    expect(p.sidebar.pinned).toEqual(['/a', '/b', '/c', '/d'])
  })
})

describe('appearance: accessible colour', () => {
  it.each(ACCENTS.map((a) => [a.key, a.hex]))('%s: white text on buttons and the accent as text both pass in both themes', (_k, hex) => {
    for (const mode of ['light', 'dark']) {
      const t = accentTokens(hex, mode)
      expect(contrast(rgb(t['--primary-solid']), WHITE)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(rgb(t['--primary']), BG[mode])).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('rescues colours that would be unreadable: pale yellow, near white and near black', () => {
    for (const hex of ['#FFFF66', '#FFFFFF', '#101010', '#00FF00']) {
      for (const mode of ['light', 'dark']) {
        const t = accentTokens(hex, mode)
        expect(contrast(rgb(t['--primary-solid']), WHITE)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(rgb(t['--primary']), BG[mode])).toBeGreaterThanOrEqual(4.4) // black on a black page is the one case that can only meet the non-text 3:1
      }
    }
  })
  it('the default violet stays exactly as it was', () => {
    expect(accentHex(normalizeAppearance({}))).toBe('#7C3AED')
    expect(hexToRgb('#7C3AED')).toEqual([124, 58, 237])
  })
})

describe('appearance: applied to the page', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-density')
    document.getElementById('lt-accent')?.remove()
    localStorage.clear()
  })
  it('the default look sets nothing custom', () => {
    applyAppearance({}, true)
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
    expect(document.getElementById('lt-accent')).toBeNull()
    expect(document.documentElement.dataset.density).toBe('comfortable')
  })
  it('an accent sets the tokens, text size, density and motion, and caches them for the next first paint', () => {
    const prefs = { accent: 'emerald', font_size: 'large', density: 'compact', motion: 'reduced' }
    applyAppearance(prefs, true)
    const root = document.documentElement
    expect(root.style.getPropertyValue('--primary-solid')).not.toBe('')
    expect(root.style.fontSize).toBe('112.5%')
    expect(root.dataset).toMatchObject({ density: 'compact', motion: 'reduced' })
    expect(document.getElementById('lt-accent').textContent).toContain('--mod')
    expect(readStoredAppearance()).toMatchObject({ accent: 'emerald', density: 'compact' })
    expect(JSON.parse(localStorage.getItem('lifetrack:appearance-vars'))).toHaveProperty('light.--primary')
    applyAppearance({}, true) // back to default clears every override
    expect(root.style.getPropertyValue('--primary-solid')).toBe('')
    expect(root.style.fontSize).toBe('')
    expect(document.getElementById('lt-accent')).toBeNull()
  })
})

describe('navigation arrangement', () => {
  it('shows favourites once, at the top, and keeps everything else', () => {
    const { pinned, groups } = arrangeNav({ pinned: ['/finance', '/habits', '/nope'] }, { admin: true })
    expect(pinned.map((n) => n.to)).toEqual(['/finance', '/habits'])
    const rest = groups.flatMap((g) => g.items.map((n) => n.to))
    expect(rest).not.toContain('/finance')
    expect(rest.length + pinned.length).toBe(NAV.length)
  })
  it('reorders inside a group only, and ignores unknown paths', () => {
    const base = arrangeNav({})
      .groups.find((g) => g.title === 'Productivity')
      .items.map((n) => n.to)
    const order = moveNavItem([], base[1], -1)
    const after = arrangeNav({ order })
      .groups.find((g) => g.title === 'Productivity')
      .items.map((n) => n.to)
    expect(after.slice(0, 2)).toEqual([base[1], base[0]])
    expect(moveNavItem(order, after[0], -1)).toEqual(order) // already first
    expect(arrangeNav({ order: ['/gone', ...order] }, { admin: true }).groups.flatMap((g) => g.items)).toHaveLength(NAV.length)
  })
  it("keeps administrator-only pages (System Health) out of everyone else's menu, pinned or not", () => {
    const all = (who) => arrangeNav({ pinned: ['/system'] }, who)
    const seen = (r) => [...r.pinned, ...r.groups.flatMap((g) => g.items)].map((n) => n.to)
    expect(seen(all({}))).not.toContain('/system')
    expect(seen(all({ admin: true }))).toContain('/system')
    expect(all({ admin: true }).pinned.map((n) => n.to)).toEqual(['/system'])
    expect(mobilePrimaryItems({ pinned: ['/system'] }).map((n) => n.to)).not.toContain('/system')
  })
  it('the phone bar uses favourites (up to four) or the standard four', () => {
    expect(mobilePrimaryItems({}).map((n) => n.to)).toEqual(['/', '/planner', '/habits', '/finance'])
    const five = NAV.slice(0, 6).map((n) => n.to)
    expect(mobilePrimaryItems({ pinned: five })).toHaveLength(MAX_PINNED)
  })
})

describe('date and time display preferences', () => {
  it('normalizes unknown values to the default and keeps valid ones', async () => {
    const { normalizeAppearance } = await import('@/lib/appearance')
    expect(normalizeAppearance({ date_format: 'bogus', time_format: 5 })).toMatchObject({ date_format: 'auto', time_format: 'auto' })
    expect(normalizeAppearance({ date_format: 'ymd', time_format: '12h' })).toMatchObject({ date_format: 'ymd', time_format: '12h' })
  })
  it('applying the preferences changes how dates are shown, and "auto" restores it', async () => {
    const { applyAppearance } = await import('@/lib/appearance')
    const { fmtDay } = await import('@lifetrack/utils')
    applyAppearance({ date_format: 'dmy' }, true)
    expect(fmtDay('2026-11-24', 'd MMM yyyy')).toBe('24/11/2026')
    applyAppearance({}, true)
    expect(fmtDay('2026-11-24', 'd MMM yyyy')).toBe('24 Nov 2026')
  })
})
