// Regression guard: production bundles must never contain the insecure in-browser backend (local auth + localStorage DB)
// unless it was explicitly requested. Builds three variants into a temp dir and inspects the output. Run: npm run verify:bundles
import { execSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'lt-bundles-'))
const MARKER = 'lifetrack-dev' // localStorage namespace used only by the local adapter / local auth
let failed = 0

function build(name, env) {
  const out = join(root, name)
  execSync(`npx vite build --outDir ${out} --emptyOutDir`, {
    stdio: 'ignore',
    env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_LOCAL_MODE: '', ...env },
  })
  const dir = join(out, 'assets')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
}
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}

try {
  const none = build('none', {})
  check('production build WITHOUT credentials contains no local backend', !none.includes(MARKER))
  const sb = build('supabase', { VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co', VITE_SUPABASE_ANON_KEY: 'eyJexample' })
  check('production build WITH Supabase credentials contains no local backend', !sb.includes(MARKER))
  check('…and talks to the configured Supabase project', sb.includes('abcdefgh.supabase.co'))
  const local = build('local', { VITE_LOCAL_MODE: 'true' })
  check('explicit VITE_LOCAL_MODE=true build still includes the local backend (E2E needs it)', local.includes(MARKER))
} finally {
  rmSync(root, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
