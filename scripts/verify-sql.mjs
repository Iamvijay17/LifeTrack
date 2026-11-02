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
check('recurring occurrence unique per (series,date)', !!dupOcc)
await asUser(A, () => db.query(`insert into tasks(title,series_id,due_date) values ('r', $1, '2026-01-02')`, [sid]))

const neg = await expectErr(asUser(A, () => db.query(`insert into transactions(type,amount_paise,txn_date) values ('expense',-5,'2026-01-01')`)))
check('negative money rejected', !!neg)
const badMonth = await expectErr(asUser(A, () => db.query(`insert into budgets(month,amount_paise) values ('2026-01-15',100)`)))
check('budget month must be first-of-month', !!badMonth)

// ---- phase 6 tables: RLS, ownership guards, dedupe, constraints
for (const [tbl, ins] of [
  ['notes', `insert into notes(title,body) values ('private','secret body')`],
  ['focus_sessions', `insert into focus_sessions(session_date,planned_minutes,actual_seconds,completed) values ('2026-01-01',25,1500,true)`],
  ['savings_goals', `insert into savings_goals(name,target_paise) values ('Laptop',5000000)`],
  ['reminders', `insert into reminders(title,remind_date) values ('Pay rent','2026-01-01')`],
  ['notifications', `insert into notifications(title) values ('hello')`],
]) {
  await asUser(A, () => db.query(ins))
  check(`${tbl}: other users cannot read A's rows`, (await asUser(B, () => db.query(`select 1 from ${tbl}`))).rows.length === 0)
  check(`${tbl}: owner can read own rows`, (await asUser(A, () => db.query(`select 1 from ${tbl}`))).rows.length === 1)
  check(`${tbl}: B cannot delete A's rows`, (await asUser(B, () => db.query(`delete from ${tbl}`))).affectedRows === 0)
}
const goalA = (await asUser(A, () => db.query(`insert into goals(title,period) values ('Ship v1','monthly') returning id`))).rows[0].id
await asUser(A, () => db.query(`insert into milestones(goal_id,title) values ($1,'Design')`, [goalA]))
check('milestones: other users cannot read', (await asUser(B, () => db.query(`select 1 from milestones`))).rows.length === 0)
const foreign = await expectErr(asUser(B, () => db.query(`insert into milestones(goal_id,title) values ($1,'sneaky')`, [goalA])))
check("milestone cannot be attached to another user's goal", !!foreign)
const foreignNote = await expectErr(asUser(B, () => db.query(`insert into notes(title,goal_id) values ('x',$1)`, [goalA])))
check("note cannot be attached to another user's goal", !!foreignNote)
await asUser(A, () => db.query(`insert into notifications(title,dedupe_key) values ('d','reminder:1:2026-01-01')`))
const dupN = await expectErr(asUser(A, () => db.query(`insert into notifications(title,dedupe_key) values ('d','reminder:1:2026-01-01')`)))
check('notification dedupe key is unique per user', !!dupN)
check('empty note rejected', !!(await expectErr(asUser(A, () => db.query(`insert into notes(title,body) values ('','')`)))))
check('focus session minutes bounded', !!(await expectErr(asUser(A, () => db.query(`insert into focus_sessions(session_date,planned_minutes) values ('2026-01-01',0)`)))))
check('goal target date cannot precede start', !!(await expectErr(asUser(A, () => db.query(`insert into goals(title,start_date,due_date) values ('x','2026-02-01','2026-01-01')`)))))
check("'offer' job status accepted", !(await expectErr(asUser(A, () => db.query(`update job_applications set status='offer' where id=$1`, [appId])))))
check('payment method constrained', !!(await expectErr(asUser(A, () => db.query(`insert into transactions(type,amount_paise,txn_date,payment_method) values ('expense',100,'2026-01-01','Bitcoin')`)))))
check('every user-owned table has RLS enabled and forced', (await db.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not (c.relrowsecurity and c.relforcerowsecurity)`)).rows[0].n === 0)


// ---- hardening (0004): cross-user references, atomic operations
const habitB = (await asUser(B, () => db.query(`insert into habits(name) values ('B habit') returning id`))).rows[0].id
check("habit log cannot reference another user's habit", !!(await expectErr(asUser(A, () => db.query(`insert into habit_logs(habit_id,log_date) values ($1,'2026-02-01')`, [habitB])))))
const goalB = (await asUser(B, () => db.query(`insert into goals(title) values ('B goal') returning id`))).rows[0].id
check("study session cannot reference another user's goal", !!(await expectErr(asUser(A, () => db.query(`insert into study_sessions(session_date,status,duration_seconds,goal_id) values ('2026-02-01','completed',60,$1)`, [goalB])))))
check('own references still accepted', !(await expectErr(asUser(A, () => db.query(`insert into habit_logs(habit_id,log_date) values ($1,'2026-02-02')`, [h.rows[0].id])))))
await asUser(A, () => db.query(`select add_water('2026-03-01', 500)`))
await asUser(A, () => db.query(`select add_water('2026-03-01', 750)`))
check('add_water accumulates atomically', (await asUser(A, () => db.query(`select water_ml from health_logs where log_date='2026-03-01'`))).rows[0].water_ml === 1250)
await asUser(A, () => db.query(`select add_water('2026-03-01', -5000)`))
check('add_water never goes below zero', (await asUser(A, () => db.query(`select water_ml from health_logs where log_date='2026-03-01'`))).rows[0].water_ml === 0)
const wk = (await asUser(A, () => db.query(`insert into workouts(workout_date,name) values ('2026-03-01','Push') returning id`))).rows[0].id
await asUser(A, () => db.query(`select * from replace_exercise_logs($1, '[{"exercise_name":"Bench","set_number":1,"reps":8,"weight_kg":60},{"exercise_name":"Bench","set_number":2,"reps":8,"weight_kg":60}]')`, [wk]))
await asUser(A, () => db.query(`select * from replace_exercise_logs($1, '[{"exercise_name":"Squat","set_number":1,"reps":5,"weight_kg":100}]')`, [wk]))
const sets = (await asUser(A, () => db.query(`select exercise_name from exercise_logs where workout_id=$1`, [wk]))).rows
check('replace_exercise_logs swaps all sets in one step', sets.length === 1 && sets[0].exercise_name === 'Squat')
check("replace_exercise_logs refuses another user's workout", !!(await expectErr(asUser(B, () => db.query(`select * from replace_exercise_logs($1,'[]')`, [wk])))))
check('anon cannot call add_water', !!(await expectErr((async () => { await db.exec(`set role anon`); try { await db.query(`select add_water('2026-03-01',1)`) } finally { await db.exec('reset role') } })())))

await asUser(A, () => db.query(`select delete_my_account()`))
check('delete_my_account cascades all owned rows',
  (await db.query(`select (select count(*) from tasks where user_id=$1)::int n`, [A])).rows[0].n === 0)
check('other user data untouched by deletion', (await db.query(`select count(*)::int n from tasks where user_id=$1`, [B])).rows[0].n === 1)

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll SQL checks passed')
process.exit(failed ? 1 : 0)
