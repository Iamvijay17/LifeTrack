-- 0029: remember the day of the month a repeating reminder was set for. ADDITIVE and idempotent: one nullable column, one check, one trigger,
-- and a backfill that only fills empty values. Nothing is dropped or rewritten.
--
-- A monthly (or yearly) reminder moved on from the date it last fired for, so one set for the 31st went to 28 Feb, then 28 Mar, and never
-- came back to the 31st. The app now reads the day to aim for from anchor_day, and each repeat clamps to the end of a short month without
-- losing it (31 Jan -> 28 Feb -> 31 Mar). anchor_day is the day number the person chose (1-31); rows without one fall back to the day of
-- remind_date, which is what the old behaviour used.

alter table public.reminders add column if not exists anchor_day smallint;
alter table public.reminders drop constraint if exists reminders_anchor_day_ck;
alter table public.reminders add constraint reminders_anchor_day_ck check (anchor_day is null or anchor_day between 1 and 31);

-- Existing rows: the best information left is the day they are on now. (A series that already drifted keeps its drifted day.)
update public.reminders set anchor_day = extract(day from remind_date)::smallint where anchor_day is null;

-- Any insert that does not say (the API, an import, a restore) gets the day of its date, so the column is never empty for new rows.
create or replace function public.reminders_set_anchor_day() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.anchor_day is null then new.anchor_day := extract(day from new.remind_date)::smallint; end if;
  return new;
end $$;
drop trigger if exists reminders_anchor_day_tg on public.reminders;
create trigger reminders_anchor_day_tg before insert on public.reminders for each row execute function public.reminders_set_anchor_day();
