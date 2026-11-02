-- Phase 6 additions: focus sessions, notes, goal milestones, savings goals, reminders, notifications,
-- plus score / dashboard / notification preferences. Everything is user-owned and protected by RLS (see bottom).

-- ------------------------------------------------------------ preferences
alter table public.user_settings
  add column if not exists score_weights jsonb not null default '{"learning":25,"career":25,"fitness":20,"habits":15,"health":15}'::jsonb,
  add column if not exists dashboard_widgets jsonb not null default '{}'::jsonb,       -- {widgetKey: false} hides a widget
  add column if not exists notification_prefs jsonb not null default '{"task":true,"study":true,"workout":true,"habit":true,"bill":true,"custom":true}'::jsonb,
  add column if not exists focus_prefs jsonb not null default '{"short_break":5,"long_break":15,"long_every":4}'::jsonb;

-- ------------------------------------------------------- job status: Offer
alter table public.job_applications drop constraint if exists job_applications_status_check;
alter table public.job_applications add constraint job_applications_status_check
  check (status in ('interested','preparing','applied','assessment','interview','selected','offer','rejected','withdrawn'));

-- ------------------------------------------------------ payment methods
alter table public.transactions
  add column if not exists payment_method text not null default 'Other'
  check (payment_method in ('Cash','UPI','Credit card','Debit card','Bank transfer','Other'));

-- ------------------------------------------------------------------ goals
alter table public.goals
  add column if not exists period text not null default 'monthly' check (period in ('daily','weekly','monthly','yearly')),
  add column if not exists start_date date,
  add column if not exists manual_progress smallint not null default 0 check (manual_progress between 0 and 100),
  add column if not exists completed_at timestamptz;
alter table public.goals drop constraint if exists goals_dates_ck;
alter table public.goals add constraint goals_dates_ck check (start_date is null or due_date is null or due_date >= start_date);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  due_date date,
  done boolean not null default false,
  completed_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists milestones_goal_idx on public.milestones (goal_id, position);
create index if not exists milestones_user_idx on public.milestones (user_id);

-- ------------------------------------------------------------ focus_sessions
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_date date not null,
  kind text not null default 'focus' check (kind in ('focus','short_break','long_break')),
  planned_minutes int not null check (planned_minutes between 1 and 240),
  actual_seconds int not null default 0 check (actual_seconds >= 0),
  completed boolean not null default false,             -- ran to the end (an abandoned timer is still recorded, but not "completed")
  task_id uuid references public.tasks(id) on delete set null,
  topic_id uuid references public.learning_topics(id) on delete set null,
  label text not null default '' check (char_length(label) <= 120),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists focus_user_date_idx on public.focus_sessions (user_id, session_date);

-- --------------------------------------------------------------------- notes
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 160),
  body text not null default '',                          -- Markdown
  category text not null default 'General' check (char_length(category) between 1 and 40),
  tags text[] not null default '{}',
  pinned boolean not null default false,
  goal_id uuid references public.goals(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_not_empty check (char_length(title) > 0 or char_length(body) > 0)
);
create index if not exists notes_user_idx on public.notes (user_id, updated_at desc);
create index if not exists notes_tags_idx on public.notes using gin (tags);

-- ------------------------------------------------------------- savings_goals
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_paise bigint not null check (target_paise > 0),
  saved_paise bigint not null default 0 check (saved_paise >= 0),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- reminders
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'custom' check (kind in ('task','study','workout','habit','bill','custom')),
  title text not null check (char_length(title) between 1 and 160),
  remind_date date not null,
  remind_time time not null default '09:00',
  repeat text not null default 'none' check (repeat in ('none','daily','weekly','monthly')),
  active boolean not null default true,
  last_fired_on date,                                        -- idempotency: one notification per reminder per day
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reminders_user_idx on public.reminders (user_id, remind_date);

-- ------------------------------------------------------------- notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'custom' check (kind in ('task','study','workout','habit','bill','custom','system')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '',
  link text not null default '',
  dedupe_key text,                                          -- e.g. 'reminder:<id>:2026-11-02' — prevents duplicates across devices
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_dedupe_uq on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

-- ----------------------------------------------------------- triggers + RLS
do $$
declare t text;
begin
  foreach t in array array['milestones','focus_sessions','notes','savings_goals','reminders','notifications'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- A child row may only reference a parent owned by the same user (RLS alone does not check foreign keys).
create or replace function public.check_same_owner() returns trigger
language plpgsql as $$
declare parent_owner uuid;
begin
  if tg_table_name = 'milestones' then
    select user_id into parent_owner from public.goals where id = new.goal_id;
    if parent_owner is distinct from new.user_id then raise exception 'goal does not belong to this user'; end if;
  elsif tg_table_name = 'notes' then
    if new.goal_id is not null then
      select user_id into parent_owner from public.goals where id = new.goal_id;
      if parent_owner is distinct from new.user_id then raise exception 'goal does not belong to this user'; end if;
    end if;
    if new.task_id is not null then
      select user_id into parent_owner from public.tasks where id = new.task_id;
      if parent_owner is distinct from new.user_id then raise exception 'task does not belong to this user'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists milestones_owner on public.milestones;
create trigger milestones_owner before insert or update on public.milestones for each row execute function public.check_same_owner();
drop trigger if exists notes_owner on public.notes;
create trigger notes_owner before insert or update on public.notes for each row execute function public.check_same_owner();
