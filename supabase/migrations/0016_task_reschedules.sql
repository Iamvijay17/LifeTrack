-- 0016: Smart Recovery & Rescheduling history. ADDITIVE: one new table, nothing existing is altered, so running app versions keep working.
--
-- Smart Recovery (packages/core/src/recovery.js) proposes new times for tasks that slipped. Accepting one moves the task in `tasks` (due_date,
-- start_time, end_time: the same columns the Planner and Calendar already use) and writes ONE row here, so a task keeps a history of every move.
-- Rejecting a suggestion writes a 'dismissed' row that keeps it quiet until `hide_until`. Settings (working hours, capacity, horizon) are not here:
-- they live in user_settings.calendar_prefs, which is already a free-form JSON column.
--
-- No duplicate moves: `dedupe_key` names what was done (task + from + to, or task + rejection) and is unique per user while the row is not undone,
-- so two devices accepting the same suggestion cannot both succeed (the second insert fails with 23505 before the task is touched).

create table if not exists public.task_reschedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),            -- the task's title when it was moved, for the history list
  action text not null check (action in ('rescheduled','dismissed')),
  source text not null default 'recovery' check (source in ('recovery','rebalance','manual')),
  from_date date not null,
  from_start time,
  from_end time,
  to_date date,
  to_start time,
  to_end time,
  reason text not null default '' check (char_length(reason) <= 500),
  batch_id uuid,                                                                 -- moves accepted together can be undone together
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  hide_until date,                                                               -- 'dismissed': do not suggest this task again before this date
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_reschedules_from_time_ck check ((from_start is null) = (from_end is null) and (from_start is null or from_end > from_start)),
  constraint task_reschedules_to_time_ck check ((to_start is null) = (to_end is null) and (to_start is null or to_end > to_start)),
  constraint task_reschedules_shape_ck check (
    (action = 'rescheduled' and to_date is not null and to_start is not null)
    or (action = 'dismissed' and to_date is null and hide_until is not null)
  )
);

create index if not exists task_reschedules_task_idx on public.task_reschedules (user_id, task_id, created_at desc);
create index if not exists task_reschedules_batch_idx on public.task_reschedules (batch_id) where batch_id is not null;
create unique index if not exists task_reschedules_dedupe_uq on public.task_reschedules (user_id, dedupe_key) where dedupe_key is not null and undone_at is null;

-- ----------------------------------------------------- triggers, RLS, realtime (same as every other table)
drop trigger if exists set_updated_at on public.task_reschedules;
create trigger set_updated_at before update on public.task_reschedules for each row execute function public.set_updated_at();
alter table public.task_reschedules enable row level security;
alter table public.task_reschedules force row level security;
revoke all on public.task_reschedules from anon;
drop policy if exists "owner_all" on public.task_reschedules;
create policy "owner_all" on public.task_reschedules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_reschedules') then
    alter publication supabase_realtime add table public.task_reschedules;
  end if;
end $$;

-- A history row can only point at the user's own task (the same-owner guard from 0004).
drop trigger if exists fk_owner on public.task_reschedules;
create trigger fk_owner before insert or update on public.task_reschedules
  for each row execute function public.check_fk_owner('task_id', 'tasks');
