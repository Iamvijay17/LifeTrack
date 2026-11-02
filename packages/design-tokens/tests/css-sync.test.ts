import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chartColors, colors } from '../src'

const css = readFileSync(new URL('../../../apps/web/src/index.css', import.meta.url), 'utf8')
const block = (sel: string) => css.slice(css.indexOf(sel + ' {'), css.indexOf('}', css.indexOf(sel + ' {')))
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
const parse = (b: string) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))

describe.each(['light', 'dark'] as const)('%s tokens match apps/web index.css', (scheme) => {
  const vars = parse(block(scheme === 'light' ? ':root' : '.dark'))
  it('colors', () => {
    for (const [name, rgb] of Object.entries(colors[scheme])) expect(vars[kebab(name)], name).toBe(rgb.join(' '))
  })
  it('chart colors', () => {
    for (const [name, hex] of Object.entries(chartColors[scheme])) expect(vars[`c-${name}`], name).toBe(hex)
  })
})
