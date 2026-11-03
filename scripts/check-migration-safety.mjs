// Flags migrations that could destroy or rewrite data, so they cannot be applied to a real project without a deliberate decision.
// Usage: node scripts/check-migration-safety.mjs [--from <prefix>] [file ...]     (default: every file in supabase/migrations)
//   --from 0005   only files whose name sorts >= "0005" (the first migration that is still pending on the target project)
// A reviewed destructive statement can be accepted by putting this comment anywhere in its file:  -- lifetrack:allow-destructive <reason>
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const DIR = new URL('../supabase/migrations/', import.meta.url).pathname
const RULES = [
  [/\bdrop\s+table\b/i, 'DROP TABLE'],
  [/\bdrop\s+schema\b/i, 'DROP SCHEMA'],
  [/\bdrop\s+column\b/i, 'DROP COLUMN'],
  [/\bdrop\s+type\b/i, 'DROP TYPE'],
  [/\btruncate\b/i, 'TRUNCATE'],
  [/\balter\s+table\b[^;]*\balter\s+column\b[^;]*\btype\b/i, 'ALTER COLUMN TYPE (rewrites data)'],
  [/\brename\s+(column|to)\b/i, 'RENAME (breaks running app versions)'],
]
const needsWhere = [[/\bdelete\s+from\b/i, 'DELETE without WHERE'], [/\bupdate\s+[\w."]+\s+set\b/i, 'UPDATE without WHERE']]

const strip = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

export function findings(sql) {
  const allowed = /--\s*lifetrack:allow-destructive[ \t]+\S+/.test(sql)
  const text = strip(sql)
  const out = []
  for (const [re, name] of RULES) if (re.test(text)) out.push(name)
  for (const segment of text.split(';')) for (const [re, name] of needsWhere) if (re.test(segment) && !/\bwhere\b/i.test(segment)) out.push(name)
  return allowed ? [] : [...new Set(out)]
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2)
  const fromAt = args.indexOf('--from')
  const from = fromAt >= 0 ? args.splice(fromAt, 2)[1] : ''
  const files = args.length ? args : readdirSync(DIR).filter((f) => f.endsWith('.sql') && f >= from).sort().map((f) => join(DIR, f))
  let bad = 0
  for (const f of files) {
    const found = findings(readFileSync(f, 'utf8'))
    if (found.length) { bad++; console.error(`DESTRUCTIVE  ${basename(f)}: ${found.join(', ')}`) }
  }
  if (bad) { console.error(`\n${bad} migration(s) need explicit approval. Review them, then either re-run with allow_destructive=true or add "-- lifetrack:allow-destructive <reason>" to the file.`); process.exit(1) }
  console.log(`${files.length} migration(s) checked: additive only.`)
}
