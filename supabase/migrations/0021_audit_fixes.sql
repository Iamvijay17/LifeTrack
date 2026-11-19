-- 0021: fixes from the November 2026 full audit. ADDITIVE and idempotent: one new index and two functions re-created with an extra
-- check (same signatures and grants). No table, column or row is altered or dropped. Needs 0012_security.sql (run in order).
--
-- task_reschedules.task_id (0016) references tasks(id) ON DELETE CASCADE but had no index that starts with task_id (the existing
-- one starts with user_id). Deleting a task therefore scanned the whole history table, and scripts/verify-sql.mjs ("every
-- foreign-key column has an index") failed.

create index if not exists task_reschedules_task_id_idx on public.task_reschedules (task_id);

-- delete_my_account (0002) only checked that someone was signed in, so a token from a LOCKED session (PIN not entered) could still
-- delete the whole account, and with it the data the lock protects. It now needs an unlocked session, like the other sensitive actions
-- (with no app lock set up every session counts as unlocked, so nothing changes for those accounts).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public._require_unlocked();
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- disable_app_lock (0012) did not check that the caller's session still exists. After ten wrong PINs the session is signed out, but its
-- access token stays valid until it expires (up to an hour) and could keep guessing here. verify_pin and change_pin already refuse that.
create or replace function public.disable_app_lock(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid; r jsonb;
begin
  if v_uid is null then raise exception 'Not signed in.' using errcode = '28000'; end if;
  v_sid := public._require_session();
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
revoke all on function public.disable_app_lock(text) from public, anon;
grant execute on function public.disable_app_lock(text) to authenticated;
