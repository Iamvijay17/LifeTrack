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
  try {
    return await fn()
  } finally {
    await db.exec('reset role;')
  }
}
const expectErr = async (p) => {
  try {
    await p
    return null
  } catch (e) {
    return e.message
  }
}

const {
  rows: [{ id: A }],
} = await db.query(`insert into auth.users(email) values ('a@x.com') returning id`)
const {
  rows: [{ id: B }],
} = await db.query(`insert into auth.users(email) values ('b@x.com') returning id`)

check(
  'signup trigger creates profile + settings',
  (
    await db.query(
      `select (select count(*) from profiles where id=$1)::int p, (select count(*) from user_settings where user_id=$1)::int s`,
      [A],
    )
  ).rows[0].p === 1,
)

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
const anon = await expectErr(
  (async () => {
    await db.exec(`set role anon`)
    try {
      await db.query('select * from tasks')
    } finally {
      await db.exec('reset role')
    }
  })(),
)
check('anon role has no access', !!anon, 'anon could read')

// ---- application status history (written by DB trigger)
const app = await asUser(A, () => db.query(`insert into job_applications(company,job_title) values ('Acme','Dev') returning id`))
const appId = app.rows[0].id
await asUser(A, () => db.query(`update job_applications set status='applied' where id=$1`, [appId]))
await asUser(A, () => db.query(`update job_applications set status='interview' where id=$1`, [appId]))
await asUser(A, () => db.query(`update job_applications set notes='edit only' where id=$1`, [appId]))
const hist = await asUser(A, () =>
  db.query(`select from_status,to_status from application_history where application_id=$1 order by changed_at, to_status`, [appId]),
)
check('status history recorded (3 rows, none for non-status edits)', hist.rows.length === 3, JSON.stringify(hist.rows))
check('history not visible to other users', (await asUser(B, () => db.query(`select 1 from application_history`))).rows.length === 0)

// ---- constraints
const h = await asUser(A, () => db.query(`insert into habits(name) values ('Read') returning id`))
await asUser(A, () => db.query(`insert into habit_logs(habit_id,log_date) values ($1,'2026-01-01')`, [h.rows[0].id]))
const dup = await expectErr(asUser(A, () => db.query(`insert into habit_logs(habit_id,log_date) values ($1,'2026-01-01')`, [h.rows[0].id])))
check('duplicate habit completion rejected', !!dup)

await asUser(A, () => db.query(`insert into study_sessions(session_date,status,source) values ('2026-01-01','running','timer')`))
const two = await expectErr(
  asUser(A, () => db.query(`insert into study_sessions(session_date,status,source) values ('2026-01-01','running','timer')`)),
)
check('only one running timer per user', !!two)
const bad = await expectErr(
  asUser(A, () => db.query(`insert into study_sessions(session_date,status,duration_seconds) values ('2026-01-01','running',600)`)),
)
check('running session cannot carry counted time', !!bad)
const compl = await expectErr(
  asUser(A, () => db.query(`insert into study_sessions(session_date,status) values ('2026-01-01','completed')`)),
)
check('completed session requires duration', !!compl)

const t1 = await asUser(A, () =>
  db.query(`insert into tasks(title,series_id,due_date) values ('r', gen_random_uuid(), '2026-01-01') returning series_id`),
)
const sid = t1.rows[0].series_id
const dupOcc = await expectErr(
  asUser(A, () => db.query(`insert into tasks(title,series_id,due_date) values ('r', $1, '2026-01-01')`, [sid])),
)
check('recurring occurrence unique per (series,date)', !!dupOcc)
await asUser(A, () => db.query(`insert into tasks(title,series_id,due_date) values ('r', $1, '2026-01-02')`, [sid]))

const neg = await expectErr(
  asUser(A, () => db.query(`insert into transactions(type,amount_paise,txn_date) values ('expense',-5,'2026-01-01')`)),
)
check('negative money rejected', !!neg)
const badMonth = await expectErr(asUser(A, () => db.query(`insert into budgets(month,amount_paise) values ('2026-01-15',100)`)))
check('budget month must be first-of-month', !!badMonth)

// ---- phase 6 tables: RLS, ownership guards, dedupe, constraints
for (const [tbl, ins] of [
  ['notes', `insert into notes(title,body) values ('private','secret body')`],
  [
    'focus_sessions',
    `insert into focus_sessions(session_date,planned_minutes,actual_seconds,completed) values ('2026-01-01',25,1500,true)`,
  ],
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
check(
  'focus session minutes bounded',
  !!(await expectErr(asUser(A, () => db.query(`insert into focus_sessions(session_date,planned_minutes) values ('2026-01-01',0)`)))),
)
check(
  'goal target date cannot precede start',
  !!(await expectErr(asUser(A, () => db.query(`insert into goals(title,start_date,due_date) values ('x','2026-02-01','2026-01-01')`)))),
)
check(
  "'offer' job status accepted",
  !(await expectErr(asUser(A, () => db.query(`update job_applications set status='offer' where id=$1`, [appId])))),
)
check(
  'payment method constrained',
  !!(await expectErr(
    asUser(A, () =>
      db.query(`insert into transactions(type,amount_paise,txn_date,payment_method) values ('expense',100,'2026-01-01','Bitcoin')`),
    ),
  )),
)
check(
  'every user-owned table has RLS enabled and forced',
  (
    await db.query(
      `select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not (c.relrowsecurity and c.relforcerowsecurity)`,
    )
  ).rows[0].n === 0,
)

// ---- 0004 + 0005: every foreign key is indexed; every parent link is same-owner guarded
{
  const { rows: fks } = await db.query(`
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1`)
  const { rows: idx } = await db.query(`
    select i.indrelid::regclass::text as tbl, a.attname as col
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid::regclass::text like 'public.%' or i.indrelid::regclass::text not like '%.%'`)
  const covered = new Set(idx.map((r) => `${r.tbl.replace('public.', '')}.${r.col}`))
  const missing = fks.map((f) => `${f.tbl.replace('public.', '')}.${f.col}`).filter((k) => !covered.has(k))
  check(`every foreign-key column has an index (${fks.length} checked)`, missing.length === 0, missing.join(', '))
}

// Parents owned by A, used as targets for B's attempts to attach to them.
const mk = async (user, sql) => (await asUser(user, () => db.query(sql))).rows[0].id
const topicA = await mk(A, `insert into learning_topics(group_name,name) values ('G','Topic A') returning id`)
const habitA = await mk(A, `insert into habits(name) values ('HabitA') returning id`)
const routineA = await mk(A, `insert into routines(name) values ('RoutineA') returning id`)
const workoutA = await mk(A, `insert into workouts(workout_date) values ('2026-01-01') returning id`)
const exerciseA = await mk(A, `insert into exercises(name) values ('ExA') returning id`)
const taskA = await mk(A, `insert into tasks(title) values ('TaskA') returning id`)
const parents = {
  goal: goalA,
  topic: topicA,
  habit: habitA,
  routine: routineA,
  workout: workoutA,
  exercise: exerciseA,
  task: taskA,
  app: appId,
}
const attach = {
  'goals.topic_id': (u, p) => `insert into goals(title,topic_id) values ('x','${p.topic}')`,
  'habit_logs.habit_id': (u, p) => `insert into habit_logs(habit_id,log_date) values ('${p.habit}','2026-02-01')`,
  'study_sessions.goal_id': (u, p) =>
    `insert into study_sessions(session_date,duration_seconds,goal_id) values ('2026-02-01',60,'${p.goal}')`,
  'study_sessions.topic_id': (u, p) =>
    `insert into study_sessions(session_date,duration_seconds,topic_id) values ('2026-02-01',60,'${p.topic}')`,
  'application_history.application_id': (u, p) => `insert into application_history(application_id,to_status) values ('${p.app}','applied')`,
  'interview_events.application_id': (u, p) => `insert into interview_events(application_id,scheduled_at) values ('${p.app}', now())`,
  'workouts.routine_id': (u, p) => `insert into workouts(workout_date,routine_id) values ('2026-02-01','${p.routine}')`,
  'exercise_logs.workout_id': (u, p) => `insert into exercise_logs(workout_id,exercise_name) values ('${p.workout}','Squat')`,
  'exercise_logs.exercise_id': (u, p) =>
    `insert into exercise_logs(workout_id,exercise_id,exercise_name) values ('${p.ownWorkout}','${p.exercise}','Squat')`,
  'milestones.goal_id': (u, p) => `insert into milestones(goal_id,title) values ('${p.goal}','m')`,
  'focus_sessions.task_id': (u, p) =>
    `insert into focus_sessions(session_date,planned_minutes,task_id) values ('2026-02-01',25,'${p.task}')`,
  'focus_sessions.topic_id': (u, p) =>
    `insert into focus_sessions(session_date,planned_minutes,topic_id) values ('2026-02-01',25,'${p.topic}')`,
  'notes.goal_id': (u, p) => `insert into notes(title,goal_id) values ('n','${p.goal}')`,
  'notes.task_id': (u, p) => `insert into notes(title,task_id) values ('n','${p.task}')`,
}
// B's own parents (so a "foreign" link is the only thing wrong with the row)
const own = {
  goal: await mk(B, `insert into goals(title) values ('B goal') returning id`),
  topic: await mk(B, `insert into learning_topics(group_name,name) values ('G','Topic B') returning id`),
  habit: await mk(B, `insert into habits(name) values ('HabitB') returning id`),
  routine: await mk(B, `insert into routines(name) values ('RoutineB') returning id`),
  workout: await mk(B, `insert into workouts(workout_date) values ('2026-01-01') returning id`),
  exercise: await mk(B, `insert into exercises(name) values ('ExB') returning id`),
  task: await mk(B, `insert into tasks(title) values ('TaskB') returning id`),
  app: await mk(B, `insert into job_applications(company,job_title) values ('BCo','Dev') returning id`),
}
for (const [link, sqlFor] of Object.entries(attach)) {
  const foreignErr = await expectErr(asUser(B, () => db.query(sqlFor(B, { ...parents, ownWorkout: own.workout }))))
  check(
    `cannot attach to another user's parent: ${link}`,
    !!foreignErr && /23503|does not refer|does not belong|violates|row-level/i.test(foreignErr + ''),
    foreignErr ?? 'insert succeeded',
  )
  const okErr = await expectErr(asUser(B, () => db.query(sqlFor(B, { ...own, ownWorkout: own.workout }))))
  check(`can attach to own parent: ${link}`, okErr === null, okErr ?? '')
}
// updates are guarded too: re-pointing an existing child at a foreign parent must fail
const ownNote = await mk(B, `insert into notes(title) values ('mine') returning id`)
check(
  "updating a link to another user's parent is rejected",
  !!(await expectErr(asUser(B, () => db.query(`update notes set goal_id='${goalA}' where id='${ownNote}'`)))),
)
check(
  'updating unrelated columns on a linked row still works',
  (await expectErr(asUser(B, () => db.query(`update notes set title='renamed' where id='${ownNote}'`)))) === null,
)
check(
  'clearing a link (NULL) is allowed',
  (await expectErr(asUser(B, () => db.query(`update notes set goal_id=null where id='${ownNote}'`)))) === null,
)

const bTasksBefore = (await db.query(`select count(*)::int n from tasks where user_id=$1`, [B])).rows[0].n

// ---- hardening (0004): cross-user references, atomic operations
const habitB = (await asUser(B, () => db.query(`insert into habits(name) values ('B habit') returning id`))).rows[0].id
check(
  "habit log cannot reference another user's habit",
  !!(await expectErr(asUser(A, () => db.query(`insert into habit_logs(habit_id,log_date) values ($1,'2026-02-01')`, [habitB])))),
)
const goalB = (await asUser(B, () => db.query(`insert into goals(title) values ('B goal') returning id`))).rows[0].id
check(
  "study session cannot reference another user's goal",
  !!(await expectErr(
    asUser(A, () =>
      db.query(`insert into study_sessions(session_date,status,duration_seconds,goal_id) values ('2026-02-01','completed',60,$1)`, [goalB]),
    ),
  )),
)
check(
  'own references still accepted',
  !(await expectErr(asUser(A, () => db.query(`insert into habit_logs(habit_id,log_date) values ($1,'2026-02-02')`, [h.rows[0].id])))),
)
await asUser(A, () => db.query(`select add_water('2026-03-01', 500)`))
await asUser(A, () => db.query(`select add_water('2026-03-01', 750)`))
check(
  'add_water accumulates atomically',
  (await asUser(A, () => db.query(`select water_ml from health_logs where log_date='2026-03-01'`))).rows[0].water_ml === 1250,
)
await asUser(A, () => db.query(`select add_water('2026-03-01', -5000)`))
check(
  'add_water never goes below zero',
  (await asUser(A, () => db.query(`select water_ml from health_logs where log_date='2026-03-01'`))).rows[0].water_ml === 0,
)
const wk = (await asUser(A, () => db.query(`insert into workouts(workout_date,name) values ('2026-03-01','Push') returning id`))).rows[0].id
await asUser(A, () =>
  db.query(
    `select * from replace_exercise_logs($1, '[{"exercise_name":"Bench","set_number":1,"reps":8,"weight_kg":60},{"exercise_name":"Bench","set_number":2,"reps":8,"weight_kg":60}]')`,
    [wk],
  ),
)
await asUser(A, () =>
  db.query(`select * from replace_exercise_logs($1, '[{"exercise_name":"Squat","set_number":1,"reps":5,"weight_kg":100}]')`, [wk]),
)
const sets = (await asUser(A, () => db.query(`select exercise_name from exercise_logs where workout_id=$1`, [wk]))).rows
check('replace_exercise_logs swaps all sets in one step', sets.length === 1 && sets[0].exercise_name === 'Squat')
check(
  "replace_exercise_logs refuses another user's workout",
  !!(await expectErr(asUser(B, () => db.query(`select * from replace_exercise_logs($1,'[]')`, [wk])))),
)
check(
  'anon cannot call add_water',
  !!(await expectErr(
    (async () => {
      await db.exec(`set role anon`)
      try {
        await db.query(`select add_water('2026-03-01',1)`)
      } finally {
        await db.exec('reset role')
      }
    })(),
  )),
)

// ---- push tokens (migration 0006)
const T1 = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', T2 = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]'
await asUser(A, () => db.query(`select register_push_token($1,'ios','Vijay iPhone')`, [T1]))
check('push tokens: owner can read own token', (await asUser(A, () => db.query(`select 1 from device_push_tokens`))).rows.length === 1)
check("push tokens: other users cannot read A's tokens", (await asUser(B, () => db.query(`select 1 from device_push_tokens`))).rows.length === 0)
check('push tokens: direct insert is denied (must use the RPC)', !!(await expectErr(asUser(A, () => db.query(`insert into device_push_tokens(token,platform) values ($1,'android')`, [T2])))))
check('push tokens: direct update is denied', !!(await expectErr(asUser(A, () => db.query(`update device_push_tokens set user_id=$1`, [B])))))
check("push tokens: B cannot delete A's tokens", (await asUser(B, () => db.query(`delete from device_push_tokens`))).affectedRows === 0)
await asUser(B, () => db.query(`select unregister_push_token($1)`, [T1]))
check("push tokens: B cannot unregister A's token", (await asUser(A, () => db.query(`select 1 from device_push_tokens`))).rows.length === 1)
await asUser(A, () => db.query(`select register_push_token($1,'ios','Renamed')`, [T1]))
check('push tokens: re-registering the same token is idempotent (one row, updated name)', (await asUser(A, () => db.query(`select device_name from device_push_tokens`))).rows.map((r) => r.device_name).join() === 'Renamed')
await asUser(B, () => db.query(`select register_push_token($1,'android','Shared phone')`, [T1]))
check('push tokens: a token signed in by another user moves to them', (await asUser(B, () => db.query(`select 1 from device_push_tokens`))).rows.length === 1 && (await asUser(A, () => db.query(`select 1 from device_push_tokens`))).rows.length === 0)
check('push tokens: invalid token format rejected', !!(await expectErr(asUser(A, () => db.query(`select register_push_token('not-a-token','ios','x')`)))))
check('push tokens: invalid platform rejected', !!(await expectErr(asUser(A, () => db.query(`select register_push_token($1,'windows','x')`, [T2])))))
await db.exec('set role anon;')
const anonCall = await expectErr(db.query(`select register_push_token($1,'ios','x')`, [T2]))
await db.exec('reset role;')
check('push tokens: anon cannot register', !!anonCall)
await asUser(B, () => db.query(`select unregister_push_token($1)`, [T1]))
check('push tokens: owner can unregister', (await asUser(B, () => db.query(`select 1 from device_push_tokens`))).rows.length === 0)
await asUser(A, () => db.query(`select register_push_token($1,'ios','will be deleted with the account')`, [T2]))

await asUser(A, () => db.query(`select delete_my_account()`))
check('delete_my_account also removes push tokens', (await db.query(`select count(*)::int n from device_push_tokens where user_id=$1`, [A])).rows[0].n === 0)
check(
  'delete_my_account cascades all owned rows',
  (await db.query(`select (select count(*) from tasks where user_id=$1)::int n`, [A])).rows[0].n === 0,
)
check(
  'other user data untouched by deletion',
  bTasksBefore > 0 && (await db.query(`select count(*)::int n from tasks where user_id=$1`, [B])).rows[0].n === bTasksBefore,
)

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll SQL checks passed')
process.exit(failed ? 1 : 0)
