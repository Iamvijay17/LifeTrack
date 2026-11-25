-- lifetrack:allow-destructive the-word-TRUNCATE-appears-only-in-a-trigger-that-BLOCKS-truncating-audit_events-nothing-is-dropped-or-deleted
-- 0027: Platform infrastructure: audit history, system health, API keys and webhooks, saved reports. ADDITIVE and idempotent: new tables, new functions,
-- new triggers (AFTER row triggers that only ever INSERT into the new tables) and one new column (user_settings.report_prefs). No existing row,
-- column, policy or function is altered or dropped. Needs 0012 (app lock) and 0015 (module locks): run in order.
--
--  1. AUDIT HISTORY   audit_events is APPEND-ONLY. A trigger on every user-data table writes who/what/when and the changed fields (old and new values).
--                     Nothing writes it from a browser: the table has SELECT for its owner only, and a guard trigger rejects UPDATE and DELETE for every
--                     role (only the retention job and the owner's own "erase my audit history" action, which leaves a tombstone, may remove rows).
--                     Each event carries a hash that chains to the previous event of the same person, so an edit or a gap is detectable (audit_verify_chain).
--                     Events of a locked module (Finance, Notes, …) are unreadable while that module is locked, like the module's own rows.
--                     audit_restore() previews and applies a restore (revert an update, re-create a deleted record) with conflict detection.
--  2. SYSTEM HEALTH   app_errors (deduplicated frontend/sync errors), request_metrics (hourly API aggregates), job_runs, platform_admins and the
--                     admin_system_* functions. Only people listed in platform_admins can call the admin functions; nobody can read these tables directly.
--  3. API + WEBHOOKS  api_keys (SHA-256 hash only; the key is shown once, at creation), api_request_log, rate_windows, webhook_endpoints, webhook_secrets
--                     (no client access), webhook_deliveries, webhook_attempts. Domain-event triggers enqueue deliveries; the `webhook-dispatch` Edge Function
--                     sends them. A failure in the enqueue trigger can never block the write that caused it.
--  4. REPORTS         user_settings.report_prefs (saved report configurations).

do $$
begin
  if to_regclass('public.user_security') is null or to_regprocedure('public.module_session_open(text, boolean)') is null then
    raise exception 'Run 0012_security.sql and 0015_module_locks.sql first.';
  end if;
end $$;

-- =============================================================================================================================== helpers
-- Keys whose values must never be copied into a log: credentials and tokens. Long text is cut (and flagged) so one note cannot bloat the log.
create or replace function public._redact(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string' and length(value #>> '{}') > 4000 then to_jsonb(left(value #>> '{}', 4000)) else value end), '{}'::jsonb)
  from jsonb_each(coalesce(j, '{}'::jsonb))
  where key !~* '(password|passwd|secret|token|api_?key|private_?key|credential|pin_hash|(^|_)hash$)' or key = 'external_hash'
$$;
create or replace function public._has_long_text(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select exists (select 1 from jsonb_each(coalesce(j, '{}'::jsonb)) where jsonb_typeof(value) = 'string' and length(value #>> '{}') > 4000)
$$;
-- A short, human label for a record (a title, a name, …).
create or replace function public._record_label(j jsonb) returns text
language sql immutable set search_path = '' as $$
  select left(coalesce(nullif(j ->> 'title', ''), nullif(j ->> 'name', ''), nullif(j ->> 'exercise_name', ''), nullif(j ->> 'company', ''),
    nullif(j ->> 'description', ''), nullif(j ->> 'note', ''), nullif(j ->> 'category', ''), nullif(j ->> 'log_date', ''), nullif(j ->> 'txn_date', ''), ''), 200)
$$;
-- The request's headers as PostgREST exposes them (null outside an HTTP request: a migration, a cron job, a test).
create or replace function public._request_headers() returns jsonb
language plpgsql stable set search_path = '' as $$
declare h text := current_setting('request.headers', true);
begin
  if h is null or h = '' then return null; end if;
  return h::jsonb;
exception when others then return null;
end $$;
-- Coarse network location only: the last IPv4 octet / the last 80 bits of an IPv6 address are dropped (enough to spot an odd location, not to identify a device).
-- A fixed text form of a timestamp (UTC, microseconds) so a hash does not depend on the session's TimeZone setting.
create or replace function public._ts(t timestamptz) returns text
language sql immutable set search_path = '' as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') $$;
create or replace function public._ip_prefix(h jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare raw text := split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'cf-connecting-ip', ''), ',', 1); ip inet;
begin
  raw := btrim(raw);
  if raw = '' then return null; end if;
  ip := raw::inet;
  return case when family(ip) = 4 then host(network(set_masklen(ip, 24))) || '/24' else host(network(set_masklen(ip, 48))) || '/48' end;
exception when others then return null;
end $$;

-- =============================================================================================================================== 1. audit
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  action text not null check (action in ('create', 'update', 'delete', 'restore', 'import', 'export', 'login', 'logout', 'permission', 'config', 'security')),
  operation text check (operation is null or operation in ('insert', 'update', 'delete')),
  entity text not null check (entity ~ '^[a-z][a-z0-9_.]{0,59}$'),
  record_id text check (record_id is null or char_length(record_id) <= 64),
  summary text not null default '' check (char_length(summary) <= 200),
  changed_fields text[] not null default '{}',
  old_values jsonb check (old_values is null or jsonb_typeof(old_values) = 'object'),
  new_values jsonb check (new_values is null or jsonb_typeof(new_values) = 'object'),
  truncated boolean not null default false,
  request_id text check (request_id is null or char_length(request_id) <= 64),
  source text not null default 'web' check (source in ('web', 'mobile', 'api', 'job', 'database')),
  ip_prefix text check (ip_prefix is null or char_length(ip_prefix) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 255),
  restored_from uuid,
  prev_hash text,
  hash text not null
);
create index if not exists audit_events_user_time_idx on public.audit_events (user_id, occurred_at desc, seq desc);
create index if not exists audit_events_user_entity_idx on public.audit_events (user_id, entity, occurred_at desc);
create index if not exists audit_events_user_record_idx on public.audit_events (user_id, entity, record_id);
create index if not exists audit_events_occurred_idx on public.audit_events (occurred_at);

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on public.audit_events from public, anon, authenticated;
grant select on public.audit_events to authenticated;
drop policy if exists "owner_read" on public.audit_events;
create policy "owner_read" on public.audit_events for select to authenticated using (user_id = (select auth.uid()));

-- Which module does an entity belong to? A locked module's history is closed with it (same lists as 0015).
create or replace function public._audit_gate(p_entity text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_entity in ('transactions', 'budgets', 'savings_goals', 'recurring_rules') then public.module_session_open('finance', true)
    when p_entity in ('notes', 'journal_entries') then public.module_session_open('notes', true)
    when p_entity in ('health_logs', 'body_measurements') then public.module_session_open('health', false)
    when p_entity in ('workouts', 'exercise_logs') then public.module_session_open('fitness', false)
    when p_entity in ('food_logs', 'nutrition_settings', 'water_logs') then public.module_session_open('nutrition', false)
    when p_entity in ('job_applications', 'application_history', 'interview_events') then public.module_session_open('jobs', false)
    else true end
$$;
drop policy if exists "module_gate" on public.audit_events;
create policy "module_gate" on public.audit_events as restrictive for select to authenticated using ((select public._audit_gate(entity)));

-- Append-only: no UPDATE, no DELETE, for any role, unless a maintenance function switched the guard off for its own transaction, or the person's whole
-- account is being deleted (the cascade from auth.users).
create or replace function public._audit_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('lifetrack.audit_maintenance', true) = 'on' then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then return old; end if;
  raise exception 'The audit log is append-only.' using errcode = '42501';
end $$;
drop trigger if exists audit_events_guard on public.audit_events;
create trigger audit_events_guard before update or delete on public.audit_events for each row execute function public._audit_guard();
create or replace function public._audit_guard_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('lifetrack.audit_maintenance', true) = 'on' then return null; end if;
  raise exception 'The audit log is append-only.' using errcode = '42501';
end $$;
drop trigger if exists audit_events_guard_truncate on public.audit_events;
create trigger audit_events_guard_truncate before truncate on public.audit_events for each statement execute function public._audit_guard_truncate();

-- The only way an event is written. Chains each event to the previous one of the same person (serialised per person, so two writes cannot fork the chain).
create or replace function public._audit_insert(
  p_user uuid, p_action text, p_operation text, p_entity text, p_record text, p_summary text, p_fields text[], p_old jsonb, p_new jsonb,
  p_truncated boolean, p_restored_from uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  h jsonb := public._request_headers();
  v_id uuid := gen_random_uuid(); v_at timestamptz := clock_timestamp(); v_prev text; v_hash text; v_source text; v_req text;
begin
  perform pg_advisory_xact_lock(hashtextextended('audit:' || p_user::text, 0));
  select e.hash into v_prev from public.audit_events e where e.user_id = p_user order by e.seq desc limit 1;
  v_source := case lower(coalesce(h ->> 'x-lifetrack-source', current_setting('lifetrack.source', true), ''))
    when 'mobile' then 'mobile' when 'api' then 'api' when 'job' then 'job' when 'web' then 'web'
    else case when h is null then 'database' else 'web' end end;
  v_req := left(coalesce(nullif(h ->> 'x-request-id', ''), nullif(h ->> 'x-correlation-id', ''), nullif(current_setting('lifetrack.request_id', true), '')), 64);
  v_hash := encode(extensions.digest(
    coalesce(v_prev, '') || '|' || v_id || '|' || p_user || '|' || p_action || '|' || p_entity || '|' || coalesce(p_record, '') || '|' || public._ts(v_at) || '|'
      || coalesce(p_old::text, '') || '|' || coalesce(p_new::text, ''), 'sha256'), 'hex');
  insert into public.audit_events (id, user_id, occurred_at, action, operation, entity, record_id, summary, changed_fields, old_values, new_values, truncated,
                                   request_id, source, ip_prefix, user_agent, restored_from, prev_hash, hash)
  values (v_id, p_user, v_at, p_action, p_operation, p_entity, p_record, left(coalesce(p_summary, ''), 200), coalesce(p_fields, '{}'), p_old, p_new, p_truncated,
          v_req, v_source, public._ip_prefix(h), left(h ->> 'user-agent', 255), p_restored_from, v_prev, v_hash);
  return v_id;
end $$;

-- The row trigger. Fails closed: if the event cannot be written, neither can the change.
create or replace function public.audit_capture() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_user uuid := (v_row ->> 'user_id')::uuid;
  v_restore uuid := nullif(current_setting('lifetrack.audit_restore', true), '')::uuid;
  v_fields text[]; v_diff_old jsonb; v_diff_new jsonb; v_trunc boolean;
  v_action text;
begin
  if v_user is null or not exists (select 1 from auth.users u where u.id = v_user) then return null; end if; -- account being deleted: nothing to keep
  v_action := case when v_restore is not null then 'restore'
                   when tg_table_name = 'user_settings' then 'config'
                   when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end;
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key), jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
      into v_fields, v_diff_old, v_diff_new
      from jsonb_each(v_new) n left join jsonb_each(v_old) o on o.key = n.key
      where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_fields is null then return null; end if; -- only updated_at moved: nothing happened
    v_trunc := public._has_long_text(v_diff_old) or public._has_long_text(v_diff_new);
    perform public._audit_insert(v_user, v_action, 'update', tg_table_name, v_row ->> 'id', public._record_label(v_new), v_fields,
      public._redact(v_diff_old), public._redact(v_diff_new), v_trunc, v_restore);
  elsif tg_op = 'INSERT' then
    perform public._audit_insert(v_user, v_action, 'insert', tg_table_name, v_row ->> 'id', public._record_label(v_new), '{}',
      null, public._redact(v_new), public._has_long_text(v_new), v_restore);
  else
    perform public._audit_insert(v_user, v_action, 'delete', tg_table_name, v_row ->> 'id', public._record_label(v_old), '{}',
      public._redact(v_old), null, public._has_long_text(v_old), v_restore);
  end if;
  return null;
end $$;
revoke all on function public.audit_capture() from public, anon, authenticated;

-- Which tables are audited (user-created data and settings; not secrets, tokens, notifications or high-volume logs).
create or replace function public._audit_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['learning_topics', 'goals', 'tasks', 'habits', 'habit_logs', 'study_sessions', 'job_applications', 'interview_events', 'exercises', 'routines',
    'workouts', 'exercise_logs', 'body_measurements', 'health_logs', 'foods', 'food_logs', 'recurring_rules', 'transactions', 'budgets', 'journal_entries',
    'milestones', 'notes', 'savings_goals', 'reminders', 'calendar_events', 'challenges', 'automation_workflows', 'user_settings']
$$;
do $$
declare t text;
begin
  foreach t in array public._audit_tables() loop
    continue when to_regclass(format('public.%I', t)) is null;
    execute format('drop trigger if exists audit_capture on public.%I', t);
    execute format('create trigger audit_capture after insert or update or delete on public.%I for each row execute function public.audit_capture()', t);
  end loop;
end $$;

-- Events the app reports about itself (sign-in, export, import, security changes). Only these actions and only a small, credential-free payload.
create or replace function public.log_audit_event(p_action text, p_entity text, p_summary text default '', p_meta jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_meta jsonb := public._redact(case when jsonb_typeof(p_meta) = 'object' then p_meta else '{}'::jsonb end);
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_action not in ('import', 'export', 'login', 'logout', 'permission', 'config', 'security') then raise exception 'Unknown audit action.' using errcode = '22023'; end if;
  if p_entity is null or p_entity !~ '^[a-z][a-z0-9_.]{0,59}$' then raise exception 'Invalid audit entity.' using errcode = '22023'; end if;
  if octet_length(v_meta::text) > 2000 then v_meta := '{}'::jsonb; end if;
  -- cheap flood guard: at most 60 reported events per minute per person
  if (select count(*) from public.audit_events e where e.user_id = v_uid and e.occurred_at > now() - interval '1 minute' and e.operation is null) >= 60 then
    raise exception 'Too many events.' using errcode = '54000';
  end if;
  return public._audit_insert(v_uid, p_action, null, p_entity, null, p_summary, '{}', null, nullif(v_meta, '{}'::jsonb), false);
end $$;
revoke all on function public.log_audit_event(text, text, text, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, text, jsonb) to authenticated;

-- Walks the last p_limit events of the signed-in person and reports the first whose hash or link does not match. A gap at the START (old events removed by
-- retention) is expected and not an error.
create or replace function public.audit_verify_chain(p_limit integer default 2000) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r record; v_prev text; v_expect text; v_n integer := 0; v_first boolean := true;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  for r in select * from (select * from public.audit_events where user_id = v_uid order by seq desc limit least(greatest(p_limit, 1), 20000)) x order by seq asc loop
    v_n := v_n + 1;
    if not v_first and r.prev_hash is distinct from v_prev then
      return jsonb_build_object('ok', false, 'checked', v_n, 'broken_at', r.id, 'reason', 'link');
    end if;
    v_expect := encode(extensions.digest(
      coalesce(r.prev_hash, '') || '|' || r.id || '|' || r.user_id || '|' || r.action || '|' || r.entity || '|' || coalesce(r.record_id, '') || '|' || public._ts(r.occurred_at) || '|'
        || coalesce(r.old_values::text, '') || '|' || coalesce(r.new_values::text, ''), 'sha256'), 'hex');
    if v_expect <> r.hash then return jsonb_build_object('ok', false, 'checked', v_n, 'broken_at', r.id, 'reason', 'hash'); end if;
    v_prev := r.hash; v_first := false;
  end loop;
  return jsonb_build_object('ok', true, 'checked', v_n);
end $$;
revoke all on function public.audit_verify_chain(integer) from public, anon;
grant execute on function public.audit_verify_chain(integer) to authenticated;

-- The owner's right to erase their history (needs an unlocked session). It is never silent: one tombstone event records that, and how many, events were erased.
create or replace function public.erase_my_audit_history() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); n integer;
begin
  perform set_config('lifetrack.audit_maintenance', 'on', true);
  with d as (delete from public.audit_events where user_id = v_uid returning 1) select count(*) into n from d;
  perform set_config('lifetrack.audit_maintenance', 'off', true);
  perform public._audit_insert(v_uid, 'security', null, 'audit', null, format('Audit history erased (%s events)', n), '{}', null, jsonb_build_object('erased', n), false);
  return n;
end $$;
revoke all on function public.erase_my_audit_history() from public, anon;
grant execute on function public.erase_my_audit_history() to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ restore
create or replace function public._assert_unlocked() returns void
language plpgsql stable security definer set search_path = '' as $$
begin perform public._require_unlocked(); end $$;
revoke all on function public._assert_unlocked() from public, anon;
grant execute on function public._assert_unlocked() to authenticated;
-- Queues the `data.restored` webhook for a restore event of the signed-in person (the queueing function itself is not callable from a client).
create or replace function public._emit_restored(p_event uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.audit_events;
begin
  select * into e from public.audit_events where id = p_event and user_id = auth.uid();
  if found then
    perform public._emit_webhook(e.user_id, 'data.restored', 'data.restored:' || e.id::text,
      jsonb_build_object('entity', e.entity, 'record_id', e.record_id, 'event_id', e.id, 'mode', p_mode));
  end if;
end $$;
revoke all on function public._emit_restored(uuid, text) from public, anon;
grant execute on function public._emit_restored(uuid, text) to authenticated;
-- p_apply = false → a PREVIEW (nothing is written). true → applies it, in this one transaction, as the signed-in person (row-level security and every table
-- constraint still apply). Never overwrites newer data: if a field changed since the event, the answer lists the conflict and nothing is written.
create or replace function public.audit_restore(p_event uuid, p_apply boolean default false) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  e public.audit_events; v_uid uuid := auth.uid(); v_cur jsonb; v_changes jsonb := '[]'::jsonb; v_conflicts jsonb := '[]'::jsonb;
  v_exists boolean; f text; v_result jsonb; v_cols text[]; v_set text; v_mode text; v_reason text; v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into e from public.audit_events where id = p_event and user_id = v_uid;
  if not found then return jsonb_build_object('restorable', false, 'reason', 'not_found', 'message', 'That event was not found.'); end if;
  if e.operation is null or e.entity <> all (public._audit_tables()) or e.entity in ('user_settings') or e.record_id is null or e.record_id !~ '^[0-9a-f-]{36}$' then
    return jsonb_build_object('restorable', false, 'reason', 'unsupported', 'message', 'This kind of event cannot be restored.');
  end if;
  if e.truncated then return jsonb_build_object('restorable', false, 'reason', 'truncated', 'message', 'This event kept only part of a long text, so it cannot be restored safely.'); end if;
  if e.operation = 'insert' then
    return jsonb_build_object('restorable', false, 'reason', 'created', 'message', 'A created record has nothing to restore. Delete it from its own page if you no longer want it.');
  end if;
  v_id := e.record_id::uuid;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', e.entity) into v_cur using v_id;
  v_exists := v_cur is not null;

  if e.operation = 'delete' then
    v_mode := 'recreate';
    if v_exists then return jsonb_build_object('restorable', false, 'reason', 'exists', 'mode', v_mode, 'message', 'This record exists again, so there is nothing to restore.'); end if;
    for f in select jsonb_object_keys(e.old_values) order by 1 loop
      v_changes := v_changes || jsonb_build_object('field', f, 'current', null, 'restore_to', e.old_values -> f);
    end loop;
  else
    v_mode := 'revert';
    if not v_exists then return jsonb_build_object('restorable', false, 'reason', 'missing', 'mode', v_mode, 'message', 'This record has since been deleted. Restore its deletion first.'); end if;
    foreach f in array e.changed_fields loop
      if v_cur -> f is distinct from e.new_values -> f then
        v_conflicts := v_conflicts || jsonb_build_object('field', f, 'expected', e.new_values -> f, 'current', v_cur -> f);
      end if;
      v_changes := v_changes || jsonb_build_object('field', f, 'current', v_cur -> f, 'restore_to', e.old_values -> f);
    end loop;
  end if;
  v_result := jsonb_build_object('restorable', jsonb_array_length(v_conflicts) = 0, 'mode', v_mode, 'entity', e.entity, 'record_id', e.record_id,
    'summary', e.summary, 'changes', v_changes, 'conflicts', v_conflicts, 'applied', false);
  if jsonb_array_length(v_conflicts) > 0 then
    return v_result || jsonb_build_object('reason', 'conflict', 'message', 'This record was changed after that event. Nothing was overwritten.');
  end if;
  if not p_apply then return v_result; end if;

  perform public._assert_unlocked();
  perform set_config('lifetrack.audit_restore', e.id::text, true);
  begin
    if v_mode = 'recreate' then
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', e.entity, e.entity) using e.old_values || jsonb_build_object('user_id', v_uid);
    else
      select array_agg(c.attname::text) into v_cols from pg_attribute c
        where c.attrelid = format('public.%I', e.entity)::regclass and c.attnum > 0 and not c.attisdropped and c.attname = any (e.changed_fields)
          and c.attname not in ('id', 'user_id', 'created_at');
      if v_cols is null or cardinality(v_cols) <> cardinality(e.changed_fields) then
        perform set_config('lifetrack.audit_restore', '', true);
        return v_result || jsonb_build_object('restorable', false, 'reason', 'unsupported', 'message', 'A changed field cannot be restored.');
      end if;
      select string_agg(format('%I = r.%I', c, c), ', ') into v_set from unnest(v_cols) c;
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2 and t.user_id = $3', e.entity, v_set, e.entity)
        using e.old_values, v_id, v_uid;
    end if;
  exception
    when foreign_key_violation then
      perform set_config('lifetrack.audit_restore', '', true);
      return v_result || jsonb_build_object('restorable', false, 'reason', 'dependency', 'message', 'A record this one belongs to no longer exists. Restore that first.');
    when unique_violation then
      perform set_config('lifetrack.audit_restore', '', true);
      return v_result || jsonb_build_object('restorable', false, 'reason', 'duplicate', 'message', 'Restoring would duplicate something that exists now.');
    when insufficient_privilege then
      perform set_config('lifetrack.audit_restore', '', true);
      return v_result || jsonb_build_object('restorable', false, 'reason', 'locked', 'message', 'This part of LifeTrack is locked. Unlock it and try again.');
    when check_violation or not_null_violation then
      perform set_config('lifetrack.audit_restore', '', true);
      return v_result || jsonb_build_object('restorable', false, 'reason', 'invalid', 'message', 'The old values no longer pass the current rules.');
  end;
  perform set_config('lifetrack.audit_restore', '', true);
  perform public._emit_restored(e.id, v_mode);
  return v_result || jsonb_build_object('applied', true);
end $$;
revoke all on function public.audit_restore(uuid, boolean) from public, anon;
grant execute on function public.audit_restore(uuid, boolean) to authenticated;

-- =============================================================================================================================== shared: rate windows
create table if not exists public.rate_windows (
  subject text not null check (char_length(subject) <= 80),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (subject, window_start)
);
alter table public.rate_windows enable row level security;
alter table public.rate_windows force row level security;
revoke all on public.rate_windows from public, anon, authenticated;

-- Counts one hit for `subject` in the current window and answers whether it is allowed. Atomic (one upsert), so concurrent requests cannot both slip under.
create or replace function public._rate_hit(p_subject text, p_limit integer, p_window_seconds integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds); v_hits integer;
begin
  insert into public.rate_windows (subject, window_start, hits) values (p_subject, v_start, 1)
    on conflict (subject, window_start) do update set hits = public.rate_windows.hits + 1 returning hits into v_hits;
  return jsonb_build_object('allowed', v_hits <= p_limit, 'hits', v_hits, 'limit', p_limit, 'reset_at', v_start + make_interval(secs => p_window_seconds));
end $$;
revoke all on function public._rate_hit(text, integer, integer) from public, anon, authenticated;

-- =============================================================================================================================== 2. system health
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not public.is_platform_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
end $$;
revoke all on function public._require_admin() from public, anon, authenticated;

-- Frontend and sync errors, one row per distinct error (deduplicated by a fingerprint), with a counter. Holds no personal data: no user id, no page query string.
create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (char_length(fingerprint) <= 64),
  category text not null check (category in ('frontend', 'sync', 'network', 'auth', 'api', 'other')),
  message text not null check (char_length(message) <= 300),
  stack text not null default '' check (char_length(stack) <= 2000),
  route text not null default '' check (char_length(route) <= 120),
  release text not null default '' check (char_length(release) <= 40),
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists app_errors_last_seen_idx on public.app_errors (last_seen desc);
alter table public.app_errors enable row level security;
alter table public.app_errors force row level security;
revoke all on public.app_errors from public, anon, authenticated;

create or replace function public.report_client_error(p_category text, p_message text, p_stack text default '', p_route text default '', p_release text default '') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_cat text := case when p_category in ('frontend', 'sync', 'network', 'auth', 'api') then p_category else 'other' end;
        v_msg text := left(coalesce(p_message, ''), 300); v_stack text := left(coalesce(p_stack, ''), 2000);
        v_route text := left(split_part(split_part(coalesce(p_route, ''), '?', 1), '#', 1), 120); v_fp text;
begin
  if v_uid is null then return false; end if;
  if v_msg = '' then return false; end if;
  if not (public._rate_hit('err:' || v_uid::text, 20, 600) ->> 'allowed')::boolean then return false; end if; -- 20 reports / 10 min / person
  v_fp := md5(v_cat || '|' || v_msg || '|' || split_part(v_stack, E'\n', 2));
  insert into public.app_errors (fingerprint, category, message, stack, route, release) values (v_fp, v_cat, v_msg, v_stack, v_route, left(coalesce(p_release, ''), 40))
    on conflict (fingerprint) do update set occurrences = public.app_errors.occurrences + 1, last_seen = now();
  return true;
end $$;
revoke all on function public.report_client_error(text, text, text, text, text) from public, anon;
grant execute on function public.report_client_error(text, text, text, text, text) to authenticated;

-- Hourly API aggregates (request volume, errors, latency histogram). Written by the API gateway only.
create table if not exists public.request_metrics (
  bucket timestamptz not null,
  scope text not null default 'api' check (scope in ('api')),
  requests integer not null default 0,
  errors_4xx integer not null default 0,
  errors_5xx integer not null default 0,
  auth_failures integer not null default 0,
  rate_limited integer not null default 0,
  total_ms bigint not null default 0,
  max_ms integer not null default 0,
  slow integer not null default 0,
  b50 integer not null default 0, b100 integer not null default 0, b250 integer not null default 0, b500 integer not null default 0,
  b1000 integer not null default 0, bmore integer not null default 0,
  primary key (bucket, scope)
);
alter table public.request_metrics enable row level security;
alter table public.request_metrics force row level security;
revoke all on public.request_metrics from public, anon, authenticated;

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job ~ '^[a-z][a-z0-9_-]{0,39}$'),
  status text not null check (status in ('ok', 'error')),
  started_at timestamptz not null default now(),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  detail text not null default '' check (char_length(detail) <= 300),
  error text not null default '' check (char_length(error) <= 300)
);
create index if not exists job_runs_job_idx on public.job_runs (job, started_at desc);
alter table public.job_runs enable row level security;
alter table public.job_runs force row level security;
revoke all on public.job_runs from public, anon, authenticated;

create or replace function public.record_job_run(p_job text, p_status text, p_duration_ms integer, p_detail text default '', p_error text default '') returns void
language sql security definer set search_path = '' as $$
  insert into public.job_runs (job, status, duration_ms, detail, error) values (p_job, p_status, greatest(p_duration_ms, 0), left(coalesce(p_detail, ''), 300), left(coalesce(p_error, ''), 300))
$$;
revoke all on function public.record_job_run(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_job_run(text, text, integer, text, text) to service_role;

-- ------------------------------------------------------------------------------------------------------------------ admin reads
create or replace function public.admin_system_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t0 timestamptz := clock_timestamp(); v_db_ms integer; v_api jsonb; v_err jsonb; v_jobs jsonb; v_slow jsonb := '[]'::jsonb; v_backup timestamptz; v_hist jsonb;
  v_incidents jsonb; v_retention jsonb; v_wh jsonb;
begin
  perform public._require_admin();
  perform count(*) from public.request_metrics;
  v_db_ms := greatest(1, round(extract(epoch from clock_timestamp() - t0) * 1000)::integer);
  select jsonb_build_object('requests', coalesce(sum(requests), 0), 'errors_4xx', coalesce(sum(errors_4xx), 0), 'errors_5xx', coalesce(sum(errors_5xx), 0),
           'auth_failures', coalesce(sum(auth_failures), 0), 'rate_limited', coalesce(sum(rate_limited), 0),
           'avg_ms', case when coalesce(sum(requests), 0) > 0 then round(sum(total_ms)::numeric / sum(requests)) end,
           'max_ms', coalesce(max(max_ms), 0), 'slow', coalesce(sum(slow), 0),
           'hist', jsonb_build_array(coalesce(sum(b50), 0), coalesce(sum(b100), 0), coalesce(sum(b250), 0), coalesce(sum(b500), 0), coalesce(sum(b1000), 0), coalesce(sum(bmore), 0)),
           'last_request_at', (select max(bucket) from public.request_metrics))
    into v_api from public.request_metrics where bucket >= now() - interval '24 hours';
  select jsonb_build_object('total_24h', coalesce(sum(occurrences) filter (where last_seen >= now() - interval '24 hours'), 0),
           'distinct_24h', count(*) filter (where last_seen >= now() - interval '24 hours'),
           'sync_24h', coalesce(sum(occurrences) filter (where category = 'sync' and last_seen >= now() - interval '24 hours'), 0),
           'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from public.app_errors where last_seen >= now() - interval '24 hours' group by 1) c), '{}'::jsonb))
    into v_err from public.app_errors;
  select coalesce(jsonb_agg(j order by (j ->> 'job')), '[]'::jsonb) into v_jobs from (
    select jsonb_build_object('job', job, 'last_run', max(started_at), 'last_status', (array_agg(status order by started_at desc))[1],
      'last_error', (array_agg(error order by started_at desc))[1],
      'last_ok', max(started_at) filter (where status = 'ok'), 'runs_24h', count(*) filter (where started_at >= now() - interval '24 hours'),
      'failures_24h', count(*) filter (where status = 'error' and started_at >= now() - interval '24 hours'),
      'avg_ms', round(avg(duration_ms) filter (where started_at >= now() - interval '24 hours'))) j
    from public.job_runs where started_at >= now() - interval '7 days' group by job) x;
  if to_regclass('pg_stat_statements') is not null then
    begin
      execute $q$select coalesce(jsonb_agg(jsonb_build_object('query', left(regexp_replace(query, '\s+', ' ', 'g'), 160), 'calls', calls, 'mean_ms', round(mean_exec_time::numeric, 1), 'max_ms', round(max_exec_time::numeric)) order by mean_exec_time desc), '[]'::jsonb)
                 from (select query, calls, mean_exec_time, max_exec_time from pg_stat_statements where calls >= 5 and mean_exec_time > 100 and query not ilike '%pg_stat_statements%' order by mean_exec_time desc limit 5) s$q$ into v_slow;
    exception when others then v_slow := '[]'::jsonb;
    end;
  end if;
  select max(created_at) into v_backup from public.integration_events where kind = 'backup';
  select coalesce(jsonb_agg(jsonb_build_object('at', bucket, 'kind', 'api', 'title', 'High API error rate', 'detail', format('%s of %s requests failed with a server error', errors_5xx, requests)) order by bucket desc), '[]'::jsonb)
    into v_incidents from (select * from public.request_metrics where bucket >= now() - interval '7 days' and requests >= 5 and errors_5xx::numeric / requests >= 0.05 order by bucket desc limit 10) i;
  v_incidents := v_incidents || coalesce((select jsonb_agg(jsonb_build_object('at', started_at, 'kind', 'job', 'title', 'Job failed: ' || job, 'detail', error) order by started_at desc)
    from (select * from public.job_runs where status = 'error' and started_at >= now() - interval '7 days' order by started_at desc limit 10) f), '[]'::jsonb);
  select jsonb_build_object('pending', count(*) filter (where status in ('pending', 'retrying')), 'dead', count(*) filter (where status = 'dead'),
           'failed_24h', count(*) filter (where status in ('retrying', 'dead') and created_at >= now() - interval '24 hours'),
           'delivered_24h', count(*) filter (where status = 'delivered' and delivered_at >= now() - interval '24 hours'),
           'oldest_pending', min(next_attempt_at) filter (where status in ('pending', 'retrying')))
    into v_wh from public.webhook_deliveries;
  select jsonb_build_object('errors_rows', (select count(*) from public.app_errors), 'request_log_rows', (select count(*) from public.api_request_log),
           'job_runs_rows', (select count(*) from public.job_runs), 'audit_rows', (select count(*) from public.audit_events)) into v_retention;
  return jsonb_build_object('generated_at', now(), 'database', jsonb_build_object('ok', true, 'latency_ms', v_db_ms, 'slow_queries', v_slow),
    'api', v_api, 'errors', v_err, 'jobs', v_jobs, 'webhooks', v_wh, 'last_backup_at', v_backup, 'incidents', v_incidents, 'storage', v_retention);
end $$;
revoke all on function public.admin_system_overview() from public, anon;
grant execute on function public.admin_system_overview() to authenticated;

create or replace function public.admin_system_metrics(p_hours integer default 24) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_hours integer := least(greatest(coalesce(p_hours, 24), 1), 168);
begin
  perform public._require_admin();
  return jsonb_build_object('hours', v_hours,
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'requests', coalesce(m.requests, 0), 'errors_4xx', coalesce(m.errors_4xx, 0), 'errors_5xx', coalesce(m.errors_5xx, 0),
        'auth_failures', coalesce(m.auth_failures, 0), 'avg_ms', case when coalesce(m.requests, 0) > 0 then round(m.total_ms::numeric / m.requests) end, 'max_ms', m.max_ms,
        'client_errors', coalesce(e.n, 0)) order by h)
      from generate_series(date_trunc('hour', now()) - make_interval(hours => v_hours - 1), date_trunc('hour', now()), interval '1 hour') h
      left join public.request_metrics m on m.bucket = h and m.scope = 'api'
      left join (select date_trunc('hour', last_seen) hr, sum(occurrences) n from public.app_errors where last_seen >= now() - make_interval(hours => v_hours) group by 1) e on e.hr = h), '[]'::jsonb));
end $$;
revoke all on function public.admin_system_metrics(integer) from public, anon;
grant execute on function public.admin_system_metrics(integer) to authenticated;

create or replace function public.admin_system_errors(p_limit integer default 25, p_offset integer default 0, p_category text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100); v_total integer;
begin
  perform public._require_admin();
  select count(*) into v_total from public.app_errors where p_category is null or category = p_category;
  return jsonb_build_object('total', v_total, 'items', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.last_seen desc) from (
      select id, category, message, stack, route, release, occurrences, first_seen, last_seen from public.app_errors
      where p_category is null or category = p_category order by last_seen desc limit v_limit offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end $$;
revoke all on function public.admin_system_errors(integer, integer, text) from public, anon;
grant execute on function public.admin_system_errors(integer, integer, text) to authenticated;

-- =============================================================================================================================== 3. API keys
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  key_prefix text not null check (char_length(key_prefix) <= 20),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (cardinality(scopes) between 1 and 20),
  rate_limit_per_min integer not null default 60 check (rate_limit_per_min between 1 and 600),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  request_count bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_user_idx on public.api_keys (user_id, created_at desc);

create table if not exists public.api_request_log (
  id bigint generated always as identity primary key,
  key_id uuid not null references public.api_keys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text check (request_id is null or char_length(request_id) <= 64),
  method text not null check (char_length(method) <= 10),
  path text not null check (char_length(path) <= 200),
  status integer not null,
  duration_ms integer not null default 0,
  error_code text check (error_code is null or char_length(error_code) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists api_request_log_user_idx on public.api_request_log (user_id, created_at desc);
create index if not exists api_request_log_key_idx on public.api_request_log (key_id, created_at desc);
create index if not exists api_request_log_created_idx on public.api_request_log (created_at);

do $$
declare t text;
begin
  foreach t in array array['api_keys', 'api_request_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "owner_read" on public.%I', t);
    execute format('create policy "owner_read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  -- the key hash is never readable from a client, not even by its owner
  revoke select on public.api_keys from authenticated;
  grant select (id, user_id, name, description, key_prefix, scopes, rate_limit_per_min, expires_at, revoked_at, last_used_at, request_count, created_at) on public.api_keys to authenticated;
end $$;

create or replace function public._api_scopes() returns text[]
language sql immutable set search_path = '' as $$
  select array['tasks:read', 'tasks:write', 'goals:read', 'habits:read', 'finance:read', 'finance:write', 'fitness:read', 'learning:read', 'health:read', 'calendar:read', 'calendar:write']
$$;

-- Creates a key. The plaintext is returned ONCE, here, and never stored: only its SHA-256 hash is. Needs an unlocked session (a locked laptop cannot mint access).
create or replace function public.create_api_key(p_name text, p_description text, p_scopes text[], p_expires_days integer default null, p_rate_limit integer default 60) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_key text; v_row public.api_keys; v_scopes text[];
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then raise exception 'Give the key a name (up to 60 characters).' using errcode = '22023'; end if;
  select array_agg(distinct s order by s) into v_scopes from unnest(coalesce(p_scopes, '{}')) s;
  if v_scopes is null or not (v_scopes <@ public._api_scopes()) then raise exception 'Choose at least one valid permission.' using errcode = '22023'; end if;
  if p_expires_days is not null and p_expires_days not between 1 and 3650 then raise exception 'Expiry must be 1 to 3650 days.' using errcode = '22023'; end if;
  if p_rate_limit not between 1 and 600 then raise exception 'The rate limit must be 1 to 600 requests a minute.' using errcode = '22023'; end if;
  if (select count(*) from public.api_keys where user_id = v_uid and revoked_at is null) >= 20 then raise exception 'You can have at most 20 active keys. Revoke one first.' using errcode = '54000'; end if;
  v_key := 'lt_live_' || replace(replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');
  insert into public.api_keys (user_id, name, description, key_prefix, key_hash, scopes, rate_limit_per_min, expires_at)
    values (v_uid, btrim(p_name), left(coalesce(p_description, ''), 300), left(v_key, 15), encode(extensions.digest(v_key, 'sha256'), 'hex'), v_scopes, p_rate_limit,
            case when p_expires_days is null then null else now() + make_interval(days => p_expires_days) end)
    returning * into v_row;
  perform public._audit_insert(v_uid, 'permission', null, 'api_key', v_row.id::text, 'API key created: ' || v_row.name, '{}', null,
    jsonb_build_object('name', v_row.name, 'scopes', v_row.scopes, 'expires_at', v_row.expires_at), false);
  return jsonb_build_object('key', v_key, 'id', v_row.id, 'name', v_row.name, 'key_prefix', v_row.key_prefix, 'scopes', v_row.scopes, 'expires_at', v_row.expires_at,
    'rate_limit_per_min', v_row.rate_limit_per_min);
end $$;
revoke all on function public.create_api_key(text, text, text[], integer, integer) from public, anon;
grant execute on function public.create_api_key(text, text, text[], integer, integer) to authenticated;

create or replace function public.revoke_api_key(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_name text;
begin
  update public.api_keys set revoked_at = now() where id = p_id and user_id = v_uid and revoked_at is null returning name into v_name;
  if v_name is null then raise exception 'That key was not found, or is already revoked.' using errcode = 'P0002'; end if;
  perform public._audit_insert(v_uid, 'permission', null, 'api_key', p_id::text, 'API key revoked: ' || v_name, '{}', null, null, false);
end $$;
revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.revoke_api_key(uuid) to authenticated;

create or replace function public.update_api_key(p_id uuid, p_name text, p_description text, p_rate_limit integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then raise exception 'Give the key a name (up to 60 characters).' using errcode = '22023'; end if;
  if p_rate_limit not between 1 and 600 then raise exception 'The rate limit must be 1 to 600 requests a minute.' using errcode = '22023'; end if;
  update public.api_keys set name = btrim(p_name), description = left(coalesce(p_description, ''), 300), rate_limit_per_min = p_rate_limit where id = p_id and user_id = v_uid and revoked_at is null;
  if not found then raise exception 'That key was not found, or is revoked.' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.update_api_key(uuid, text, text, integer) from public, anon;
grant execute on function public.update_api_key(uuid, text, text, integer) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ gateway-only functions
-- The gateway hashes the presented key itself and calls this: it answers with the key's row when it is usable, and says why when it is not.
create or replace function public.api_authenticate(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where key_hash = p_hash;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if k.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'revoked', 'key_id', k.id, 'user_id', k.user_id); end if;
  if k.expires_at is not null and k.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired', 'key_id', k.id, 'user_id', k.user_id); end if;
  return jsonb_build_object('ok', true, 'key_id', k.id, 'user_id', k.user_id, 'name', k.name, 'scopes', to_jsonb(k.scopes), 'rate_limit_per_min', k.rate_limit_per_min,
    'expires_at', k.expires_at, 'key_prefix', k.key_prefix);
end $$;
revoke all on function public.api_authenticate(text) from public, anon, authenticated;
grant execute on function public.api_authenticate(text) to service_role;

create or replace function public.api_rate_hit(p_key uuid, p_limit integer) returns jsonb
language sql security definer set search_path = '' as $$ select public._rate_hit('key:' || p_key::text, p_limit, 60) $$;
revoke all on function public.api_rate_hit(uuid, integer) from public, anon, authenticated;
grant execute on function public.api_rate_hit(uuid, integer) to service_role;

-- One round trip per request: the request log row, the hourly aggregate, and the key's last-used mark. key_id may be null (an unauthenticated request:
-- only the aggregate is kept, so a flood of bad keys cannot fill the log).
create or replace function public.api_record(p_key uuid, p_user uuid, p_request_id text, p_method text, p_path text, p_status integer, p_ms integer, p_error text, p_slow_ms integer default 1000) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ms integer := greatest(coalesce(p_ms, 0), 0);
begin
  if p_key is not null then
    insert into public.api_request_log (key_id, user_id, request_id, method, path, status, duration_ms, error_code)
      values (p_key, p_user, left(p_request_id, 64), left(p_method, 10), left(p_path, 200), p_status, v_ms, left(p_error, 40));
    update public.api_keys set last_used_at = now(), request_count = request_count + 1 where id = p_key;
  end if;
  insert into public.request_metrics (bucket, scope, requests, errors_4xx, errors_5xx, auth_failures, rate_limited, total_ms, max_ms, slow, b50, b100, b250, b500, b1000, bmore)
    values (date_trunc('hour', now()), 'api', 1, (p_status between 400 and 499)::int, (p_status >= 500)::int, (p_status in (401, 403) and p_error in ('invalid_key', 'revoked_key', 'expired_key', 'missing_key'))::int,
      (p_status = 429)::int, v_ms, v_ms, (v_ms >= p_slow_ms)::int, (v_ms < 50)::int, (v_ms >= 50 and v_ms < 100)::int, (v_ms >= 100 and v_ms < 250)::int,
      (v_ms >= 250 and v_ms < 500)::int, (v_ms >= 500 and v_ms < 1000)::int, (v_ms >= 1000)::int)
    on conflict (bucket, scope) do update set requests = public.request_metrics.requests + 1,
      errors_4xx = public.request_metrics.errors_4xx + excluded.errors_4xx, errors_5xx = public.request_metrics.errors_5xx + excluded.errors_5xx,
      auth_failures = public.request_metrics.auth_failures + excluded.auth_failures, rate_limited = public.request_metrics.rate_limited + excluded.rate_limited,
      total_ms = public.request_metrics.total_ms + excluded.total_ms, max_ms = greatest(public.request_metrics.max_ms, excluded.max_ms), slow = public.request_metrics.slow + excluded.slow,
      b50 = public.request_metrics.b50 + excluded.b50, b100 = public.request_metrics.b100 + excluded.b100, b250 = public.request_metrics.b250 + excluded.b250,
      b500 = public.request_metrics.b500 + excluded.b500, b1000 = public.request_metrics.b1000 + excluded.b1000, bmore = public.request_metrics.bmore + excluded.bmore;
end $$;
revoke all on function public.api_record(uuid, uuid, text, text, text, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.api_record(uuid, uuid, text, text, text, integer, integer, text, integer) to service_role;

-- Gateway readiness probe: does the database answer a real query?
create or replace function public.api_ready() returns boolean
language sql stable security definer set search_path = '' as $$ select true $$;
revoke all on function public.api_ready() from public, anon, authenticated;
grant execute on function public.api_ready() to service_role;

-- Usage for the owner's keys: per day, per status class and the busiest endpoints. Row-level security limits it to their own log.
create or replace function public.api_usage_summary(p_days integer default 14) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  return jsonb_build_object('days', v_days,
    'totals', (select jsonb_build_object('requests', count(*), 'ok', count(*) filter (where status < 400), 'client_errors', count(*) filter (where status between 400 and 499),
        'server_errors', count(*) filter (where status >= 500), 'rate_limited', count(*) filter (where status = 429), 'avg_ms', round(avg(duration_ms)))
      from public.api_request_log where created_at >= now() - make_interval(days => v_days)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'requests', coalesce(r.n, 0), 'errors', coalesce(r.errs, 0)) order by d)
      from generate_series(current_date - (v_days - 1), current_date, interval '1 day') d
      left join (select created_at::date as dy, count(*) n, count(*) filter (where status >= 400) errs from public.api_request_log
                 where created_at >= now() - make_interval(days => v_days) group by 1) r on r.dy = d::date), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(x) from (select jsonb_build_object('method', method, 'path', path, 'requests', count(*), 'errors', count(*) filter (where status >= 400)) x
      from public.api_request_log where created_at >= now() - make_interval(days => v_days) group by method, path order by count(*) desc limit 8) t), '[]'::jsonb));
end $$;
revoke all on function public.api_usage_summary(integer) from public, anon;
grant execute on function public.api_usage_summary(integer) to authenticated;

-- =============================================================================================================================== 3b. webhooks
create or replace function public._webhook_events() returns text[]
language sql immutable set search_path = '' as $$
  select array['task.created', 'task.updated', 'task.completed', 'goal.created', 'goal.completed', 'habit.completed', 'expense.created', 'workout.logged',
    'study.session.completed', 'calendar.event.created', 'data.restored']
$$;

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null check (char_length(url) <= 2048 and url ~ '^https://[^/?#@\s]+'),
  description text not null default '' check (char_length(description) <= 200),
  events text[] not null check (cardinality(events) between 1 and 20),
  enabled boolean not null default true,
  timeout_ms integer not null default 5000 check (timeout_ms between 1000 and 15000),
  max_attempts integer not null default 6 check (max_attempts between 1 and 10),
  consecutive_failures integer not null default 0,
  disabled_reason text not null default '' check (char_length(disabled_reason) <= 200),
  last_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webhook_endpoints_user_idx on public.webhook_endpoints (user_id, enabled);

create table if not exists public.webhook_secrets (
  endpoint_id uuid primary key references public.webhook_endpoints(id) on delete cascade,
  secret text not null
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type ~ '^[a-z.]{3,40}$'),
  event_key text not null check (char_length(event_key) <= 120),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'retrying', 'delivered', 'dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_status integer,
  last_error text not null default '' check (char_length(last_error) <= 300),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (endpoint_id, event_key)
);
create index if not exists webhook_deliveries_user_idx on public.webhook_deliveries (user_id, created_at desc);
create index if not exists webhook_deliveries_endpoint_idx on public.webhook_deliveries (endpoint_id, created_at desc);
create index if not exists webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status in ('pending', 'retrying', 'sending');

create table if not exists public.webhook_attempts (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.webhook_deliveries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt integer not null,
  ok boolean not null,
  status integer,
  error text not null default '' check (char_length(error) <= 300),
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists webhook_attempts_delivery_idx on public.webhook_attempts (delivery_id, attempt);
create index if not exists webhook_attempts_user_idx on public.webhook_attempts (user_id);

do $$
declare t text;
begin
  foreach t in array array['webhook_endpoints', 'webhook_secrets', 'webhook_deliveries', 'webhook_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
  foreach t in array array['webhook_endpoints', 'webhook_deliveries', 'webhook_attempts'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "owner_read" on public.%I', t);
    execute format('create policy "owner_read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  drop trigger if exists set_updated_at on public.webhook_endpoints;
  create trigger set_updated_at before update on public.webhook_endpoints for each row execute function public.set_updated_at();
end $$;

-- A first line of defence for the address (the dispatcher repeats it, and resolves the name, at delivery time): https only, no credentials in the URL, no
-- obviously internal hosts. The names and ranges below can never be a customer's server.
create or replace function public._webhook_url_problem(p_url text) returns text
language plpgsql immutable set search_path = '' as $$
declare v_host text;
begin
  if p_url is null or char_length(p_url) > 2048 or p_url !~ '^https://[^/?#@\s]+([/?#]\S*)?$' then return 'Use a full https:// address.'; end if;
  v_host := lower(split_part(split_part(substring(p_url from '^https://([^/?#]+)'), ':', 1), '@', 1));
  if v_host in ('localhost', '') or v_host ~ '\.(local|localhost|internal|lan|home|corp|intranet)$' then return 'That address is internal; use a public server.'; end if;
  if v_host ~ '^\[' or v_host ~ ':' then return 'Use a host name, not an IP address.'; end if;
  if v_host ~ '^[0-9.]+$' then return 'Use a host name, not an IP address.'; end if;
  if v_host !~ '\.' then return 'Use a full host name.'; end if;
  return null;
end $$;

create or replace function public.create_webhook_endpoint(p_url text, p_description text, p_events text[], p_timeout_ms integer default 5000, p_max_attempts integer default 6) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_problem text := public._webhook_url_problem(p_url); v_events text[]; v_row public.webhook_endpoints; v_secret text;
begin
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  select array_agg(distinct e order by e) into v_events from unnest(coalesce(p_events, '{}')) e;
  if v_events is null or not (v_events <@ public._webhook_events()) then raise exception 'Choose at least one valid event.' using errcode = '22023'; end if;
  if (select count(*) from public.webhook_endpoints where user_id = v_uid) >= 10 then raise exception 'You can have at most 10 webhook endpoints.' using errcode = '54000'; end if;
  insert into public.webhook_endpoints (user_id, url, description, events, timeout_ms, max_attempts)
    values (v_uid, btrim(p_url), left(coalesce(p_description, ''), 200), v_events, least(greatest(coalesce(p_timeout_ms, 5000), 1000), 15000), least(greatest(coalesce(p_max_attempts, 6), 1), 10))
    returning * into v_row;
  v_secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.webhook_secrets (endpoint_id, secret) values (v_row.id, v_secret);
  perform public._audit_insert(v_uid, 'config', null, 'webhook', v_row.id::text, 'Webhook added: ' || split_part(substring(v_row.url from '^https://([^/?#]+)'), ':', 1), '{}', null,
    jsonb_build_object('events', v_row.events), false);
  return jsonb_build_object('id', v_row.id, 'secret', v_secret);
end $$;
revoke all on function public.create_webhook_endpoint(text, text, text[], integer, integer) from public, anon;
grant execute on function public.create_webhook_endpoint(text, text, text[], integer, integer) to authenticated;

create or replace function public.update_webhook_endpoint(p_id uuid, p_url text, p_description text, p_events text[], p_enabled boolean, p_timeout_ms integer, p_max_attempts integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_problem text := public._webhook_url_problem(p_url); v_events text[];
begin
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  select array_agg(distinct e order by e) into v_events from unnest(coalesce(p_events, '{}')) e;
  if v_events is null or not (v_events <@ public._webhook_events()) then raise exception 'Choose at least one valid event.' using errcode = '22023'; end if;
  update public.webhook_endpoints set url = btrim(p_url), description = left(coalesce(p_description, ''), 200), events = v_events, enabled = p_enabled,
      timeout_ms = least(greatest(coalesce(p_timeout_ms, 5000), 1000), 15000), max_attempts = least(greatest(coalesce(p_max_attempts, 6), 1), 10),
      consecutive_failures = case when p_enabled then 0 else consecutive_failures end, disabled_reason = case when p_enabled then '' else 'Turned off by you' end
    where id = p_id and user_id = v_uid;
  if not found then raise exception 'That webhook was not found.' using errcode = 'P0002'; end if;
  perform public._audit_insert(v_uid, 'config', null, 'webhook', p_id::text, case when p_enabled then 'Webhook updated' else 'Webhook turned off' end, '{}', null, jsonb_build_object('events', v_events), false);
end $$;
revoke all on function public.update_webhook_endpoint(uuid, text, text, text[], boolean, integer, integer) from public, anon;
grant execute on function public.update_webhook_endpoint(uuid, text, text, text[], boolean, integer, integer) to authenticated;

create or replace function public.delete_webhook_endpoint(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  delete from public.webhook_endpoints where id = p_id and user_id = v_uid;
  if not found then raise exception 'That webhook was not found.' using errcode = 'P0002'; end if;
  perform public._audit_insert(v_uid, 'config', null, 'webhook', p_id::text, 'Webhook deleted', '{}', null, null, false);
end $$;
revoke all on function public.delete_webhook_endpoint(uuid) from public, anon;
grant execute on function public.delete_webhook_endpoint(uuid) to authenticated;

create or replace function public.rotate_webhook_secret(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_secret text := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not exists (select 1 from public.webhook_endpoints where id = p_id and user_id = v_uid) then raise exception 'That webhook was not found.' using errcode = 'P0002'; end if;
  update public.webhook_secrets set secret = v_secret where endpoint_id = p_id;
  perform public._audit_insert(v_uid, 'security', null, 'webhook', p_id::text, 'Webhook signing secret rotated', '{}', null, null, false);
  return v_secret;
end $$;
revoke all on function public.rotate_webhook_secret(uuid) from public, anon;
grant execute on function public.rotate_webhook_secret(uuid) to authenticated;

-- Queues one delivery per enabled, subscribed endpoint of `p_user`. Idempotent: the same event key is never queued twice for an endpoint.
create or replace function public._emit_webhook(p_user uuid, p_type text, p_key text, p_data jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ins as (
    insert into public.webhook_deliveries (endpoint_id, user_id, event_type, event_key, payload)
    select e.id, p_user, p_type, p_key,
           jsonb_build_object('type', p_type, 'created_at', now(), 'data', public._redact(p_data))
      from public.webhook_endpoints e where e.user_id = p_user and e.enabled and p_type = any (e.events)
    on conflict (endpoint_id, event_key) do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;
revoke all on function public._emit_webhook(uuid, text, text, jsonb) from public, anon, authenticated;

-- The domain events, derived from the tables that already exist. Never lets a webhook problem break the user's own write.
create or replace function public.webhook_domain_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := to_jsonb(new); v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end; v_user uuid := (to_jsonb(new) ->> 'user_id')::uuid; v_id text := to_jsonb(new) ->> 'id';
        v_stamp text := coalesce(to_jsonb(new) ->> 'updated_at', to_jsonb(new) ->> 'created_at', '');
begin
  if not exists (select 1 from public.webhook_endpoints e where e.user_id = v_user and e.enabled) then return null; end if;
  case tg_table_name
    when 'tasks' then
      if tg_op = 'INSERT' then perform public._emit_webhook(v_user, 'task.created', 'task.created:' || v_id, jsonb_build_object('task', v_row)); end if;
      if tg_op = 'UPDATE' and v_old <> v_row then
        if new.status = 'done' and (v_old ->> 'status') is distinct from 'done' then perform public._emit_webhook(v_user, 'task.completed', 'task.completed:' || v_id || ':' || v_stamp, jsonb_build_object('task', v_row));
        else perform public._emit_webhook(v_user, 'task.updated', 'task.updated:' || v_id || ':' || v_stamp, jsonb_build_object('task', v_row)); end if;
      end if;
    when 'goals' then
      if tg_op = 'INSERT' then perform public._emit_webhook(v_user, 'goal.created', 'goal.created:' || v_id, jsonb_build_object('goal', v_row)); end if;
      if tg_op = 'UPDATE' and new.status = 'completed' and (v_old ->> 'status') is distinct from 'completed' then
        perform public._emit_webhook(v_user, 'goal.completed', 'goal.completed:' || v_id || ':' || v_stamp, jsonb_build_object('goal', v_row)); end if;
    when 'habit_logs' then
      if new.status = 'done' and (v_old ->> 'status') is distinct from 'done' then
        perform public._emit_webhook(v_user, 'habit.completed', 'habit.completed:' || v_id || ':' || v_stamp, jsonb_build_object('habit_log', v_row)); end if;
    when 'transactions' then
      if tg_op = 'INSERT' and new.type = 'expense' then perform public._emit_webhook(v_user, 'expense.created', 'expense.created:' || v_id, jsonb_build_object('transaction', v_row)); end if;
    when 'workouts' then
      if new.status = 'completed' and (v_old ->> 'status') is distinct from 'completed' then
        perform public._emit_webhook(v_user, 'workout.logged', 'workout.logged:' || v_id || ':' || v_stamp, jsonb_build_object('workout', v_row)); end if;
    when 'study_sessions' then
      if new.status = 'completed' and (v_old ->> 'status') is distinct from 'completed' then
        perform public._emit_webhook(v_user, 'study.session.completed', 'study.session.completed:' || v_id || ':' || v_stamp, jsonb_build_object('study_session', v_row)); end if;
    when 'calendar_events' then
      if tg_op = 'INSERT' then perform public._emit_webhook(v_user, 'calendar.event.created', 'calendar.event.created:' || v_id, jsonb_build_object('calendar_event', v_row)); end if;
    else null;
  end case;
  return null;
exception when others then
  raise warning 'webhook enqueue failed: %', sqlerrm; -- the person's own write must never fail because of an integration
  return null;
end $$;
revoke all on function public.webhook_domain_events() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['tasks', 'goals', 'habit_logs', 'transactions', 'workouts', 'study_sessions', 'calendar_events'] loop
    continue when to_regclass(format('public.%I', t)) is null;
    execute format('drop trigger if exists webhook_domain_events on public.%I', t);
    execute format('create trigger webhook_domain_events after insert or update on public.%I for each row execute function public.webhook_domain_events()', t);
  end loop;
end $$;

-- A test delivery (always queued, even if the endpoint did not subscribe to anything) and a manual retry.
create or replace function public.queue_webhook_test(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_id uuid;
begin
  if not exists (select 1 from public.webhook_endpoints where id = p_id and user_id = v_uid) then raise exception 'That webhook was not found.' using errcode = 'P0002'; end if;
  insert into public.webhook_deliveries (endpoint_id, user_id, event_type, event_key, payload)
    values (p_id, v_uid, 'webhook.test', 'webhook.test:' || gen_random_uuid()::text,
            jsonb_build_object('type', 'webhook.test', 'created_at', now(), 'data', jsonb_build_object('message', 'This is a test event from LifeTrack.')))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_webhook_test(uuid) from public, anon;
grant execute on function public.queue_webhook_test(uuid) to authenticated;

create or replace function public.retry_webhook_delivery(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  update public.webhook_deliveries d set status = 'pending', next_attempt_at = now(), lease_until = null,
      attempts = least(d.attempts, (select e.max_attempts - 1 from public.webhook_endpoints e where e.id = d.endpoint_id))
    where d.id = p_id and d.user_id = v_uid and d.status in ('dead', 'retrying');
  if not found then raise exception 'Only a failed delivery can be retried.' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.retry_webhook_delivery(uuid) from public, anon;
grant execute on function public.retry_webhook_delivery(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ dispatcher-only functions
-- Takes up to p_limit due deliveries and LEASES them for 90 seconds (status 'sending'): another run, or a retry of this one, cannot take them at the same time,
-- and a run that crashes simply lets the lease expire. p_user limits the batch to one person (the "deliver now" button).
create or replace function public.claim_webhook_deliveries(p_limit integer default 25, p_user uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  with due as (
    select d.id from public.webhook_deliveries d join public.webhook_endpoints e on e.id = d.endpoint_id
    where (p_user is null or d.user_id = p_user) and e.enabled
      and ((d.status in ('pending', 'retrying') and d.next_attempt_at <= now()) or (d.status = 'sending' and d.lease_until < now()))
    order by d.next_attempt_at limit least(greatest(p_limit, 1), 100) for update of d skip locked),
  upd as (
    update public.webhook_deliveries d set status = 'sending', lease_until = now() + interval '90 seconds' from due where d.id = due.id
    returning d.id, d.endpoint_id, d.event_type, d.payload, d.attempts, d.created_at)
  select jsonb_agg(jsonb_build_object('id', u.id, 'event_type', u.event_type, 'payload', u.payload, 'attempts', u.attempts, 'created_at', u.created_at,
      'url', e.url, 'timeout_ms', e.timeout_ms, 'max_attempts', e.max_attempts, 'secret', s.secret, 'endpoint_id', e.id))
    into v_out
    from upd u join public.webhook_endpoints e on e.id = u.endpoint_id join public.webhook_secrets s on s.endpoint_id = e.id;
  return coalesce(v_out, '[]'::jsonb);
end $$;
revoke all on function public.claim_webhook_deliveries(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries(integer, uuid) to service_role;

-- Records one attempt. Only a delivery that is still leased can be completed, so a late or duplicate report changes nothing.
create or replace function public.complete_webhook_delivery(p_id uuid, p_ok boolean, p_status integer, p_error text, p_duration_ms integer, p_next timestamptz, p_dead boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.webhook_deliveries; v_n integer;
begin
  select * into d from public.webhook_deliveries where id = p_id and status = 'sending' for update;
  if not found then return false; end if;
  v_n := d.attempts + 1;
  insert into public.webhook_attempts (delivery_id, user_id, attempt, ok, status, error, duration_ms) values (d.id, d.user_id, v_n, p_ok, p_status, left(coalesce(p_error, ''), 300), greatest(coalesce(p_duration_ms, 0), 0));
  update public.webhook_deliveries set attempts = v_n, last_status = p_status, last_error = left(coalesce(p_error, ''), 300), lease_until = null,
      status = case when p_ok then 'delivered' when p_dead then 'dead' else 'retrying' end,
      delivered_at = case when p_ok then now() end, next_attempt_at = case when p_ok or p_dead then next_attempt_at else coalesce(p_next, now() + interval '5 minutes') end
    where id = d.id;
  update public.webhook_endpoints set last_delivery_at = now(),
      consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
      enabled = case when not p_ok and consecutive_failures + 1 >= 25 then false else enabled end,
      disabled_reason = case when not p_ok and consecutive_failures + 1 >= 25 then 'Turned off after 25 failed deliveries in a row' else disabled_reason end
    where id = d.endpoint_id;
  return true;
end $$;
revoke all on function public.complete_webhook_delivery(uuid, boolean, integer, text, integer, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.complete_webhook_delivery(uuid, boolean, integer, text, integer, timestamptz, boolean) to service_role;

-- =============================================================================================================================== retention
-- Bounded storage: run daily by the webhook-dispatch function (or any scheduler with the service role). Audit history is kept longest and can be set per
-- install (p_audit_days; 0 keeps it forever).
create or replace function public.purge_platform_data(p_request_days integer default 30, p_metric_days integer default 90, p_error_days integer default 60, p_job_days integer default 30,
                                                      p_webhook_days integer default 30, p_audit_days integer default 730) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer; c integer; d integer; e integer; f integer; g integer;
begin
  with x as (delete from public.api_request_log where created_at < now() - make_interval(days => p_request_days) returning 1) select count(*) into a from x;
  with x as (delete from public.request_metrics where bucket < now() - make_interval(days => p_metric_days) returning 1) select count(*) into b from x;
  with x as (delete from public.app_errors where last_seen < now() - make_interval(days => p_error_days) returning 1) select count(*) into c from x;
  with x as (delete from public.job_runs where started_at < now() - make_interval(days => p_job_days) returning 1) select count(*) into d from x;
  -- finished deliveries after p_webhook_days; anything still unsent after three times that (an endpoint that was switched off) is stale and goes too
  with x as (delete from public.webhook_deliveries where (status in ('delivered', 'dead') and created_at < now() - make_interval(days => p_webhook_days))
                 or created_at < now() - make_interval(days => greatest(p_webhook_days * 3, 90)) returning 1) select count(*) into e from x;
  with x as (delete from public.rate_windows where window_start < now() - interval '2 days' returning 1) select count(*) into f from x;
  g := 0;
  if p_audit_days > 0 then
    perform set_config('lifetrack.audit_maintenance', 'on', true);
    with x as (delete from public.audit_events where occurred_at < now() - make_interval(days => p_audit_days) returning 1) select count(*) into g from x;
    perform set_config('lifetrack.audit_maintenance', 'off', true);
  end if;
  return jsonb_build_object('api_request_log', a, 'request_metrics', b, 'app_errors', c, 'job_runs', d, 'webhook_deliveries', e, 'rate_windows', f, 'audit_events', g);
end $$;
revoke all on function public.purge_platform_data(integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.purge_platform_data(integer, integer, integer, integer, integer, integer) to service_role;

-- =============================================================================================================================== 4. saved reports
alter table public.user_settings add column if not exists report_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(report_prefs) = 'object');

-- Realtime is not needed for any of these tables. Internal helpers are not callable by clients.
revoke all on function public._redact(jsonb), public._has_long_text(jsonb), public._record_label(jsonb), public._request_headers(), public._ip_prefix(jsonb),
  public._audit_tables(), public._api_scopes(), public._webhook_events(), public._webhook_url_problem(text), public._ts(timestamptz) from public, anon;
revoke all on function public._audit_insert(uuid, text, text, text, text, text, text[], jsonb, jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public._audit_guard(), public._audit_guard_truncate() from public, anon, authenticated;
grant execute on function public._audit_tables(), public._api_scopes(), public._webhook_events(), public._webhook_url_problem(text) to authenticated;
