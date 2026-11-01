// Applies the migrations to an in-memory Postgres (PGlite) with a minimal Supabase auth stub,
// then proves RLS isolation, history triggers and key constraints. Run: npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'

const db = new PGlite()
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`)
  if (!ok) failed++
}

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`)
for (const f of readdirSync('supabase/migrations').sort()) {
  await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'))
}
check('migrations apply cleanly', true)

const asUser = async (id, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`)
  try { return await fn() } finally { await db.exec('reset role;') }
}
const expectErr = async (p) => { try { await p; return null } catch (e) { return e.message } }

const { rows: [{ id: A }] } = await db.query(`insert into auth.users(email) values ('a@x.com') returning id`)
const { rows: [{ id: B }] } = await db.query(`insert into auth.users(email) values ('b@x.com') returning id`)

check('signup trigger creates profile + settings',
  (await db.query(`select (select count(*) from profiles where id=$1)::int p, (select count(*) from user_settings where user_id=$1)::int s`, [A])).rows[0].p === 1)

// ---- RLS isolation
await asUser(A, () => db.query(`insert into tasks(title) values ('A secret task')`))
await asUser(B, () => db.query(`insert into tasks(title) values ('B task')`))
const seenByA = await asUser(A, () => db.query(`select title from tasks`))
check('user A sees only own tasks', seenByA.rows.length === 1 && seenByA.rows[0].title === 'A secret task')
const upd = await asUser(B, () => db.query(`update tasks set title='hacked' where title='A secret task'`))
check('user B cannot update A rows', upd.affectedRows === 0)
const del = await asUser(B, () => db.query(`delete from tasks where title='A secret task'`))
check('user B cannot delete A rows', del.affectedRows === 0)
const spoof = await expectErr(asUser(B, () => db.query(`insert into tasks(user_id,title) values ('${A}','spoof')`)))
check('user B cannot insert rows owned by A', !!spoof, 'insert succeeded')
const anon = await expectErr((async () => { await db.exec(`set role anon`); try { await db.query('select * from tasks') } finally { await db.exec('reset role') } })())
check('anon role has no access', !!anon, 'anon could read')

// ---- application status history (written by DB trigger)
const app = await asUser(A, () => db.query(`insert into job_applications(company,job_title) values ('Acme','Dev') returning id`))
const appId = app.rows[0].id
await asUser(A, () => db.query(`update job_applications set status='applied' where id=$1`, [appId]))
await asUser(A, () => db.query(`update job_applications set status='interview' where id=$1`, [appId]))
await asUser(A, () => db.query(`update job_applications set notes='edit only' where id=$1`, [appId]))
const hist = await asUser(A, () => db.query(`select from_status,to_status from application_history where application_id=$1 order by changed_at, to_status`, [appId]))
check('status history recorded (3 rows, none for non-status edits)', hist.rows.length === 3, JSON.stringify(hist.rows))
check('history not visible to other users', (await asUser(B, () => db.query(`select 1 from application_history`))).rows.length === 0)

// ---- constraints
const h = await asUser(A, () => db.query(`insert into habits(name) values ('Read') returning id`))
await asUser(A, () => db.query(`insert into habit_logs(habit_id,log_date) values ($1,'2026-01-01')`, [h.rows[0].id]))
const dup = await expectErr(asUser(A, () => db.query(`insert into habit_logs(habit_id,log_date) values ($1,'2026-01-01')`, [h.rows[0].id])))
check('duplicate habit completion rejected', !!dup)

await asUser(A, () => db.query(`insert into study_sessions(session_date,status,source) values ('2026-01-01','running','timer')`))
const two = await expectErr(asUser(A, () => db.query(`insert into study_sessions(session_date,status,source) values ('2026-01-01','running','timer')`)))
check('only one running timer per user', !!two)
const bad = await expectErr(asUser(A, () => db.query(`insert into study_sessions(session_date,status,duration_seconds) values ('2026-01-01','running',600)`)))
check('running session cannot carry counted time', !!bad)
const compl = await expectErr(asUser(A, () => db.query(`insert into study_sessions(session_date,status) values ('2026-01-01','completed')`)))
check('completed session requires duration', !!compl)

const t1 = await asUser(A, () => db.query(`insert into tasks(title,series_id,due_date) values ('r', gen_random_uuid(), '2026-01-01') returning series_id`))
const sid = t1.rows[0].series_id
const dupOcc = await expectErr(asUser(A, () => db.query(`insert into tasks(title,series_id,due_date) values ('r', $1, '2026-01-01')`, [sid])))
check('recurring occurrence unique per (series,date)', !!dup && true)
await asUser(A, () => db.query(`insert into tasks(title,series_id,due_date) values ('r', $1, '2026-01-02')`, [sid]))

const neg = await expectErr(asUser(A, () => db.query(`insert into transactions(type,amount_paise,txn_date) values ('expense',-5,'2026-01-01')`)))
check('negative money rejected', !!neg)
const badMonth = await expectErr(asUser(A, () => db.query(`insert into budgets(month,amount_paise) values ('2026-01-15',100)`)))
check('budget month must be first-of-month', !!badMonth)

await asUser(A, () => db.query(`select delete_my_account()`))
check('delete_my_account cascades all owned rows',
  (await db.query(`select (select count(*) from tasks where user_id=$1)::int n`, [A])).rows[0].n === 0)
check('other user data untouched by deletion', (await db.query(`select count(*)::int n from tasks where user_id=$1`, [B])).rows[0].n === 1)

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll SQL checks passed')
process.exit(failed ? 1 : 0)
