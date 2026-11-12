-- 0014: Device keys: fingerprint / face unlock for the MOBILE app lock. ADDITIVE: two new tables, new functions, one widened CHECK and one trigger.
-- Nothing changes for a user who never enrols a phone, and the PIN keeps working exactly as before.
--
-- This is the native counterpart of the passkeys in 0012. A phone enrols an EC P-256 PUBLIC key whose private half is sealed by the operating system
-- behind the user's biometrics (Android Keystore + BiometricPrompt, iOS Keychain + Face ID / Touch ID, "biometry current set"). To unlock, the
-- `device-key` Edge Function issues a one-time challenge, the phone signs it with that key (which the OS releases only after a fingerprint or face check),
-- and the function verifies the ECDSA signature and calls dk_unlock(). A flag in the app ("the biometric check passed") unlocks nothing: only a valid
-- signature from a key this user enrolled can open the session, exactly as only a verified passkey signature can on the web.
--
--   * Same rules as passkeys: challenges are single-use, live 2 minutes and are bound to user + session + purpose (+ the key); a signature counter must
--     move forward, so a copied key is noticed; a bad signature counts toward the SAME lockout as a wrong PIN (_register_failure) and can end the session.
--   * Nothing here is readable or writable by clients directly: RLS on, no policies. A client lists, renames and removes ITS OWN keys through functions
--     that need an unlocked session. Public keys, counters and challenges are only reachable by the service role (the Edge Function).
--   * Enrolling needs the app lock on and an UNLOCKED session, otherwise a stolen token could enrol its own "fingerprint" and walk in.
--   * Turning the app lock off removes every device key (trigger below), as it already switches biometric_enabled off: re-enrol after turning it on again.

-- ------------------------------------------------------------------------------------------------------------------ tables
create table if not exists public.device_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thumbprint text not null unique check (char_length(thumbprint) = 43),   -- RFC 7638 SHA-256 of the public key, base64url: one key cannot be enrolled twice
  public_key_jwk jsonb not null check (public_key_jwk ->> 'kty' = 'EC' and public_key_jwk ->> 'crv' = 'P-256'), -- a PUBLIC key
  alg smallint not null default -7 check (alg = -7),                      -- ES256 only (ECDSA P-256 over SHA-256)
  sign_count bigint not null default 0 check (sign_count >= 0),
  label text not null default 'This phone' check (char_length(label) between 1 and 60),
  platform text not null default 'unknown' check (platform in ('android', 'ios', 'unknown')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists device_keys_user_idx on public.device_keys (user_id);

-- One-time challenges. Taking one deletes it, so a recorded signature can never be replayed. `key_id` is the key the phone said it would sign with
-- (unlock only); it is deliberately not a foreign key, and dk_remove_key / the trigger below clear the pending ones.
create table if not exists public.device_key_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  purpose text not null check (purpose in ('enroll', 'unlock')),
  key_id uuid,
  challenge text not null unique check (char_length(challenge) between 22 and 200),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists device_key_challenges_user_idx on public.device_key_challenges (user_id);

do $$
declare t text;
begin
  foreach t in array array['device_keys', 'device_key_challenges'] loop
    -- RLS on and NO policies: every client role is denied. The functions below run as the table owner (as 0012's do).
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- app_unlocks records HOW a session was opened. A device key is its own method (not "passkey"): widen the CHECK from 0012. Existing rows all satisfy it.
alter table public.app_unlocks drop constraint if exists app_unlocks_method_check;
alter table public.app_unlocks add constraint app_unlocks_method_check check (method in ('setup', 'pin', 'passkey', 'password', 'trusted', 'device'));

-- ------------------------------------------------------------------------------------------------------------------ client side
-- A client sees its own keys (never the public key or the counter), and only from an unlocked session.
create or replace function public.list_device_keys()
returns table (id uuid, label text, platform text, created_at timestamptz, last_used_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  return query select k.id, k.label, k.platform, k.created_at, k.last_used_at
    from public.device_keys k where k.user_id = v_uid order by k.created_at;
end $$;

create or replace function public.rename_device_key(p_id uuid, p_label text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_label text := btrim(coalesce(p_label, ''));
begin
  if char_length(v_label) not between 1 and 60 then raise exception 'Give it a name of 1 to 60 characters.' using errcode = '22023'; end if;
  update public.device_keys set label = v_label where id = p_id and user_id = v_uid;
  if not found then raise exception 'That phone is not on your account.' using errcode = 'P0002'; end if;
end $$;

create or replace function public.remove_device_key(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  delete from public.device_keys where id = p_id and user_id = v_uid;
  if not found then raise exception 'That phone is not on your account.' using errcode = 'P0002'; end if;
  delete from public.device_key_challenges where user_id = v_uid and key_id = p_id;
end $$;

-- ------------------------------------------------------------------------------------------------------------------ Edge Function side
-- Only the service role may call these: they decide who may unlock a session, so a signed-in client must not be able to call them itself.
create or replace function public.dk_status(p_user uuid, p_session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'app_lock_enabled', coalesce((select app_lock_enabled from public.user_security where user_id = p_user), false),
    'unlocked', public._is_unlocked(p_user, p_session),
    'key_count', (select count(*) from public.device_keys where user_id = p_user))
$$;

create or replace function public.dk_issue_challenge(p_user uuid, p_session uuid, p_purpose text, p_challenge text, p_key uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.device_key_challenges where user_id = p_user and expires_at < now();
  -- at most 10 open challenges per user; the oldest go first
  delete from public.device_key_challenges where id in (
    select id from public.device_key_challenges where user_id = p_user order by created_at desc offset 9);
  insert into public.device_key_challenges (user_id, session_id, purpose, key_id, challenge, expires_at)
    values (p_user, p_session, p_purpose, p_key, p_challenge, now() + interval '2 minutes');
end $$;

-- Consumes a challenge: true exactly once, and only for the same user, session, purpose and key it was issued for, before it expires.
create or replace function public.dk_take_challenge(p_user uuid, p_session uuid, p_purpose text, p_challenge text, p_key uuid default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  delete from public.device_key_challenges
    where user_id = p_user and purpose = p_purpose and challenge = p_challenge
      and session_id is not distinct from p_session and key_id is not distinct from p_key and expires_at > now();
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

create or replace function public.dk_keys(p_user uuid)
returns table (id uuid, public_key_jwk jsonb, alg smallint, sign_count bigint)
language sql stable security definer set search_path = '' as $$
  select k.id, k.public_key_jwk, k.alg, k.sign_count from public.device_keys k where k.user_id = p_user order by k.created_at
$$;

-- Enrols a public key. The Edge Function has already checked the proof of possession (a signature over a fresh challenge); this checks the rest.
create or replace function public.dk_add_key(p_user uuid, p_thumbprint text, p_jwk jsonb, p_label text, p_platform text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.user_security where user_id = p_user and app_lock_enabled) then
    raise exception 'Turn on the app lock first.' using errcode = '55000';
  end if;
  if (select count(*) from public.device_keys where user_id = p_user) >= 10 then
    raise exception 'You can use fingerprint or face unlock on up to 10 phones. Remove one first.' using errcode = '54000';
  end if;
  insert into public.device_keys (user_id, thumbprint, public_key_jwk, label, platform)
    values (p_user, p_thumbprint, p_jwk, coalesce(nullif(btrim(p_label), ''), 'This phone'), coalesce(nullif(p_platform, ''), 'unknown'))
    returning id into v_id;
  return v_id;
end $$;

-- Saves the counter only if it moved strictly forward; false means the stored one is at or ahead of it (a cloned key, or two unlocks racing).
create or replace function public.dk_record_assertion(p_id uuid, p_user uuid, p_new_count bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.device_keys set sign_count = p_new_count, last_used_at = now()
    where id = p_id and user_id = p_user and p_new_count > sign_count;
  return found;
end $$;

create or replace function public.dk_unlock(p_user uuid, p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_session is null then raise exception 'No session to unlock.' using errcode = '28000'; end if;
  if not exists (select 1 from public.user_security where user_id = p_user and app_lock_enabled) then
    raise exception 'Turn on the app lock first.' using errcode = '55000';
  end if;
  if not exists (select 1 from public.device_keys where user_id = p_user) then
    raise exception 'Fingerprint or face unlock is not set up on any phone.' using errcode = '55000';
  end if;
  insert into public.app_unlocks (session_id, user_id, method) values (p_session, p_user, 'device')
    on conflict (session_id) do update set last_active_at = now(), unlocked_at = now(), method = 'device';
  update public.user_security set failed_attempts = 0, lockout_until = null, last_failed_at = null, updated_at = now()
    where user_id = p_user and (failed_attempts <> 0 or lockout_until is not null);
end $$;

-- A signature that does not verify is not slowness: it counts toward the same lockout as a wrong PIN.
create or replace function public.dk_failure(p_user uuid, p_session uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select public._register_failure(p_user, p_session)
$$;

-- ------------------------------------------------------------------------------------------------------------------ the lock being turned off
-- disable_app_lock and reset_app_lock(null) (0012) switch the lock off. Phones enrolled for it go with it, so turning the lock on again starts clean.
create or replace function public._drop_device_keys() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.device_keys where user_id = new.user_id;
  delete from public.device_key_challenges where user_id = new.user_id;
  return new;
end $$;

drop trigger if exists user_security_drop_device_keys on public.user_security;
create trigger user_security_drop_device_keys after update of app_lock_enabled on public.user_security
  for each row when (old.app_lock_enabled and not new.app_lock_enabled) execute function public._drop_device_keys();

-- ------------------------------------------------------------------------------------------------------------------ privileges
do $$
declare f text;
begin
  -- Internal helper: callable by nobody but the trigger machinery.
  revoke all on function public._drop_device_keys() from public, anon, authenticated;
  -- The app's API: signed-in clients only (each one also needs an unlocked session).
  foreach f in array array['public.list_device_keys()', 'public.rename_device_key(uuid, text)', 'public.remove_device_key(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- The Edge Function's API: the service role only.
  foreach f in array array[
    'public.dk_status(uuid, uuid)', 'public.dk_issue_challenge(uuid, uuid, text, text, uuid)', 'public.dk_take_challenge(uuid, uuid, text, text, uuid)',
    'public.dk_keys(uuid)', 'public.dk_add_key(uuid, text, jsonb, text, text)', 'public.dk_record_assertion(uuid, uuid, bigint)',
    'public.dk_unlock(uuid, uuid)', 'public.dk_failure(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
end $$;
