// Concatenates the migrations into the single paste-and-run file. Run: npm run sql:build
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
const out = [`-- LifeTrack: complete database setup (generated from supabase/migrations by scripts/build-setup-sql.mjs). Run once.`, ...files.map((f) => `\n-- ===== ${f} =====\n${readFileSync(`supabase/migrations/${f}`, 'utf8')}`)].join('\n')
writeFileSync('supabase/setup-all.sql', out)
console.log(`setup-all.sql: ${files.join(', ')}`)
