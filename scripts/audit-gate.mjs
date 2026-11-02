// Dependency security gate for CI. Fails when `npm audit` (production dependencies) reports an advisory of the chosen
// severity that is not listed — with a reason and a review deadline — in .audit-allowlist.json. No extra dependency.
// Usage: node scripts/audit-gate.mjs [--omit=dev] [--level=high|moderate|low]
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const omit = args.omit ?? 'dev'
const order = ['info', 'low', 'moderate', 'high', 'critical']
const min = order.indexOf(args.level ?? 'moderate')

let raw
try { raw = execSync(`npm audit --omit=${omit} --json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
catch (e) { raw = e.stdout } // npm audit exits non-zero when it finds anything
const report = JSON.parse(raw)
if (report.error) { console.error('npm audit failed:', report.error.summary ?? JSON.stringify(report.error)); process.exit(2) }

const advisories = new Map()
for (const v of Object.values(report.vulnerabilities ?? {})) {
  for (const via of v.via) if (typeof via === 'object' && via.url) {
    const id = via.url.split('/').pop()
    advisories.set(id, { id, pkg: via.name, severity: via.severity, title: via.title, url: via.url })
  }
}

const allow = existsSync('.audit-allowlist.json') ? JSON.parse(readFileSync('.audit-allowlist.json', 'utf8')) : []
const today = new Date().toISOString().slice(0, 10)
const problems = []
for (const a of advisories.values()) {
  if (order.indexOf(a.severity) < min) continue
  const rule = allow.find((r) => r.id === a.id)
  if (!rule) problems.push(`NEW ${a.severity} advisory in ${a.pkg}: ${a.title} (${a.url})`)
  else if (rule.reviewBy < today) problems.push(`Allowlist entry for ${a.id} (${a.pkg}) expired on ${rule.reviewBy}; re-review it: ${rule.reason}`)
  else console.log(`allowed until ${rule.reviewBy}: ${a.id} (${a.pkg}, ${a.severity}) — ${rule.reason}`)
}
const stale = allow.filter((r) => !advisories.has(r.id)).map((r) => r.id)
if (stale.length) console.log(`note: allowlist entries no longer reported (remove them): ${stale.join(', ')}`)

if (problems.length) { console.error('\n' + problems.join('\n')); process.exit(1) }
console.log(`audit gate passed (${advisories.size} advisories seen, omit=${omit}, level>=${args.level ?? 'moderate'})`)
