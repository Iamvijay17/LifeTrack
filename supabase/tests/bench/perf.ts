// Database performance benchmark on in-memory Postgres (PGlite). NOT part of the test suite (a separate environment: `node --experimental-strip-types bench/perf.ts`).
// It applies the migrations BEFORE 0028 (baseline), seeds one person with N rows per table, times the app's real query patterns with EXPLAIN ANALYZE as the
// `authenticated` role (row-level security on), then applies 0028 and times them again on the same data. Results are written as JSON to the path in argv[3].
// PGlite is single-user WASM Postgres: the numbers show plan quality (rows examined, index use, relative time), not production latency.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { AUTH_STUB } from '../authStub.ts'

const MIG = new URL('../../migrations/', import.meta.url)
const files = readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()
const sizes = (process.argv[2] ?? '10000').split(',').map(Number)
const out = process.argv[3]
const SPLIT = '0028'

const QUERIES: Record<string, { table: string; sql: string; note: string }> = {
  'tasks: full list (adapter.list page)': { table: 'tasks', sql: `select * from tasks order by created_at, id limit 1000`, note: 'data adapter paging order' },
  'tasks: open by due date (keyset)': { table: 'tasks', sql: `select id,title,due_date from tasks where status in ('pending','in_progress') order by due_date, id limit 50`, note: 'Tasks board' },
  'tasks: status filter + created sort': { table: 'tasks', sql: `select id from tasks where status = 'done' order by created_at desc, id desc limit 50`, note: 'status filter, newest first' },
  'transactions: month range': { table: 'transactions', sql: `select * from transactions where txn_date >= current_date - 30 and txn_date < current_date + 1 order by txn_date desc, id desc limit 50`, note: 'Finance month view' },
  'transactions: expense type + date sort': { table: 'transactions', sql: `select * from transactions where type = 'expense' order by txn_date desc, id desc limit 50`, note: 'expenses list, any date' },
  'transactions: full list (adapter.list page)': { table: 'transactions', sql: `select * from transactions order by created_at, id limit 1000`, note: 'data adapter paging order' },
  'habit_logs: date range': { table: 'habit_logs', sql: `select * from habit_logs where log_date >= current_date - 90 order by log_date desc, id desc limit 100`, note: 'habit history window' },
  'habit_logs: full list (adapter.list page)': { table: 'habit_logs', sql: `select * from habit_logs order by created_at, id limit 1000`, note: 'data adapter paging order' },
  'study_sessions: recent': { table: 'study_sessions', sql: `select * from study_sessions order by session_date desc, id desc limit 50`, note: 'Learning history' },
  'job_applications: by status': { table: 'job_applications', sql: `select * from job_applications where status = 'applied' order by updated_at desc, id desc limit 50`, note: 'Jobs board column' },
  'workouts: recent': { table: 'workouts', sql: `select * from workouts order by workout_date desc, id desc limit 50`, note: 'Fitness history' },
  'calendar_events: week window': { table: 'calendar_events', sql: `select * from calendar_events where starts_at >= now() - interval '7 days' and starts_at < now() + interval '7 days' order by starts_at, id`, note: 'Calendar view' },
  'notifications: inbox page': { table: 'notifications', sql: `select * from notifications where dismissed_at is null order by created_at desc, id desc limit 25`, note: 'Notification centre' },
  'notifications: unread count': { table: 'notifications', sql: `select count(*) from notifications where dismissed_at is null and read_at is null`, note: 'badge' },
  'audit_events: page + filter': { table: 'audit_events', sql: `select id,seq,occurred_at,action,entity from audit_events where entity = 'tasks' order by occurred_at desc, seq desc limit 25`, note: 'Audit page, entity filter' },
  'audit_events: date range': { table: 'audit_events', sql: `select id from audit_events where occurred_at >= now() - interval '2 days' order by occurred_at desc, seq desc limit 25`, note: 'Audit page, date filter' },
}

function seed(from: number, n: number) {
  const days = (col: string) => `current_date - ((g * 7919) % 1500)`
  return [
    `insert into tasks (user_id,title,status,due_date,created_at,updated_at) select :u, 'Task '||g, (array['pending','in_progress','done','done','skipped'])[1+g%5], ${days('')}, now() - (g||' minutes')::interval, now() - (g||' minutes')::interval from generate_series(${from},${n}) g`,
    `insert into transactions (user_id,type,amount_paise,category,txn_date,created_at,updated_at) select :u, (array['expense','expense','income','savings'])[1+g%4], 100+g%9000, 'Food', ${days('')}, now() - (g||' minutes')::interval, now() - (g||' minutes')::interval from generate_series(${from},${n}) g`,
    `insert into habits (id,user_id,name) values ('00000000-0000-0000-0000-0000000000aa', :u, 'bench') on conflict do nothing`,
    `insert into habit_logs (user_id,habit_id,log_date,created_at,updated_at) select :u, '00000000-0000-0000-0000-0000000000aa', current_date - g, now() - (g||' minutes')::interval, now() - (g||' minutes')::interval from generate_series(${from},${n}) g`,
    `insert into study_sessions (user_id,session_date,status,duration_seconds,created_at,updated_at) select :u, ${days('')}, 'completed', 600, now() - (g||' minutes')::interval, now() - (g||' minutes')::interval from generate_series(${from},${n}) g`,
    `insert into job_applications (user_id,company,job_title,status,created_at,updated_at) select :u, 'Co'||g, 'Dev', (array['interested','applied','interview','rejected','selected'])[1+g%5], now() - (g||' minutes')::interval, now() - (g||' minutes')::interval from generate_series(${from},${n}) g`,
    `insert into workouts (user_id,workout_date,created_at,updated_at) select :u, ${days('')}, now() - (g||' minutes')::interval, now() - (g||' minutes')::interval from generate_series(${from},${n}) g`,
    `insert into calendar_events (user_id,title,starts_at,ends_at,created_at,updated_at) select :u, 'Event '||g, now() + ((g%4000-2000)||' hours')::interval, now() + ((g%4000-2000)||' hours')::interval + interval '1 hour', now() - (g||' minutes')::interval, now() - (g||' minutes')::interval from generate_series(${from},${n}) g`,
    `insert into notifications (user_id,title,kind,read_at,dismissed_at,created_at,updated_at) select :u, 'N'||g, 'task', case when g%3=0 then now() end, case when g%10<7 then now() end, now() - (g||' minutes')::interval, now() - (g||' minutes')::interval from generate_series(${from},${n}) g`,
  ]
}
const seedAudit = (from: number, n: number) =>
  `insert into audit_events (user_id,occurred_at,action,operation,entity,record_id,summary,source,hash) select :u, now() - (g||' minutes')::interval, 'update','update',(array['tasks','transactions','goals','habits'])[1+g%4], g::text, 's','web','h'||g from generate_series(${from},${n}) g`

type Plan = { time: number; examined: number; returned: number; scans: string[]; index: string[] }
function walk(node: any, acc: Plan) {
  const t = node['Node Type'] as string
  if (/Scan/.test(t)) {
    const loops = node['Actual Loops'] ?? 1
    acc.examined += (node['Actual Rows'] ?? 0) * loops + (node['Rows Removed by Filter'] ?? 0) + (node['Rows Removed by Index Recheck'] ?? 0)
    acc.scans.push(t)
    if (node['Index Name']) acc.index.push(node['Index Name'])
  }
  for (const c of node.Plans ?? []) walk(c, acc)
}

async function main() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(AUTH_STUB)
  const bench: any = { engine: 'PGlite (WASM Postgres)', generated: new Date().toISOString(), sizes, results: {} }
  for (const f of files.filter((x) => x < SPLIT)) await db.exec(readFileSync(new URL(f, MIG), 'utf8'))
  const uid = (await db.query<{ id: string }>(`insert into auth.users(email) values ('bench@example.com') returning id`)).rows[0].id
  const run = async (label: 'before' | 'after', n: number) => {
    await db.exec(`reset role`)
    await db.exec(`analyze`)
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false); select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',false);`)
    for (const [name, q] of Object.entries(QUERIES)) {
      const times: number[] = []
      let acc: Plan = { time: 0, examined: 0, returned: 0, scans: [], index: [] }
      for (let i = 0; i < 5; i++) {
        const r = await db.query<any>(`explain (analyze, format json) ${q.sql}`)
        const j = (r.rows[0] as any)['QUERY PLAN'][0]
        times.push(j['Execution Time'])
        if (i === 4) { acc = { time: 0, examined: 0, returned: j.Plan['Actual Rows'], scans: [], index: [] }; walk(j.Plan, acc) }
      }
      times.sort((a, b) => a - b)
      ;(bench.results[n] ??= {})[name] = { ...(bench.results[n][name] ?? {}), table: q.table, note: q.note, [label]: { ms: +times[2].toFixed(2), examined: acc.examined, returned: acc.returned, scans: [...new Set(acc.scans)], indexes: [...new Set(acc.index)] } }
    }
    await db.exec(`reset role`)
  }
  let have = 0
  for (const n of sizes) {
    await db.exec(`set session_replication_role = replica`) // seed without firing triggers (audit, webhooks): the benchmark seeds audit rows itself
    for (const s of seed(have + 1, n)) await db.query(s.replace(/:u/g, `'${uid}'`))
    await db.query(seedAudit(have + 1, n).replace(/:u/g, `'${uid}'`))
    await db.exec(`set session_replication_role = origin`)
    have = n
    const hasIdx = files.some((x) => x >= SPLIT)
    await run('before', n)
    if (hasIdx) {
      // apply 0028+ once, on the first size; later sizes grow the same database, so "after" is measured with the indexes maintained during the load
    }
  }
  // After: apply the new migrations to the final database and time again at the largest size; smaller sizes are re-seeded below.
  const t0 = Date.now()
  for (const f of files.filter((x) => x >= SPLIT)) await db.exec(readFileSync(new URL(f, MIG), 'utf8'))
  bench.indexBuildMs = Date.now() - t0
  const last = sizes[sizes.length - 1]
  await run('after', last)
  if (out) writeFileSync(out, JSON.stringify(bench, null, 2))
  console.log(JSON.stringify(bench, null, 1).slice(0, 200))
  await db.close()
}
main()
