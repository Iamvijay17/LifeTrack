-- LifeTrack: complete database setup (generated from supabase/migrations by scripts/build-setup-sql.mjs). Run once.

-- ===== 0001_schema.sql =====
-- LifeTrack schema. Run in order: 0001_schema.sql, 0002_rls_realtime.sql
-- Conventions:
--  * every row is owned by user_id (defaults to auth.uid(), cascades only when the account itself is deleted)
--  * daily records use a plain DATE computed client-side in the user's timezone (default Asia/Kolkata)
--  * money is stored as integer paise (bigint)
--  * enums are text + CHECK constraints so they can evolve without type migrations


create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------- user_settings
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  daily_study_target_minutes int not null default 120 check (daily_study_target_minutes between 0 and 1440),
  monthly_budget_paise bigint not null default 0 check (monthly_budget_paise >= 0),
  water_goal_ml int not null default 3000 check (water_goal_ml between 0 and 20000),
  steps_goal int not null default 8000 check (steps_goal between 0 and 200000),
  week_starts_on smallint not null default 1 check (week_starts_on in (0,1)),
  habit_prefs jsonb not null default '{}'::jsonb,
  workout_plan jsonb not null default '{}'::jsonb,   -- {"0".."6": routine uuid | "rest" | null}
  defaults_seeded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile + settings for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------- learning_topics
create table public.learning_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_name text not null check (char_length(group_name) between 1 and 60),
  name text not null check (char_length(name) between 1 and 80),
  notes text not null default '',
  revision_dates date[] not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_name, name)
);

-- -------------------------------------------------------------------- goals
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  category text not null default 'Learning',
  topic_id uuid references public.learning_topics(id) on delete set null,
  target_minutes int not null default 0 check (target_minutes >= 0),
  due_date date,
  status text not null default 'active' check (status in ('active','completed','archived')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_user_idx on public.goals (user_id, status);

-- -------------------------------------------------------------------- tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '',
  category text not null default 'Personal' check (category in ('Learning','Job Search','Gym','Health','Personal','Finance')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'pending' check (status in ('pending','in_progress','done','skipped','cancelled')),
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekdays','weekly','monthly')),
  recurrence_until date,
  series_id uuid,                        -- groups the occurrences of a recurring task
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_due_idx on public.tasks (user_id, due_date);
create index tasks_user_status_idx on public.tasks (user_id, status);
-- Prevents two devices from both materialising the same next occurrence.
create unique index tasks_series_occurrence_uq on public.tasks (user_id, series_id, due_date) where series_id is not null;

-- ------------------------------------------------------------------- habits
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  color text not null default '#8B5CF6',
  frequency text not null default 'daily' check (frequency in ('daily','weekly','custom')),
  days_of_week smallint[] not null default '{}',     -- custom schedule, 0=Sun..6=Sat
  weekly_target smallint not null default 3 check (weekly_target between 1 and 7),
  start_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index habits_user_idx on public.habits (user_id);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  log_date date not null,
  status text not null default 'done' check (status in ('done','skipped','rest')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, log_date)               -- no duplicate completion for the same habit and day
);
create index habit_logs_user_date_idx on public.habit_logs (user_id, log_date);

-- ----------------------------------------------------------- study_sessions
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  topic_id uuid references public.learning_topics(id) on delete set null,
  session_date date not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'completed' check (status in ('running','completed','discarded')),
  source text not null default 'manual' check (source in ('timer','manual')),
  problems_solved int not null default 0 check (problems_solved >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An incomplete (running) timer can never carry counted time.
  constraint study_running_has_no_end check (status <> 'running' or (ended_at is null and duration_seconds is null)),
  constraint study_completed_has_duration check (status <> 'completed' or duration_seconds is not null)
);
create index study_user_date_idx on public.study_sessions (user_id, session_date);
create unique index study_one_running_uq on public.study_sessions (user_id) where status = 'running';

-- ---------------------------------------------------------- job_applications
create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null check (char_length(company) between 1 and 120),
  job_title text not null check (char_length(job_title) between 1 and 120),
  jd_url text not null default '',
  location text not null default '',
  salary_paise bigint check (salary_paise is null or salary_paise >= 0),   -- annual package in paise
  applied_date date,
  source text not null default '',
  status text not null default 'interested'
    check (status in ('interested','preparing','applied','assessment','interview','selected','rejected','withdrawn')),
  contact_person text not null default '',
  followup_date date,
  resume_version text not null default '',
  prep_checklist jsonb not null default '[]'::jsonb,        -- [{id,text,done}]
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_user_status_idx on public.job_applications (user_id, status);
create index jobs_user_followup_idx on public.job_applications (user_id, followup_date);

create table public.application_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text not null default '',
  changed_at timestamptz not null default now()
);
create index app_history_idx on public.application_history (application_id, changed_at);

-- Status history is written by the database, so no client can forget (or lose) it.
create or replace function public.log_application_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_history (user_id, application_id, from_status, to_status)
    values (new.user_id, new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.application_history (user_id, application_id, from_status, to_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  return null;
end $$;
create trigger job_applications_history after insert or update of status on public.job_applications
  for each row execute function public.log_application_status();

create table public.interview_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  round_name text not null default 'Interview',
  scheduled_at timestamptz not null,
  mode text not null default 'video' check (mode in ('video','phone','onsite','other')),
  link text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interview_user_time_idx on public.interview_events (user_id, scheduled_at);

-- ------------------------------------------------------------------ fitness
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  muscle_group text not null default '',
  equipment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  exercises jsonb not null default '[]'::jsonb,          -- [{name, sets, reps, weight_kg}]
  notes text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  workout_date date not null,
  name text not null default 'Workout',
  kind text not null default 'strength' check (kind in ('strength','cardio','mixed','other')),
  status text not null default 'completed' check (status in ('completed','skipped','rest')),
  duration_minutes int check (duration_minutes is null or duration_minutes between 0 and 1440),
  cardio_minutes int check (cardio_minutes is null or cardio_minutes between 0 and 1440),
  cardio_distance_km numeric(6,2) check (cardio_distance_km is null or cardio_distance_km >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workouts_user_date_idx on public.workouts (user_id, workout_date);

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null,
  order_index smallint not null default 0,
  set_number smallint not null default 1 check (set_number >= 1),
  reps int not null default 0 check (reps >= 0),
  weight_kg numeric(6,2) not null default 0 check (weight_kg >= 0),
  created_at timestamptz not null default now()
);
create index exercise_logs_workout_idx on public.exercise_logs (workout_id);
create index exercise_logs_user_name_idx on public.exercise_logs (user_id, exercise_name);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_on date not null,
  chest_cm numeric(5,1), waist_cm numeric(5,1), hips_cm numeric(5,1),
  arm_cm numeric(5,1), thigh_cm numeric(5,1), body_fat_pct numeric(4,1),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- ------------------------------------------------------------------- health
create table public.health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,                        -- the date you WOKE UP (overnight sleep belongs to the wake date)
  bedtime time,
  wake_time time,
  sleep_minutes int check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  water_ml int not null default 0 check (water_ml between 0 and 20000),
  steps int not null default 0 check (steps between 0 and 200000),
  energy_level smallint check (energy_level is null or energy_level between 1 and 5),
  weight_kg numeric(5,2) check (weight_kg is null or weight_kg between 20 and 500),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- ------------------------------------------------------------------ finance
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense','savings')),
  amount_paise bigint not null check (amount_paise > 0),
  category text not null default 'Other',
  txn_date date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index txn_user_date_idx on public.transactions (user_id, txn_date);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),   -- first day of month
  category text not null default '',                          -- '' = overall monthly budget
  amount_paise bigint not null check (amount_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, category)
);

-- ------------------------------------------------------------------ journal
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  mood smallint check (mood is null or mood between 1 and 5),
  content text not null default '',
  wins text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

-- ------------------------------------------------- updated_at triggers (all)
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_settings','learning_topics','goals','tasks','habits','habit_logs','study_sessions',
    'job_applications','interview_events','exercises','routines','workouts','body_measurements',
    'health_logs','transactions','budgets','journal_entries'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;


-- ===== 0002_rls_realtime.sql =====
-- Row Level Security + Realtime + account deletion.
-- Every policy is "you can only touch rows you own". The anon role gets nothing.

do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','learning_topics','goals','tasks','habits','habit_logs','study_sessions',
    'job_applications','application_history','interview_events','exercises','routines','workouts',
    'exercise_logs','body_measurements','health_logs','transactions','budgets','journal_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from anon;
create policy "owner_all" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Realtime: changes are broadcast to subscribed devices (RLS still filters what each user receives).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'user_settings','learning_topics','goals','tasks','habits','habit_logs','study_sessions',
      'job_applications','application_history','interview_events','exercises','routines','workouts',
      'exercise_logs','body_measurements','health_logs','transactions','budgets','journal_entries'
    ] loop
      if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Self-service account deletion (all owned rows cascade from auth.users).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;


-- ===== 0003_focus_notes_goals_reminders.sql =====
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


-- ===== 0004_hardening.sql =====
-- Hardening: (1) every cross-table reference must stay inside one user's data,
-- (2) indexes on foreign keys used by ON DELETE SET NULL / CASCADE, (3) atomic counter / replace operations
-- so two devices can't lose each other's writes. Safe to re-run.

-- ------------------------------------------------ 1. same-owner foreign keys
-- RLS does not look at foreign keys, so a row could otherwise reference another user's parent row (if its id were known).
-- Trigger args: pairs of (column, parent table). The parent lookup runs as the caller, so RLS hides other users' rows.
create or replace function public.check_fk_owner() returns trigger
language plpgsql as $$
declare
  i int := 0;
  col text; parent text; ref uuid; parent_owner uuid;
begin
  while i < tg_nargs loop
    col := tg_argv[i]; parent := tg_argv[i + 1]; i := i + 2;
    ref := nullif(to_jsonb(new) ->> col, '')::uuid;
    if ref is not null then
      execute format('select user_id from public.%I where id = $1', parent) into parent_owner using ref;
      if parent_owner is distinct from new.user_id then
        raise exception '% does not belong to this user', col using errcode = '23503';
      end if;
    end if;
  end loop;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('habit_logs',        'habit_id', 'habits', null, null),
    ('study_sessions',    'goal_id', 'goals', 'topic_id', 'learning_topics'),
    ('goals',             'topic_id', 'learning_topics', null, null),
    ('focus_sessions',    'task_id', 'tasks', 'topic_id', 'learning_topics'),
    ('exercise_logs',     'workout_id', 'workouts', 'exercise_id', 'exercises'),
    ('interview_events',  'application_id', 'job_applications', null, null),
    ('workouts',          'routine_id', 'routines', null, null)
  ) as v(tbl, c1, p1, c2, p2) loop
    execute format('drop trigger if exists fk_owner on public.%I', r.tbl);
    if r.c2 is null then
      execute format('create trigger fk_owner before insert or update on public.%I for each row execute function public.check_fk_owner(%L, %L)', r.tbl, r.c1, r.p1);
    else
      execute format('create trigger fk_owner before insert or update on public.%I for each row execute function public.check_fk_owner(%L, %L, %L, %L)', r.tbl, r.c1, r.p1, r.c2, r.p2);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------ 2. foreign-key indexes
create index if not exists goals_topic_idx            on public.goals (topic_id) where topic_id is not null;
create index if not exists study_goal_idx             on public.study_sessions (goal_id) where goal_id is not null;
create index if not exists study_topic_idx            on public.study_sessions (topic_id) where topic_id is not null;
create index if not exists focus_task_idx             on public.focus_sessions (task_id) where task_id is not null;
create index if not exists focus_topic_idx            on public.focus_sessions (topic_id) where topic_id is not null;
create index if not exists notes_goal_idx             on public.notes (goal_id) where goal_id is not null;
create index if not exists notes_task_idx             on public.notes (task_id) where task_id is not null;
create index if not exists workouts_routine_idx       on public.workouts (routine_id) where routine_id is not null;
create index if not exists exercise_logs_exercise_idx on public.exercise_logs (exercise_id) where exercise_id is not null;
create index if not exists interview_app_idx          on public.interview_events (application_id);
-- incremental ("changed since") fetches
create index if not exists habit_logs_updated_idx     on public.habit_logs (user_id, updated_at);
create index if not exists txn_updated_idx            on public.transactions (user_id, updated_at);
create index if not exists health_updated_idx         on public.health_logs (user_id, updated_at);

-- ------------------------------------------------------ 3. atomic operations
-- Both run as the caller (security invoker), so RLS still applies.
create or replace function public.add_water(p_date date, p_ml int) returns public.health_logs
language plpgsql set search_path = '' as $$
declare r public.health_logs;
begin
  insert into public.health_logs (log_date, water_ml) values (p_date, greatest(0, least(20000, p_ml)))
  on conflict (user_id, log_date) do update
    set water_ml = greatest(0, least(20000, public.health_logs.water_ml + p_ml))
  returning * into r;
  return r;
end $$;

-- Replaces every set of a workout in one transaction (no half-saved edits, no duplicates on retry).
create or replace function public.replace_exercise_logs(p_workout uuid, p_sets jsonb) returns setof public.exercise_logs
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.workouts where id = p_workout) then
    raise exception 'workout not found' using errcode = 'P0002';
  end if;
  delete from public.exercise_logs where workout_id = p_workout;
  return query
    insert into public.exercise_logs (workout_id, exercise_id, exercise_name, order_index, set_number, reps, weight_kg)
    select p_workout, s.exercise_id, s.exercise_name, coalesce(s.order_index, 0), coalesce(s.set_number, 1), coalesce(s.reps, 0), coalesce(s.weight_kg, 0)
    from jsonb_to_recordset(p_sets) as s(exercise_id uuid, exercise_name text, order_index smallint, set_number smallint, reps int, weight_kg numeric)
    returning *;
end $$;

revoke all on function public.add_water(date, int) from public, anon;
revoke all on function public.replace_exercise_logs(uuid, jsonb) from public, anon;
grant execute on function public.add_water(date, int) to authenticated;
grant execute on function public.replace_exercise_logs(uuid, jsonb) to authenticated;


-- ===== 0005_history_owner_guard_and_user_indexes.sql =====
-- 0005: the two gaps left after 0004_hardening (idempotent; safe to re-run).
--  1. application_history.application_id was the one parent link without a same-owner guard. Same mechanism as 0004
--     (public.check_fk_owner): a user can't point history at another user's application.
--  2. Three tables that RLS filters by user_id had no user_id-leading index.

drop trigger if exists fk_owner on public.application_history;
create trigger fk_owner before insert or update on public.application_history
  for each row execute function public.check_fk_owner('application_id', 'job_applications');

create index if not exists app_history_user_idx   on public.application_history (user_id, changed_at);
create index if not exists routines_user_idx      on public.routines (user_id);
create index if not exists savings_goals_user_idx on public.savings_goals (user_id);


-- ===== 0006_push_tokens.sql =====
-- Push notification device tokens. ADDITIVE: one new table and two functions; no existing data is touched.
-- Clients never write this table directly: they call register_push_token / unregister_push_token (security definer),
-- so a token can be re-assigned when a different user signs in on the same phone, without opening an RLS hole.

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^(Expo|Exponent)PushToken\[[^\]]+\]$'),
  platform text not null check (platform in ('ios','android')),
  device_name text not null default '' check (char_length(device_name) <= 80),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index device_push_tokens_user_idx on public.device_push_tokens (user_id);

create trigger set_updated_at before update on public.device_push_tokens
  for each row execute function public.set_updated_at();

alter table public.device_push_tokens enable row level security;
alter table public.device_push_tokens force row level security;
revoke all on public.device_push_tokens from anon;
-- Read and delete your own tokens only. No insert/update policy => direct writes are denied.
create policy "owner_select" on public.device_push_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy "owner_delete" on public.device_push_tokens for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update on public.device_push_tokens from authenticated;

create or replace function public.register_push_token(p_token text, p_platform text, p_device_name text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.device_push_tokens (user_id, token, platform, device_name)
  values (auth.uid(), p_token, p_platform, left(coalesce(p_device_name, ''), 80))
  on conflict (token) do update
    set user_id = auth.uid(), platform = excluded.platform, device_name = excluded.device_name, last_seen_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.device_push_tokens where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;


-- ===== 0007_savings_atomic.sql =====
-- 0007: atomic savings deposits.
-- The client used to read the cached total, add to it and write it back, so two devices (or two quick taps in flight) could each write a
-- stale total and silently lose a deposit. This function adds inside the database in ONE statement, so concurrent deposits accumulate.
-- (add_water, the same fix for water intake, already exists in 0004_hardening.sql.)
-- SECURITY INVOKER: row-level security still applies, so a user can only touch their own goals. Additive: no existing data or table is changed.

create or replace function public.add_savings(p_goal uuid, p_paise bigint)
returns public.savings_goals
language plpgsql security invoker set search_path = '' as $$
declare r public.savings_goals;
begin
  if p_paise is null or p_paise <= 0 then raise exception 'Enter an amount greater than 0.'; end if;
  update public.savings_goals set saved_paise = saved_paise + p_paise where id = p_goal returning * into r;
  if not found then raise exception 'Savings goal not found.'; end if;
  return r;
end $$;

revoke all on function public.add_savings(uuid, bigint) from public, anon;
grant execute on function public.add_savings(uuid, bigint) to authenticated;


-- ===== 0008_recurring_rules.sql =====
-- 0008: recurring transactions (rent, EMI, subscriptions). ADDITIVE: one new table and two nullable columns on transactions; no existing row changes.
-- The apps post due occurrences themselves while open (packages/core/src/recurring.js, api.postDueRecurring). Several devices can do so at once:
-- the unique index below lets only the first insert of an occurrence win, exactly like notifications.dedupe_key does for reminders.

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense','savings')),
  amount_paise bigint not null check (amount_paise > 0),
  category text not null default 'Other' check (char_length(category) between 1 and 40),
  payment_method text not null default 'Other' check (payment_method in ('Cash','UPI','Credit card','Debit card','Bank transfer','Other')),
  note text not null default '' check (char_length(note) <= 300),
  frequency text not null default 'monthly' check (frequency in ('daily','weekly','monthly','yearly')),
  anchor_day smallint not null check (anchor_day between 1 and 31), -- the intended day of the month: a rule on the 31st falls on Feb 28, then back on Mar 31
  next_date date not null,                                          -- the next occurrence to post
  end_date date,                                                    -- last day an occurrence may fall on (inclusive); null = no end
  active boolean not null default true,                             -- false = paused or finished
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recurring_rules_user_idx on public.recurring_rules (user_id, next_date);

drop trigger if exists set_updated_at on public.recurring_rules;
create trigger set_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();

alter table public.recurring_rules enable row level security;
alter table public.recurring_rules force row level security;
revoke all on public.recurring_rules from anon;
drop policy if exists "owner_all" on public.recurring_rules;
create policy "owner_all" on public.recurring_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_rules') then
    alter publication supabase_realtime add table public.recurring_rules;
  end if;
end $$;

-- A posted transaction remembers its rule and which occurrence it was. recurring_date never changes, so moving a posted transaction to another day
-- (which edits txn_date) can't free that occurrence to post again. Deleting a rule keeps the transactions it already posted.
alter table public.transactions
  add column if not exists recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  add column if not exists recurring_date date;
alter table public.transactions drop constraint if exists transactions_recurring_ck;
alter table public.transactions add constraint transactions_recurring_ck check (recurring_rule_id is null or recurring_date is not null); -- nulls would slip past the unique index
create unique index if not exists transactions_recurring_occurrence_uq on public.transactions (user_id, recurring_rule_id, recurring_date) where recurring_rule_id is not null;
create index if not exists transactions_recurring_rule_idx on public.transactions (recurring_rule_id) where recurring_rule_id is not null;

-- Same-owner guard from 0004: a transaction can't point at another user's rule.
drop trigger if exists fk_owner on public.transactions;
create trigger fk_owner before insert or update on public.transactions
  for each row execute function public.check_fk_owner('recurring_rule_id', 'recurring_rules');


-- ===== 0009_nutrition.sql =====
-- 0009: Food & Nutrition tracking. ADDITIVE: four new tables and two functions; no existing table, column or row changes.
--   foods              the user's own foods, and their edited copies of the built-in Indian starter list (the starter list itself ships with the apps)
--   food_logs          one row per food eaten (a snapshot of its nutrition, so editing a food later never rewrites history)
--   water_logs         one row per drink of water; the day's total is also kept in health_logs.water_ml so Sleep & Health stays in step
--   nutrition_settings one row per user: daily targets (null = not set) and favourite foods
-- Dates are plain `date` values in the user's own timezone (chosen by the app, like every other *_date column), so there is no UTC boundary to cross.

-- ------------------------------------------------------------------ foods
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'Other' check (char_length(category) between 1 and 40),
  base_key text check (base_key is null or char_length(base_key) between 1 and 60), -- set when this row is the user's edited copy of a starter food
  serving_label text not null default '1 serving' check (char_length(serving_label) between 1 and 60),
  serving_g numeric(7,1) check (serving_g is null or serving_g > 0),
  kcal numeric(7,1) not null default 0 check (kcal between 0 and 5000),   -- all nutrition is per ONE serving_label
  protein_g numeric(6,1) not null default 0 check (protein_g between 0 and 500),
  carbs_g numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g numeric(6,1) not null default 0 check (fat_g between 0 and 500),
  fiber_g numeric(6,1) not null default 0 check (fiber_g between 0 and 200),
  servings jsonb not null default '[]'::jsonb check (jsonb_typeof(servings) = 'array' and jsonb_array_length(servings) <= 12),   -- [{label, factor}]: other serving sizes, as multiples of serving_label
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 12),   -- [{label, kcal, protein_g, carbs_g, fat_g, fiber_g}]: preparation styles
  notes text not null default '' check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists foods_user_base_uq on public.foods (user_id, base_key) where base_key is not null;
create index if not exists foods_user_name_idx on public.foods (user_id, lower(name));

-- --------------------------------------------------------------- food_logs
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  log_time time,
  meal_type text not null check (meal_type in ('breakfast','lunch','snack','dinner')),
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'Other' check (char_length(category) between 1 and 40),
  food_id uuid references public.foods(id) on delete set null,
  base_key text check (base_key is null or char_length(base_key) between 1 and 60),   -- the starter food it came from, if any
  variant text not null default '' check (char_length(variant) <= 60),
  quantity numeric(7,2) not null default 1 check (quantity > 0 and quantity <= 1000),
  serving_label text not null default '1 serving' check (char_length(serving_label) between 1 and 60),
  kcal numeric(8,1) not null default 0 check (kcal between 0 and 20000),             -- totals for the whole entry (quantity already applied)
  protein_g numeric(7,1) not null default 0 check (protein_g between 0 and 2000),
  carbs_g numeric(7,1) not null default 0 check (carbs_g between 0 and 4000),
  fat_g numeric(7,1) not null default 0 check (fat_g between 0 and 2000),
  fiber_g numeric(7,1) not null default 0 check (fiber_g between 0 and 1000),
  notes text not null default '' check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_logs_user_date_idx on public.food_logs (user_id, log_date desc, log_time);
create index if not exists food_logs_updated_idx on public.food_logs (user_id, updated_at);
create index if not exists food_logs_food_idx on public.food_logs (food_id) where food_id is not null;

-- --------------------------------------------------------------- water_logs
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  log_time time,
  amount_ml int not null check (amount_ml between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists water_logs_user_date_idx on public.water_logs (user_id, log_date desc, created_at);

-- ------------------------------------------------------ nutrition_settings
create table if not exists public.nutrition_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() unique references auth.users(id) on delete cascade,
  calorie_goal int check (calorie_goal is null or calorie_goal between 500 and 10000),
  protein_goal_g int check (protein_goal_g is null or protein_goal_g between 1 and 1000),
  carbs_goal_g int check (carbs_goal_g is null or carbs_goal_g between 1 and 2000),
  fat_goal_g int check (fat_goal_g is null or fat_goal_g between 1 and 1000),
  fiber_goal_g int check (fiber_goal_g is null or fiber_goal_g between 1 and 500),
  favorite_foods jsonb not null default '[]'::jsonb check (jsonb_typeof(favorite_foods) = 'array' and jsonb_array_length(favorite_foods) <= 200), -- ["starter:idli", "custom:<uuid>"]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------- triggers, RLS, realtime (as in 0008)
do $$
declare t text;
begin
  foreach t in array array['foods','food_logs','water_logs','nutrition_settings'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Same-owner guard from 0004: a food log can't point at another user's food.
drop trigger if exists fk_owner on public.food_logs;
create trigger fk_owner before insert or update on public.food_logs
  for each row execute function public.check_fk_owner('food_id', 'foods');

-- ------------------------------------------------------- atomic water entries
-- Both run as the caller (security invoker), so RLS still applies. They keep health_logs.water_ml (what Sleep & Health shows) equal to the
-- day's total, in the same transaction, so two devices adding water at once never lose an increment and a failure never leaves the two apart.
create or replace function public.log_water(p_date date, p_ml int, p_time time default null) returns jsonb
language plpgsql set search_path = '' as $$
declare
  w public.water_logs;
  h public.health_logs;
begin
  if p_ml is null or p_ml < 1 or p_ml > 5000 then
    raise exception 'amount must be between 1 and 5000 ml' using errcode = '22023';
  end if;
  insert into public.water_logs (log_date, log_time, amount_ml) values (p_date, p_time, p_ml) returning * into w;
  select * into h from public.add_water(p_date, p_ml);
  return jsonb_build_object('entry', to_jsonb(w), 'health', to_jsonb(h)); -- both rows, so the app updates its cache exactly
end $$;

create or replace function public.delete_water_log(p_id uuid) returns public.health_logs
language plpgsql set search_path = '' as $$
declare
  w public.water_logs;
  h public.health_logs;
begin
  delete from public.water_logs where id = p_id returning * into w;
  if not found then
    raise exception 'water entry not found' using errcode = 'P0002';
  end if;
  select * into h from public.add_water(w.log_date, -w.amount_ml);
  return h;
end $$;

revoke all on function public.log_water(date, int, time) from public, anon;
revoke all on function public.delete_water_log(uuid) from public, anon;
grant execute on function public.log_water(date, int, time) to authenticated;
grant execute on function public.delete_water_log(uuid) to authenticated;


-- ===== 0010_food_database.sql =====
-- 0010: food database metadata. ADDITIVE and safe to re-run: two new columns and three indexes on tables from 0009. No row changes.
--   foods.aliases   other names the user's own food can be found by (a Tamil name, a spelling, "amma's sambar"). The built-in foods carry theirs
--                   in the app, so this only holds what the user typed. An edited copy of a built-in food keeps the built-in names automatically.
--   foods.source    where the user's numbers came from ("packet label", "my recipe", "restaurant menu"). Free text, optional.
-- The built-in food list is NOT stored in the database (it ships with the apps), so growing it never touches anyone's data, and a log entry is
-- a snapshot of its nutrition, so no list change can rewrite history. Categories saved earlier (Tiffin, Rice & Grains, ...) stay as they are;
-- the apps map them onto the current categories when they read them.

alter table public.foods add column if not exists aliases text[] not null default '{}'
  check (cardinality(aliases) <= 12 and char_length(array_to_string(aliases, ' ')) <= 800);
alter table public.foods add column if not exists source text not null default ''
  check (char_length(source) <= 80);

-- Browsing "My foods" by category, finding a food by an other-name, and showing a food's recent logs.
create index if not exists foods_user_category_idx on public.foods (user_id, category);
create index if not exists foods_aliases_gin on public.foods using gin (aliases);
create index if not exists food_logs_user_base_idx on public.food_logs (user_id, base_key) where base_key is not null;


-- ===== 0011_calendar.sql =====
-- 0011: Advanced calendar. ADDITIVE: two new tables, new nullable / defaulted columns, and four CHECK constraints widened (never narrowed),
-- so no existing row changes and running app versions keep working.
--
--  * tasks gain an optional time of day (start_time / end_time), a colour, a location and alert offsets. A task with no start_time is exactly what it
--    was before (a date-only task), so the Planner, dashboard and mobile app are unaffected. Calendar tasks ARE tasks: nothing is duplicated.
--  * calendar_events holds events that are not tasks. Times are UTC instants plus the IANA zone they were planned in, so a recurring "09:00" stays at
--    09:00 on the wall clock across daylight-saving changes. Recurrence is a small JSON rule expanded by the apps (packages/core/src/calendarRecurrence.js).
--  * calendar_event_exceptions edits or cancels ONE occurrence of a recurring event without touching the series.
--  * priority gains 'urgent'; task categories gain 'Routine' and 'Custom'; tasks may repeat 'yearly'; notifications gain kind 'event'.

-- ------------------------------------------------------------------ tasks
alter table public.tasks
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists location text not null default '' check (char_length(location) <= 200),
  add column if not exists alert_minutes integer[] not null default '{}'
    check (cardinality(alert_minutes) <= 5 and 0 <= all(alert_minutes) and 40320 >= all(alert_minutes));

alter table public.tasks drop constraint if exists tasks_time_range_ck;
alter table public.tasks add constraint tasks_time_range_ck check (
  (start_time is null and end_time is null)
  or (start_time is not null and end_time is not null and end_time > start_time and due_date is not null)
);

alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('low','medium','high','urgent'));
alter table public.tasks drop constraint if exists tasks_category_check;
alter table public.tasks add constraint tasks_category_check
  check (category in ('Learning','Job Search','Gym','Health','Personal','Finance','Routine','Custom'));
alter table public.tasks drop constraint if exists tasks_recurrence_check;
alter table public.tasks add constraint tasks_recurrence_check check (recurrence in ('none','daily','weekdays','weekly','monthly','yearly'));

-- ------------------------------------------------------------ preferences
alter table public.user_settings
  add column if not exists calendar_prefs jsonb not null default '{}'::jsonb;  -- {time_format, default_view, default_duration, default_alert, show_weekends, browser_notifications}

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task','study','workout','habit','bill','custom','system','event'));

-- ---------------------------------------------------------- calendar_events
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  location text not null default '' check (char_length(location) <= 200),
  category text not null default 'personal' check (category in ('learning','jobs','fitness','health','finance','routine','personal','custom')),
  category_label text not null default '' check (char_length(category_label) <= 40),   -- the name of a 'custom' category
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  all_day boolean not null default false,
  starts_at timestamptz not null,                 -- first occurrence; all-day = local midnight of the first day in `timezone`
  ends_at timestamptz not null,                   -- exclusive; all-day = local midnight after the last day
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 1 and 64),
  rrule jsonb,                                    -- null = does not repeat; see calendarRecurrence.js for the shape
  alert_minutes integer[] not null default '{}',  -- minutes before the start; at most 5
  goal_id uuid references public.goals(id) on delete set null,                  -- optional links to the record this event is about
  topic_id uuid references public.learning_topics(id) on delete set null,
  application_id uuid references public.job_applications(id) on delete set null,
  routine_id uuid references public.routines(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_range_ck check (ends_at > starts_at),
  constraint calendar_events_alerts_ck check (cardinality(alert_minutes) <= 5 and 0 <= all(alert_minutes) and 40320 >= all(alert_minutes)),
  constraint calendar_events_rrule_ck check (
    rrule is null or (
      jsonb_typeof(rrule) = 'object'
      and coalesce(rrule ->> 'freq', '') in ('daily','weekly','monthly','yearly') -- coalesce: a missing key is NULL, which a CHECK would accept
      and coalesce(rrule ->> 'interval', '1') ~ '^[0-9]{1,3}$'
      and coalesce(rrule ->> 'until', '2000-01-01') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and coalesce(rrule ->> 'count', '1') ~ '^[0-9]{1,4}$'
    )
  )
);
create index if not exists calendar_events_user_start_idx on public.calendar_events (user_id, starts_at);
create index if not exists calendar_events_user_recurring_idx on public.calendar_events (user_id) where rrule is not null;
create index if not exists calendar_events_goal_idx on public.calendar_events (goal_id) where goal_id is not null;
create index if not exists calendar_events_topic_idx on public.calendar_events (topic_id) where topic_id is not null;
create index if not exists calendar_events_application_idx on public.calendar_events (application_id) where application_id is not null;
create index if not exists calendar_events_routine_idx on public.calendar_events (routine_id) where routine_id is not null;

-- ------------------------------------------------- calendar_event_exceptions
-- One row per occurrence that differs from its series. `occurrence_date` is the local date (in the event's timezone) the series generated, so it
-- never changes when the occurrence is moved. NULL columns inherit from the series.
create table if not exists public.calendar_event_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  occurrence_date date not null,
  status text not null default 'modified' check (status in ('modified','cancelled')),
  title text check (title is null or char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  location text check (location is null or char_length(location) <= 200),
  category text check (category is null or category in ('learning','jobs','fitness','health','finance','routine','personal','custom')),
  priority text check (priority is null or priority in ('low','medium','high','urgent')),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  all_day boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  alert_minutes integer[] check (alert_minutes is null or (cardinality(alert_minutes) <= 5 and 0 <= all(alert_minutes) and 40320 >= all(alert_minutes))),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_exceptions_range_ck check ((starts_at is null) = (ends_at is null) and (starts_at is null or ends_at > starts_at))
);
-- One override per occurrence: a second device editing the same occurrence updates this row instead of adding another.
create unique index if not exists calendar_exceptions_occurrence_uq on public.calendar_event_exceptions (event_id, occurrence_date);
create index if not exists calendar_exceptions_user_idx on public.calendar_event_exceptions (user_id);

-- ----------------------------------------------------- triggers, RLS, realtime
do $$
declare t text;
begin
  foreach t in array array['calendar_events','calendar_event_exceptions'] loop
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
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Same-owner guard from 0004: an event can only link to the user's own records, and an exception only to the user's own event.
drop trigger if exists fk_owner on public.calendar_events;
create trigger fk_owner before insert or update on public.calendar_events
  for each row execute function public.check_fk_owner('goal_id', 'goals', 'topic_id', 'learning_topics', 'application_id', 'job_applications', 'routine_id', 'routines');
drop trigger if exists fk_owner on public.calendar_event_exceptions;
create trigger fk_owner before insert or update on public.calendar_event_exceptions
  for each row execute function public.check_fk_owner('event_id', 'calendar_events');


-- ===== 0012_security.sql =====
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


-- ===== 0013_notification_center.sql =====
-- 0013: Smart Notification & Reminder Center. ADDITIVE: new defaulted / nullable columns, two CHECK constraints widened (never narrowed) and two
-- partial indexes, so no existing row changes and running app versions (the mobile app included) keep working.
--
--  * reminders gain a priority and an optional note, and may repeat on weekdays or yearly.
--  * notifications gain a priority, the time the thing was meant to happen (`due_at`, so a late one can be shown as "missed"), and the two states
--    the inbox needs: snoozed (hidden until `snoozed_until`, then back as new) and dismissed (out of the inbox, kept in the history).
--    A notification is "unread" only while it is visible: not dismissed and not snoozed into the future.
--  * notifications.kind gains 'job' and 'goal' (the existing kinds are the categories: task, study, workout, habit, bill, custom, event, system).
--  * user_settings.notification_settings holds quiet hours, desktop notifications and the times of the daily nudges (see packages/core/src/notifications.js).
-- Nothing here is a new table, so row-level security, the owner trigger and the realtime publication from 0003 already cover every new column.

-- --------------------------------------------------------------- reminders
alter table public.reminders
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  add column if not exists body text not null default '' check (char_length(body) <= 500);

alter table public.reminders drop constraint if exists reminders_repeat_check;
alter table public.reminders add constraint reminders_repeat_check
  check (repeat in ('none','daily','weekdays','weekly','monthly','yearly'));

-- ----------------------------------------------------------- notifications
alter table public.notifications
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  add column if not exists due_at timestamptz,          -- when the reminder / event was meant to happen; created_at well after it = missed
  add column if not exists snoozed_until timestamptz,   -- hidden from the inbox until then
  add column if not exists dismissed_at timestamptz;    -- out of the inbox; stays in the history until deleted

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task','study','workout','habit','bill','custom','system','event','job','goal'));

-- The inbox reads "not dismissed, newest first"; the snooze timer reads "snoozed, soonest first". Both stay small however long the history grows.
create index if not exists notifications_inbox_idx on public.notifications (user_id, created_at desc) where dismissed_at is null;
create index if not exists notifications_snoozed_idx on public.notifications (user_id, snoozed_until) where snoozed_until is not null;

-- ------------------------------------------------------------ preferences
alter table public.user_settings
  add column if not exists notification_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(notification_settings) = 'object');  -- {quiet:{enabled,from,to,allow_urgent}, desktop, smart, morning, evening, lead_minutes}
