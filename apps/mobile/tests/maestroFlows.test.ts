import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

// Static checks for the Maestro device flows (.maestro/). They cannot execute without a device, but they can stop the flows rotting:
// the app id must match the app, no credentials may be hard-coded, and every on-screen text a flow taps or asserts must still exist in the app source.
const ROOT = new URL('..', import.meta.url).pathname
const FLOWS = join(ROOT, '.maestro')

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const flowFiles = walk(FLOWS).filter((f) => f.endsWith('.yaml') && !f.endsWith('config.yaml'))
const source = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src')), join(ROOT, '../../packages/data/src/errors.js'), join(ROOT, '../../packages/data/src/auth.js')].filter((f) => /\.(tsx?|js)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n')
// Texts that come from the operating system, from data the flow itself typed, or from the backend rather than from our source.
const FROM_ELSEWHERE = new Set(['Cancel'])

function commands(doc: unknown[]): unknown[] {
  return doc.flatMap((c) => {
    const inner = typeof c === 'object' && c ? (c as any).runFlow?.commands ?? [] : []
    return [c, ...commands(inner)]
  })
}
function texts(flow: string): string[] {
  const docs = yaml.loadAll(flow) as any[]
  const steps = commands((docs[1] ?? []) as unknown[])
  const out: string[] = []
  for (const s of steps as any[]) {
    for (const key of ['tapOn', 'assertVisible', 'assertNotVisible']) {
      const v = s?.[key]
      if (typeof v === 'string') out.push(v)
      else if (v?.text) out.push(v.text)
    }
    const w = s?.runFlow?.when?.visible
    if (typeof w === 'string') out.push(w)
    if (s?.scrollUntilVisible?.element) out.push(s.scrollUntilVisible.element)
  }
  return out
}
/** Splits `Complete ${HABIT}` into the fixed fragments around test data the flow types itself (`Complete`). */
const fixedFragments = (t: string, env: Record<string, string>) => {
  let out = [t]
  for (const [k, v] of Object.entries(env)) out = out.flatMap((x) => x.split(`\${${k}}`).flatMap((y) => y.split(v)))
  return out.map((x) => x.replace(/\\"/g, '"').trim()).filter(Boolean)
}

describe('Maestro flows', () => {
  it('there are flows', () => { expect(flowFiles.length).toBeGreaterThanOrEqual(4) })

  describe.each(flowFiles.map((f) => [f.slice(FLOWS.length + 1), f] as const))('%s', (_name, file) => {
    const raw = readFileSync(file, 'utf8')
    const [header = {}] = yaml.loadAll(raw) as any[]

    it('targets the app id from app.config.ts', () => {
      expect(readFileSync(join(ROOT, 'app.config.ts'), 'utf8')).toContain(`'${header.appId}'`)
    })
    it('never hard-codes credentials (they come from E2E_EMAIL / E2E_PASSWORD)', () => {
      expect(raw).not.toMatch(/inputText:\s*["']?[^$"'\s][^"'\n]*@[^"'\n]*\./) // a literal email
      for (const m of raw.matchAll(/inputText:\s*(.+)/g)) if (/pass/i.test(m[1]) && !m[1].includes('${')) expect(m[1]).toMatch(/definitely-not-the-password/) // only the deliberate wrong password
    })
    it('only refers to screen text that exists in the app', () => {
      const env: Record<string, string> = { ...(header.env ?? {}) }
      for (const t of texts(raw)) {
        if (FROM_ELSEWHERE.has(t)) continue
        for (const fragment of fixedFragments(t, env)) expect(source, `"${t}" is used by ${_name} but "${fragment}" no longer appears in the app source`).toContain(fragment)
      }
    })
  })
})
