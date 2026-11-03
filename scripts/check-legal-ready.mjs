// Release gate: the published legal documents must be finished. Fails while a draft banner or an unfilled [placeholder] remains.
// Used by the production web release and production mobile build workflows (not by the PR gate, drafts are fine in development).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = new URL('../docs/legal/', import.meta.url).pathname
export function problems(name, text) {
  const out = []
  if (/\*\*?DRAFT for review/i.test(text) || /^>\s*\*\*DRAFT/m.test(text)) out.push('still carries the DRAFT banner')
  const holes = [...new Set([...text.matchAll(/\[([^\]\n]{2,60})\](?!\()/g)].map((m) => m[0]))]
  if (holes.length) out.push(`unfilled placeholders: ${holes.join(' ')}`)
  return out.map((p) => `${name}: ${p}`)
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const bad = readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'STORE_DATA_SAFETY.md').flatMap((f) => problems(f, readFileSync(join(DIR, f), 'utf8')))
  if (bad.length) { console.error('Legal documents are not release-ready:\n  ' + bad.join('\n  ')); process.exit(1) }
  console.log('Legal documents have no draft banner or placeholders.')
}
