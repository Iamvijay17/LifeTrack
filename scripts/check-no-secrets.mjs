// Fails if client code or built bundles contain anything that looks like a Supabase service-role / secret key.
// Usage: node scripts/check-no-secrets.mjs [dir ...]   (defaults to the client sources and any existing build output)
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SKIP = new Set(['node_modules', '.git', 'coverage', '.expo', 'ios', 'android'])
const EXT = /\.(js|jsx|ts|tsx|mjs|cjs|json|html|map|env)$/

/** Decode a JWT payload; returns null if it is not one. */
export function jwtRole(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role ?? null } catch { return null }
}

export function scanText(text) {
  const hits = []
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) hits.push('sb_secret_ key')
  if (/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]?[A-Za-z0-9._-]{20,}/.test(text)) hits.push('assigned SUPABASE_SERVICE_ROLE_KEY')
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) if (jwtRole(m[0]) === 'service_role') hits.push('service_role JWT')
  return hits
}

export function scanDir(dir, found = []) {
  if (!existsSync(dir)) return found
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) scanDir(p, found)
    else if (EXT.test(name) && st.size < 20e6) for (const h of scanText(readFileSync(p, 'utf8'))) found.push(`${p}: ${h}`)
  }
  return found
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['apps/web/src', 'apps/web/dist', 'apps/mobile/app', 'apps/mobile/src', 'apps/mobile/dist', 'packages']
  const found = dirs.flatMap((d) => scanDir(d))
  if (found.length) { console.error('Secret material found in client code:\n' + found.join('\n')); process.exit(1) }
  console.log(`No service-role/secret keys in: ${dirs.filter(existsSync).join(', ')}`)
}
