-- 0032: `_emit_restored` only queues a `data.restored` webhook for a restore that really happened. ADDITIVE and idempotent: redefines one internal
-- helper; no table changes.
--
-- It stays callable by `authenticated` because audit_restore (SECURITY INVOKER) calls it, so before this anyone signed in could call it directly and
-- send their own webhook receiver a `data.restored` event for one of their audit events without restoring anything, with any text as the mode.
-- A real restore writes, in the same transaction and before this is called, an audit event with `restored_from` = the restored event (see
-- _audit_record, lifetrack.audit_restore). That row is the proof required here; the mode must be one audit_restore produces.

create or replace function public._emit_restored(p_event uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.audit_events;
begin
  if p_mode is null or p_mode not in ('recreate', 'revert') then return; end if;
  select * into e from public.audit_events where id = p_event and user_id = auth.uid();
  if not found then return; end if;
  if not exists (select 1 from public.audit_events r where r.user_id = e.user_id and r.restored_from = e.id) then return; end if;
  perform public._emit_webhook(e.user_id, 'data.restored', 'data.restored:' || e.id::text,
    jsonb_build_object('entity', e.entity, 'record_id', e.record_id, 'event_id', e.id, 'mode', p_mode));
end $$;
revoke all on function public._emit_restored(uuid, text) from public, anon;
grant execute on function public._emit_restored(uuid, text) to authenticated;
