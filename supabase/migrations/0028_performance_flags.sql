-- 0028: database performance + feature flags and experiments. ADDITIVE: new indexes, new tables, new functions. No existing row, column, policy or index is changed
-- or dropped, and the running web and mobile apps keep working without it (the web app falls back to built-in defaults when the new functions are missing).
--
--   1. Indexes chosen from the app's real query patterns (see docs/DATABASE_PERFORMANCE.md for the measurements behind each).
--   2. Database performance monitoring for administrators (System Health Center): snapshots, client query statistics, `admin_db_*` functions.
--   3. Feature flags (per environment, rollout, targeting), emergency controls, change history with rollback, and experiments.
--
-- Creating the indexes takes a short write lock on each table. For a big table, create the same index by hand first with CREATE INDEX CONCURRENTLY (a migration
-- runs in a transaction and cannot); `if not exists` then makes this file skip it.

-- =============================================================================================================================== 1. indexes
-- The data adapter reads whole tables in (created_at, id) order (a stable page order), and the paged lists use the same keyset. Without an index the database
-- sorts every row of the person on each page.
create index if not exists tasks_user_created_idx            on public.tasks (user_id, created_at, id);
create index if not exists transactions_user_created_idx     on public.transactions (user_id, created_at, id);
create index if not exists habit_logs_user_created_idx       on public.habit_logs (user_id, created_at, id);
create index if not exists study_sessions_user_created_idx   on public.study_sessions (user_id, created_at, id);
create index if not exists workouts_user_created_idx         on public.workouts (user_id, created_at, id);
create index if not exists food_logs_user_created_idx        on public.food_logs (user_id, created_at, id);
create index if not exists calendar_events_user_created_idx  on public.calendar_events (user_id, created_at, id);
create index if not exists job_applications_user_created_idx on public.job_applications (user_id, created_at, id);
create index if not exists notifications_user_created_idx    on public.notifications (user_id, created_at, id);
-- A status filter with a newest-first sort (done tasks, applications in one column). It starts with the columns of tasks_user_status_idx / jobs_user_status_idx,
-- so it can serve every query those serve; those two are left in place (dropping is a separate, deliberate step: see docs/DATABASE_PERFORMANCE.md).
create index if not exists tasks_user_status_created_idx     on public.tasks (user_id, status, created_at, id);
create index if not exists job_applications_user_status_updated_idx on public.job_applications (user_id, status, updated_at desc, id desc);
-- The unread badge counts only visible, unread notifications: a small partial index instead of the whole inbox.
create index if not exists notifications_unread_idx          on public.notifications (user_id, created_at desc) where dismissed_at is null and read_at is null;

-- =============================================================================================================================== 2. performance monitoring
-- What the browsers measured about their own requests, per hour and per "location" (table.operation). No user id, no parameters, no row content.
create table if not exists public.query_stats (
  bucket timestamptz not null,
  location text not null check (location ~ '^[a-z][a-z0-9_.]{0,59}$'),
  table_name text not null check (table_name ~ '^[a-z][a-z0-9_]{0,47}$'),
  operation text not null check (operation in ('select', 'insert', 'update', 'delete', 'rpc')),
  calls integer not null default 0,
  errors integer not null default 0,
  slow integer not null default 0,
  total_ms bigint not null default 0,
  max_ms integer not null default 0,
  rows_total bigint not null default 0,
  primary key (bucket, location)
);
alter table public.query_stats enable row level security;
alter table public.query_stats force row level security;
revoke all on public.query_stats from public, anon, authenticated;

-- Trend points: one row each time an administrator opens the performance view (at most one per 10 minutes).
create table if not exists public.db_perf_snapshots (
  at timestamptz primary key default now(),
  db_size_bytes bigint, connections integer, active_connections integer, max_connections integer,
  cache_hit_ratio numeric(6, 4), latency_ms integer, seq_scans bigint, idx_scans bigint, dead_tuples bigint, live_tuples bigint, slow_queries integer
);
alter table public.db_perf_snapshots enable row level security;
alter table public.db_perf_snapshots force row level security;
revoke all on public.db_perf_snapshots from public, anon, authenticated;

-- The browser reports its own request timings in batches. Rate-limited per person, validated, and it only ever adds counters.
create or replace function public.report_query_stats(p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r jsonb; n integer := 0; v_loc text; v_tab text; v_op text;
begin
  if v_uid is null then return 0; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60 then return 0; end if;
  if not (public._rate_hit('qs:' || v_uid::text, 12, 3600) ->> 'allowed')::boolean then return 0; end if; -- 12 batches per hour per person
  for r in select * from jsonb_array_elements(p_rows) loop
    v_tab := r ->> 'table'; v_op := r ->> 'op'; v_loc := v_tab || '.' || v_op;
    continue when v_tab !~ '^[a-z][a-z0-9_]{0,47}$' or v_op not in ('select', 'insert', 'update', 'delete', 'rpc');
    continue when coalesce((r ->> 'calls')::integer, 0) not between 1 and 100000;
    insert into public.query_stats (bucket, location, table_name, operation, calls, errors, slow, total_ms, max_ms, rows_total)
    values (date_trunc('hour', now()), v_loc, v_tab, v_op, (r ->> 'calls')::integer, least(coalesce((r ->> 'errors')::integer, 0), 100000), least(coalesce((r ->> 'slow')::integer, 0), 100000),
            least(coalesce((r ->> 'total_ms')::bigint, 0), 86400000), least(coalesce((r ->> 'max_ms')::integer, 0), 600000), least(coalesce((r ->> 'rows')::bigint, 0), 100000000))
    on conflict (bucket, location) do update set calls = public.query_stats.calls + excluded.calls, errors = public.query_stats.errors + excluded.errors,
      slow = public.query_stats.slow + excluded.slow, total_ms = public.query_stats.total_ms + excluded.total_ms,
      max_ms = greatest(public.query_stats.max_ms, excluded.max_ms), rows_total = public.query_stats.rows_total + excluded.rows_total;
    n := n + 1;
  end loop;
  return n;
exception when others then return 0; -- measuring must never break the app
end $$;
revoke all on function public.report_query_stats(jsonb) from public, anon;
grant execute on function public.report_query_stats(jsonb) to authenticated;

-- Everything the Database Performance section shows, in one call: connections, latency, size, cache hit rate, per-table scan behaviour, index usage, slow
-- statements, aggregation timings and the trend. Real catalog numbers only (pg_stat_*): a view the server does not offer is reported as null, never invented.
create or replace function public.admin_db_overview(p_hours integer default 24) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hours integer := least(greatest(coalesce(p_hours, 24), 1), 720);
  t0 timestamptz; v_lat integer; v_conn jsonb; v_db jsonb; v_tables jsonb; v_indexes jsonb; v_slow jsonb := null; v_agg jsonb; v_trend jsonb; v_stmt regclass;
  v_hit numeric; v_ms1 numeric; v_ms2 numeric; v_conns integer; v_active integer; v_slow_n integer := 0;
begin
  perform public._require_admin();
  t0 := clock_timestamp(); perform 1; v_lat := greatest(1, round(extract(epoch from clock_timestamp() - t0) * 1000)::integer);

  select jsonb_build_object('total', count(*), 'active', count(*) filter (where state = 'active'), 'idle', count(*) filter (where state = 'idle'),
           'idle_in_transaction', count(*) filter (where state like 'idle in transaction%'), 'max', current_setting('max_connections')::integer)
    into v_conn from pg_catalog.pg_stat_activity where datname = current_database();
  v_conns := (v_conn ->> 'total')::integer; v_active := (v_conn ->> 'active')::integer;

  select jsonb_build_object('size_bytes', pg_database_size(current_database()), 'commits', xact_commit, 'rollbacks', xact_rollback, 'blocks_hit', blks_hit, 'blocks_read', blks_read,
           'deadlocks', deadlocks, 'temp_files', temp_files, 'stats_reset', stats_reset)
    into v_db from pg_catalog.pg_stat_database where datname = current_database();
  v_hit := case when coalesce((v_db ->> 'blocks_hit')::numeric, 0) + coalesce((v_db ->> 'blocks_read')::numeric, 0) > 0
                then (v_db ->> 'blocks_hit')::numeric / ((v_db ->> 'blocks_hit')::numeric + (v_db ->> 'blocks_read')::numeric) end;

  select coalesce(jsonb_agg(x order by (x ->> 'size_bytes')::bigint desc), '[]'::jsonb) into v_tables from (
    select jsonb_build_object('table', s.relname, 'rows', s.n_live_tup, 'dead_rows', s.n_dead_tup, 'size_bytes', pg_total_relation_size(s.relid),
             'seq_scans', s.seq_scan, 'seq_rows_read', s.seq_tup_read, 'index_scans', coalesce(s.idx_scan, 0), 'index_rows_fetched', coalesce(s.idx_tup_fetch, 0),
             'last_vacuum', greatest(s.last_vacuum, s.last_autovacuum), 'last_analyze', greatest(s.last_analyze, s.last_autoanalyze)) x
    from pg_catalog.pg_stat_user_tables s where s.schemaname = 'public' order by pg_total_relation_size(s.relid) desc limit 25) q;

  select coalesce(jsonb_agg(x order by (x ->> 'size_bytes')::bigint desc), '[]'::jsonb) into v_indexes from (
    select jsonb_build_object('table', s.relname, 'index', s.indexrelname, 'scans', s.idx_scan, 'size_bytes', pg_relation_size(s.indexrelid),
             'unique', i.indisunique, 'primary', i.indisprimary) x
    from pg_catalog.pg_stat_user_indexes s join pg_catalog.pg_index i on i.indexrelid = s.indexrelid where s.schemaname = 'public'
    order by pg_relation_size(s.indexrelid) desc limit 250) q;

  -- Slow statements: pg_stat_statements lives in the "extensions" schema on Supabase. Statement text has its parameters already replaced by $1, $2.
  v_stmt := coalesce(to_regclass('extensions.pg_stat_statements'), to_regclass('public.pg_stat_statements'));
  if v_stmt is not null then
    begin
      execute format($q$select coalesce(jsonb_agg(jsonb_build_object('query', left(regexp_replace(query, '\s+', ' ', 'g'), 200), 'calls', calls, 'mean_ms', round(mean_exec_time::numeric, 2),
                 'max_ms', round(max_exec_time::numeric), 'total_ms', round(total_exec_time::numeric), 'rows_per_call', round(rows::numeric / greatest(calls, 1), 1),
                 'cache_hit', case when shared_blks_hit + shared_blks_read > 0 then round(shared_blks_hit::numeric / (shared_blks_hit + shared_blks_read), 4) end)
                 order by mean_exec_time desc), '[]'::jsonb)
               from (select * from %s where calls >= 3 and mean_exec_time > 50 and query ~* '(from|into|update)\s+("?public"?\.)?"?[a-z_]+' and query not ilike '%%pg_stat%%'
                     and query not ilike '%%pg_catalog%%' order by mean_exec_time desc limit 15) s$q$, v_stmt) into v_slow;
      v_slow_n := jsonb_array_length(v_slow);
    exception when others then v_slow := null;
    end;
  end if;

  -- Aggregation timing: the same kind of work the reports do (count, group by day over a time range), on the audit history, measured here and now.
  t0 := clock_timestamp(); perform count(*) from public.audit_events; v_ms1 := round(extract(epoch from clock_timestamp() - t0) * 1000, 2);
  t0 := clock_timestamp(); perform count(*) from (select date_trunc('day', occurred_at) d, count(*) from public.audit_events where occurred_at >= now() - interval '30 days' group by 1) g;
  v_ms2 := round(extract(epoch from clock_timestamp() - t0) * 1000, 2);
  v_agg := jsonb_build_object('count_audit_ms', v_ms1, 'group_by_day_ms', v_ms2);

  -- one trend point per 10 minutes, and nothing older than 30 days
  insert into public.db_perf_snapshots (at, db_size_bytes, connections, active_connections, max_connections, cache_hit_ratio, latency_ms, seq_scans, idx_scans, dead_tuples, live_tuples, slow_queries)
  select now(), (v_db ->> 'size_bytes')::bigint, v_conns, v_active, (v_conn ->> 'max')::integer, round(v_hit, 4), v_lat,
         (select coalesce(sum(seq_scan), 0) from pg_catalog.pg_stat_user_tables where schemaname = 'public'),
         (select coalesce(sum(idx_scan), 0) from pg_catalog.pg_stat_user_tables where schemaname = 'public'),
         (select coalesce(sum(n_dead_tup), 0) from pg_catalog.pg_stat_user_tables where schemaname = 'public'),
         (select coalesce(sum(n_live_tup), 0) from pg_catalog.pg_stat_user_tables where schemaname = 'public'), v_slow_n
  where not exists (select 1 from public.db_perf_snapshots where at > now() - interval '10 minutes');
  delete from public.db_perf_snapshots where at < now() - interval '30 days';
  select coalesce(jsonb_agg(to_jsonb(s) order by s.at), '[]'::jsonb) into v_trend from public.db_perf_snapshots s where s.at >= now() - make_interval(hours => v_hours);

  return jsonb_build_object('generated_at', now(), 'hours', v_hours, 'latency_ms', v_lat, 'connections', v_conn, 'database', v_db, 'cache_hit_ratio', round(v_hit, 4),
    'tables', v_tables, 'indexes', v_indexes, 'slow_queries', v_slow, 'statements_available', v_stmt is not null, 'aggregation', v_agg, 'trend', v_trend);
end $$;
revoke all on function public.admin_db_overview(integer) from public, anon;
grant execute on function public.admin_db_overview(integer) to authenticated;

-- The query report: what the browsers ran, how often, how long, how many rows came back. Locations are "table.operation": no parameters, no ids, no content.
create or replace function public.admin_db_query_report(p_hours integer default 24) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_hours integer := least(greatest(coalesce(p_hours, 24), 1), 720);
begin
  perform public._require_admin();
  return jsonb_build_object('hours', v_hours, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('location', location, 'table', table_name, 'operation', operation, 'calls', calls, 'errors', errors, 'slow', slow,
             'avg_ms', round(total_ms::numeric / greatest(calls, 1), 1), 'max_ms', max_ms, 'rows_avg', round(rows_total::numeric / greatest(calls, 1), 1)) order by total_ms desc)
    from (select location, table_name, operation, sum(calls) calls, sum(errors) errors, sum(slow) slow, sum(total_ms) total_ms, max(max_ms) max_ms, sum(rows_total) rows_total
          from public.query_stats where bucket >= now() - make_interval(hours => v_hours) group by 1, 2, 3 order by sum(total_ms) desc limit 100) q), '[]'::jsonb));
end $$;
revoke all on function public.admin_db_query_report(integer) from public, anon;
grant execute on function public.admin_db_query_report(integer) to authenticated;

create or replace function public.purge_performance_data(p_stat_days integer default 30, p_snapshot_days integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer;
begin
  with x as (delete from public.query_stats where bucket < now() - make_interval(days => p_stat_days) returning 1) select count(*) into a from x;
  with x as (delete from public.db_perf_snapshots where at < now() - make_interval(days => p_snapshot_days) returning 1) select count(*) into b from x;
  return jsonb_build_object('query_stats', a, 'db_perf_snapshots', b);
end $$;
revoke all on function public.purge_performance_data(integer, integer) from public, anon, authenticated;
grant execute on function public.purge_performance_data(integer, integer) to service_role;

-- =============================================================================================================================== 3. feature flags
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){0,3}$' and char_length(key) <= 64),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  kind text not null default 'release' check (kind in ('release', 'experiment', 'ops')),
  module text check (module is null or module ~ '^[a-z][a-z0-9_]{0,30}$'),
  is_protected boolean not null default false,        -- core.* flags: always on, never switchable
  archived boolean not null default false,
  default_value boolean not null default false,       -- the value when nothing else applies (an archived flag, or an environment without a setting)
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint feature_flags_protected_core check (is_protected = (key like 'core.%'))
);
create table if not exists public.feature_flag_envs (
  flag_key text not null references public.feature_flags(key) on delete cascade,
  env text not null check (env in ('development', 'staging', 'production')),
  enabled boolean not null default false,
  default_value boolean not null default false,       -- the value for people outside the rollout
  rollout_percent numeric(5, 2) not null default 100 check (rollout_percent between 0 and 100),
  allow_users uuid[] not null default '{}' check (cardinality(allow_users) <= 200),
  block_users uuid[] not null default '{}' check (cardinality(block_users) <= 200),
  roles text[] not null default '{}' check (roles <@ array['user', 'admin']),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (flag_key, env)
);
-- One row: the emergency controls. They can switch things off, never the protected parts.
create table if not exists public.platform_controls (
  id integer primary key check (id = 1),
  global_disable boolean not null default false,       -- every non-protected flag evaluates to off
  experiments_disabled boolean not null default false, -- every "experiment" flag evaluates to off and no one is enrolled
  disabled_modules text[] not null default '{}' check (cardinality(disabled_modules) <= 30),
  reason text not null default '' check (char_length(reason) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.platform_controls (id) values (1) on conflict do nothing;
-- Who changed what, before and after: the source for the history view and for rollback. (The Audit History gets a redacted line for each entry too.)
create table if not exists public.feature_flag_history (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('flag', 'experiment', 'controls')),
  ref_key text not null check (char_length(ref_key) <= 64),
  env text check (env is null or env in ('development', 'staging', 'production')),
  at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) <= 30),
  before jsonb, after jsonb,
  reason text not null default '' check (char_length(reason) <= 200)
);
create index if not exists feature_flag_history_ref_idx on public.feature_flag_history (ref_key, at desc);
create index if not exists feature_flag_history_at_idx on public.feature_flag_history (at desc);

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,47}$'),
  flag_key text not null references public.feature_flags(key),
  name text not null check (char_length(name) between 1 and 80),
  hypothesis text not null default '' check (char_length(hypothesis) <= 500),
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed')),
  traffic_percent numeric(5, 2) not null default 100 check (traffic_percent between 0 and 100),
  variants jsonb not null check (jsonb_typeof(variants) = 'array'),
  primary_event text not null default 'conversion' check (primary_event ~ '^[a-z][a-z0-9_]{0,39}$'),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz, ended_at timestamptz, updated_at timestamptz not null default now()
);
-- Exposure = the person was shown a variant. Conversion = they did the thing the experiment is about (reported by the app on purpose). One of each per person.
create table if not exists public.experiment_events (
  id bigint generated always as identity primary key,
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,   -- removed with the account; administrators only ever see counts
  variant text not null,
  event text not null check (event in ('exposure', 'conversion')),
  name text not null default '' check (name ~ '^[a-z0-9_]{0,40}$'),
  at timestamptz not null default now(),
  unique (experiment_id, user_id, event, name)
);
create index if not exists experiment_events_exp_idx on public.experiment_events (experiment_id, event, variant);
create index if not exists experiment_events_user_idx on public.experiment_events (user_id);

do $$
declare t text;
begin
  foreach t in array array['feature_flags', 'feature_flag_envs', 'platform_controls', 'feature_flag_history', 'experiments', 'experiment_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);   -- no policies: every read and write goes through the functions below
  end loop;
end $$;

-- ------------------------------------------------------------------------------------------------------------------ hashing and evaluation (mirrors packages/core/src/flags.js)
create or replace function public._fnv1a(p text) returns bigint
language plpgsql immutable set search_path = '' as $$
declare b bytea := convert_to(p, 'UTF8'); h bigint := 2166136261; i integer;
begin
  for i in 0 .. length(b) - 1 loop
    h := h # get_byte(b, i)::bigint;
    h := (h * 16777619) & 4294967295;
  end loop;
  return h;
end $$;
create or replace function public._flag_bucket(p_key text, p_user uuid) returns integer
language sql immutable set search_path = '' as $$ select (public._fnv1a(p_key || ':' || p_user::text) % 10000)::integer $$;

create or replace function public._flag_value(p_key text, p_env text, p_uid uuid, p_role text, c public.platform_controls) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f public.feature_flags; e public.feature_flag_envs; pct numeric;
begin
  select * into f from public.feature_flags where key = p_key;
  if not found then return jsonb_build_object('enabled', false, 'reason', 'unknown_flag'); end if;
  if f.is_protected then return jsonb_build_object('enabled', true, 'reason', 'protected'); end if;
  if f.archived then return jsonb_build_object('enabled', f.default_value, 'reason', 'archived'); end if;
  if c.global_disable then return jsonb_build_object('enabled', false, 'reason', 'kill_global'); end if;
  if c.experiments_disabled and f.kind = 'experiment' then return jsonb_build_object('enabled', false, 'reason', 'kill_experiments'); end if;
  if f.module is not null and f.module = any (c.disabled_modules) then return jsonb_build_object('enabled', false, 'reason', 'kill_module'); end if;
  select * into e from public.feature_flag_envs where flag_key = p_key and env = p_env;
  if not found then return jsonb_build_object('enabled', f.default_value, 'reason', 'no_environment'); end if;
  if not e.enabled then return jsonb_build_object('enabled', false, 'reason', 'disabled'); end if;
  if p_uid is not null and p_uid = any (e.block_users) then return jsonb_build_object('enabled', false, 'reason', 'blocked'); end if;
  if p_uid is not null and p_uid = any (e.allow_users) then return jsonb_build_object('enabled', true, 'reason', 'allowed'); end if;
  if cardinality(e.roles) > 0 and not (coalesce(p_role, 'user') = any (e.roles)) then return jsonb_build_object('enabled', false, 'reason', 'role_excluded'); end if;
  pct := e.rollout_percent;
  if pct >= 100 then return jsonb_build_object('enabled', true, 'reason', case when cardinality(e.roles) > 0 then 'role' else 'everyone' end); end if;
  if p_uid is null then return jsonb_build_object('enabled', e.default_value, 'reason', 'anonymous_default'); end if;
  if public._flag_bucket(p_key, p_uid) < round(pct * 100) then return jsonb_build_object('enabled', true, 'reason', 'rollout'); end if;
  return jsonb_build_object('enabled', e.default_value, 'reason', 'default');
end $$;
revoke all on function public._flag_value(text, text, uuid, text, public.platform_controls) from public, anon, authenticated;

-- The one call the apps make: every flag for the signed-in person, evaluated here. `version` changes whenever any flag or control changes.
create or replace function public.evaluate_flags(p_env text default 'production') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_env text := case when p_env in ('development', 'staging', 'production') then p_env else 'production' end; v_role text; c public.platform_controls; r jsonb := '{}'::jsonb; k text;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  v_role := case when public.is_platform_admin() then 'admin' else 'user' end;
  select * into c from public.platform_controls where id = 1;
  for k in select key from public.feature_flags order by key loop
    r := r || jsonb_build_object(k, (public._flag_value(k, v_env, v_uid, v_role, c) ->> 'enabled')::boolean);
  end loop;
  return jsonb_build_object('env', v_env, 'flags', r,
    'killed', c.global_disable or c.experiments_disabled or cardinality(c.disabled_modules) > 0,
    'version', greatest((select max(updated_at) from public.feature_flag_envs), (select max(updated_at) from public.feature_flags), c.updated_at));
end $$;
revoke all on function public.evaluate_flags(text) from public, anon;
grant execute on function public.evaluate_flags(text) to authenticated;

-- For database code that guards real functionality (an RPC, a policy): is this flag on for the signed-in person? The environment is the database's own
-- setting `lifetrack.environment` (default production), not something a client can choose.
create or replace function public.flag_enabled(p_key text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare c public.platform_controls;
begin
  if auth.uid() is null then return false; end if;
  select * into c from public.platform_controls where id = 1;
  return coalesce((public._flag_value(p_key, coalesce(nullif(current_setting('lifetrack.environment', true), ''), 'production'), auth.uid(),
    case when public.is_platform_admin() then 'admin' else 'user' end, c) ->> 'enabled')::boolean, false);
end $$;
revoke all on function public.flag_enabled(text) from public, anon;
grant execute on function public.flag_enabled(text) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ history + audit
create or replace function public._env_json(e public.feature_flag_envs) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('enabled', e.enabled, 'default_value', e.default_value, 'rollout_percent', e.rollout_percent, 'allow_users', to_jsonb(e.allow_users),
    'block_users', to_jsonb(e.block_users), 'roles', to_jsonb(e.roles))
$$;
-- The audit history gets counts, not the user ids of an allow- or block-list.
create or replace function public._flag_redact(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when j is null then null else (j - 'allow_users' - 'block_users') || jsonb_build_object('allow_count', jsonb_array_length(coalesce(j -> 'allow_users', '[]'::jsonb)),
    'block_count', jsonb_array_length(coalesce(j -> 'block_users', '[]'::jsonb))) end
$$;
create or replace function public._flag_log(p_scope text, p_ref text, p_env text, p_action text, p_before jsonb, p_after jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  insert into public.feature_flag_history (scope, ref_key, env, actor, action, before, after, reason) values (p_scope, p_ref, p_env, v_uid, p_action, p_before, p_after, left(coalesce(p_reason, ''), 200));
  if v_uid is not null then
    perform public._audit_insert(v_uid, 'config', null, case p_scope when 'flag' then 'feature_flag' when 'experiment' then 'experiment' else 'platform_controls' end, p_ref,
      left(format('%s %s%s', p_action, p_ref, coalesce(' (' || p_env || ')', '')), 200), '{}', public._flag_redact(p_before), public._flag_redact(p_after), false);
  end if;
end $$;
revoke all on function public._env_json(public.feature_flag_envs), public._flag_redact(jsonb), public._flag_log(text, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------------------------ administration (every function checks the caller itself)
create or replace function public.admin_flags() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.platform_controls;
begin
  perform public._require_admin();
  select * into c from public.platform_controls where id = 1;
  return jsonb_build_object('controls', to_jsonb(c) - 'id', 'flags', coalesce((
    select jsonb_agg(jsonb_build_object('key', f.key, 'name', f.name, 'description', f.description, 'kind', f.kind, 'module', f.module, 'protected', f.is_protected,
      'archived', f.archived, 'default_value', f.default_value, 'created_at', f.created_at, 'updated_at', f.updated_at,
      'envs', coalesce((select jsonb_object_agg(e.env, public._env_json(e) || jsonb_build_object('updated_at', e.updated_at)) from public.feature_flag_envs e where e.flag_key = f.key), '{}'::jsonb))
      order by f.is_protected desc, f.key) from public.feature_flags f), '[]'::jsonb));
end $$;
revoke all on function public.admin_flags() from public, anon;
grant execute on function public.admin_flags() to authenticated;

create or replace function public.admin_flag_create(p_key text, p_name text, p_description text default '', p_kind text default 'release', p_module text default null, p_default boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_env text;
begin
  perform public._require_admin();
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){0,3}$' or char_length(p_key) > 64 then raise exception 'The key needs lowercase letters, digits and underscores, with optional dots.' using errcode = '22023'; end if;
  if p_key like 'core.%' then raise exception 'Keys starting with core. are reserved for protected parts of the product.' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Give the flag a name of up to 80 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'The description can be at most 500 characters.' using errcode = '22023'; end if;
  if p_kind not in ('release', 'experiment', 'ops') then raise exception 'The kind must be release, experiment or ops.' using errcode = '22023'; end if;
  if exists (select 1 from public.feature_flags where key = p_key) then raise exception 'A flag with this key already exists.' using errcode = '23505'; end if;
  insert into public.feature_flags (key, name, description, kind, module, default_value, created_by, updated_by) values (p_key, btrim(p_name), coalesce(p_description, ''), p_kind, p_module, coalesce(p_default, false), v_uid, v_uid);
  foreach v_env in array array['development', 'staging', 'production'] loop
    insert into public.feature_flag_envs (flag_key, env, enabled, default_value, updated_by) values (p_key, v_env, false, coalesce(p_default, false), v_uid);  -- off everywhere until someone turns it on
  end loop;
  perform public._flag_log('flag', p_key, null, 'create', null, jsonb_build_object('name', p_name, 'kind', p_kind, 'module', p_module), '');
  return jsonb_build_object('key', p_key);
end $$;
revoke all on function public.admin_flag_create(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_flag_create(text, text, text, text, text, boolean) to authenticated;

create or replace function public.admin_flag_update(p_key text, p_name text, p_description text, p_module text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.feature_flags;
begin
  perform public._require_admin();
  select * into f from public.feature_flags where key = p_key for update;
  if not found then raise exception 'There is no flag with this key.' using errcode = 'P0002'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Give the flag a name of up to 80 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'The description can be at most 500 characters.' using errcode = '22023'; end if;
  if f.is_protected then p_module := null; end if;
  update public.feature_flags set name = btrim(p_name), description = coalesce(p_description, ''), module = case when f.is_protected then null else p_module end, updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform public._flag_log('flag', p_key, null, 'edit', jsonb_build_object('name', f.name, 'description', f.description, 'module', f.module), jsonb_build_object('name', p_name, 'description', p_description, 'module', p_module), '');
end $$;
revoke all on function public.admin_flag_update(text, text, text, text) from public, anon;
grant execute on function public.admin_flag_update(text, text, text, text) to authenticated;

-- Changes one environment of one flag. `p_patch` may hold: enabled, default_value, rollout_percent, allow_users, block_users, roles. Protected flags are refused.
create or replace function public.admin_flag_env_set(p_key text, p_env text, p_patch jsonb, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.feature_flags; e public.feature_flag_envs; before jsonb; v_pct numeric; v_allow uuid[]; v_block uuid[]; v_roles text[]; u text;
begin
  perform public._require_admin();
  if p_env not in ('development', 'staging', 'production') then raise exception 'Unknown environment.' using errcode = '22023'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Nothing to change.' using errcode = '22023'; end if;
  select * into f from public.feature_flags where key = p_key for update;
  if not found then raise exception 'There is no flag with this key.' using errcode = 'P0002'; end if;
  if f.is_protected then raise exception 'This is a protected part of the product. It is always on and can not be switched off or changed.' using errcode = '42501'; end if;
  if f.archived then raise exception 'This flag is archived. Restore it before changing it.' using errcode = '42501'; end if;
  insert into public.feature_flag_envs (flag_key, env, enabled, default_value) values (p_key, p_env, false, f.default_value) on conflict do nothing;
  select * into e from public.feature_flag_envs where flag_key = p_key and env = p_env for update;
  before := public._env_json(e);
  v_pct := coalesce((p_patch ->> 'rollout_percent')::numeric, e.rollout_percent);
  if v_pct < 0 or v_pct > 100 then raise exception 'Rollout must be between 0 and 100 percent.' using errcode = '22023'; end if;
  v_allow := e.allow_users; v_block := e.block_users; v_roles := e.roles;
  if p_patch ? 'allow_users' then
    if jsonb_typeof(p_patch -> 'allow_users') <> 'array' or jsonb_array_length(p_patch -> 'allow_users') > 200 then raise exception 'A user list can hold up to 200 ids.' using errcode = '22023'; end if;
    for u in select jsonb_array_elements_text(p_patch -> 'allow_users') loop
      if u !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'User lists take user ids (UUIDs).' using errcode = '22023'; end if;
    end loop;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_allow from jsonb_array_elements_text(p_patch -> 'allow_users') x;
  end if;
  if p_patch ? 'block_users' then
    if jsonb_typeof(p_patch -> 'block_users') <> 'array' or jsonb_array_length(p_patch -> 'block_users') > 200 then raise exception 'A user list can hold up to 200 ids.' using errcode = '22023'; end if;
    for u in select jsonb_array_elements_text(p_patch -> 'block_users') loop
      if u !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'User lists take user ids (UUIDs).' using errcode = '22023'; end if;
    end loop;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_block from jsonb_array_elements_text(p_patch -> 'block_users') x;
  end if;
  if p_patch ? 'roles' then
    if jsonb_typeof(p_patch -> 'roles') <> 'array' then raise exception 'Roles must be a list.' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_roles from jsonb_array_elements_text(p_patch -> 'roles') x;
    if not (v_roles <@ array['user', 'admin']) then raise exception 'Roles can be user or admin.' using errcode = '22023'; end if;
  end if;
  update public.feature_flag_envs set enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled), default_value = coalesce((p_patch ->> 'default_value')::boolean, default_value),
    rollout_percent = v_pct, allow_users = v_allow, block_users = v_block, roles = v_roles, updated_at = now(), updated_by = auth.uid()
    where flag_key = p_key and env = p_env returning * into e;
  perform public._flag_log('flag', p_key, p_env, 'env_set', before, public._env_json(e), p_reason);
  return public._env_json(e);
end $$;
revoke all on function public.admin_flag_env_set(text, text, jsonb, text) from public, anon;
grant execute on function public.admin_flag_env_set(text, text, jsonb, text) to authenticated;

-- Archiving keeps the flag and its history; an archived flag evaluates to its default and can not be changed until restored. Flags are never deleted.
create or replace function public.admin_flag_archive(p_key text, p_archived boolean, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare f public.feature_flags;
begin
  perform public._require_admin();
  select * into f from public.feature_flags where key = p_key for update;
  if not found then raise exception 'There is no flag with this key.' using errcode = 'P0002'; end if;
  if f.is_protected then raise exception 'This is a protected part of the product and can not be archived.' using errcode = '42501'; end if;
  if exists (select 1 from public.experiments x where x.flag_key = p_key and x.status in ('running', 'paused')) and p_archived then raise exception 'An experiment that is running or paused uses this flag. Complete it first.' using errcode = '23514'; end if;
  update public.feature_flags set archived = coalesce(p_archived, true), updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform public._flag_log('flag', p_key, null, case when coalesce(p_archived, true) then 'archive' else 'restore' end, jsonb_build_object('archived', f.archived), jsonb_build_object('archived', coalesce(p_archived, true)), p_reason);
end $$;
revoke all on function public.admin_flag_archive(text, boolean, text) from public, anon;
grant execute on function public.admin_flag_archive(text, boolean, text) to authenticated;

create or replace function public.admin_flag_history(p_key text default null, p_limit integer default 25, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100); v_total integer;
begin
  perform public._require_admin();
  select count(*) into v_total from public.feature_flag_history where p_key is null or ref_key = p_key;
  return jsonb_build_object('total', v_total, 'items', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
      select h.id, h.scope, h.ref_key, h.env, h.at, h.action, h.before, h.after, h.reason, coalesce(u.email, 'removed account') as actor
      from public.feature_flag_history h left join auth.users u on u.id = h.actor
      where p_key is null or h.ref_key = p_key order by h.at desc, h.id desc limit v_limit offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end $$;
revoke all on function public.admin_flag_history(text, integer, integer) from public, anon;
grant execute on function public.admin_flag_history(text, integer, integer) to authenticated;

-- Restores the configuration an earlier change replaced. Only flag-environment and emergency-control changes can be rolled back, never a protected flag.
-- The rollback is itself a new history entry (and an audit event), so it can be rolled back too.
create or replace function public.admin_flag_rollback(p_history_id bigint, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.feature_flag_history; f public.feature_flags; e public.feature_flag_envs; before jsonb; c public.platform_controls;
begin
  perform public._require_admin();
  select * into h from public.feature_flag_history where id = p_history_id;
  if not found then raise exception 'That history entry does not exist.' using errcode = 'P0002'; end if;
  if h.before is null or h.action not in ('env_set', 'rollback', 'controls') then raise exception 'This kind of change can not be rolled back.' using errcode = '22023'; end if;
  if h.scope = 'flag' then
    select * into f from public.feature_flags where key = h.ref_key for update;
    if not found or f.is_protected then raise exception 'This flag can not be changed.' using errcode = '42501'; end if;
    if f.archived then raise exception 'This flag is archived. Restore it first.' using errcode = '42501'; end if;
    select * into e from public.feature_flag_envs where flag_key = h.ref_key and env = h.env for update;
    if not found then raise exception 'That environment no longer exists.' using errcode = 'P0002'; end if;
    before := public._env_json(e);
    update public.feature_flag_envs set enabled = (h.before ->> 'enabled')::boolean, default_value = (h.before ->> 'default_value')::boolean, rollout_percent = (h.before ->> 'rollout_percent')::numeric,
      allow_users = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(h.before -> 'allow_users') x), '{}'),
      block_users = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(h.before -> 'block_users') x), '{}'),
      roles = coalesce((select array_agg(x) from jsonb_array_elements_text(h.before -> 'roles') x), '{}'), updated_at = now(), updated_by = auth.uid()
      where flag_key = h.ref_key and env = h.env returning * into e;
    perform public._flag_log('flag', h.ref_key, h.env, 'rollback', before, public._env_json(e), coalesce(nullif(p_reason, ''), 'Rolled back change #' || h.id));
    return public._env_json(e);
  elsif h.scope = 'controls' then
    select * into c from public.platform_controls where id = 1 for update;
    before := to_jsonb(c) - 'id' - 'updated_at' - 'updated_by';
    update public.platform_controls set global_disable = (h.before ->> 'global_disable')::boolean, experiments_disabled = (h.before ->> 'experiments_disabled')::boolean,
      disabled_modules = coalesce((select array_agg(x) from jsonb_array_elements_text(h.before -> 'disabled_modules') x), '{}'), reason = coalesce(h.before ->> 'reason', ''), updated_at = now(), updated_by = auth.uid() where id = 1;
    perform public._flag_log('controls', 'platform_controls', null, 'rollback', before, h.before, coalesce(nullif(p_reason, ''), 'Rolled back change #' || h.id));
    return h.before;
  end if;
  raise exception 'This kind of change can not be rolled back.' using errcode = '22023';
end $$;
revoke all on function public.admin_flag_rollback(bigint, text) from public, anon;
grant execute on function public.admin_flag_rollback(bigint, text) to authenticated;

-- Emergency controls. A reason is required. Switching things OFF is always allowed; the protected core.* flags ignore all of it (see _flag_value).
create or replace function public.admin_controls_set(p_patch jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.platform_controls; before jsonb; v_modules text[]; m text;
begin
  perform public._require_admin();
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 200 then raise exception 'Say why (3 to 200 characters): it goes in the history.' using errcode = '22023'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Nothing to change.' using errcode = '22023'; end if;
  select * into c from public.platform_controls where id = 1 for update;
  before := to_jsonb(c) - 'id' - 'updated_at' - 'updated_by';
  v_modules := c.disabled_modules;
  if p_patch ? 'disabled_modules' then
    if jsonb_typeof(p_patch -> 'disabled_modules') <> 'array' or jsonb_array_length(p_patch -> 'disabled_modules') > 30 then raise exception 'Up to 30 modules can be switched off.' using errcode = '22023'; end if;
    for m in select jsonb_array_elements_text(p_patch -> 'disabled_modules') loop
      if m !~ '^[a-z][a-z0-9_]{0,30}$' then raise exception 'Module names use lowercase letters, digits and underscores.' using errcode = '22023'; end if;
      if m in ('core', 'auth', 'security', 'recovery', 'data_integrity', 'settings') then raise exception 'Sign-in, security, data integrity and recovery can never be switched off.' using errcode = '42501'; end if;
    end loop;
    select coalesce(array_agg(distinct x), '{}') into v_modules from jsonb_array_elements_text(p_patch -> 'disabled_modules') x;
  end if;
  update public.platform_controls set global_disable = coalesce((p_patch ->> 'global_disable')::boolean, global_disable), experiments_disabled = coalesce((p_patch ->> 'experiments_disabled')::boolean, experiments_disabled),
    disabled_modules = v_modules, reason = left(btrim(p_reason), 200), updated_at = now(), updated_by = auth.uid() where id = 1 returning * into c;
  perform public._flag_log('controls', 'platform_controls', null, 'controls', before, to_jsonb(c) - 'id' - 'updated_at' - 'updated_by', p_reason);
  return to_jsonb(c) - 'id';
end $$;
revoke all on function public.admin_controls_set(jsonb, text) from public, anon;
grant execute on function public.admin_controls_set(jsonb, text) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ experiments
create or replace function public._experiment_variant(p_key text, p_traffic numeric, p_variants jsonb, p_uid uuid) returns text
language plpgsql immutable set search_path = '' as $$
declare v jsonb; acc integer := 0; point integer; last_key text;
begin
  if p_uid is null then return null; end if;
  if (public._fnv1a('exp:' || p_key || ':' || p_uid::text) % 10000) >= round(p_traffic * 100) then return null; end if;
  point := (public._fnv1a('var:' || p_key || ':' || p_uid::text) % 100)::integer;
  for v in select * from jsonb_array_elements(p_variants) loop
    acc := acc + (v ->> 'weight')::integer; last_key := v ->> 'key';
    if point < acc then return last_key; end if;
  end loop;
  return last_key;
end $$;
revoke all on function public._experiment_variant(text, numeric, jsonb, uuid) from public, anon, authenticated;

create or replace function public._variants_problem(p_variants jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare n integer; v jsonb; total integer := 0; keys text[] := '{}';
begin
  if jsonb_typeof(p_variants) <> 'array' then return 'Variants must be a list.'; end if;
  n := jsonb_array_length(p_variants);
  if n < 2 or n > 5 then return 'An experiment needs 2 to 5 variants.'; end if;
  for v in select * from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v) <> 'object' or coalesce(v ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,31}$' then return 'Variant keys use lowercase letters, digits and underscores.'; end if;
    if coalesce(v ->> 'weight', '') !~ '^[0-9]{1,3}$' or (v ->> 'weight')::integer < 1 then return 'Each variant needs a whole-number weight of at least 1.'; end if;
    if (v ->> 'key') = any (keys) then return 'Variant keys must be different.'; end if;
    keys := keys || (v ->> 'key'); total := total + (v ->> 'weight')::integer;
  end loop;
  if not ('control' = any (keys)) then return 'One variant must be named control.'; end if;
  if total <> 100 then return 'Variant weights must add up to 100.'; end if;
  return null;
end $$;
revoke all on function public._variants_problem(jsonb) from public, anon, authenticated;

create or replace function public.admin_experiment_save(p_key text, p_flag_key text, p_name text, p_hypothesis text, p_traffic numeric, p_variants jsonb, p_primary_event text default 'conversion') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.experiments; f public.feature_flags; v_problem text;
begin
  perform public._require_admin();
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{0,47}$' then raise exception 'The experiment key uses lowercase letters, digits and underscores.' using errcode = '22023'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Give the experiment a name of up to 80 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(p_hypothesis, '')) > 500 then raise exception 'The hypothesis can be at most 500 characters.' using errcode = '22023'; end if;
  if p_traffic is null or p_traffic < 0 or p_traffic > 100 then raise exception 'Traffic must be between 0 and 100 percent.' using errcode = '22023'; end if;
  if coalesce(p_primary_event, 'conversion') !~ '^[a-z][a-z0-9_]{0,39}$' then raise exception 'The conversion event uses lowercase letters, digits and underscores.' using errcode = '22023'; end if;
  v_problem := public._variants_problem(p_variants);
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  select * into f from public.feature_flags where key = p_flag_key;
  if not found then raise exception 'There is no flag with that key.' using errcode = 'P0002'; end if;
  if f.is_protected or f.kind <> 'experiment' then raise exception 'An experiment needs a flag of the kind experiment (never a protected one).' using errcode = '42501'; end if;
  select * into x from public.experiments where key = p_key for update;
  if found then
    if x.status <> 'draft' then raise exception 'Only a draft can be edited: people are already assigned to the variants.' using errcode = '23514'; end if;
    update public.experiments set flag_key = p_flag_key, name = btrim(p_name), hypothesis = coalesce(p_hypothesis, ''), traffic_percent = p_traffic, variants = p_variants,
      primary_event = coalesce(p_primary_event, 'conversion'), updated_at = now() where key = p_key;
    perform public._flag_log('experiment', p_key, null, 'edit', to_jsonb(x) - 'id', jsonb_build_object('traffic_percent', p_traffic, 'variants', p_variants), '');
  else
    insert into public.experiments (key, flag_key, name, hypothesis, traffic_percent, variants, primary_event, created_by) values (p_key, p_flag_key, btrim(p_name), coalesce(p_hypothesis, ''), p_traffic, p_variants, coalesce(p_primary_event, 'conversion'), auth.uid());
    perform public._flag_log('experiment', p_key, null, 'create', null, jsonb_build_object('flag', p_flag_key, 'traffic_percent', p_traffic, 'variants', p_variants), '');
  end if;
  return jsonb_build_object('key', p_key, 'status', 'draft');
end $$;
revoke all on function public.admin_experiment_save(text, text, text, text, numeric, jsonb, text) from public, anon;
grant execute on function public.admin_experiment_save(text, text, text, text, numeric, jsonb, text) to authenticated;

create or replace function public.admin_experiment_set_status(p_key text, p_status text, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.experiments; ok boolean;
begin
  perform public._require_admin();
  select * into x from public.experiments where key = p_key for update;
  if not found then raise exception 'There is no experiment with this key.' using errcode = 'P0002'; end if;
  ok := (x.status = 'draft' and p_status = 'running') or (x.status = 'running' and p_status in ('paused', 'completed')) or (x.status = 'paused' and p_status in ('running', 'completed'));
  if not ok then raise exception 'An experiment can not go from % to %.', x.status, p_status using errcode = '23514'; end if;
  update public.experiments set status = p_status, started_at = case when p_status = 'running' and started_at is null then now() else started_at end,
    ended_at = case when p_status = 'completed' then now() else ended_at end, updated_at = now() where key = p_key;
  perform public._flag_log('experiment', p_key, null, 'status', jsonb_build_object('status', x.status), jsonb_build_object('status', p_status), p_reason);
  return jsonb_build_object('key', p_key, 'status', p_status);
end $$;
revoke all on function public.admin_experiment_set_status(text, text, text) from public, anon;
grant execute on function public.admin_experiment_set_status(text, text, text) to authenticated;

create or replace function public.admin_experiments() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('key', x.key, 'flag_key', x.flag_key, 'name', x.name, 'hypothesis', x.hypothesis, 'status', x.status, 'traffic_percent', x.traffic_percent,
    'variants', x.variants, 'primary_event', x.primary_event, 'started_at', x.started_at, 'ended_at', x.ended_at, 'created_at', x.created_at,
    'participants', (select count(*) from public.experiment_events e where e.experiment_id = x.id and e.event = 'exposure')) order by x.created_at desc) from public.experiments x), '[]'::jsonb);
end $$;
revoke all on function public.admin_experiments() from public, anon;
grant execute on function public.admin_experiments() to authenticated;

-- Counts only: participants (people shown a variant) and conversions (of those, people who did the primary event), plus exposures per day. No user ids.
create or replace function public.admin_experiment_results(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare x public.experiments;
begin
  perform public._require_admin();
  select * into x from public.experiments where key = p_key;
  if not found then raise exception 'There is no experiment with this key.' using errcode = 'P0002'; end if;
  return jsonb_build_object('key', x.key, 'status', x.status, 'primary_event', x.primary_event, 'variants', x.variants,
    'rows', (select jsonb_agg(jsonb_build_object('variant', v ->> 'key',
        'participants', (select count(*) from public.experiment_events e where e.experiment_id = x.id and e.event = 'exposure' and e.variant = v ->> 'key'),
        'conversions', (select count(*) from public.experiment_events e where e.experiment_id = x.id and e.event = 'conversion' and e.name = x.primary_event and e.variant = v ->> 'key')))
      from jsonb_array_elements(x.variants) v),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'variant', variant, 'participants', n) order by d) from (
      select date_trunc('day', at)::date d, variant, count(*) n from public.experiment_events where experiment_id = x.id and event = 'exposure' group by 1, 2) q), '[]'::jsonb));
end $$;
revoke all on function public.admin_experiment_results(text) from public, anon;
grant execute on function public.admin_experiment_results(text) to authenticated;

-- The app asks which variant to show. Everything is decided here: the experiment must be running, the controls must allow it and its flag must be on for this person.
-- Someone who is not enrolled gets "control" and nothing is recorded. The first call that enrolls someone records their exposure (once).
create or replace function public.experiment_assign(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); x public.experiments; c public.platform_controls; v_variant text; v_env text := coalesce(nullif(current_setting('lifetrack.environment', true), ''), 'production');
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into x from public.experiments where key = p_key;
  if not found or x.status <> 'running' then return jsonb_build_object('variant', 'control', 'enrolled', false); end if;
  select * into c from public.platform_controls where id = 1;
  if c.experiments_disabled or c.global_disable then return jsonb_build_object('variant', 'control', 'enrolled', false); end if;
  if not coalesce((public._flag_value(x.flag_key, v_env, v_uid, case when public.is_platform_admin() then 'admin' else 'user' end, c) ->> 'enabled')::boolean, false) then
    return jsonb_build_object('variant', 'control', 'enrolled', false);
  end if;
  v_variant := public._experiment_variant(x.key, x.traffic_percent, x.variants, v_uid);
  if v_variant is null then return jsonb_build_object('variant', 'control', 'enrolled', false); end if;
  insert into public.experiment_events (experiment_id, user_id, variant, event, name) values (x.id, v_uid, v_variant, 'exposure', '') on conflict do nothing;
  return jsonb_build_object('variant', v_variant, 'enrolled', true);
end $$;
revoke all on function public.experiment_assign(text) from public, anon;
grant execute on function public.experiment_assign(text) to authenticated;

-- An explicit conversion event: the app calls this when the person does the thing being measured. Only someone who was enrolled can convert, once per event name.
create or replace function public.experiment_convert(p_key text, p_event text default 'conversion') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); x public.experiments; v_variant text; n integer;
begin
  if v_uid is null then return false; end if;
  if p_event is null or p_event !~ '^[a-z][a-z0-9_]{0,39}$' then return false; end if;
  select * into x from public.experiments where key = p_key and status = 'running';
  if not found then return false; end if;
  select variant into v_variant from public.experiment_events where experiment_id = x.id and user_id = v_uid and event = 'exposure';
  if v_variant is null then return false; end if;
  insert into public.experiment_events (experiment_id, user_id, variant, event, name) values (x.id, v_uid, v_variant, 'conversion', p_event) on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.experiment_convert(text, text) from public, anon;
grant execute on function public.experiment_convert(text, text) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ built-in flags
insert into public.feature_flags (key, name, description, kind, module, is_protected, default_value) values
  ('core.auth', 'Sign-in and sessions', 'Signing in, sessions and account recovery. Always on.', 'ops', null, true, true),
  ('core.security', 'Security and privacy', 'App lock, passkeys, module locks, row-level security. Always on.', 'ops', null, true, true),
  ('core.data_integrity', 'Data integrity', 'Validation, the audit history, conflict detection and sync. Always on.', 'ops', null, true, true),
  ('core.recovery', 'Backup and recovery', 'Export, backup, restore and the undo history. Always on.', 'ops', null, true, true),
  ('module.automation', 'Automation Studio', 'The Automation Studio pages and menu entry.', 'release', 'automation', false, true),
  ('module.challenges', 'Challenges', 'The Challenges pages and menu entry.', 'release', 'challenges', false, true),
  ('module.lifemap', 'Life Map', 'The Life Map page and menu entry.', 'release', 'lifemap', false, true),
  ('module.insights', 'Insights', 'The Insights page and menu entry.', 'release', 'insights', false, true),
  ('module.developers', 'Developers (API and webhooks)', 'The Developers page and menu entry.', 'release', 'developers', false, true)
on conflict (key) do nothing;
-- The shipped modules are on in every environment (as they were before flags existed).
insert into public.feature_flag_envs (flag_key, env, enabled, default_value)
  select f.key, e.env, true, true from public.feature_flags f cross join (values ('development'), ('staging'), ('production')) e(env) where f.key like 'module.%'
on conflict do nothing;

-- Internal helpers are not callable by clients.
revoke all on function public._fnv1a(text), public._flag_bucket(text, uuid) from public, anon, authenticated;
