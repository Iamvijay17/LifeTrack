-- 0012: Security & Privacy — app lock (PIN), passkeys/biometric unlock, session management. ADDITIVE: new tables and functions, plus one RESTRICTIVE
-- policy on the tables that hold the most private data. Nothing existing changes for a user who never turns the app lock on: with no row in
-- user_security, app_session_unlocked() is true and every policy behaves exactly as before.
--
-- How the lock is enforced (not just drawn): unlocking is recorded here, against the Supabase session (the `session_id` claim of the user's JWT),
-- by a function that has checked the PIN (verify_pin) or a passkey signature (the `webauthn` Edge Function). The restrictive policy
-- `app_lock_gate` on the sensitive tables then answers "is THIS session unlocked right now?" on every query. A browser that holds a valid
-- token but never entered the PIN reads nothing from, and writes nothing to, those tables, whatever the front end claims.
--
--   * Nothing here is readable or writable by clients directly: the tables have RLS on and NO policies. Clients call the functions below.
--   * PINs are hashed with bcrypt (pgcrypto, cost 12) and never leave the database. 5 wrong PINs in a row lock PIN entry for 30 s, then for twice
--     as long each round (up to 1 h); from the second round the session is also ended. Mirrors packages/core/src/security.js.
--   * Passkey public keys, counters and one-time challenges are only reachable by the service role (the Edge Function), never by clients.
--   * Signing a device out (even through GoTrue) closes the sensitive tables for it at once: the session must still exist to count as unlocked.
--   * A device whose app cannot show a lock screen can be marked "trusted" by an unlocked session (trust_session), so it keeps working.
--   * Wrong-PIN results are RETURNED, not raised: raising would roll back the very counter update that makes the lockout work.

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------------------------------------------ tables
create table if not exists public.user_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_lock_enabled boolean not null default false,
  pin_hash text,                                   -- bcrypt; never returned to a client
  pin_length smallint check (pin_length in (4, 6)),
  pin_set_at timestamptz,
  auto_lock_seconds integer not null default 300 check (auto_lock_seconds in (0, 60, 300, 900, 1800, 3600)),
  biometric_enabled boolean not null default false,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  lockout_until timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_security_pin_ck check (not app_lock_enabled or (pin_hash is not null and pin_length is not null))
);

-- One row per UNLOCKED session. Absent row = locked. last_active_at is renewed by heartbeats while the user is active.
create table if not exists public.app_unlocks (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('setup', 'pin', 'passkey', 'password', 'trusted')),
  unlocked_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
create index if not exists app_unlocks_user_idx on public.app_unlocks (user_id);

create table if not exists public.passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique check (char_length(credential_id) between 16 and 1400),
  public_key_jwk jsonb not null,                   -- a PUBLIC key; the private key never leaves the user's device
  alg smallint not null check (alg in (-7, -257)), -- ES256, RS256
  sign_count bigint not null default 0 check (sign_count >= 0),
  transports text[] not null default '{}',
  label text not null default 'This device' check (char_length(label) between 1 and 60),
  device_type text not null default 'singleDevice' check (device_type in ('singleDevice', 'multiDevice')),
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_user_idx on public.passkeys (user_id);

-- One-time challenges. Taking one deletes it, so a recorded response can never be replayed.
create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  purpose text not null check (purpose in ('register', 'authenticate')),
  challenge text not null unique check (char_length(challenge) between 22 and 200),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists webauthn_challenges_user_idx on public.webauthn_challenges (user_id);

do $$
declare t text;
begin
  foreach t in array array['user_security', 'app_unlocks', 'passkeys', 'webauthn_challenges'] loop
    -- RLS on and NO policies: every client role is denied. The functions below run as the table owner (as register_push_token does in 0006).
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t); -- belt and braces: no table privileges either
  end loop;
end $$;

-- Fail here, with a clear message, rather than at the first PIN: the hashing functions must be where the code below calls them.
do $$
begin
  if extensions.crypt('probe', extensions.gen_salt('bf', 4)) is null then raise exception 'pgcrypto is not usable from the extensions schema'; end if;
end $$;

-- ------------------------------------------------------------------------------------------------------------------ helpers
-- The session behind the caller's JWT. GoTrue puts it in every access token; null for a token without one (e.g. the anon key).
create or replace function public.current_session_id() returns uuid
language sql stable set search_path = '' as $$
  select case when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (auth.jwt() ->> 'session_id')::uuid end
$$;

-- Is this session allowed to see sensitive data? True when the user has no app lock, or this session unlocked and has been active recently.
-- The window is the auto-lock time (at least 60 s) plus 30 s for the heartbeat; the app locks itself earlier, this is the server's backstop.
-- A "trusted" session (see trust_session) is unlocked until it is untrusted. The session must STILL EXIST: a device signed out through GoTrue
-- (sign out others / everywhere, a password change) loses sensitive data at once, even though its access token stays valid until it expires.
create or replace function public._is_unlocked(p_user uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    not coalesce((select s.app_lock_enabled from public.user_security s where s.user_id = p_user), false)
    or (p_session is not null and exists (
      select 1 from public.user_security s
        join public.app_unlocks u on u.user_id = s.user_id
        join auth.sessions gs on gs.id = u.session_id and gs.user_id = u.user_id
      where s.user_id = p_user and u.session_id = p_session
        and u.last_active_at > now() - make_interval(secs => greatest(s.auto_lock_seconds, 60) + 30)))
  )
$$;

create or replace function public.app_session_unlocked() returns boolean
language sql stable security definer set search_path = '' as $$
  select public._is_unlocked((select auth.uid()), public.current_session_id())
$$;

-- The caller's session, or an error that tells the app to send the person back to the sign-in screen. A device signed out elsewhere keeps a valid access
-- token for up to an hour, but its session is gone: it must not be allowed to sit at a lock screen that can never open.
create or replace function public._require_session() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id();
begin
  if v_uid is null then raise exception 'Not signed in.' using errcode = '28000'; end if;
  if v_sid is not null and not exists (select 1 from auth.sessions s where s.id = v_sid and s.user_id = v_uid) then
    raise exception 'Your session has ended. Sign in again.' using errcode = '28000';
  end if;
  return v_sid;
end $$;

create or replace function public._require_unlocked() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  perform public._require_session();
  if not public._is_unlocked(v_uid, public.current_session_id()) then
    raise exception 'LifeTrack is locked. Enter your PIN first.' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- PINs an attacker tries first. Mirrors weakPinReason() in packages/core/src/security.js (a test runs both on the same cases).
create or replace function public._is_run(p text, p_step integer) returns boolean
language sql immutable set search_path = '' as $$
  select not exists (
    select 1 from generate_series(2, length(p)) i
    where ((substr(p, i, 1)::int - substr(p, i - 1, 1)::int + 10) % 10) <> p_step)
$$;
create or replace function public._weak_pin(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p ~ '^([0-9])\1+$' then 'Avoid repeating one digit.'
    when public._is_run(p, 1) or public._is_run(p, 9) then 'Avoid straight runs like 1234 or 4321.'
    when p = any (array['1234','0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1212','2580','1004','2000','6969','1122','1313',
                        '4321','2001','1010','0852','123123','112233','121212','159753','654321','123321','111222','000000','121314'])
      then 'That PIN is one of the first an attacker would try.'
  end
$$;

create or replace function public._validate_pin(p text) returns void
language plpgsql immutable set search_path = '' as $$
declare v_weak text;
begin
  if p is null or p !~ '^([0-9]{4}|[0-9]{6})$' then raise exception 'Use a PIN of exactly 4 or 6 digits.' using errcode = '22023'; end if;
  v_weak := public._weak_pin(p);
  if v_weak is not null then raise exception '%', v_weak using errcode = '22023'; end if;
end $$;

-- One more wrong try. Every 5th locks PIN entry (30 s, doubling per round, 1 h at most); from the 10th the session is ended too.
create or replace function public._register_failure(p_user uuid, p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_failed integer; v_wait integer := 0; v_revoke boolean;
begin
  update public.user_security set failed_attempts = failed_attempts + 1, last_failed_at = now(), updated_at = now()
    where user_id = p_user returning failed_attempts into v_failed;
  if v_failed is null then return jsonb_build_object('failed_attempts', 0, 'lockout_seconds', 0, 'signed_out', false, 'tries_left', 5); end if;
  if v_failed % 5 = 0 then
    v_wait := least(30 * power(2, v_failed / 5 - 1), 3600)::integer;
    update public.user_security set lockout_until = now() + make_interval(secs => v_wait) where user_id = p_user;
  end if;
  v_revoke := v_failed >= 10 and v_failed % 5 = 0;
  if v_revoke and p_session is not null then
    delete from auth.sessions where id = p_session and user_id = p_user;
    delete from public.app_unlocks where session_id = p_session;
  end if;
  return jsonb_build_object('failed_attempts', v_failed, 'lockout_seconds', v_wait, 'signed_out', v_revoke, 'tries_left', case when v_wait > 0 then 0 else 5 - v_failed % 5 end);
end $$;

-- Checks a PIN against the stored hash, with the lockout rules. The row lock makes parallel guesses take turns, so firing 100 requests at once
-- cannot get past the counter. Returns { ok, reason, ... }; never raises for a wrong PIN.
create or replace function public._check_pin(p_user uuid, p_session uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.user_security; v_ok boolean;
begin
  select * into s from public.user_security where user_id = p_user for update;
  if not found or not s.app_lock_enabled then return jsonb_build_object('ok', false, 'reason', 'not_enabled'); end if;
  if s.lockout_until is not null and s.lockout_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked_out', 'failed_attempts', s.failed_attempts,
                              'lockout_seconds', ceil(extract(epoch from s.lockout_until - now()))::integer);
  end if;
  v_ok := p_pin is not null and p_pin ~ '^([0-9]{4}|[0-9]{6})$' and extensions.crypt(p_pin, s.pin_hash) = s.pin_hash;
  if v_ok then
    update public.user_security set failed_attempts = 0, lockout_until = null, last_failed_at = null, updated_at = now()
      where user_id = p_user and (failed_attempts <> 0 or lockout_until is not null);
    return jsonb_build_object('ok', true);
  end if;
  return public._register_failure(p_user, p_session) || jsonb_build_object('ok', false, 'reason', 'wrong_pin');
end $$;

-- ------------------------------------------------------------------------------------------------------------------ app lock
-- Everything the lock screen and the Security page need, and nothing secret.
create or replace function public.security_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id(); s public.user_security; v_keys integer;
begin
  perform public._require_session();
  select * into s from public.user_security where user_id = v_uid;
  select count(*) into v_keys from public.passkeys where user_id = v_uid;
  return jsonb_build_object(
    'app_lock_enabled', coalesce(s.app_lock_enabled, false),
    'pin_length', s.pin_length,
    'pin_set_at', s.pin_set_at,
    'auto_lock_seconds', coalesce(s.auto_lock_seconds, 300),
    'biometric_enabled', coalesce(s.biometric_enabled, false) and v_keys > 0,
    'passkey_count', v_keys,
    'locked', coalesce(s.app_lock_enabled, false) and not public._is_unlocked(v_uid, v_sid),
    'lockout_seconds', case when s.lockout_until > now() then ceil(extract(epoch from s.lockout_until - now()))::integer else 0 end,
    'failed_attempts', coalesce(s.failed_attempts, 0),
    'session_id', v_sid);
end $$;

create or replace function public.set_pin(p_pin text, p_auto_lock_seconds integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id();
begin
  if v_uid is null or v_sid is null then raise exception 'Sign in again to set a PIN.' using errcode = '28000'; end if;
  perform public._require_session();
  perform public._validate_pin(p_pin);
  if p_auto_lock_seconds is not null and p_auto_lock_seconds not in (0, 60, 300, 900, 1800, 3600) then
    raise exception 'Choose one of the listed auto-lock times.' using errcode = '22023';
  end if;
  insert into public.user_security (user_id) values (v_uid) on conflict (user_id) do nothing;
  perform 1 from public.user_security where user_id = v_uid for update; -- two devices setting a PIN at once take turns
  if exists (select 1 from public.user_security where user_id = v_uid and app_lock_enabled) then
    raise exception 'App lock is already on. Change the PIN instead.' using errcode = '55000';
  end if;
  update public.user_security
    set app_lock_enabled = true, pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12)), pin_length = length(p_pin), pin_set_at = now(),
        auto_lock_seconds = coalesce(p_auto_lock_seconds, auto_lock_seconds), failed_attempts = 0, lockout_until = null, updated_at = now()
    where user_id = v_uid;
  insert into public.app_unlocks (session_id, user_id, method) values (v_sid, v_uid, 'setup')
    on conflict (session_id) do update set last_active_at = now(), unlocked_at = now(), method = 'setup';
  return public.security_state();
end $$;

create or replace function public.verify_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id(); r jsonb;
begin
  if v_uid is null or v_sid is null then raise exception 'Sign in again.' using errcode = '28000'; end if;
  perform public._require_session();
  r := public._check_pin(v_uid, v_sid, p_pin);
  if (r ->> 'ok')::boolean then
    insert into public.app_unlocks (session_id, user_id, method) values (v_sid, v_uid, 'pin')
      on conflict (session_id) do update set last_active_at = now(), unlocked_at = now(), method = 'pin';
    delete from public.app_unlocks where user_id = v_uid and last_active_at < now() - interval '2 days'; -- sessions long gone
  end if;
  return r;
end $$;

create or replace function public.change_pin(p_current text, p_new text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_sid uuid := public.current_session_id(); r jsonb;
begin
  perform public._validate_pin(p_new);
  if p_new = p_current then raise exception 'Choose a PIN different from the current one.' using errcode = '22023'; end if;
  r := public._check_pin(v_uid, v_sid, p_current);
  if (r ->> 'ok')::boolean then
    update public.user_security set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 12)), pin_length = length(p_new), pin_set_at = now(), updated_at = now()
      where user_id = v_uid;
  end if;
  return r;
end $$;

create or replace function public.disable_app_lock(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id(); r jsonb;
begin
  if v_uid is null then raise exception 'Not signed in.' using errcode = '28000'; end if;
  r := public._check_pin(v_uid, v_sid, p_pin);
  if (r ->> 'ok')::boolean then
    update public.user_security
      set app_lock_enabled = false, pin_hash = null, pin_length = null, pin_set_at = null, biometric_enabled = false,
          failed_attempts = 0, lockout_until = null, updated_at = now()
      where user_id = v_uid;
    delete from public.app_unlocks where user_id = v_uid;
  end if;
  return r;
end $$;

-- "I forgot my PIN" / "I am locked out": allowed only to a session that signed in with the password in the last 10 minutes, and it locks every
-- OTHER session again. p_new_pin = null turns the app lock off instead.
create or replace function public.reset_app_lock(p_new_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id(); v_started timestamptz;
begin
  if v_uid is null or v_sid is null then raise exception 'Sign in again.' using errcode = '28000'; end if;
  select s.created_at into v_started from auth.sessions s where s.id = v_sid and s.user_id = v_uid;
  if v_started is null or v_started < now() - interval '10 minutes' then
    raise exception 'Sign in again with your password first.' using errcode = '42501';
  end if;
  if p_new_pin is not null then perform public._validate_pin(p_new_pin); end if;
  insert into public.user_security (user_id) values (v_uid) on conflict (user_id) do nothing;
  perform 1 from public.user_security where user_id = v_uid for update;
  if p_new_pin is null then
    update public.user_security
      set app_lock_enabled = false, pin_hash = null, pin_length = null, pin_set_at = null, biometric_enabled = false,
          failed_attempts = 0, lockout_until = null, updated_at = now()
      where user_id = v_uid;
    delete from public.app_unlocks where user_id = v_uid;
  else
    update public.user_security
      set app_lock_enabled = true, pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 12)), pin_length = length(p_new_pin), pin_set_at = now(),
          failed_attempts = 0, lockout_until = null, updated_at = now()
      where user_id = v_uid;
    delete from public.app_unlocks where user_id = v_uid and session_id <> v_sid;
    insert into public.app_unlocks (session_id, user_id, method) values (v_sid, v_uid, 'password')
      on conflict (session_id) do update set last_active_at = now(), unlocked_at = now(), method = 'password';
  end if;
  return public.security_state();
end $$;

-- Locks THIS session. The row stays (with an old timestamp) rather than being deleted: a session that was ever unlocked and then locked can not be
-- re-opened by unlock_after_login below, so "Lock now" followed by a reload really asks for the PIN.
create or replace function public.lock_app() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.app_unlocks set last_active_at = 'epoch'::timestamptz where session_id = public.current_session_id() and user_id = auth.uid();
end $$;

-- A session that was JUST created by typing the account password (so: under a minute old, and never unlocked or locked since) opens without
-- the PIN; the password is the stronger proof and was entered a moment ago. Anything else is left as it is. Never raises: the caller reads `locked`.
create or replace function public.unlock_after_login() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id(); v_started timestamptz;
begin
  if v_uid is null or v_sid is null then raise exception 'Sign in again.' using errcode = '28000'; end if;
  select s.created_at into v_started from auth.sessions s where s.id = v_sid and s.user_id = v_uid;
  if v_started is not null and v_started >= now() - interval '60 seconds'
     and not exists (select 1 from public.app_unlocks where session_id = v_sid)
     and exists (select 1 from public.user_security where user_id = v_uid and app_lock_enabled) then
    insert into public.app_unlocks (session_id, user_id, method) values (v_sid, v_uid, 'password') on conflict (session_id) do nothing;
    update public.user_security set failed_attempts = 0, lockout_until = null, last_failed_at = null, updated_at = now()
      where user_id = v_uid and (failed_attempts <> 0 or lockout_until is not null); -- the owner just proved themselves: clear any guessing against the PIN
  end if;
  return public.security_state();
end $$;

-- Heartbeat while the user is active. Returns whether this session is still unlocked (false = show the lock screen).
create or replace function public.touch_unlock() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid := public.current_session_id();
begin
  if v_uid is null then return false; end if;
  if not public._is_unlocked(v_uid, v_sid) then return false; end if;
  update public.app_unlocks set last_active_at = now() where session_id = v_sid and user_id = v_uid and method <> 'trusted';
  return true;
end $$;

create or replace function public.set_auto_lock(p_seconds integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  if p_seconds is null or p_seconds not in (0, 60, 300, 900, 1800, 3600) then raise exception 'Choose one of the listed auto-lock times.' using errcode = '22023'; end if;
  insert into public.user_security (user_id, auto_lock_seconds) values (v_uid, p_seconds)
    on conflict (user_id) do update set auto_lock_seconds = excluded.auto_lock_seconds, updated_at = now();
  return public.security_state();
end $$;

create or replace function public.set_biometric_enabled(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  if p_enabled then
    if not exists (select 1 from public.user_security where user_id = v_uid and app_lock_enabled) then
      raise exception 'Turn on the app lock first.' using errcode = '55000';
    end if;
    if not exists (select 1 from public.passkeys where user_id = v_uid) then
      raise exception 'Add a fingerprint or face unlock first.' using errcode = '55000';
    end if;
  end if;
  update public.user_security set biometric_enabled = coalesce(p_enabled, false), updated_at = now() where user_id = v_uid;
  return public.security_state();
end $$;

-- ------------------------------------------------------------------------------------------------------------------ passkeys (client side)
create or replace function public.list_passkeys()
returns table (id uuid, label text, device_type text, backed_up boolean, transports text[], created_at timestamptz, last_used_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  return query select k.id, k.label, k.device_type, k.backed_up, k.transports, k.created_at, k.last_used_at
    from public.passkeys k where k.user_id = v_uid order by k.created_at;
end $$;

create or replace function public.rename_passkey(p_id uuid, p_label text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_label text := btrim(coalesce(p_label, ''));
begin
  if char_length(v_label) not between 1 and 60 then raise exception 'Give it a name of 1 to 60 characters.' using errcode = '22023'; end if;
  update public.passkeys set label = v_label where id = p_id and user_id = v_uid;
  if not found then raise exception 'That fingerprint or face unlock is not on your account.' using errcode = 'P0002'; end if;
end $$;

create or replace function public.remove_passkey(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  delete from public.passkeys where id = p_id and user_id = v_uid;
  if not found then raise exception 'That fingerprint or face unlock is not on your account.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.passkeys where user_id = v_uid) then
    update public.user_security set biometric_enabled = false, updated_at = now() where user_id = v_uid;
  end if;
  return public.security_state();
end $$;

-- ------------------------------------------------------------------------------------------------------------------ sessions
-- GoTrue's sessions table is not exposed over the API. These read it for the caller only. to_jsonb keeps this working across GoTrue versions
-- (older ones have no user_agent / ip column).
create or replace function public.list_my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text, is_current boolean, unlocked boolean, trusted boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_sid uuid := public.current_session_id();
begin
  return query
    select s.id, s.created_at,
           coalesce(nullif(to_jsonb(s) ->> 'refreshed_at', '')::timestamptz, s.updated_at, s.created_at),
           to_jsonb(s) ->> 'user_agent', to_jsonb(s) ->> 'ip',
           s.id = v_sid, (select public._is_unlocked(v_uid, s.id)),
           exists (select 1 from public.app_unlocks u where u.session_id = s.id and u.user_id = v_uid and u.method = 'trusted' and u.last_active_at = 'infinity'::timestamptz)
    from auth.sessions s
    where s.user_id = v_uid and (nullif(to_jsonb(s) ->> 'not_after', '') is null or (to_jsonb(s) ->> 'not_after')::timestamptz > now())
    order by (s.id = v_sid) desc, 3 desc;
end $$;

-- Ends one session (its refresh tokens go with it). The access token already issued stays valid until it expires (jwt_expiry, 1 h by default),
-- but with the app lock on the sensitive tables close at once, because the unlock record is deleted here.
create or replace function public.revoke_session(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  delete from public.app_unlocks where session_id = p_id and user_id = v_uid;
  delete from auth.sessions where id = p_id and user_id = v_uid;
  if not found then raise exception 'That session no longer exists.' using errcode = 'P0002'; end if;
end $$;

-- A trusted session never asks for the PIN, until it is untrusted, signed out, or the lock is turned off or reset. It exists for devices whose app has
-- no lock screen (the LifeTrack mobile app today): with the lock on, such a device would otherwise lose Finance, Journal and Notes. Only an unlocked
-- session can grant it, only to another session of the same account, and never to itself (that would just be switching the lock off).
create or replace function public.trust_session(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  if p_id = public.current_session_id() then
    raise exception 'This is the device you are using. To stop being asked for the PIN here, turn the app lock off.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_security where user_id = v_uid and app_lock_enabled) then
    raise exception 'Turn on the app lock first.' using errcode = '55000';
  end if;
  if not exists (select 1 from auth.sessions s where s.id = p_id and s.user_id = v_uid) then
    raise exception 'That session no longer exists.' using errcode = 'P0002';
  end if;
  insert into public.app_unlocks (session_id, user_id, method, last_active_at) values (p_id, v_uid, 'trusted', 'infinity'::timestamptz)
    on conflict (session_id) do update set method = 'trusted', last_active_at = 'infinity'::timestamptz, unlocked_at = now();
end $$;

create or replace function public.untrust_session(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  update public.app_unlocks set method = 'pin', last_active_at = 'epoch'::timestamptz
    where session_id = p_id and user_id = v_uid and method = 'trusted'; -- locked again; the PIN is asked for from now on
end $$;

-- ------------------------------------------------------------------------------------------------------------------ passkeys (Edge Function side)
-- Only the service role may call these: they decide who may unlock a session, so a signed-in client must not be able to call them itself.
create or replace function public.pk_status(p_user uuid, p_session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'app_lock_enabled', coalesce((select app_lock_enabled from public.user_security where user_id = p_user), false),
    'biometric_enabled', coalesce((select biometric_enabled from public.user_security where user_id = p_user), false),
    'unlocked', public._is_unlocked(p_user, p_session),
    'passkey_count', (select count(*) from public.passkeys where user_id = p_user))
$$;

create or replace function public.pk_issue_challenge(p_user uuid, p_session uuid, p_purpose text, p_challenge text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.webauthn_challenges where user_id = p_user and expires_at < now();
  -- at most 10 open challenges per user; the oldest go first
  delete from public.webauthn_challenges where id in (
    select id from public.webauthn_challenges where user_id = p_user order by created_at desc offset 9);
  insert into public.webauthn_challenges (user_id, session_id, purpose, challenge, expires_at)
    values (p_user, p_session, p_purpose, p_challenge, now() + interval '2 minutes');
end $$;

create or replace function public.pk_take_challenge(p_user uuid, p_session uuid, p_purpose text, p_challenge text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  delete from public.webauthn_challenges
    where user_id = p_user and purpose = p_purpose and challenge = p_challenge and session_id is not distinct from p_session and expires_at > now();
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

create or replace function public.pk_credentials(p_user uuid)
returns table (id uuid, credential_id text, public_key_jwk jsonb, alg smallint, sign_count bigint)
language sql stable security definer set search_path = '' as $$
  select k.id, k.credential_id, k.public_key_jwk, k.alg, k.sign_count from public.passkeys k where k.user_id = p_user order by k.created_at
$$;

create or replace function public.pk_add_credential(
  p_user uuid, p_credential_id text, p_jwk jsonb, p_alg integer, p_sign_count bigint,
  p_transports text[], p_label text, p_device_type text, p_backed_up boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_first boolean;
begin
  if (select count(*) from public.passkeys where user_id = p_user) >= 10 then
    raise exception 'You can register up to 10 fingerprint or face unlocks. Remove one first.' using errcode = '54000';
  end if;
  v_first := not exists (select 1 from public.passkeys where user_id = p_user);
  insert into public.passkeys (user_id, credential_id, public_key_jwk, alg, sign_count, transports, label, device_type, backed_up)
    values (p_user, p_credential_id, p_jwk, p_alg, p_sign_count, coalesce(p_transports, '{}'),
            coalesce(nullif(btrim(p_label), ''), 'This device'), coalesce(p_device_type, 'singleDevice'), coalesce(p_backed_up, false))
    returning id into v_id;
  if v_first then update public.user_security set biometric_enabled = true, updated_at = now() where user_id = p_user and app_lock_enabled; end if;
  return v_id;
end $$;

-- Saves the counter only if it moved forward; false means the stored one is ahead (a cloned authenticator, or two sign-ins racing).
create or replace function public.pk_record_assertion(p_id uuid, p_user uuid, p_new_count bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.passkeys set sign_count = p_new_count, last_used_at = now()
    where id = p_id and user_id = p_user and (p_new_count > sign_count or (p_new_count = 0 and sign_count = 0));
  return found;
end $$;

create or replace function public.pk_unlock(p_user uuid, p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_session is null then raise exception 'No session to unlock.' using errcode = '28000'; end if;
  if not exists (select 1 from public.user_security where user_id = p_user and app_lock_enabled and biometric_enabled) then
    raise exception 'Fingerprint or face unlock is not turned on.' using errcode = '55000';
  end if;
  insert into public.app_unlocks (session_id, user_id, method) values (p_session, p_user, 'passkey')
    on conflict (session_id) do update set last_active_at = now(), unlocked_at = now(), method = 'passkey';
  update public.user_security set failed_attempts = 0, lockout_until = null, last_failed_at = null, updated_at = now()
    where user_id = p_user and (failed_attempts <> 0 or lockout_until is not null);
end $$;

create or replace function public.pk_failure(p_user uuid, p_session uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select public._register_failure(p_user, p_session)
$$;

-- ------------------------------------------------------------------------------------------------------------------ password lockout
-- GoTrue rate-limits sign-ins per IP address, but has no lockout PER ACCOUNT. This is Supabase's "Password verification attempt" hook, which GoTrue
-- calls after every password check (sign-in, re-authentication, change password). 5 wrong passwords in a row lock the account's password sign-in
-- for 1 minute, doubling each round up to 15 minutes; a correct password clears the count. It does nothing until you enable the hook:
-- Dashboard → Authentication → Hooks → Password verification attempt → Postgres function → public.hook_password_verification_attempt
-- (local: [auth.hook.password_verification_attempt] in supabase/config.toml). Hosted: needs a plan that includes auth hooks.
create table if not exists public.password_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed integer not null default 0 check (failed >= 0),
  last_failed_at timestamptz,
  locked_until timestamptz
);
alter table public.password_attempts enable row level security;
alter table public.password_attempts force row level security;
revoke all on public.password_attempts from public, anon, authenticated;

create or replace function public.hook_password_verification_attempt(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (event ->> 'user_id')::uuid; v_valid boolean := coalesce((event ->> 'valid')::boolean, false);
        r public.password_attempts; v_failed integer; v_wait integer;
begin
  insert into public.password_attempts (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into r from public.password_attempts where user_id = v_user for update; -- parallel guesses take turns
  if r.locked_until is not null and r.locked_until > now() then
    -- even the right password is refused during the lockout, otherwise guessing could simply carry on
    return jsonb_build_object('decision', 'reject',
      'message', 'Too many sign-in attempts. Try again in ' || greatest(ceil(extract(epoch from r.locked_until - now()) / 60), 1)::integer || ' min.');
  end if;
  if v_valid then
    update public.password_attempts set failed = 0, last_failed_at = null, locked_until = null
      where user_id = v_user and (failed <> 0 or locked_until is not null);
    return jsonb_build_object('decision', 'continue');
  end if;
  v_failed := case when r.last_failed_at is not null and r.last_failed_at < now() - interval '24 hours' then 1 else r.failed + 1 end;
  v_wait := case when v_failed % 5 = 0 then least(60 * power(2, v_failed / 5 - 1), 900)::integer else 0 end;
  update public.password_attempts
    set failed = v_failed, last_failed_at = now(), locked_until = case when v_wait > 0 then now() + make_interval(secs => v_wait) end
    where user_id = v_user;
  return jsonb_build_object('decision', 'continue'); -- GoTrue itself answers "invalid login credentials"
end $$;

-- ------------------------------------------------------------------------------------------------------------------ privileges
do $$
declare f text;
begin
  -- Internal helpers: callable by nobody but the functions above (which run as their owner).
  foreach f in array array[
    'public._is_unlocked(uuid, uuid)', 'public._require_session()', 'public._require_unlocked()', 'public._is_run(text, integer)', 'public._weak_pin(text)',
    'public._validate_pin(text)', 'public._register_failure(uuid, uuid)', 'public._check_pin(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- The app's API.
  foreach f in array array[
    'public.current_session_id()', 'public.app_session_unlocked()', 'public.security_state()', 'public.set_pin(text, integer)',
    'public.verify_pin(text)', 'public.change_pin(text, text)', 'public.disable_app_lock(text)', 'public.reset_app_lock(text)',
    'public.lock_app()', 'public.unlock_after_login()', 'public.touch_unlock()', 'public.set_auto_lock(integer)', 'public.set_biometric_enabled(boolean)',
    'public.list_passkeys()', 'public.rename_passkey(uuid, text)', 'public.remove_passkey(uuid)',
    'public.list_my_sessions()', 'public.revoke_session(uuid)', 'public.trust_session(uuid)', 'public.untrust_session(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- The Edge Function's API: the service role only.
  foreach f in array array[
    'public.pk_status(uuid, uuid)', 'public.pk_issue_challenge(uuid, uuid, text, text)', 'public.pk_take_challenge(uuid, uuid, text, text)',
    'public.pk_credentials(uuid)', 'public.pk_add_credential(uuid, text, jsonb, integer, bigint, text[], text, text, boolean)',
    'public.pk_record_assertion(uuid, uuid, bigint)', 'public.pk_unlock(uuid, uuid)', 'public.pk_failure(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public._is_unlocked(uuid, uuid) to service_role;
  end if;
  -- The password hook: GoTrue (supabase_auth_admin) only.
  revoke all on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
  end if;
end $$;

-- ------------------------------------------------------------------------------------------------------------------ the gate
-- RESTRICTIVE: it is ANDed with each table's existing owner policy, so it can only take access away, and only from a session that is locked.
-- Finance, plus the private journal and notes (this app's documents). Add a table here to protect it.
do $$
declare t text;
begin
  foreach t in array array['transactions', 'budgets', 'savings_goals', 'recurring_rules', 'journal_entries', 'notes'] loop
    execute format('drop policy if exists "app_lock_gate" on public.%I', t);
    execute format(
      'create policy "app_lock_gate" on public.%I as restrictive for all to authenticated
         using ((select public.app_session_unlocked())) with check ((select public.app_session_unlocked()))', t);
  end loop;
end $$;
