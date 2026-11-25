-- 0018: Consistency Protection. ADDITIVE and idempotent: running app versions keep working without it.
--
--  * habits.rest_days      planned rest days (0=Sun..6=Sat). A rest day is not "scheduled", so it can never be missed or break a streak.
--  * habit_pauses          one row per pause window of a habit (end_date null = still paused). Days inside a window are neutral, exactly like rest days.
--  * habit_logs.recovered_at   set when a past day was checked in later ("made up"), so the recovery history can be listed.
--
-- Nothing here rewrites a check-in: logs stay exactly as recorded. Pauses and rest days only change what the calculations EXPECT.

alter table public.habits add column if not exists rest_days smallint[] not null default '{}';
alter table public.habits drop constraint if exists habits_rest_days_ck;
alter table public.habits add constraint habits_rest_days_ck check (rest_days <@ array[0,1,2,3,4,5,6]::smallint[]);

alter table public.habit_logs add column if not exists recovered_at timestamptz;

create table if not exists public.habit_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  start_date date not null,
  end_date date,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habit_pauses_dates_ck check (end_date is null or end_date >= start_date)
);
create index if not exists habit_pauses_habit_idx on public.habit_pauses (user_id, habit_id, start_date);
-- At most one open-ended pause per habit: two devices pausing at once cannot create two.
create unique index if not exists habit_pauses_open_uq on public.habit_pauses (habit_id) where end_date is null;
create index if not exists habit_logs_recovered_idx on public.habit_logs (user_id, recovered_at) where recovered_at is not null;

drop trigger if exists set_updated_at on public.habit_pauses;
create trigger set_updated_at before update on public.habit_pauses for each row execute function public.set_updated_at();
drop trigger if exists fk_owner on public.habit_pauses;
create trigger fk_owner before insert or update on public.habit_pauses
  for each row execute function public.check_fk_owner('habit_id', 'habits');
alter table public.habit_pauses enable row level security;
alter table public.habit_pauses force row level security;
revoke all on public.habit_pauses from anon;
drop policy if exists "owner_all" on public.habit_pauses;
create policy "owner_all" on public.habit_pauses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'habit_pauses') then
    alter publication supabase_realtime add table public.habit_pauses;
  end if;
end $$;
