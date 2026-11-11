-- 0015: Module locks — lock only the parts of LifeTrack you choose (Finance, Health, Journal & notes, …) instead of the whole app, with the same PIN /
-- fingerprint / face unlock. Builds on 0012_security.sql (run that first). ADDITIVE and OFF by default: every existing user keeps `lock_scope = 'app'`,
-- which behaves exactly as before (the whole app behind the lock screen; Finance, Journal and Notes closed on the server).
--
-- How it is enforced (not just drawn): the same way as the app lock. The database remembers which SESSION entered the PIN (app_unlocks), and a
-- RESTRICTIVE row-level-security policy on each table of a locked module asks "is this module closed for this user, and is this session unlocked?"
-- on every query. A browser that holds a valid token but never entered the PIN reads nothing from, and writes nothing to, a locked module, whatever the
-- page claims. With `lock_scope = 'modules'`:
--   * the app opens normally (there is no lock screen), and only the chosen modules are closed;
--   * one unlock (PIN, passkey) opens all of them, until the auto-lock time runs out or the person locks again;
--   * a fresh password sign-in does NOT open them (unlock_after_login only serves the whole-app lock): the point is to ask each time.
--
-- Which tables belong to which module is the list at the bottom; packages/core/src/moduleLocks.js has the same list (a test compares them).
--
-- Migration numbers: 0014 is reserved for the phone biometrics work (0014_device_keys.sql, on its own branch); this file does not depend on it.

do $$
begin
  if to_regclass('public.user_security') is null or to_regprocedure('public._is_unlocked(uuid, uuid)') is null then
    raise exception 'Run supabase/migrations/0012_security.sql first: module locks build on the app lock.';
  end if;
end $$;

-- ------------------------------------------------------------------------------------------------------------------ settings
alter table public.user_security add column if not exists lock_scope text not null default 'app';
alter table public.user_security add column if not exists locked_modules text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_security_lock_scope_ck') then
    alter table public.user_security add constraint user_security_lock_scope_ck check (lock_scope in ('app', 'modules'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_security_locked_modules_ck') then
    -- only known modules, and "only some modules" means at least one
    alter table public.user_security add constraint user_security_locked_modules_ck
      check (locked_modules <@ array['finance', 'notes', 'health', 'fitness', 'nutrition', 'jobs']::text[]
             and (lock_scope = 'app' or cardinality(locked_modules) > 0));
  end if;
end $$;

-- Turning the app lock off (disable_app_lock, reset_app_lock) goes back to the plain defaults, so a later setup starts from "whole app".
create or replace function public._reset_lock_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.app_lock_enabled then new.lock_scope := 'app'; new.locked_modules := '{}'; end if;
  return new;
end $$;
drop trigger if exists user_security_reset_scope on public.user_security;
create trigger user_security_reset_scope before update of app_lock_enabled on public.user_security
  for each row execute function public._reset_lock_scope();

-- ------------------------------------------------------------------------------------------------------------------ the gate
-- Is `p_module` open to this session? It is closed only when this user's lock row gates it (the whole-app lock gates the modules marked `legacy`,
-- i.e. the ones 0012 always closed; the module lock gates the chosen ones) AND the session has not unlocked.
create or replace function public._module_open(p_user uuid, p_session uuid, p_module text, p_gated_in_app boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    public._is_unlocked(p_user, p_session)
    or not exists (
      select 1 from public.user_security s
      where s.user_id = p_user and s.app_lock_enabled
        and case s.lock_scope when 'modules' then p_module = any (s.locked_modules) else p_gated_in_app end))
$$;

create or replace function public.module_session_open(p_module text, p_gated_in_app boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select public._module_open((select auth.uid()), public.current_session_id(), p_module, p_gated_in_app)
$$;

-- ------------------------------------------------------------------------------------------------------------------ state
-- Same answer as 0012, plus the scope, the chosen modules and whether THIS session is unlocked. `locked` is the lock SCREEN: only the whole-app lock
-- has one. With module locks `locked` stays false and the page asks per module, from `session_unlocked`.
create or replace function public.security_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id(); s public.user_security; v_keys integer; v_open boolean;
begin
  perform public._require_session();
  select * into s from public.user_security where user_id = v_uid;
  select count(*) into v_keys from public.passkeys where user_id = v_uid;
  v_open := public._is_unlocked(v_uid, v_sid);
  return jsonb_build_object(
    'app_lock_enabled', coalesce(s.app_lock_enabled, false),
    'pin_length', s.pin_length,
    'pin_set_at', s.pin_set_at,
    'auto_lock_seconds', coalesce(s.auto_lock_seconds, 300),
    'biometric_enabled', coalesce(s.biometric_enabled, false) and v_keys > 0,
    'passkey_count', v_keys,
    'locked', coalesce(s.app_lock_enabled, false) and coalesce(s.lock_scope, 'app') = 'app' and not v_open,
    'lock_scope', coalesce(s.lock_scope, 'app'),
    'locked_modules', to_jsonb(coalesce(s.locked_modules, '{}'::text[])),
    'session_unlocked', v_open,
    'lockout_seconds', case when s.lockout_until > now() then ceil(extract(epoch from s.lockout_until - now()))::integer else 0 end,
    'failed_attempts', coalesce(s.failed_attempts, 0),
    'session_id', v_sid);
end $$;

-- A password sign-in opens the whole-app lock without the PIN (0012). It does not open module locks.
create or replace function public.unlock_after_login() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id(); v_started timestamptz;
begin
  if v_uid is null or v_sid is null then raise exception 'Sign in again.' using errcode = '28000'; end if;
  select s.created_at into v_started from auth.sessions s where s.id = v_sid and s.user_id = v_uid;
  if v_started is not null and v_started >= now() - interval '60 seconds'
     and not exists (select 1 from public.app_unlocks where session_id = v_sid)
     and exists (select 1 from public.user_security where user_id = v_uid and app_lock_enabled and lock_scope = 'app') then
    insert into public.app_unlocks (session_id, user_id, method) values (v_sid, v_uid, 'password') on conflict (session_id) do nothing;
    update public.user_security set failed_attempts = 0, lockout_until = null, last_failed_at = null, updated_at = now()
      where user_id = v_uid and (failed_attempts <> 0 or lockout_until is not null); -- the owner just proved themselves: clear any guessing against the PIN
  end if;
  return public.security_state();
end $$;

-- ------------------------------------------------------------------------------------------------------------------ choosing what to lock
-- Needs an UNLOCKED session (so a borrowed, locked laptop cannot unlock itself by editing the list) and the app lock on (it supplies the PIN).
-- p_scope 'app' = the whole app; 'modules' = only p_modules (at least one, only known names). The chosen list is kept when going back to 'app'.
create or replace function public.set_lock_modules(p_scope text, p_modules text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_list text[];
begin
  if p_scope is null or p_scope not in ('app', 'modules') then raise exception 'Choose the whole app or some modules.' using errcode = '22023'; end if;
  if not exists (select 1 from public.user_security where user_id = v_uid and app_lock_enabled) then
    raise exception 'Turn on the app lock first.' using errcode = '55000';
  end if;
  v_list := coalesce((select array_agg(m order by m) from (select distinct m from unnest(coalesce(p_modules, '{}'::text[])) m) x), '{}'::text[]);
  if not (v_list <@ array['finance', 'notes', 'health', 'fitness', 'nutrition', 'jobs']::text[]) then
    raise exception 'One of those modules cannot be locked.' using errcode = '22023';
  end if;
  if p_scope = 'modules' and cardinality(v_list) = 0 then
    raise exception 'Choose at least one module to lock, or lock the whole app.' using errcode = '22023';
  end if;
  update public.user_security
    set lock_scope = p_scope,
        locked_modules = case when p_scope = 'modules' or cardinality(v_list) > 0 then v_list else locked_modules end,
        updated_at = now()
    where user_id = v_uid;
  return public.security_state();
end $$;

-- ------------------------------------------------------------------------------------------------------------------ privileges
revoke all on function public._reset_lock_scope() from public, anon, authenticated;
revoke all on function public._module_open(uuid, uuid, text, boolean) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.module_session_open(text, boolean)', 'public.set_lock_modules(text, text[])'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- 0012 granted these to the roles below; create or replace keeps grants, but say it again so a fresh database is explicit.
  execute 'revoke all on function public.security_state() from public, anon';
  execute 'grant execute on function public.security_state() to authenticated';
  execute 'revoke all on function public.unlock_after_login() from public, anon';
  execute 'grant execute on function public.unlock_after_login() to authenticated';
end $$;

-- ------------------------------------------------------------------------------------------------------------------ the gates
-- RESTRICTIVE: ANDed with each table's existing owner policy, so a gate can only take access away, and only from a locked session. Tables that are
-- missing (a database that has not had a feature's migration yet) are skipped.
--   legacy modules  keep the policy name `app_lock_gate` from 0012 and stay closed under the whole-app lock (p_gated_in_app = true)
--   other modules   get `module_lock_gate`, closed only when the person locked that module
do $$
declare m record; t text;
begin
  for m in select * from (values
    ('finance',   true,  array['transactions', 'budgets', 'savings_goals', 'recurring_rules']),
    ('notes',     true,  array['notes', 'journal_entries']),
    ('health',    false, array['health_logs', 'body_measurements']),
    ('fitness',   false, array['workouts', 'exercise_logs']),
    ('nutrition', false, array['food_logs', 'nutrition_settings', 'water_logs']),
    ('jobs',      false, array['job_applications', 'application_history', 'interview_events'])
  ) as v(module, legacy, tables) loop
    foreach t in array m.tables loop
      continue when to_regclass(format('public.%I', t)) is null;
      execute format('drop policy if exists %I on public.%I', case when m.legacy then 'app_lock_gate' else 'module_lock_gate' end, t);
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated
           using ((select public.module_session_open(%L, %L))) with check ((select public.module_session_open(%L, %L)))',
        case when m.legacy then 'app_lock_gate' else 'module_lock_gate' end, t, m.module, m.legacy, m.module, m.legacy);
    end loop;
  end loop;
end $$;
