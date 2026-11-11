// Copies the shared reminder rules into the Edge Function's folder so Deno uses the SAME code as the apps.
// Run: node scripts/sync-function-core.mjs   (a test fails if the copies are stale)
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = new URL('../', import.meta.url).pathname // resolve from the repo root so it works from any directory
const HEADER = (src) => `// GENERATED from ${src} by scripts/sync-function-core.mjs — do not edit; change the source and re-run the script.\n`
const FILES = [
  ['packages/core/src/reminders.js', 'supabase/functions/_shared/reminders.js'],
  ['packages/core/src/notifications.js', 'supabase/functions/_shared/notifications.js'],
  ['packages/utils/src/dates.ts', 'supabase/functions/_shared/dates.ts'],
]
export const expected = () => FILES.map(([from, to]) => [to, HEADER(from) + readFileSync(ROOT + from, 'utf8')])
if (process.argv[1].endsWith('sync-function-core.mjs')) {
  for (const [to, content] of expected()) { writeFileSync(ROOT + to, content); console.log('wrote', to) }
}
