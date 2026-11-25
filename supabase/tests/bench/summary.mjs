import { readFileSync } from 'node:fs'
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const [n, qs] of Object.entries(j.results)) {
  console.log(`\n## ${n} rows per table`)
  for (const [name, r] of Object.entries(qs)) {
    const f = (x) => (x ? `${String(x.ms).padStart(8)} ms ${String(x.examined).padStart(7)} ex ${x.scans.join('+')}` : '-')
    console.log(name.padEnd(46), f(r.before), ' => ', f(r.after))
  }
}
