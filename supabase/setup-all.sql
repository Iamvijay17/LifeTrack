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


-- ===== 0014_device_keys.sql =====
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


-- ===== 0015_module_locks.sql =====
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


-- ===== 0016_task_reschedules.sql =====
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


-- ===== 0017_appearance.sql =====
-- 0017: Appearance — accent colour, text size, spacing, motion and sidebar layout follow the account across devices.
-- ADDITIVE: one jsonb column with an empty default, so every existing row keeps working and the app falls back to its built-in look.
-- user_settings already has row-level security (a person reads and edits only their own row), so no policy changes are needed.
-- Shape (validated in the app, packages/../apps/web/src/lib/appearance.js): {accent, custom_accent, font_size, density, motion, sidebar:{collapsed, order[], pinned[]}}

alter table public.user_settings
  add column if not exists appearance_prefs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(appearance_prefs) = 'object');


-- ===== 0018_consistency.sql =====
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


-- ===== 0019_automation.sql =====
-- 0019: Personal Automation Studio. ADDITIVE and idempotent: two new tables and one new column, nothing existing is altered or rewritten.
--
--  * automation_workflows   a workflow: its name, a graph of nodes and edges (one trigger, conditions, actions: see packages/core/src/automation.js),
--                           whether it is switched on, and when it was (a workflow only reacts to what happens AFTER that moment).
--  * automation_executions  one row per run, the history AND the lock. The unique (workflow, dedupe_key) says "this thing already started a run":
--                           the runner inserts the row FIRST (claim), so two devices, two tabs or a retry can never run the same occurrence twice.
--                           Lifecycle: pending -> running -> completed | failed | skipped. `steps` is the per-node log (what ran, what it did,
--                           the ids it created), so a failed run is retried from the step that failed instead of repeating the ones that worked.
--  * user_settings.automation_prefs   { paused: boolean }: the "pause all automations" switch.
--
-- Deleting a workflow keeps its history (workflow_id becomes null; workflow_name remembers what it was called). Nothing here can delete a
-- user's tasks, goals or habits: the runner only ever inserts, or updates a task/goal the workflow was pointed at.

alter table public.user_settings
  add column if not exists automation_prefs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(automation_prefs) = 'object');

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  enabled boolean not null default false,
  trigger_kind text not null default '' check (char_length(trigger_kind) <= 40),     -- copied from the graph, for the list and for filtering
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb
    check (jsonb_typeof(graph) = 'object' and jsonb_typeof(graph -> 'nodes') = 'array' and jsonb_typeof(graph -> 'edges') = 'array'
           and jsonb_array_length(graph -> 'nodes') <= 30 and jsonb_array_length(graph -> 'edges') <= 90),
  template_key text check (template_key is null or char_length(template_key) <= 60),
  max_runs_per_day int not null default 50 check (max_runs_per_day between 1 and 200),
  activated_at timestamptz,                                                         -- when it was last switched on; null while off
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_workflows_user_idx on public.automation_workflows (user_id, enabled);

create table if not exists public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workflow_id uuid references public.automation_workflows(id) on delete set null,
  workflow_name text not null default '' check (char_length(workflow_name) <= 120),
  trigger_kind text not null default '' check (char_length(trigger_kind) <= 40),
  trigger_info jsonb not null default '{}'::jsonb check (jsonb_typeof(trigger_info) = 'object'),
  status text not null default 'pending' check (status in ('pending','running','completed','failed','skipped')),
  attempt int not null default 1 check (attempt between 1 and 10),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  reason text not null default '' check (char_length(reason) <= 500),               -- why it was skipped
  error text not null default '' check (char_length(error) <= 1000),
  retryable boolean not null default false,                                          -- a temporary failure: the runner tries again by itself
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 300),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_executions_user_idx on public.automation_executions (user_id, created_at desc);
create index if not exists automation_executions_workflow_idx on public.automation_executions (workflow_id, created_at desc);
-- One run per occurrence: the second insert fails with 23505 before anything is done.
create unique index if not exists automation_executions_dedupe_uq on public.automation_executions (user_id, workflow_id, dedupe_key)
  where dedupe_key is not null and workflow_id is not null;

-- ----------------------------------------------------- triggers, RLS, realtime (same as every other table)
do $$
declare t text;
begin
  foreach t in array array['automation_workflows', 'automation_executions'] loop
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

-- A run can only point at the user's own workflow (the same-owner guard from 0004).
drop trigger if exists fk_owner on public.automation_executions;
create trigger fk_owner before insert or update on public.automation_executions
  for each row execute function public.check_fk_owner('workflow_id', 'automation_workflows');


-- ===== 0020_life_map.sql =====
-- 0020: Life Map. ADDITIVE and idempotent: nothing existing is altered except for four small clean-up triggers (below).
--
-- The Life Map draws goals, milestones, habits and tasks that already exist, so it stores only what is new:
--   life_map_nodes      "custom" nodes with no other home (a project, an area of life)
--   life_map_links      "A contributes to B" between ANY two nodes
--   life_map_positions  where each node was left on the canvas (the saved layout)
-- A node is named by a key `kind:uuid` (e.g. `goal:3f2a...`). Keys point at rows in different tables, so they cannot be foreign keys; the
-- clean-up triggers at the bottom delete a record's links and position when the record is deleted, so nothing dangles.

create table if not exists public.life_map_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('project','area')),
  title text not null check (char_length(title) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 1000),
  category text not null default 'Personal' check (category in ('Learning','Career','Fitness','Health','Finance','Personal')),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default 'active' check (status in ('active','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists life_map_nodes_user_idx on public.life_map_nodes (user_id, kind);

create table if not exists public.life_map_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_key text not null check (from_key ~ '^(goal|habit|task|milestone|project|area):[0-9a-fA-F-]{8,40}$'),
  to_key text not null check (to_key ~ '^(goal|habit|task|milestone|project|area):[0-9a-fA-F-]{8,40}$'),
  label text not null default '' check (char_length(label) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_map_links_distinct_ck check (from_key <> to_key),
  constraint life_map_links_uq unique (user_id, from_key, to_key)   -- the same two items can only be connected once, in one direction
);
create index if not exists life_map_links_to_idx on public.life_map_links (user_id, to_key);
create index if not exists life_map_links_from_idx on public.life_map_links (user_id, from_key);

create table if not exists public.life_map_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  node_key text not null check (node_key ~ '^(goal|habit|task|milestone|project|area):[0-9a-fA-F-]{8,40}$'),
  x real not null check (x between -100000 and 100000),
  y real not null check (y between -100000 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_map_positions_uq unique (user_id, node_key)      -- one saved place per node; the unique index also serves the lookup
);

-- ----------------------------------------------------- triggers, RLS, realtime (same as every other table)
do $$
declare t text;
begin
  foreach t in array array['life_map_nodes','life_map_links','life_map_positions'] loop
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

-- ----------------------------------------------------- clean-up when a record is deleted
-- Runs as the person deleting (RLS applies), and only touches their own rows. Trigger argument = the node kind.
create or replace function public.life_map_forget() returns trigger
language plpgsql as $$
declare k text := tg_argv[0] || ':' || old.id::text;
begin
  delete from public.life_map_links where user_id = old.user_id and (from_key = k or to_key = k);
  delete from public.life_map_positions where user_id = old.user_id and node_key = k;
  return old;
end $$;

do $$
declare r record;
begin
  for r in select * from (values ('goals','goal'),('habits','habit'),('tasks','task'),('milestones','milestone'),('life_map_nodes','project')) as v(tbl, kind) loop
    if r.tbl = 'life_map_nodes' then
      -- a custom node's kind is stored on the row, so it needs both spellings
      execute 'drop trigger if exists life_map_forget on public.life_map_nodes';
      execute 'create trigger life_map_forget after delete on public.life_map_nodes for each row when (old.kind = ''project'') execute function public.life_map_forget(''project'')';
      execute 'drop trigger if exists life_map_forget_area on public.life_map_nodes';
      execute 'create trigger life_map_forget_area after delete on public.life_map_nodes for each row when (old.kind = ''area'') execute function public.life_map_forget(''area'')';
    else
      execute format('drop trigger if exists life_map_forget on public.%I', r.tbl);
      execute format('create trigger life_map_forget after delete on public.%I for each row execute function public.life_map_forget(%L)', r.tbl, r.kind);
    end if;
  end loop;
end $$;


-- ===== 0021_audit_fixes.sql =====
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


-- ===== 0022_global_search.sql =====
-- 0022: Global search. ADDITIVE and idempotent: one function and a few indexes; no table, column or row is altered or dropped.
--
-- public.global_search(...) looks for text in the person's own tasks, goals, habits, transactions, workouts, study sessions, calendar events,
-- notes, journal, job applications, reminders, food log and learning topics in ONE round trip, ranks the hits, applies the filters and returns
-- one page plus the total. It is SECURITY INVOKER, so row-level security (including the module locks of 0015) decides what it can see; the
-- explicit `user_id = auth.uid()` on every branch is a second guard and lets the planner use each table's (user_id, …) index.
-- The ranking mirrors packages/core/src/globalSearch.js (rankOf), which the in-browser dev backend uses.

-- Trigram indexes make "contains" searches on the text columns fast once a person has many rows. pg_trgm is optional: where it cannot be
-- installed (a plain Postgres, the test database) the search still works, using each table's (user_id, …) index and a scan of that one person's rows.
do $$
begin
  create extension if not exists pg_trgm with schema extensions;
exception when others then
  raise notice 'pg_trgm is not available (%): global search works without its indexes', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists tasks_title_trgm_idx on public.tasks using gin (lower(title) extensions.gin_trgm_ops)';
    execute 'create index if not exists notes_title_trgm_idx on public.notes using gin (lower(title) extensions.gin_trgm_ops)';
    execute 'create index if not exists notes_body_trgm_idx on public.notes using gin (lower(body) extensions.gin_trgm_ops)';
    execute 'create index if not exists goals_title_trgm_idx on public.goals using gin (lower(title) extensions.gin_trgm_ops)';
    execute 'create index if not exists calendar_events_title_trgm_idx on public.calendar_events using gin (lower(title) extensions.gin_trgm_ops)';
    execute 'create index if not exists transactions_note_trgm_idx on public.transactions using gin (lower(note) extensions.gin_trgm_ops)';
    execute 'create index if not exists food_logs_name_trgm_idx on public.food_logs using gin (lower(name) extensions.gin_trgm_ops)';
  end if;
end $$;

-- "Newest first" and the date filter read the latest rows of one person; these cover the tables that had no (user_id, date) index of their own.
create index if not exists tasks_user_updated_idx on public.tasks (user_id, updated_at desc);
create index if not exists goals_user_updated_idx on public.goals (user_id, updated_at desc);
create index if not exists habits_user_updated_idx on public.habits (user_id, updated_at desc);
create index if not exists journal_user_date_idx on public.journal_entries (user_id, entry_date desc);
create index if not exists reminders_user_updated_idx on public.reminders (user_id, updated_at desc);
create index if not exists food_logs_user_date_idx on public.food_logs (user_id, log_date desc);
create index if not exists topics_user_updated_idx on public.learning_topics (user_id, updated_at desc);

create or replace function public.global_search(
  p_terms    text[] default '{}',
  p_modules  text[] default null,
  p_from     date default null,
  p_to       date default null,
  p_status   text[] default null,
  p_category text[] default null,
  p_priority text[] default null,
  p_sort     text default 'relevance',
  p_limit    int default 20,
  p_offset   int default 0
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_terms  text[];
  v_pat    text[];
  v_q      text;
  v_qpat   text;
  v_limit  int := least(50, greatest(1, coalesce(p_limit, 20)));
  v_offset int := least(10000, greatest(0, coalesce(p_offset, 0)));
  v_sort   text := case when p_sort in ('relevance', 'newest', 'oldest') then p_sort else 'relevance' end;
  v_out    jsonb;
begin
  if v_uid is null then raise exception 'Not signed in.' using errcode = '28000'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    return public.global_search(p_terms, p_modules, p_to, p_from, p_status, p_category, p_priority, p_sort, p_limit, p_offset);
  end if;

  -- At most 8 terms of at most 100 characters, lower-cased, in the order typed without repeats. A term is looked for as plain text:
  -- the characters % _ and \ are escaped so they cannot act as wildcards.
  select coalesce(array_agg(f.t order by f.n), '{}') into v_terms
    from (select e.t, e.n
            from (select distinct on (d.t) d.t, d.n
                    from (select lower(left(btrim(u.x), 100)) as t, u.n
                            from unnest(coalesce(p_terms, '{}')) with ordinality as u(x, n) where btrim(u.x) <> '') d
                   order by d.t, d.n) e
           order by e.n limit 8) f;
  select coalesce(array_agg('%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%'), '{}') into v_pat from unnest(v_terms) t;
  v_q := array_to_string(v_terms, ' ');
  v_qpat := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  with src as (
    select 'task'::text as kind, 'planner'::text as module, t.id, t.title as title, t.notes as body, t.status as status, t.category as category,
           t.priority as priority, t.due_date as day, t.updated_at
      from public.tasks t where t.user_id = v_uid and (p_modules is null or 'planner' = any (p_modules))
    union all
    select 'goal', 'goals', g.id, g.title, g.notes, g.status, g.category, null, g.due_date, g.updated_at
      from public.goals g where g.user_id = v_uid and (p_modules is null or 'goals' = any (p_modules))
    union all
    select 'habit', 'habits', h.id, h.name, h.description, case when h.archived_at is null then 'active' else 'archived' end, null, null,
           h.start_date, h.updated_at
      from public.habits h where h.user_id = v_uid and (p_modules is null or 'habits' = any (p_modules))
    union all
    select 'transaction', 'finance', x.id, coalesce(nullif(x.note, ''), x.category), x.category || ' ' || x.note, x.type, x.category, null,
           x.txn_date, x.updated_at
      from public.transactions x where x.user_id = v_uid and (p_modules is null or 'finance' = any (p_modules))
    union all
    select 'workout', 'fitness', w.id, w.name, w.notes, w.status, w.kind, null, w.workout_date, w.updated_at
      from public.workouts w where w.user_id = v_uid and (p_modules is null or 'fitness' = any (p_modules))
    union all
    select 'study', 'learning', s.id, coalesce(lt.name, sg.title, 'Study session'), s.notes, s.status, s.source, null, s.session_date, s.updated_at
      from public.study_sessions s
      left join public.learning_topics lt on lt.id = s.topic_id and lt.user_id = v_uid
      left join public.goals sg on sg.id = s.goal_id and sg.user_id = v_uid
     where s.user_id = v_uid and (p_modules is null or 'learning' = any (p_modules))
    union all
    select 'event', 'calendar', e.id, e.title, e.description || ' ' || e.location, null, e.category, e.priority,
           (e.starts_at at time zone e.timezone)::date, e.updated_at
      from public.calendar_events e where e.user_id = v_uid and (p_modules is null or 'calendar' = any (p_modules))
    union all
    select 'note', 'notes', n.id, coalesce(nullif(n.title, ''), nullif(left(n.body, 60), ''), 'Untitled note'),
           n.body || ' ' || array_to_string(n.tags, ' '), case when n.pinned then 'pinned' end, n.category, null,
           (n.updated_at at time zone 'UTC')::date, n.updated_at
      from public.notes n where n.user_id = v_uid and (p_modules is null or 'notes' = any (p_modules))
    union all
    select 'journal', 'notes', j.id, 'Journal — ' || j.entry_date::text, j.content || ' ' || j.wins, null, null, null, j.entry_date, j.updated_at
      from public.journal_entries j where j.user_id = v_uid and (p_modules is null or 'notes' = any (p_modules))
    union all
    select 'application', 'jobs', a.id, a.company || ' — ' || a.job_title, a.location || ' ' || a.source || ' ' || a.notes, a.status, null, null,
           coalesce(a.applied_date, (a.created_at at time zone 'UTC')::date), a.updated_at
      from public.job_applications a where a.user_id = v_uid and (p_modules is null or 'jobs' = any (p_modules))
    union all
    select 'reminder', 'notifications', r.id, r.title, r.kind, case when r.active then 'active' else 'off' end, r.kind, null, r.remind_date, r.updated_at
      from public.reminders r where r.user_id = v_uid and (p_modules is null or 'notifications' = any (p_modules))
    union all
    select 'food', 'nutrition', f.id, f.name, f.variant || ' ' || f.notes, f.meal_type, f.category, null, f.log_date, f.updated_at
      from public.food_logs f where f.user_id = v_uid and (p_modules is null or 'nutrition' = any (p_modules))
    union all
    select 'topic', 'learning', l.id, l.name, l.notes, case when l.archived then 'archived' else 'active' end, l.group_name, null,
           (l.created_at at time zone 'UTC')::date, l.updated_at
      from public.learning_topics l where l.user_id = v_uid and (p_modules is null or 'learning' = any (p_modules))
  ),
  hits as (
    select s.*,
           case
             when cardinality(v_terms) = 0 then 0
             when lower(s.title) = v_q then 100
             when lower(s.title) like v_qpat || '%' then 85
             when ' ' || lower(s.title) like '% ' || v_qpat || '%' then 70
             when lower(s.title) like '%' || v_qpat || '%' then 55
             when not exists (select 1 from unnest(v_pat) p where lower(s.title) not like p) then 40
             else 20
           end as rank
      from src s
     where (cardinality(v_terms) = 0
            or not exists (select 1 from unnest(v_pat) p where lower(s.title) not like p and lower(s.body) not like p))
       and (p_from is null or s.day >= p_from)
       and (p_to is null or s.day <= p_to)
       and (p_status is null or s.status = any (p_status))
       and (p_category is null or s.category = any (p_category))
       and (p_priority is null or s.priority = any (p_priority))
  ),
  ordered as (
    select h.*, regexp_replace(h.body, '\s+', ' ', 'g') as cb,
           row_number() over (
             order by
               case when v_sort = 'relevance' and cardinality(v_terms) > 0 then h.rank end desc nulls last,
               case when v_sort = 'oldest' then coalesce(h.day::timestamptz, h.updated_at) end asc nulls last,
               coalesce(h.day::timestamptz, h.updated_at) desc,
               h.id) as rn
      from hits h
  )
  select jsonb_build_object(
           'total', (select count(*) from hits),
           'rows', coalesce(jsonb_agg(jsonb_build_object(
             'kind', o.kind, 'id', o.id, 'title', o.title, 'status', o.status, 'category', o.category, 'priority', o.priority,
             'day', o.day, 'updated_at', o.updated_at, 'rank', o.rank,
             'snippet', case
               when btrim(o.cb) = '' then ''
               when cardinality(v_terms) > 0 and position(v_terms[1] in lower(o.cb)) > 50
                 then '…' || substr(o.cb, position(v_terms[1] in lower(o.cb)) - 50, 160)
               else left(o.cb, 160)
             end) order by o.rn), '[]'::jsonb))
    into v_out
    from ordered o
   where o.rn > v_offset and o.rn <= v_offset + v_limit;
  return v_out;
end $$;
revoke all on function public.global_search(text[], text[], date, date, text[], text[], text[], text, int, int) from public, anon;
grant execute on function public.global_search(text[], text[], date, date, text[], text[], text[], text, int, int) to authenticated;


-- ===== 0023_challenges.sql =====
-- 0023: Personal Challenge Center. ADDITIVE and idempotent: nothing existing is altered.
--
--  * challenges           a dated goal with a rhythm: daily (X every day), weekly (X days a week) or total (reach N units by the end date).
--                         `pauses` holds the paused windows ([{from,to|null}]); days inside one are neutral, exactly like a habit's rest days.
--                         `habit_id` optionally lends an existing habit's check-ins, so nothing is logged twice.
--  * challenge_checkins   one row per challenge per DAY (unique), with an amount, an optional note and up to five evidence links.
--  * challenge_templates  the user's own reusable challenge definitions (built-in templates live in code).
--
-- Dates are plain days in the person's own timezone (user_settings.timezone). The check-in guard below uses that same zone, so a check-in made
-- "today" in Chennai at 01:00 is today for the database too, whatever time the server's clock shows.

create table if not exists public.challenge_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  kind text not null default 'daily' check (kind in ('daily','weekly','total')),
  target integer not null default 1 check (target between 1 and 10000000),
  unit text not null default '' check (char_length(unit) <= 30),
  duration_days integer not null default 30 check (duration_days between 1 and 731),
  category text not null default 'Personal' check (char_length(category) between 1 and 40),
  color text not null default '#8B5CF6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  milestones jsonb not null default '[]'::jsonb check (jsonb_typeof(milestones) = 'array' and jsonb_array_length(milestones) <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenge_templates_weekly_ck check (kind <> 'weekly' or target <= 7)
);
create index if not exists challenge_templates_user_idx on public.challenge_templates (user_id, created_at);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  kind text not null default 'daily' check (kind in ('daily','weekly','total')),
  target integer not null default 1 check (target between 1 and 10000000),
  unit text not null default '' check (char_length(unit) <= 30),
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  category text not null default 'Personal' check (char_length(category) between 1 and 40),
  color text not null default '#8B5CF6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  habit_id uuid references public.habits(id) on delete set null,
  template_key text check (template_key is null or char_length(template_key) <= 60),
  milestones jsonb not null default '[]'::jsonb check (jsonb_typeof(milestones) = 'array' and jsonb_array_length(milestones) <= 10),
  pauses jsonb not null default '[]'::jsonb check (jsonb_typeof(pauses) = 'array' and jsonb_array_length(pauses) <= 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  completed_at timestamptz,
  cancelled_at timestamptz,
  final_pct smallint check (final_pct is null or final_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenges_dates_ck check (end_date >= start_date and end_date - start_date <= 730),
  constraint challenges_weekly_ck check (kind <> 'weekly' or target <= 7),
  -- a habit is a once-a-day yes/no, so it can only stand in for a daily or weekly challenge, never for a unit total
  constraint challenges_habit_ck check (habit_id is null or kind <> 'total')
);
create index if not exists challenges_user_status_idx on public.challenges (user_id, status, end_date);
create index if not exists challenges_habit_idx on public.challenges (habit_id) where habit_id is not null;

create table if not exists public.challenge_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  checkin_date date not null,
  amount integer not null default 1 check (amount between 1 and 10000000),
  note text not null default '' check (char_length(note) <= 500),
  -- up to five {label,url} links; only http(s) addresses are accepted, so a stored link can never be a script URL
  evidence jsonb not null default '[]'::jsonb check (
    jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 5 and octet_length(evidence::text) <= 4000
    and not jsonb_path_exists(evidence, '$[*] ? (!(@.url like_regex "^https?://[^ ]+$"))')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- THE duplicate guard: two taps, two tabs or two devices can never leave two check-ins for one day.
  constraint challenge_checkins_day_uq unique (challenge_id, checkin_date)
);
create index if not exists challenge_checkins_user_idx on public.challenge_checkins (user_id, checkin_date);

-- ----------------------------------------------------- the check-in guard
-- A check-in belongs inside its challenge's dates and cannot be for a day that has not started yet IN THE PERSON'S TIMEZONE.
create or replace function public.challenge_checkin_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  c record;
  tz text;
  today date;
begin
  if tg_op = 'UPDATE' and new.challenge_id = old.challenge_id and new.checkin_date = old.checkin_date then
    return new; -- only the amount, note or evidence changed
  end if;
  select start_date, end_date into c from public.challenges where id = new.challenge_id;
  if not found then
    raise exception 'That challenge could not be found.' using errcode = '23503';
  end if;
  select timezone into tz from public.user_settings where user_id = new.user_id;
  begin
    today := (now() at time zone coalesce(tz, 'Asia/Kolkata'))::date;
  exception when others then
    today := (now() at time zone 'UTC')::date;
  end;
  if new.checkin_date > today then
    raise exception 'You cannot check in for a day that has not started yet.' using errcode = '23514';
  end if;
  if new.checkin_date < c.start_date or new.checkin_date > c.end_date then
    raise exception 'That day is outside the challenge dates.' using errcode = '23514';
  end if;
  return new;
end $$;

-- ----------------------------------------------------- triggers, RLS, realtime (same as every other table)
drop trigger if exists fk_owner on public.challenges;
create trigger fk_owner before insert or update on public.challenges
  for each row execute function public.check_fk_owner('habit_id', 'habits');
drop trigger if exists fk_owner on public.challenge_checkins;
create trigger fk_owner before insert or update on public.challenge_checkins
  for each row execute function public.check_fk_owner('challenge_id', 'challenges');
-- named so that it fires AFTER fk_owner (triggers run alphabetically): a challenge that is not yours is reported as "does not belong to this user"
drop trigger if exists guard_checkin on public.challenge_checkins;
create trigger guard_checkin before insert or update on public.challenge_checkins
  for each row execute function public.challenge_checkin_guard();

do $$
declare t text;
begin
  foreach t in array array['challenge_templates','challenges','challenge_checkins'] loop
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


-- ===== 0024_onboarding.sql =====
-- 0024: Onboarding, guided tours and first-use hints — progress follows the account across devices.
-- ADDITIVE: one jsonb column with an empty default, so every existing row keeps working (an empty object means "not decided yet").
-- user_settings already has row-level security (a person reads and edits only their own row), so no policy changes are needed.
-- Shape (validated in the app, apps/web/src/lib/onboarding.js): {status, step, answers{}, tours{key: 'done'|'skipped'}, offered{key: true}}

alter table public.user_settings
  add column if not exists onboarding_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(onboarding_state) = 'object');


-- ===== 0025_profile_avatar.sql =====
-- 0025: Profile photo. A small picture (the app shrinks it to ~160 px before saving) kept on the person's own profile row.
-- ADDITIVE: one nullable column. It lives on `profiles`, not in the auth user's metadata, because user metadata is copied into every access
-- token and a picture there would make each request header huge. profiles already has row-level security (a person reads and edits only their own row).
-- Only an inline image data URL of reasonable size is accepted.

alter table public.profiles
  add column if not exists avatar text
    check (avatar is null or (length(avatar) <= 60000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));


-- ===== 0026_integrations.sql =====
-- 0026: Integration Center (Google Calendar, Google Drive). ADDITIVE: three new tables, nothing existing is altered.
--
--  * integrations        one row per person per provider: status, granted scopes, which account, last sync. The app can READ its own rows; only the
--                        server (the `google-integration` Edge Function, service role) writes them, so a page can never mark itself "connected".
--  * integration_events  the activity history shown in the Integration Center (connected, synced, failed, revoked, disconnected). Readable by its owner,
--                        written by the server only. Messages never hold tokens or file contents.
--  * integration_tokens  the OAuth refresh/access tokens. RLS is on with NO policies and every client role is revoked: they cannot be read or written
--                        from the browser or the app, with or without a valid sign-in. Only the Edge Function (service role) touches them.
-- Disconnecting deletes the token row (after the function revokes it at Google). Deleting the account cascades through all three.

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'google_drive')),
  status text not null default 'connected' check (status in ('connected', 'revoked', 'error')),
  scopes text[] not null default '{}',
  account_email text not null default '' check (char_length(account_email) <= 320),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text not null default '' check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'google_drive')),
  kind text not null check (kind in ('connected', 'synced', 'backup', 'restore', 'error', 'revoked', 'disconnected', 'conflict')),
  message text not null default '' check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists integration_events_user_idx on public.integration_events (user_id, created_at desc);

create table if not exists public.integration_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'google_drive')),
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

do $$
declare t text;
begin
  foreach t in array array['integrations', 'integration_events', 'integration_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
  -- The two readable tables: SELECT for the owner only, no insert / update / delete from any client.
  foreach t in array array['integrations', 'integration_events'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "owner_read" on public.%I', t);
    execute format('create policy "owner_read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['integrations', 'integration_tokens'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Calendar sync keeps a link from a LifeTrack event to its Google copy, so an event is never created twice and a change is recognised as one.
-- All three are NULL for every existing and every unsynced event.
alter table public.calendar_events add column if not exists external_provider text check (external_provider is null or external_provider = 'google_calendar');
alter table public.calendar_events add column if not exists external_id text check (external_id is null or char_length(external_id) <= 1024);
-- The fingerprint of the event as it was when both sides last agreed. A difference from it on one side means that side changed; on both, a conflict.
alter table public.calendar_events add column if not exists external_hash text check (external_hash is null or char_length(external_hash) <= 64);
create unique index if not exists calendar_events_external_uq on public.calendar_events (user_id, external_provider, external_id) where external_id is not null;


-- ===== 0027_platform.sql =====
-- lifetrack:allow-destructive the-word-TRUNCATE-appears-only-in-a-trigger-that-BLOCKS-truncating-audit_events-nothing-is-dropped-or-deleted
-- 0027: Platform infrastructure: audit history, system health, API keys and webhooks, saved reports. ADDITIVE and idempotent: new tables, new functions,
-- new triggers (AFTER row triggers that only ever INSERT into the new tables) and one new column (user_settings.report_prefs). No existing row,
-- column, policy or function is altered or dropped. Needs 0012 (app lock) and 0015 (module locks): run in order.
--
--  1. AUDIT HISTORY   audit_events is APPEND-ONLY. A trigger on every user-data table writes who/what/when and the changed fields (old and new values).
--                     Nothing writes it from a browser: the table has SELECT for its owner only, and a guard trigger rejects UPDATE and DELETE for every
--                     role (only the retention job and the owner's own "erase my audit history" action, which leaves a tombstone, may remove rows).
--                     Each event carries a hash that chains to the previous event of the same person, so an edit or a gap is detectable (audit_verify_chain).
--                     Events of a locked module (Finance, Notes, …) are unreadable while that module is locked, like the module's own rows.
--                     audit_restore() previews and applies a restore (revert an update, re-create a deleted record) with conflict detection.
--  2. SYSTEM HEALTH   app_errors (deduplicated frontend/sync errors), request_metrics (hourly API aggregates), job_runs, platform_admins and the
--                     admin_system_* functions. Only people listed in platform_admins can call the admin functions; nobody can read these tables directly.
--  3. API + WEBHOOKS  api_keys (SHA-256 hash only; the key is shown once, at creation), api_request_log, rate_windows, webhook_endpoints, webhook_secrets
--                     (no client access), webhook_deliveries, webhook_attempts. Domain-event triggers enqueue deliveries; the `webhook-dispatch` Edge Function
--                     sends them. A failure in the enqueue trigger can never block the write that caused it.
--  4. REPORTS         user_settings.report_prefs (saved report configurations).

do $$
begin
  if to_regclass('public.user_security') is null or to_regprocedure('public.module_session_open(text, boolean)') is null then
    raise exception 'Run 0012_security.sql and 0015_module_locks.sql first.';
  end if;
end $$;

-- =============================================================================================================================== helpers
-- Keys whose values must never be copied into a log: credentials and tokens. Long text is cut (and flagged) so one note cannot bloat the log.
create or replace function public._redact(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string' and length(value #>> '{}') > 4000 then to_jsonb(left(value #>> '{}', 4000)) else value end), '{}'::jsonb)
  from jsonb_each(coalesce(j, '{}'::jsonb))
  where key !~* '(password|passwd|secret|token|api_?key|private_?key|credential|pin_hash|(^|_)hash$)' or key = 'external_hash'
$$;
create or replace function public._has_long_text(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select exists (select 1 from jsonb_each(coalesce(j, '{}'::jsonb)) where jsonb_typeof(value) = 'string' and length(value #>> '{}') > 4000)
$$;
-- A short, human label for a record (a title, a name, …).
create or replace function public._record_label(j jsonb) returns text
language sql immutable set search_path = '' as $$
  select left(coalesce(nullif(j ->> 'title', ''), nullif(j ->> 'name', ''), nullif(j ->> 'exercise_name', ''), nullif(j ->> 'company', ''),
    nullif(j ->> 'description', ''), nullif(j ->> 'note', ''), nullif(j ->> 'category', ''), nullif(j ->> 'log_date', ''), nullif(j ->> 'txn_date', ''), ''), 200)
$$;
-- The request's headers as PostgREST exposes them (null outside an HTTP request: a migration, a cron job, a test).
create or replace function public._request_headers() returns jsonb
language plpgsql stable set search_path = '' as $$
declare h text := current_setting('request.headers', true);
begin
  if h is null or h = '' then return null; end if;
  return h::jsonb;
exception when others then return null;
end $$;
-- Coarse network location only: the last IPv4 octet / the last 80 bits of an IPv6 address are dropped (enough to spot an odd location, not to identify a device).
-- A fixed text form of a timestamp (UTC, microseconds) so a hash does not depend on the session's TimeZone setting.
create or replace function public._ts(t timestamptz) returns text
language sql immutable set search_path = '' as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') $$;
create or replace function public._ip_prefix(h jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare raw text := split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'cf-connecting-ip', ''), ',', 1); ip inet;
begin
  raw := btrim(raw);
  if raw = '' then return null; end if;
  ip := raw::inet;
  return case when family(ip) = 4 then host(network(set_masklen(ip, 24))) || '/24' else host(network(set_masklen(ip, 48))) || '/48' end;
exception when others then return null;
end $$;

-- =============================================================================================================================== 1. audit
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  action text not null check (action in ('create', 'update', 'delete', 'restore', 'import', 'export', 'login', 'logout', 'permission', 'config', 'security')),
  operation text check (operation is null or operation in ('insert', 'update', 'delete')),
  entity text not null check (entity ~ '^[a-z][a-z0-9_.]{0,59}$'),
  record_id text check (record_id is null or char_length(record_id) <= 64),
  summary text not null default '' check (char_length(summary) <= 200),
  changed_fields text[] not null default '{}',
  old_values jsonb check (old_values is null or jsonb_typeof(old_values) = 'object'),
  new_values jsonb check (new_values is null or jsonb_typeof(new_values) = 'object'),
  truncated boolean not null default false,
  request_id text check (request_id is null or char_length(request_id) <= 64),
  source text not null default 'web' check (source in ('web', 'mobile', 'api', 'job', 'database')),
  ip_prefix text check (ip_prefix is null or char_length(ip_prefix) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 255),
  restored_from uuid,
  prev_hash text,
  hash text not null
);
create index if not exists audit_events_user_time_idx on public.audit_events (user_id, occurred_at desc, seq desc);
create index if not exists audit_events_user_entity_idx on public.audit_events (user_id, entity, occurred_at desc);
create index if not exists audit_events_user_record_idx on public.audit_events (user_id, entity, record_id);
create index if not exists audit_events_occurred_idx on public.audit_events (occurred_at);

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on public.audit_events from public, anon, authenticated;
grant select on public.audit_events to authenticated;
drop policy if exists "owner_read" on public.audit_events;
create policy "owner_read" on public.audit_events for select to authenticated using (user_id = (select auth.uid()));

-- Which module does an entity belong to? A locked module's history is closed with it (same lists as 0015).
create or replace function public._audit_gate(p_entity text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_entity in ('transactions', 'budgets', 'savings_goals', 'recurring_rules') then public.module_session_open('finance', true)
    when p_entity in ('notes', 'journal_entries') then public.module_session_open('notes', true)
    when p_entity in ('health_logs', 'body_measurements') then public.module_session_open('health', false)
    when p_entity in ('workouts', 'exercise_logs') then public.module_session_open('fitness', false)
    when p_entity in ('food_logs', 'nutrition_settings', 'water_logs') then public.module_session_open('nutrition', false)
    when p_entity in ('job_applications', 'application_history', 'interview_events') then public.module_session_open('jobs', false)
    else true end
$$;
drop policy if exists "module_gate" on public.audit_events;
create policy "module_gate" on public.audit_events as restrictive for select to authenticated using ((select public._audit_gate(entity)));

-- Append-only: no UPDATE, no DELETE, for any role, unless a maintenance function switched the guard off for its own transaction, or the person's whole
-- account is being deleted (the cascade from auth.users).
create or replace function public._audit_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('lifetrack.audit_maintenance', true) = 'on' then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then return old; end if;
  raise exception 'The audit log is append-only.' using errcode = '42501';
end $$;
drop trigger if exists audit_events_guard on public.audit_events;
create trigger audit_events_guard before update or delete on public.audit_events for each row execute function public._audit_guard();
create or replace function public._audit_guard_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('lifetrack.audit_maintenance', true) = 'on' then return null; end if;
  raise exception 'The audit log is append-only.' using errcode = '42501';
end $$;
drop trigger if exists audit_events_guard_truncate on public.audit_events;
create trigger audit_events_guard_truncate before truncate on public.audit_events for each statement execute function public._audit_guard_truncate();

-- The only way an event is written. Chains each event to the previous one of the same person (serialised per person, so two writes cannot fork the chain).
create or replace function public._audit_insert(
  p_user uuid, p_action text, p_operation text, p_entity text, p_record text, p_summary text, p_fields text[], p_old jsonb, p_new jsonb,
  p_truncated boolean, p_restored_from uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  h jsonb := public._request_headers();
  v_id uuid := gen_random_uuid(); v_at timestamptz := clock_timestamp(); v_prev text; v_hash text; v_source text; v_req text;
begin
  perform pg_advisory_xact_lock(hashtextextended('audit:' || p_user::text, 0));
  select e.hash into v_prev from public.audit_events e where e.user_id = p_user order by e.seq desc limit 1;
  v_source := case lower(coalesce(h ->> 'x-lifetrack-source', current_setting('lifetrack.source', true), ''))
    when 'mobile' then 'mobile' when 'api' then 'api' when 'job' then 'job' when 'web' then 'web'
    else case when h is null then 'database' else 'web' end end;
  v_req := left(coalesce(nullif(h ->> 'x-request-id', ''), nullif(h ->> 'x-correlation-id', ''), nullif(current_setting('lifetrack.request_id', true), '')), 64);
  v_hash := encode(extensions.digest(
    coalesce(v_prev, '') || '|' || v_id || '|' || p_user || '|' || p_action || '|' || p_entity || '|' || coalesce(p_record, '') || '|' || public._ts(v_at) || '|'
      || coalesce(p_old::text, '') || '|' || coalesce(p_new::text, ''), 'sha256'), 'hex');
  insert into public.audit_events (id, user_id, occurred_at, action, operation, entity, record_id, summary, changed_fields, old_values, new_values, truncated,
                                   request_id, source, ip_prefix, user_agent, restored_from, prev_hash, hash)
  values (v_id, p_user, v_at, p_action, p_operation, p_entity, p_record, left(coalesce(p_summary, ''), 200), coalesce(p_fields, '{}'), p_old, p_new, p_truncated,
          v_req, v_source, public._ip_prefix(h), left(h ->> 'user-agent', 255), p_restored_from, v_prev, v_hash);
  return v_id;
end $$;

-- The row trigger. Fails closed: if the event cannot be written, neither can the change.
create or replace function public.audit_capture() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_user uuid := (v_row ->> 'user_id')::uuid;
  v_restore uuid := nullif(current_setting('lifetrack.audit_restore', true), '')::uuid;
  v_fields text[]; v_diff_old jsonb; v_diff_new jsonb; v_trunc boolean;
  v_action text;
begin
  if v_user is null or not exists (select 1 from auth.users u where u.id = v_user) then return null; end if; -- account being deleted: nothing to keep
  v_action := case when v_restore is not null then 'restore'
                   when tg_table_name = 'user_settings' then 'config'
                   when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end;
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key), jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
      into v_fields, v_diff_old, v_diff_new
      from jsonb_each(v_new) n left join jsonb_each(v_old) o on o.key = n.key
      where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_fields is null then return null; end if; -- only updated_at moved: nothing happened
    v_trunc := public._has_long_text(v_diff_old) or public._has_long_text(v_diff_new);
    perform public._audit_insert(v_user, v_action, 'update', tg_table_name, v_row ->> 'id', public._record_label(v_new), v_fields,
      public._redact(v_diff_old), public._redact(v_diff_new), v_trunc, v_restore);
  elsif tg_op = 'INSERT' then
    perform public._audit_insert(v_user, v_action, 'insert', tg_table_name, v_row ->> 'id', public._record_label(v_new), '{}',
      null, public._redact(v_new), public._has_long_text(v_new), v_restore);
  else
    perform public._audit_insert(v_user, v_action, 'delete', tg_table_name, v_row ->> 'id', public._record_label(v_old), '{}',
      public._redact(v_old), null, public._has_long_text(v_old), v_restore);
  end if;
  return null;
end $$;
revoke all on function public.audit_capture() from public, anon, authenticated;

-- Which tables are audited (user-created data and settings; not secrets, tokens, notifications or high-volume logs).
create or replace function public._audit_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['learning_topics', 'goals', 'tasks', 'habits', 'habit_logs', 'study_sessions', 'job_applications', 'interview_events', 'exercises', 'routines',
    'workouts', 'exercise_logs', 'body_measurements', 'health_logs', 'foods', 'food_logs', 'recurring_rules', 'transactions', 'budgets', 'journal_entries',
    'milestones', 'notes', 'savings_goals', 'reminders', 'calendar_events', 'challenges', 'automation_workflows', 'user_settings']
$$;
do $$
declare t text;
begin
  foreach t in array public._audit_tables() loop
    continue when to_regclass(format('public.%I', t)) is null;
    execute format('drop trigger if exists audit_capture on public.%I', t);
    execute format('create trigger audit_capture after insert or update or delete on public.%I for each row execute function public.audit_capture()', t);
  end loop;
end $$;

-- Events the app reports about itself (sign-in, export, import, security changes). Only these actions and only a small, credential-free payload.
create or replace function public.log_audit_event(p_action text, p_entity text, p_summary text default '', p_meta jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_meta jsonb := public._redact(case when jsonb_typeof(p_meta) = 'object' then p_meta else '{}'::jsonb end);
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_action not in ('import', 'export', 'login', 'logout', 'permission', 'config', 'security') then raise exception 'Unknown audit action.' using errcode = '22023'; end if;
  if p_entity is null or p_entity !~ '^[a-z][a-z0-9_.]{0,59}$' then raise exception 'Invalid audit entity.' using errcode = '22023'; end if;
  if octet_length(v_meta::text) > 2000 then v_meta := '{}'::jsonb; end if;
  -- cheap flood guard: at most 60 reported events per minute per person
  if (select count(*) from public.audit_events e where e.user_id = v_uid and e.occurred_at > now() - interval '1 minute' and e.operation is null) >= 60 then
    raise exception 'Too many events.' using errcode = '54000';
  end if;
  return public._audit_insert(v_uid, p_action, null, p_entity, null, p_summary, '{}', null, nullif(v_meta, '{}'::jsonb), false);
end $$;
revoke all on function public.log_audit_event(text, text, text, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, text, jsonb) to authenticated;

-- Walks the last p_limit events of the signed-in person and reports the first whose hash or link does not match. A gap at the START (old events removed by
-- retention) is expected and not an error.
create or replace function public.audit_verify_chain(p_limit integer default 2000) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r record; v_prev text; v_expect text; v_n integer := 0; v_first boolean := true;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  for r in select * from (select * from public.audit_events where user_id = v_uid order by seq desc limit least(greatest(p_limit, 1), 20000)) x order by seq asc loop
    v_n := v_n + 1;
    if not v_first and r.prev_hash is distinct from v_prev then
      return jsonb_build_object('ok', false, 'checked', v_n, 'broken_at', r.id, 'reason', 'link');
    end if;
    v_expect := encode(extensions.digest(
      coalesce(r.prev_hash, '') || '|' || r.id || '|' || r.user_id || '|' || r.action || '|' || r.entity || '|' || coalesce(r.record_id, '') || '|' || public._ts(r.occurred_at) || '|'
        || coalesce(r.old_values::text, '') || '|' || coalesce(r.new_values::text, ''), 'sha256'), 'hex');
    if v_expect <> r.hash then return jsonb_build_object('ok', false, 'checked', v_n, 'broken_at', r.id, 'reason', 'hash'); end if;
    v_prev := r.hash; v_first := false;
  end loop;
  return jsonb_build_object('ok', true, 'checked', v_n);
end $$;
revoke all on function public.audit_verify_chain(integer) from public, anon;
grant execute on function public.audit_verify_chain(integer) to authenticated;

-- The owner's right to erase their history (needs an unlocked session). It is never silent: one tombstone event records that, and how many, events were erased.
create or replace function public.erase_my_audit_history() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); n integer;
begin
  perform set_config('lifetrack.audit_maintenance', 'on', true);
  with d as (delete from public.audit_events where user_id = v_uid returning 1) select count(*) into n from d;
  perform set_config('lifetrack.audit_maintenance', 'off', true);
  perform public._audit_insert(v_uid, 'security', null, 'audit', null, format('Audit history erased (%s events)', n), '{}', null, jsonb_build_object('erased', n), false);
  return n;
end $$;
revoke all on function public.erase_my_audit_history() from public, anon;
grant execute on function public.erase_my_audit_history() to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ restore
create or replace function public._assert_unlocked() returns void
language plpgsql stable security definer set search_path = '' as $$
begin perform public._require_unlocked(); end $$;
revoke all on function public._assert_unlocked() from public, anon;
grant execute on function public._assert_unlocked() to authenticated;
-- Queues the `data.restored` webhook for a restore event of the signed-in person (the queueing function itself is not callable from a client).
create or replace function public._emit_restored(p_event uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.audit_events;
begin
  select * into e from public.audit_events where id = p_event and user_id = auth.uid();
  if found then
    perform public._emit_webhook(e.user_id, 'data.restored', 'data.restored:' || e.id::text,
      jsonb_build_object('entity', e.entity, 'record_id', e.record_id, 'event_id', e.id, 'mode', p_mode));
  end if;
end $$;
revoke all on function public._emit_restored(uuid, text) from public, anon;
grant execute on function public._emit_restored(uuid, text) to authenticated;
-- p_apply = false → a PREVIEW (nothing is written). true → applies it, in this one transaction, as the signed-in person (row-level security and every table
-- constraint still apply). Never overwrites newer data: if a field changed since the event, the answer lists the conflict and nothing is written.
create or replace function public.audit_restore(p_event uuid, p_apply boolean default false) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  e public.audit_events; v_uid uuid := auth.uid(); v_cur jsonb; v_changes jsonb := '[]'::jsonb; v_conflicts jsonb := '[]'::jsonb;
  v_exists boolean; f text; v_result jsonb; v_cols text[]; v_set text; v_mode text; v_reason text; v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into e from public.audit_events where id = p_event and user_id = v_uid;
  if not found then return jsonb_build_object('restorable', false, 'reason', 'not_found', 'message', 'That event was not found.'); end if;
  if e.operation is null or e.entity <> all (public._audit_tables()) or e.entity in ('user_settings') or e.record_id is null or e.record_id !~ '^[0-9a-f-]{36}$' then
    return jsonb_build_object('restorable', false, 'reason', 'unsupported', 'message', 'This kind of event cannot be restored.');
  end if;
  if e.truncated then return jsonb_build_object('restorable', false, 'reason', 'truncated', 'message', 'This event kept only part of a long text, so it cannot be restored safely.'); end if;
  if e.operation = 'insert' then
    return jsonb_build_object('restorable', false, 'reason', 'created', 'message', 'A created record has nothing to restore. Delete it from its own page if you no longer want it.');
  end if;
  v_id := e.record_id::uuid;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', e.entity) into v_cur using v_id;
  v_exists := v_cur is not null;

  if e.operation = 'delete' then
    v_mode := 'recreate';
    if v_exists then return jsonb_build_object('restorable', false, 'reason', 'exists', 'mode', v_mode, 'message', 'This record exists again, so there is nothing to restore.'); end if;
    for f in select jsonb_object_keys(e.old_values) order by 1 loop
      v_changes := v_changes || jsonb_build_object('field', f, 'current', null, 'restore_to', e.old_values -> f);
    end loop;
  else
    v_mode := 'revert';
    if not v_exists then return jsonb_build_object('restorable', false, 'reason', 'missing', 'mode', v_mode, 'message', 'This record has since been deleted. Restore its deletion first.'); end if;
    foreach f in array e.changed_fields loop
      if v_cur -> f is distinct from e.new_values -> f then
        v_conflicts := v_conflicts || jsonb_build_object('field', f, 'expected', e.new_values -> f, 'current', v_cur -> f);
      end if;
      v_changes := v_changes || jsonb_build_object('field', f, 'current', v_cur -> f, 'restore_to', e.old_values -> f);
    end loop;
  end if;
  v_result := jsonb_build_object('restorable', jsonb_array_length(v_conflicts) = 0, 'mode', v_mode, 'entity', e.entity, 'record_id', e.record_id,
    'summary', e.summary, 'changes', v_changes, 'conflicts', v_conflicts, 'applied', false);
  if jsonb_array_length(v_conflicts) > 0 then
    return v_result || jsonb_build_object('reason', 'conflict', 'message', 'This record was changed after that event. Nothing was overwritten.');
  end if;
  if not p_apply then return v_result; end if;

  perform public._assert_unlocked();
  perform set_config('lifetrack.audit_restore', e.id::text, true);
  begin
    if v_mode = 'recreate' then
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', e.entity, e.entity) using e.old_values || jsonb_build_object('user_id', v_uid);
    else
      select array_agg(c.attname::text) into v_cols from pg_attribute c
        where c.attrelid = format('public.%I', e.entity)::regclass and c.attnum > 0 and not c.attisdropped and c.attname = any (e.changed_fields)
          and c.attname not in ('id', 'user_id', 'created_at');
      if v_cols is null or cardinality(v_cols) <> cardinality(e.changed_fields) then
        perform set_config('lifetrack.audit_restore', '', true);
        return v_result || jsonb_build_object('restorable', false, 'reason', 'unsupported', 'message', 'A changed field cannot be restored.');
      end if;
      select string_agg(format('%I = r.%I', c, c), ', ') into v_set from unnest(v_cols) c;
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2 and t.user_id = $3', e.entity, v_set, e.entity)
        using e.old_values, v_id, v_uid;
    end if;
  exception
    when foreign_key_violation then
      perform set_config('lifetrack.audit_restore', '', true);
      return v_result || jsonb_build_object('restorable', false, 'reason', 'dependency', 'message', 'A record this one belongs to no longer exists. Restore that first.');
    when unique_violation then
      perform set_config('lifetrack.audit_restore', '', true);
      return v_result || jsonb_build_object('restorable', false, 'reason', 'duplicate', 'message', 'Restoring would duplicate something that exists now.');
    when insufficient_privilege then
      perform set_config('lifetrack.audit_restore', '', true);
      return v_result || jsonb_build_object('restorable', false, 'reason', 'locked', 'message', 'This part of LifeTrack is locked. Unlock it and try again.');
    when check_violation or not_null_violation then
      perform set_config('lifetrack.audit_restore', '', true);
      return v_result || jsonb_build_object('restorable', false, 'reason', 'invalid', 'message', 'The old values no longer pass the current rules.');
  end;
  perform set_config('lifetrack.audit_restore', '', true);
  perform public._emit_restored(e.id, v_mode);
  return v_result || jsonb_build_object('applied', true);
end $$;
revoke all on function public.audit_restore(uuid, boolean) from public, anon;
grant execute on function public.audit_restore(uuid, boolean) to authenticated;

-- =============================================================================================================================== shared: rate windows
create table if not exists public.rate_windows (
  subject text not null check (char_length(subject) <= 80),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (subject, window_start)
);
alter table public.rate_windows enable row level security;
alter table public.rate_windows force row level security;
revoke all on public.rate_windows from public, anon, authenticated;

-- Counts one hit for `subject` in the current window and answers whether it is allowed. Atomic (one upsert), so concurrent requests cannot both slip under.
create or replace function public._rate_hit(p_subject text, p_limit integer, p_window_seconds integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds); v_hits integer;
begin
  insert into public.rate_windows (subject, window_start, hits) values (p_subject, v_start, 1)
    on conflict (subject, window_start) do update set hits = public.rate_windows.hits + 1 returning hits into v_hits;
  return jsonb_build_object('allowed', v_hits <= p_limit, 'hits', v_hits, 'limit', p_limit, 'reset_at', v_start + make_interval(secs => p_window_seconds));
end $$;
revoke all on function public._rate_hit(text, integer, integer) from public, anon, authenticated;

-- =============================================================================================================================== 2. system health
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not public.is_platform_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
end $$;
revoke all on function public._require_admin() from public, anon, authenticated;

-- Frontend and sync errors, one row per distinct error (deduplicated by a fingerprint), with a counter. Holds no personal data: no user id, no page query string.
create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (char_length(fingerprint) <= 64),
  category text not null check (category in ('frontend', 'sync', 'network', 'auth', 'api', 'other')),
  message text not null check (char_length(message) <= 300),
  stack text not null default '' check (char_length(stack) <= 2000),
  route text not null default '' check (char_length(route) <= 120),
  release text not null default '' check (char_length(release) <= 40),
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists app_errors_last_seen_idx on public.app_errors (last_seen desc);
alter table public.app_errors enable row level security;
alter table public.app_errors force row level security;
revoke all on public.app_errors from public, anon, authenticated;

create or replace function public.report_client_error(p_category text, p_message text, p_stack text default '', p_route text default '', p_release text default '') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_cat text := case when p_category in ('frontend', 'sync', 'network', 'auth', 'api') then p_category else 'other' end;
        v_msg text := left(coalesce(p_message, ''), 300); v_stack text := left(coalesce(p_stack, ''), 2000);
        v_route text := left(split_part(split_part(coalesce(p_route, ''), '?', 1), '#', 1), 120); v_fp text;
begin
  if v_uid is null then return false; end if;
  if v_msg = '' then return false; end if;
  if not (public._rate_hit('err:' || v_uid::text, 20, 600) ->> 'allowed')::boolean then return false; end if; -- 20 reports / 10 min / person
  v_fp := md5(v_cat || '|' || v_msg || '|' || split_part(v_stack, E'\n', 2));
  insert into public.app_errors (fingerprint, category, message, stack, route, release) values (v_fp, v_cat, v_msg, v_stack, v_route, left(coalesce(p_release, ''), 40))
    on conflict (fingerprint) do update set occurrences = public.app_errors.occurrences + 1, last_seen = now();
  return true;
end $$;
revoke all on function public.report_client_error(text, text, text, text, text) from public, anon;
grant execute on function public.report_client_error(text, text, text, text, text) to authenticated;

-- Hourly API aggregates (request volume, errors, latency histogram). Written by the API gateway only.
create table if not exists public.request_metrics (
  bucket timestamptz not null,
  scope text not null default 'api' check (scope in ('api')),
  requests integer not null default 0,
  errors_4xx integer not null default 0,
  errors_5xx integer not null default 0,
  auth_failures integer not null default 0,
  rate_limited integer not null default 0,
  total_ms bigint not null default 0,
  max_ms integer not null default 0,
  slow integer not null default 0,
  b50 integer not null default 0, b100 integer not null default 0, b250 integer not null default 0, b500 integer not null default 0,
  b1000 integer not null default 0, bmore integer not null default 0,
  primary key (bucket, scope)
);
alter table public.request_metrics enable row level security;
alter table public.request_metrics force row level security;
revoke all on public.request_metrics from public, anon, authenticated;

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job ~ '^[a-z][a-z0-9_-]{0,39}$'),
  status text not null check (status in ('ok', 'error')),
  started_at timestamptz not null default now(),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  detail text not null default '' check (char_length(detail) <= 300),
  error text not null default '' check (char_length(error) <= 300)
);
create index if not exists job_runs_job_idx on public.job_runs (job, started_at desc);
alter table public.job_runs enable row level security;
alter table public.job_runs force row level security;
revoke all on public.job_runs from public, anon, authenticated;

create or replace function public.record_job_run(p_job text, p_status text, p_duration_ms integer, p_detail text default '', p_error text default '') returns void
language sql security definer set search_path = '' as $$
  insert into public.job_runs (job, status, duration_ms, detail, error) values (p_job, p_status, greatest(p_duration_ms, 0), left(coalesce(p_detail, ''), 300), left(coalesce(p_error, ''), 300))
$$;
revoke all on function public.record_job_run(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_job_run(text, text, integer, text, text) to service_role;

-- ------------------------------------------------------------------------------------------------------------------ admin reads
create or replace function public.admin_system_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t0 timestamptz := clock_timestamp(); v_db_ms integer; v_api jsonb; v_err jsonb; v_jobs jsonb; v_slow jsonb := '[]'::jsonb; v_backup timestamptz; v_hist jsonb;
  v_incidents jsonb; v_retention jsonb; v_wh jsonb;
begin
  perform public._require_admin();
  perform count(*) from public.request_metrics;
  v_db_ms := greatest(1, round(extract(epoch from clock_timestamp() - t0) * 1000)::integer);
  select jsonb_build_object('requests', coalesce(sum(requests), 0), 'errors_4xx', coalesce(sum(errors_4xx), 0), 'errors_5xx', coalesce(sum(errors_5xx), 0),
           'auth_failures', coalesce(sum(auth_failures), 0), 'rate_limited', coalesce(sum(rate_limited), 0),
           'avg_ms', case when coalesce(sum(requests), 0) > 0 then round(sum(total_ms)::numeric / sum(requests)) end,
           'max_ms', coalesce(max(max_ms), 0), 'slow', coalesce(sum(slow), 0),
           'hist', jsonb_build_array(coalesce(sum(b50), 0), coalesce(sum(b100), 0), coalesce(sum(b250), 0), coalesce(sum(b500), 0), coalesce(sum(b1000), 0), coalesce(sum(bmore), 0)),
           'last_request_at', (select max(bucket) from public.request_metrics))
    into v_api from public.request_metrics where bucket >= now() - interval '24 hours';
  select jsonb_build_object('total_24h', coalesce(sum(occurrences) filter (where last_seen >= now() - interval '24 hours'), 0),
           'distinct_24h', count(*) filter (where last_seen >= now() - interval '24 hours'),
           'sync_24h', coalesce(sum(occurrences) filter (where category = 'sync' and last_seen >= now() - interval '24 hours'), 0),
           'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from public.app_errors where last_seen >= now() - interval '24 hours' group by 1) c), '{}'::jsonb))
    into v_err from public.app_errors;
  select coalesce(jsonb_agg(j order by (j ->> 'job')), '[]'::jsonb) into v_jobs from (
    select jsonb_build_object('job', job, 'last_run', max(started_at), 'last_status', (array_agg(status order by started_at desc))[1],
      'last_error', (array_agg(error order by started_at desc))[1],
      'last_ok', max(started_at) filter (where status = 'ok'), 'runs_24h', count(*) filter (where started_at >= now() - interval '24 hours'),
      'failures_24h', count(*) filter (where status = 'error' and started_at >= now() - interval '24 hours'),
      'avg_ms', round(avg(duration_ms) filter (where started_at >= now() - interval '24 hours'))) j
    from public.job_runs where started_at >= now() - interval '7 days' group by job) x;
  if to_regclass('pg_stat_statements') is not null then
    begin
      execute $q$select coalesce(jsonb_agg(jsonb_build_object('query', left(regexp_replace(query, '\s+', ' ', 'g'), 160), 'calls', calls, 'mean_ms', round(mean_exec_time::numeric, 1), 'max_ms', round(max_exec_time::numeric)) order by mean_exec_time desc), '[]'::jsonb)
                 from (select query, calls, mean_exec_time, max_exec_time from pg_stat_statements where calls >= 5 and mean_exec_time > 100 and query not ilike '%pg_stat_statements%' order by mean_exec_time desc limit 5) s$q$ into v_slow;
    exception when others then v_slow := '[]'::jsonb;
    end;
  end if;
  select max(created_at) into v_backup from public.integration_events where kind = 'backup';
  select coalesce(jsonb_agg(jsonb_build_object('at', bucket, 'kind', 'api', 'title', 'High API error rate', 'detail', format('%s of %s requests failed with a server error', errors_5xx, requests)) order by bucket desc), '[]'::jsonb)
    into v_incidents from (select * from public.request_metrics where bucket >= now() - interval '7 days' and requests >= 5 and errors_5xx::numeric / requests >= 0.05 order by bucket desc limit 10) i;
  v_incidents := v_incidents || coalesce((select jsonb_agg(jsonb_build_object('at', started_at, 'kind', 'job', 'title', 'Job failed: ' || job, 'detail', error) order by started_at desc)
    from (select * from public.job_runs where status = 'error' and started_at >= now() - interval '7 days' order by started_at desc limit 10) f), '[]'::jsonb);
  select jsonb_build_object('pending', count(*) filter (where status in ('pending', 'retrying')), 'dead', count(*) filter (where status = 'dead'),
           'failed_24h', count(*) filter (where status in ('retrying', 'dead') and created_at >= now() - interval '24 hours'),
           'delivered_24h', count(*) filter (where status = 'delivered' and delivered_at >= now() - interval '24 hours'),
           'oldest_pending', min(next_attempt_at) filter (where status in ('pending', 'retrying')))
    into v_wh from public.webhook_deliveries;
  select jsonb_build_object('errors_rows', (select count(*) from public.app_errors), 'request_log_rows', (select count(*) from public.api_request_log),
           'job_runs_rows', (select count(*) from public.job_runs), 'audit_rows', (select count(*) from public.audit_events)) into v_retention;
  return jsonb_build_object('generated_at', now(), 'database', jsonb_build_object('ok', true, 'latency_ms', v_db_ms, 'slow_queries', v_slow),
    'api', v_api, 'errors', v_err, 'jobs', v_jobs, 'webhooks', v_wh, 'last_backup_at', v_backup, 'incidents', v_incidents, 'storage', v_retention);
end $$;
revoke all on function public.admin_system_overview() from public, anon;
grant execute on function public.admin_system_overview() to authenticated;

create or replace function public.admin_system_metrics(p_hours integer default 24) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_hours integer := least(greatest(coalesce(p_hours, 24), 1), 168);
begin
  perform public._require_admin();
  return jsonb_build_object('hours', v_hours,
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'requests', coalesce(m.requests, 0), 'errors_4xx', coalesce(m.errors_4xx, 0), 'errors_5xx', coalesce(m.errors_5xx, 0),
        'auth_failures', coalesce(m.auth_failures, 0), 'avg_ms', case when coalesce(m.requests, 0) > 0 then round(m.total_ms::numeric / m.requests) end, 'max_ms', m.max_ms,
        'client_errors', coalesce(e.n, 0)) order by h)
      from generate_series(date_trunc('hour', now()) - make_interval(hours => v_hours - 1), date_trunc('hour', now()), interval '1 hour') h
      left join public.request_metrics m on m.bucket = h and m.scope = 'api'
      left join (select date_trunc('hour', last_seen) hr, sum(occurrences) n from public.app_errors where last_seen >= now() - make_interval(hours => v_hours) group by 1) e on e.hr = h), '[]'::jsonb));
end $$;
revoke all on function public.admin_system_metrics(integer) from public, anon;
grant execute on function public.admin_system_metrics(integer) to authenticated;

create or replace function public.admin_system_errors(p_limit integer default 25, p_offset integer default 0, p_category text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100); v_total integer;
begin
  perform public._require_admin();
  select count(*) into v_total from public.app_errors where p_category is null or category = p_category;
  return jsonb_build_object('total', v_total, 'items', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.last_seen desc) from (
      select id, category, message, stack, route, release, occurrences, first_seen, last_seen from public.app_errors
      where p_category is null or category = p_category order by last_seen desc limit v_limit offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end $$;
revoke all on function public.admin_system_errors(integer, integer, text) from public, anon;
grant execute on function public.admin_system_errors(integer, integer, text) to authenticated;

-- =============================================================================================================================== 3. API keys
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  key_prefix text not null check (char_length(key_prefix) <= 20),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (cardinality(scopes) between 1 and 20),
  rate_limit_per_min integer not null default 60 check (rate_limit_per_min between 1 and 600),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  request_count bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_user_idx on public.api_keys (user_id, created_at desc);

create table if not exists public.api_request_log (
  id bigint generated always as identity primary key,
  key_id uuid not null references public.api_keys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text check (request_id is null or char_length(request_id) <= 64),
  method text not null check (char_length(method) <= 10),
  path text not null check (char_length(path) <= 200),
  status integer not null,
  duration_ms integer not null default 0,
  error_code text check (error_code is null or char_length(error_code) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists api_request_log_user_idx on public.api_request_log (user_id, created_at desc);
create index if not exists api_request_log_key_idx on public.api_request_log (key_id, created_at desc);
create index if not exists api_request_log_created_idx on public.api_request_log (created_at);

do $$
declare t text;
begin
  foreach t in array array['api_keys', 'api_request_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "owner_read" on public.%I', t);
    execute format('create policy "owner_read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  -- the key hash is never readable from a client, not even by its owner
  revoke select on public.api_keys from authenticated;
  grant select (id, user_id, name, description, key_prefix, scopes, rate_limit_per_min, expires_at, revoked_at, last_used_at, request_count, created_at) on public.api_keys to authenticated;
end $$;

create or replace function public._api_scopes() returns text[]
language sql immutable set search_path = '' as $$
  select array['tasks:read', 'tasks:write', 'goals:read', 'habits:read', 'finance:read', 'finance:write', 'fitness:read', 'learning:read', 'health:read', 'calendar:read', 'calendar:write']
$$;

-- Creates a key. The plaintext is returned ONCE, here, and never stored: only its SHA-256 hash is. Needs an unlocked session (a locked laptop cannot mint access).
create or replace function public.create_api_key(p_name text, p_description text, p_scopes text[], p_expires_days integer default null, p_rate_limit integer default 60) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_key text; v_row public.api_keys; v_scopes text[];
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then raise exception 'Give the key a name (up to 60 characters).' using errcode = '22023'; end if;
  select array_agg(distinct s order by s) into v_scopes from unnest(coalesce(p_scopes, '{}')) s;
  if v_scopes is null or not (v_scopes <@ public._api_scopes()) then raise exception 'Choose at least one valid permission.' using errcode = '22023'; end if;
  if p_expires_days is not null and p_expires_days not between 1 and 3650 then raise exception 'Expiry must be 1 to 3650 days.' using errcode = '22023'; end if;
  if p_rate_limit not between 1 and 600 then raise exception 'The rate limit must be 1 to 600 requests a minute.' using errcode = '22023'; end if;
  if (select count(*) from public.api_keys where user_id = v_uid and revoked_at is null) >= 20 then raise exception 'You can have at most 20 active keys. Revoke one first.' using errcode = '54000'; end if;
  v_key := 'lt_live_' || replace(replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');
  insert into public.api_keys (user_id, name, description, key_prefix, key_hash, scopes, rate_limit_per_min, expires_at)
    values (v_uid, btrim(p_name), left(coalesce(p_description, ''), 300), left(v_key, 15), encode(extensions.digest(v_key, 'sha256'), 'hex'), v_scopes, p_rate_limit,
            case when p_expires_days is null then null else now() + make_interval(days => p_expires_days) end)
    returning * into v_row;
  perform public._audit_insert(v_uid, 'permission', null, 'api_key', v_row.id::text, 'API key created: ' || v_row.name, '{}', null,
    jsonb_build_object('name', v_row.name, 'scopes', v_row.scopes, 'expires_at', v_row.expires_at), false);
  return jsonb_build_object('key', v_key, 'id', v_row.id, 'name', v_row.name, 'key_prefix', v_row.key_prefix, 'scopes', v_row.scopes, 'expires_at', v_row.expires_at,
    'rate_limit_per_min', v_row.rate_limit_per_min);
end $$;
revoke all on function public.create_api_key(text, text, text[], integer, integer) from public, anon;
grant execute on function public.create_api_key(text, text, text[], integer, integer) to authenticated;

create or replace function public.revoke_api_key(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_name text;
begin
  update public.api_keys set revoked_at = now() where id = p_id and user_id = v_uid and revoked_at is null returning name into v_name;
  if v_name is null then raise exception 'That key was not found, or is already revoked.' using errcode = 'P0002'; end if;
  perform public._audit_insert(v_uid, 'permission', null, 'api_key', p_id::text, 'API key revoked: ' || v_name, '{}', null, null, false);
end $$;
revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.revoke_api_key(uuid) to authenticated;

create or replace function public.update_api_key(p_id uuid, p_name text, p_description text, p_rate_limit integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then raise exception 'Give the key a name (up to 60 characters).' using errcode = '22023'; end if;
  if p_rate_limit not between 1 and 600 then raise exception 'The rate limit must be 1 to 600 requests a minute.' using errcode = '22023'; end if;
  update public.api_keys set name = btrim(p_name), description = left(coalesce(p_description, ''), 300), rate_limit_per_min = p_rate_limit where id = p_id and user_id = v_uid and revoked_at is null;
  if not found then raise exception 'That key was not found, or is revoked.' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.update_api_key(uuid, text, text, integer) from public, anon;
grant execute on function public.update_api_key(uuid, text, text, integer) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ gateway-only functions
-- The gateway hashes the presented key itself and calls this: it answers with the key's row when it is usable, and says why when it is not.
create or replace function public.api_authenticate(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where key_hash = p_hash;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if k.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'revoked', 'key_id', k.id, 'user_id', k.user_id); end if;
  if k.expires_at is not null and k.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired', 'key_id', k.id, 'user_id', k.user_id); end if;
  return jsonb_build_object('ok', true, 'key_id', k.id, 'user_id', k.user_id, 'name', k.name, 'scopes', to_jsonb(k.scopes), 'rate_limit_per_min', k.rate_limit_per_min,
    'expires_at', k.expires_at, 'key_prefix', k.key_prefix);
end $$;
revoke all on function public.api_authenticate(text) from public, anon, authenticated;
grant execute on function public.api_authenticate(text) to service_role;

create or replace function public.api_rate_hit(p_key uuid, p_limit integer) returns jsonb
language sql security definer set search_path = '' as $$ select public._rate_hit('key:' || p_key::text, p_limit, 60) $$;
revoke all on function public.api_rate_hit(uuid, integer) from public, anon, authenticated;
grant execute on function public.api_rate_hit(uuid, integer) to service_role;

-- One round trip per request: the request log row, the hourly aggregate, and the key's last-used mark. key_id may be null (an unauthenticated request:
-- only the aggregate is kept, so a flood of bad keys cannot fill the log).
create or replace function public.api_record(p_key uuid, p_user uuid, p_request_id text, p_method text, p_path text, p_status integer, p_ms integer, p_error text, p_slow_ms integer default 1000) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ms integer := greatest(coalesce(p_ms, 0), 0);
begin
  if p_key is not null then
    insert into public.api_request_log (key_id, user_id, request_id, method, path, status, duration_ms, error_code)
      values (p_key, p_user, left(p_request_id, 64), left(p_method, 10), left(p_path, 200), p_status, v_ms, left(p_error, 40));
    update public.api_keys set last_used_at = now(), request_count = request_count + 1 where id = p_key;
  end if;
  insert into public.request_metrics (bucket, scope, requests, errors_4xx, errors_5xx, auth_failures, rate_limited, total_ms, max_ms, slow, b50, b100, b250, b500, b1000, bmore)
    values (date_trunc('hour', now()), 'api', 1, (p_status between 400 and 499)::int, (p_status >= 500)::int, (p_status in (401, 403) and p_error in ('invalid_key', 'revoked_key', 'expired_key', 'missing_key'))::int,
      (p_status = 429)::int, v_ms, v_ms, (v_ms >= p_slow_ms)::int, (v_ms < 50)::int, (v_ms >= 50 and v_ms < 100)::int, (v_ms >= 100 and v_ms < 250)::int,
      (v_ms >= 250 and v_ms < 500)::int, (v_ms >= 500 and v_ms < 1000)::int, (v_ms >= 1000)::int)
    on conflict (bucket, scope) do update set requests = public.request_metrics.requests + 1,
      errors_4xx = public.request_metrics.errors_4xx + excluded.errors_4xx, errors_5xx = public.request_metrics.errors_5xx + excluded.errors_5xx,
      auth_failures = public.request_metrics.auth_failures + excluded.auth_failures, rate_limited = public.request_metrics.rate_limited + excluded.rate_limited,
      total_ms = public.request_metrics.total_ms + excluded.total_ms, max_ms = greatest(public.request_metrics.max_ms, excluded.max_ms), slow = public.request_metrics.slow + excluded.slow,
      b50 = public.request_metrics.b50 + excluded.b50, b100 = public.request_metrics.b100 + excluded.b100, b250 = public.request_metrics.b250 + excluded.b250,
      b500 = public.request_metrics.b500 + excluded.b500, b1000 = public.request_metrics.b1000 + excluded.b1000, bmore = public.request_metrics.bmore + excluded.bmore;
end $$;
revoke all on function public.api_record(uuid, uuid, text, text, text, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.api_record(uuid, uuid, text, text, text, integer, integer, text, integer) to service_role;

-- Gateway readiness probe: does the database answer a real query?
create or replace function public.api_ready() returns boolean
language sql stable security definer set search_path = '' as $$ select true $$;
revoke all on function public.api_ready() from public, anon, authenticated;
grant execute on function public.api_ready() to service_role;

-- Usage for the owner's keys: per day, per status class and the busiest endpoints. Row-level security limits it to their own log.
create or replace function public.api_usage_summary(p_days integer default 14) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  return jsonb_build_object('days', v_days,
    'totals', (select jsonb_build_object('requests', count(*), 'ok', count(*) filter (where status < 400), 'client_errors', count(*) filter (where status between 400 and 499),
        'server_errors', count(*) filter (where status >= 500), 'rate_limited', count(*) filter (where status = 429), 'avg_ms', round(avg(duration_ms)))
      from public.api_request_log where created_at >= now() - make_interval(days => v_days)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'requests', coalesce(r.n, 0), 'errors', coalesce(r.errs, 0)) order by d)
      from generate_series(current_date - (v_days - 1), current_date, interval '1 day') d
      left join (select created_at::date as dy, count(*) n, count(*) filter (where status >= 400) errs from public.api_request_log
                 where created_at >= now() - make_interval(days => v_days) group by 1) r on r.dy = d::date), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(x) from (select jsonb_build_object('method', method, 'path', path, 'requests', count(*), 'errors', count(*) filter (where status >= 400)) x
      from public.api_request_log where created_at >= now() - make_interval(days => v_days) group by method, path order by count(*) desc limit 8) t), '[]'::jsonb));
end $$;
revoke all on function public.api_usage_summary(integer) from public, anon;
grant execute on function public.api_usage_summary(integer) to authenticated;

-- =============================================================================================================================== 3b. webhooks
create or replace function public._webhook_events() returns text[]
language sql immutable set search_path = '' as $$
  select array['task.created', 'task.updated', 'task.completed', 'goal.created', 'goal.completed', 'habit.completed', 'expense.created', 'workout.logged',
    'study.session.completed', 'calendar.event.created', 'data.restored']
$$;

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null check (char_length(url) <= 2048 and url ~ '^https://[^/?#@\s]+'),
  description text not null default '' check (char_length(description) <= 200),
  events text[] not null check (cardinality(events) between 1 and 20),
  enabled boolean not null default true,
  timeout_ms integer not null default 5000 check (timeout_ms between 1000 and 15000),
  max_attempts integer not null default 6 check (max_attempts between 1 and 10),
  consecutive_failures integer not null default 0,
  disabled_reason text not null default '' check (char_length(disabled_reason) <= 200),
  last_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webhook_endpoints_user_idx on public.webhook_endpoints (user_id, enabled);

create table if not exists public.webhook_secrets (
  endpoint_id uuid primary key references public.webhook_endpoints(id) on delete cascade,
  secret text not null
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type ~ '^[a-z.]{3,40}$'),
  event_key text not null check (char_length(event_key) <= 120),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'retrying', 'delivered', 'dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_status integer,
  last_error text not null default '' check (char_length(last_error) <= 300),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (endpoint_id, event_key)
);
create index if not exists webhook_deliveries_user_idx on public.webhook_deliveries (user_id, created_at desc);
create index if not exists webhook_deliveries_endpoint_idx on public.webhook_deliveries (endpoint_id, created_at desc);
create index if not exists webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status in ('pending', 'retrying', 'sending');

create table if not exists public.webhook_attempts (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.webhook_deliveries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt integer not null,
  ok boolean not null,
  status integer,
  error text not null default '' check (char_length(error) <= 300),
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists webhook_attempts_delivery_idx on public.webhook_attempts (delivery_id, attempt);
create index if not exists webhook_attempts_user_idx on public.webhook_attempts (user_id);

do $$
declare t text;
begin
  foreach t in array array['webhook_endpoints', 'webhook_secrets', 'webhook_deliveries', 'webhook_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
  foreach t in array array['webhook_endpoints', 'webhook_deliveries', 'webhook_attempts'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "owner_read" on public.%I', t);
    execute format('create policy "owner_read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  drop trigger if exists set_updated_at on public.webhook_endpoints;
  create trigger set_updated_at before update on public.webhook_endpoints for each row execute function public.set_updated_at();
end $$;

-- A first line of defence for the address (the dispatcher repeats it, and resolves the name, at delivery time): https only, no credentials in the URL, no
-- obviously internal hosts. The names and ranges below can never be a customer's server.
create or replace function public._webhook_url_problem(p_url text) returns text
language plpgsql immutable set search_path = '' as $$
declare v_host text;
begin
  if p_url is null or char_length(p_url) > 2048 or p_url !~ '^https://[^/?#@\s]+([/?#]\S*)?$' then return 'Use a full https:// address.'; end if;
  v_host := lower(split_part(split_part(substring(p_url from '^https://([^/?#]+)'), ':', 1), '@', 1));
  if v_host in ('localhost', '') or v_host ~ '\.(local|localhost|internal|lan|home|corp|intranet)$' then return 'That address is internal; use a public server.'; end if;
  if v_host ~ '^\[' or v_host ~ ':' then return 'Use a host name, not an IP address.'; end if;
  if v_host ~ '^[0-9.]+$' then return 'Use a host name, not an IP address.'; end if;
  if v_host !~ '\.' then return 'Use a full host name.'; end if;
  return null;
end $$;

create or replace function public.create_webhook_endpoint(p_url text, p_description text, p_events text[], p_timeout_ms integer default 5000, p_max_attempts integer default 6) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_problem text := public._webhook_url_problem(p_url); v_events text[]; v_row public.webhook_endpoints; v_secret text;
begin
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  select array_agg(distinct e order by e) into v_events from unnest(coalesce(p_events, '{}')) e;
  if v_events is null or not (v_events <@ public._webhook_events()) then raise exception 'Choose at least one valid event.' using errcode = '22023'; end if;
  if (select count(*) from public.webhook_endpoints where user_id = v_uid) >= 10 then raise exception 'You can have at most 10 webhook endpoints.' using errcode = '54000'; end if;
  insert into public.webhook_endpoints (user_id, url, description, events, timeout_ms, max_attempts)
    values (v_uid, btrim(p_url), left(coalesce(p_description, ''), 200), v_events, least(greatest(coalesce(p_timeout_ms, 5000), 1000), 15000), least(greatest(coalesce(p_max_attempts, 6), 1), 10))
    returning * into v_row;
  v_secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.webhook_secrets (endpoint_id, secret) values (v_row.id, v_secret);
  perform public._audit_insert(v_uid, 'config', null, 'webhook', v_row.id::text, 'Webhook added: ' || split_part(substring(v_row.url from '^https://([^/?#]+)'), ':', 1), '{}', null,
    jsonb_build_object('events', v_row.events), false);
  return jsonb_build_object('id', v_row.id, 'secret', v_secret);
end $$;
revoke all on function public.create_webhook_endpoint(text, text, text[], integer, integer) from public, anon;
grant execute on function public.create_webhook_endpoint(text, text, text[], integer, integer) to authenticated;

create or replace function public.update_webhook_endpoint(p_id uuid, p_url text, p_description text, p_events text[], p_enabled boolean, p_timeout_ms integer, p_max_attempts integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_problem text := public._webhook_url_problem(p_url); v_events text[];
begin
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  select array_agg(distinct e order by e) into v_events from unnest(coalesce(p_events, '{}')) e;
  if v_events is null or not (v_events <@ public._webhook_events()) then raise exception 'Choose at least one valid event.' using errcode = '22023'; end if;
  update public.webhook_endpoints set url = btrim(p_url), description = left(coalesce(p_description, ''), 200), events = v_events, enabled = p_enabled,
      timeout_ms = least(greatest(coalesce(p_timeout_ms, 5000), 1000), 15000), max_attempts = least(greatest(coalesce(p_max_attempts, 6), 1), 10),
      consecutive_failures = case when p_enabled then 0 else consecutive_failures end, disabled_reason = case when p_enabled then '' else 'Turned off by you' end
    where id = p_id and user_id = v_uid;
  if not found then raise exception 'That webhook was not found.' using errcode = 'P0002'; end if;
  perform public._audit_insert(v_uid, 'config', null, 'webhook', p_id::text, case when p_enabled then 'Webhook updated' else 'Webhook turned off' end, '{}', null, jsonb_build_object('events', v_events), false);
end $$;
revoke all on function public.update_webhook_endpoint(uuid, text, text, text[], boolean, integer, integer) from public, anon;
grant execute on function public.update_webhook_endpoint(uuid, text, text, text[], boolean, integer, integer) to authenticated;

create or replace function public.delete_webhook_endpoint(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  delete from public.webhook_endpoints where id = p_id and user_id = v_uid;
  if not found then raise exception 'That webhook was not found.' using errcode = 'P0002'; end if;
  perform public._audit_insert(v_uid, 'config', null, 'webhook', p_id::text, 'Webhook deleted', '{}', null, null, false);
end $$;
revoke all on function public.delete_webhook_endpoint(uuid) from public, anon;
grant execute on function public.delete_webhook_endpoint(uuid) to authenticated;

create or replace function public.rotate_webhook_secret(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_secret text := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not exists (select 1 from public.webhook_endpoints where id = p_id and user_id = v_uid) then raise exception 'That webhook was not found.' using errcode = 'P0002'; end if;
  update public.webhook_secrets set secret = v_secret where endpoint_id = p_id;
  perform public._audit_insert(v_uid, 'security', null, 'webhook', p_id::text, 'Webhook signing secret rotated', '{}', null, null, false);
  return v_secret;
end $$;
revoke all on function public.rotate_webhook_secret(uuid) from public, anon;
grant execute on function public.rotate_webhook_secret(uuid) to authenticated;

-- Queues one delivery per enabled, subscribed endpoint of `p_user`. Idempotent: the same event key is never queued twice for an endpoint.
create or replace function public._emit_webhook(p_user uuid, p_type text, p_key text, p_data jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ins as (
    insert into public.webhook_deliveries (endpoint_id, user_id, event_type, event_key, payload)
    select e.id, p_user, p_type, p_key,
           jsonb_build_object('type', p_type, 'created_at', now(), 'data', public._redact(p_data))
      from public.webhook_endpoints e where e.user_id = p_user and e.enabled and p_type = any (e.events)
    on conflict (endpoint_id, event_key) do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;
revoke all on function public._emit_webhook(uuid, text, text, jsonb) from public, anon, authenticated;

-- The domain events, derived from the tables that already exist. Never lets a webhook problem break the user's own write.
create or replace function public.webhook_domain_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := to_jsonb(new); v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end; v_user uuid := (to_jsonb(new) ->> 'user_id')::uuid; v_id text := to_jsonb(new) ->> 'id';
        v_stamp text := coalesce(to_jsonb(new) ->> 'updated_at', to_jsonb(new) ->> 'created_at', '');
begin
  if not exists (select 1 from public.webhook_endpoints e where e.user_id = v_user and e.enabled) then return null; end if;
  case tg_table_name
    when 'tasks' then
      if tg_op = 'INSERT' then perform public._emit_webhook(v_user, 'task.created', 'task.created:' || v_id, jsonb_build_object('task', v_row)); end if;
      if tg_op = 'UPDATE' and v_old <> v_row then
        if new.status = 'done' and (v_old ->> 'status') is distinct from 'done' then perform public._emit_webhook(v_user, 'task.completed', 'task.completed:' || v_id || ':' || v_stamp, jsonb_build_object('task', v_row));
        else perform public._emit_webhook(v_user, 'task.updated', 'task.updated:' || v_id || ':' || v_stamp, jsonb_build_object('task', v_row)); end if;
      end if;
    when 'goals' then
      if tg_op = 'INSERT' then perform public._emit_webhook(v_user, 'goal.created', 'goal.created:' || v_id, jsonb_build_object('goal', v_row)); end if;
      if tg_op = 'UPDATE' and new.status = 'completed' and (v_old ->> 'status') is distinct from 'completed' then
        perform public._emit_webhook(v_user, 'goal.completed', 'goal.completed:' || v_id || ':' || v_stamp, jsonb_build_object('goal', v_row)); end if;
    when 'habit_logs' then
      if new.status = 'done' and (v_old ->> 'status') is distinct from 'done' then
        perform public._emit_webhook(v_user, 'habit.completed', 'habit.completed:' || v_id || ':' || v_stamp, jsonb_build_object('habit_log', v_row)); end if;
    when 'transactions' then
      if tg_op = 'INSERT' and new.type = 'expense' then perform public._emit_webhook(v_user, 'expense.created', 'expense.created:' || v_id, jsonb_build_object('transaction', v_row)); end if;
    when 'workouts' then
      if new.status = 'completed' and (v_old ->> 'status') is distinct from 'completed' then
        perform public._emit_webhook(v_user, 'workout.logged', 'workout.logged:' || v_id || ':' || v_stamp, jsonb_build_object('workout', v_row)); end if;
    when 'study_sessions' then
      if new.status = 'completed' and (v_old ->> 'status') is distinct from 'completed' then
        perform public._emit_webhook(v_user, 'study.session.completed', 'study.session.completed:' || v_id || ':' || v_stamp, jsonb_build_object('study_session', v_row)); end if;
    when 'calendar_events' then
      if tg_op = 'INSERT' then perform public._emit_webhook(v_user, 'calendar.event.created', 'calendar.event.created:' || v_id, jsonb_build_object('calendar_event', v_row)); end if;
    else null;
  end case;
  return null;
exception when others then
  raise warning 'webhook enqueue failed: %', sqlerrm; -- the person's own write must never fail because of an integration
  return null;
end $$;
revoke all on function public.webhook_domain_events() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['tasks', 'goals', 'habit_logs', 'transactions', 'workouts', 'study_sessions', 'calendar_events'] loop
    continue when to_regclass(format('public.%I', t)) is null;
    execute format('drop trigger if exists webhook_domain_events on public.%I', t);
    execute format('create trigger webhook_domain_events after insert or update on public.%I for each row execute function public.webhook_domain_events()', t);
  end loop;
end $$;

-- A test delivery (always queued, even if the endpoint did not subscribe to anything) and a manual retry.
create or replace function public.queue_webhook_test(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked(); v_id uuid;
begin
  if not exists (select 1 from public.webhook_endpoints where id = p_id and user_id = v_uid) then raise exception 'That webhook was not found.' using errcode = 'P0002'; end if;
  insert into public.webhook_deliveries (endpoint_id, user_id, event_type, event_key, payload)
    values (p_id, v_uid, 'webhook.test', 'webhook.test:' || gen_random_uuid()::text,
            jsonb_build_object('type', 'webhook.test', 'created_at', now(), 'data', jsonb_build_object('message', 'This is a test event from LifeTrack.')))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_webhook_test(uuid) from public, anon;
grant execute on function public.queue_webhook_test(uuid) to authenticated;

create or replace function public.retry_webhook_delivery(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_unlocked();
begin
  update public.webhook_deliveries d set status = 'pending', next_attempt_at = now(), lease_until = null,
      attempts = least(d.attempts, (select e.max_attempts - 1 from public.webhook_endpoints e where e.id = d.endpoint_id))
    where d.id = p_id and d.user_id = v_uid and d.status in ('dead', 'retrying');
  if not found then raise exception 'Only a failed delivery can be retried.' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.retry_webhook_delivery(uuid) from public, anon;
grant execute on function public.retry_webhook_delivery(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ dispatcher-only functions
-- Takes up to p_limit due deliveries and LEASES them for 90 seconds (status 'sending'): another run, or a retry of this one, cannot take them at the same time,
-- and a run that crashes simply lets the lease expire. p_user limits the batch to one person (the "deliver now" button).
create or replace function public.claim_webhook_deliveries(p_limit integer default 25, p_user uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  with due as (
    select d.id from public.webhook_deliveries d join public.webhook_endpoints e on e.id = d.endpoint_id
    where (p_user is null or d.user_id = p_user) and e.enabled
      and ((d.status in ('pending', 'retrying') and d.next_attempt_at <= now()) or (d.status = 'sending' and d.lease_until < now()))
    order by d.next_attempt_at limit least(greatest(p_limit, 1), 100) for update of d skip locked),
  upd as (
    update public.webhook_deliveries d set status = 'sending', lease_until = now() + interval '90 seconds' from due where d.id = due.id
    returning d.id, d.endpoint_id, d.event_type, d.payload, d.attempts, d.created_at)
  select jsonb_agg(jsonb_build_object('id', u.id, 'event_type', u.event_type, 'payload', u.payload, 'attempts', u.attempts, 'created_at', u.created_at,
      'url', e.url, 'timeout_ms', e.timeout_ms, 'max_attempts', e.max_attempts, 'secret', s.secret, 'endpoint_id', e.id))
    into v_out
    from upd u join public.webhook_endpoints e on e.id = u.endpoint_id join public.webhook_secrets s on s.endpoint_id = e.id;
  return coalesce(v_out, '[]'::jsonb);
end $$;
revoke all on function public.claim_webhook_deliveries(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries(integer, uuid) to service_role;

-- Records one attempt. Only a delivery that is still leased can be completed, so a late or duplicate report changes nothing.
create or replace function public.complete_webhook_delivery(p_id uuid, p_ok boolean, p_status integer, p_error text, p_duration_ms integer, p_next timestamptz, p_dead boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.webhook_deliveries; v_n integer;
begin
  select * into d from public.webhook_deliveries where id = p_id and status = 'sending' for update;
  if not found then return false; end if;
  v_n := d.attempts + 1;
  insert into public.webhook_attempts (delivery_id, user_id, attempt, ok, status, error, duration_ms) values (d.id, d.user_id, v_n, p_ok, p_status, left(coalesce(p_error, ''), 300), greatest(coalesce(p_duration_ms, 0), 0));
  update public.webhook_deliveries set attempts = v_n, last_status = p_status, last_error = left(coalesce(p_error, ''), 300), lease_until = null,
      status = case when p_ok then 'delivered' when p_dead then 'dead' else 'retrying' end,
      delivered_at = case when p_ok then now() end, next_attempt_at = case when p_ok or p_dead then next_attempt_at else coalesce(p_next, now() + interval '5 minutes') end
    where id = d.id;
  update public.webhook_endpoints set last_delivery_at = now(),
      consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
      enabled = case when not p_ok and consecutive_failures + 1 >= 25 then false else enabled end,
      disabled_reason = case when not p_ok and consecutive_failures + 1 >= 25 then 'Turned off after 25 failed deliveries in a row' else disabled_reason end
    where id = d.endpoint_id;
  return true;
end $$;
revoke all on function public.complete_webhook_delivery(uuid, boolean, integer, text, integer, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.complete_webhook_delivery(uuid, boolean, integer, text, integer, timestamptz, boolean) to service_role;

-- =============================================================================================================================== retention
-- Bounded storage: run daily by the webhook-dispatch function (or any scheduler with the service role). Audit history is kept longest and can be set per
-- install (p_audit_days; 0 keeps it forever).
create or replace function public.purge_platform_data(p_request_days integer default 30, p_metric_days integer default 90, p_error_days integer default 60, p_job_days integer default 30,
                                                      p_webhook_days integer default 30, p_audit_days integer default 730) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer; c integer; d integer; e integer; f integer; g integer;
begin
  with x as (delete from public.api_request_log where created_at < now() - make_interval(days => p_request_days) returning 1) select count(*) into a from x;
  with x as (delete from public.request_metrics where bucket < now() - make_interval(days => p_metric_days) returning 1) select count(*) into b from x;
  with x as (delete from public.app_errors where last_seen < now() - make_interval(days => p_error_days) returning 1) select count(*) into c from x;
  with x as (delete from public.job_runs where started_at < now() - make_interval(days => p_job_days) returning 1) select count(*) into d from x;
  -- finished deliveries after p_webhook_days; anything still unsent after three times that (an endpoint that was switched off) is stale and goes too
  with x as (delete from public.webhook_deliveries where (status in ('delivered', 'dead') and created_at < now() - make_interval(days => p_webhook_days))
                 or created_at < now() - make_interval(days => greatest(p_webhook_days * 3, 90)) returning 1) select count(*) into e from x;
  with x as (delete from public.rate_windows where window_start < now() - interval '2 days' returning 1) select count(*) into f from x;
  g := 0;
  if p_audit_days > 0 then
    perform set_config('lifetrack.audit_maintenance', 'on', true);
    with x as (delete from public.audit_events where occurred_at < now() - make_interval(days => p_audit_days) returning 1) select count(*) into g from x;
    perform set_config('lifetrack.audit_maintenance', 'off', true);
  end if;
  return jsonb_build_object('api_request_log', a, 'request_metrics', b, 'app_errors', c, 'job_runs', d, 'webhook_deliveries', e, 'rate_windows', f, 'audit_events', g);
end $$;
revoke all on function public.purge_platform_data(integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.purge_platform_data(integer, integer, integer, integer, integer, integer) to service_role;

-- =============================================================================================================================== 4. saved reports
alter table public.user_settings add column if not exists report_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(report_prefs) = 'object');

-- Realtime is not needed for any of these tables. Internal helpers are not callable by clients.
revoke all on function public._redact(jsonb), public._has_long_text(jsonb), public._record_label(jsonb), public._request_headers(), public._ip_prefix(jsonb),
  public._audit_tables(), public._api_scopes(), public._webhook_events(), public._webhook_url_problem(text), public._ts(timestamptz) from public, anon;
revoke all on function public._audit_insert(uuid, text, text, text, text, text, text[], jsonb, jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public._audit_guard(), public._audit_guard_truncate() from public, anon, authenticated;
grant execute on function public._audit_tables(), public._api_scopes(), public._webhook_events(), public._webhook_url_problem(text) to authenticated;


-- ===== 0028_performance_flags.sql =====
-- 0028: database performance + feature flags and experiments. ADDITIVE: new indexes, new tables, new functions. No existing row, column, policy or index is changed
-- or dropped, and the running web and mobile apps keep working without it (the web app falls back to built-in defaults when the new functions are missing).
--
--   1. Indexes chosen from the app's real query patterns (see docs/DATABASE_PERFORMANCE.md for the measurements behind each).
--   2. Database performance monitoring for administrators (System Health Center): snapshots, client query statistics, `admin_db_*` functions.
--   3. Feature flags (per environment, rollout, targeting), emergency controls, change history with rollback, and experiments.
--
-- Creating the indexes takes a short write lock on each table. For a big table, create the same index by hand first with CREATE INDEX CONCURRENTLY (a migration
-- runs in a transaction and cannot); `if not exists` then makes this file skip it.

-- =============================================================================================================================== 1. indexes
-- The data adapter reads whole tables in (created_at, id) order (a stable page order), and the paged lists use the same keyset. Without an index the database
-- sorts every row of the person on each page.
create index if not exists tasks_user_created_idx            on public.tasks (user_id, created_at, id);
create index if not exists transactions_user_created_idx     on public.transactions (user_id, created_at, id);
create index if not exists habit_logs_user_created_idx       on public.habit_logs (user_id, created_at, id);
create index if not exists study_sessions_user_created_idx   on public.study_sessions (user_id, created_at, id);
create index if not exists workouts_user_created_idx         on public.workouts (user_id, created_at, id);
create index if not exists food_logs_user_created_idx        on public.food_logs (user_id, created_at, id);
create index if not exists calendar_events_user_created_idx  on public.calendar_events (user_id, created_at, id);
create index if not exists job_applications_user_created_idx on public.job_applications (user_id, created_at, id);
create index if not exists notifications_user_created_idx    on public.notifications (user_id, created_at, id);
-- A status filter with a newest-first sort (done tasks, applications in one column). It starts with the columns of tasks_user_status_idx / jobs_user_status_idx,
-- so it can serve every query those serve; those two are left in place (dropping is a separate, deliberate step: see docs/DATABASE_PERFORMANCE.md).
create index if not exists tasks_user_status_created_idx     on public.tasks (user_id, status, created_at, id);
create index if not exists job_applications_user_status_updated_idx on public.job_applications (user_id, status, updated_at desc, id desc);
-- The unread badge counts only visible, unread notifications: a small partial index instead of the whole inbox.
create index if not exists notifications_unread_idx          on public.notifications (user_id, created_at desc) where dismissed_at is null and read_at is null;

-- =============================================================================================================================== 2. performance monitoring
-- What the browsers measured about their own requests, per hour and per "location" (table.operation). No user id, no parameters, no row content.
create table if not exists public.query_stats (
  bucket timestamptz not null,
  location text not null check (location ~ '^[a-z][a-z0-9_.]{0,59}$'),
  table_name text not null check (table_name ~ '^[a-z][a-z0-9_]{0,47}$'),
  operation text not null check (operation in ('select', 'insert', 'update', 'delete', 'rpc')),
  calls integer not null default 0,
  errors integer not null default 0,
  slow integer not null default 0,
  total_ms bigint not null default 0,
  max_ms integer not null default 0,
  rows_total bigint not null default 0,
  primary key (bucket, location)
);
alter table public.query_stats enable row level security;
alter table public.query_stats force row level security;
revoke all on public.query_stats from public, anon, authenticated;

-- Trend points: one row each time an administrator opens the performance view (at most one per 10 minutes).
create table if not exists public.db_perf_snapshots (
  at timestamptz primary key default now(),
  db_size_bytes bigint, connections integer, active_connections integer, max_connections integer,
  cache_hit_ratio numeric(6, 4), latency_ms integer, seq_scans bigint, idx_scans bigint, dead_tuples bigint, live_tuples bigint, slow_queries integer
);
alter table public.db_perf_snapshots enable row level security;
alter table public.db_perf_snapshots force row level security;
revoke all on public.db_perf_snapshots from public, anon, authenticated;

-- The browser reports its own request timings in batches. Rate-limited per person, validated, and it only ever adds counters.
create or replace function public.report_query_stats(p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r jsonb; n integer := 0; v_loc text; v_tab text; v_op text;
begin
  if v_uid is null then return 0; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60 then return 0; end if;
  if not (public._rate_hit('qs:' || v_uid::text, 12, 3600) ->> 'allowed')::boolean then return 0; end if; -- 12 batches per hour per person
  for r in select * from jsonb_array_elements(p_rows) loop
    v_tab := r ->> 'table'; v_op := r ->> 'op'; v_loc := v_tab || '.' || v_op;
    continue when v_tab !~ '^[a-z][a-z0-9_]{0,47}$' or v_op not in ('select', 'insert', 'update', 'delete', 'rpc');
    continue when coalesce((r ->> 'calls')::integer, 0) not between 1 and 100000;
    insert into public.query_stats (bucket, location, table_name, operation, calls, errors, slow, total_ms, max_ms, rows_total)
    values (date_trunc('hour', now()), v_loc, v_tab, v_op, (r ->> 'calls')::integer, least(coalesce((r ->> 'errors')::integer, 0), 100000), least(coalesce((r ->> 'slow')::integer, 0), 100000),
            least(coalesce((r ->> 'total_ms')::bigint, 0), 86400000), least(coalesce((r ->> 'max_ms')::integer, 0), 600000), least(coalesce((r ->> 'rows')::bigint, 0), 100000000))
    on conflict (bucket, location) do update set calls = public.query_stats.calls + excluded.calls, errors = public.query_stats.errors + excluded.errors,
      slow = public.query_stats.slow + excluded.slow, total_ms = public.query_stats.total_ms + excluded.total_ms,
      max_ms = greatest(public.query_stats.max_ms, excluded.max_ms), rows_total = public.query_stats.rows_total + excluded.rows_total;
    n := n + 1;
  end loop;
  return n;
exception when others then return 0; -- measuring must never break the app
end $$;
revoke all on function public.report_query_stats(jsonb) from public, anon;
grant execute on function public.report_query_stats(jsonb) to authenticated;

-- Everything the Database Performance section shows, in one call: connections, latency, size, cache hit rate, per-table scan behaviour, index usage, slow
-- statements, aggregation timings and the trend. Real catalog numbers only (pg_stat_*): a view the server does not offer is reported as null, never invented.
create or replace function public.admin_db_overview(p_hours integer default 24) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hours integer := least(greatest(coalesce(p_hours, 24), 1), 720);
  t0 timestamptz; v_lat integer; v_conn jsonb; v_db jsonb; v_tables jsonb; v_indexes jsonb; v_slow jsonb := null; v_agg jsonb; v_trend jsonb; v_stmt regclass;
  v_hit numeric; v_ms1 numeric; v_ms2 numeric; v_conns integer; v_active integer; v_slow_n integer := 0;
begin
  perform public._require_admin();
  t0 := clock_timestamp(); perform 1; v_lat := greatest(1, round(extract(epoch from clock_timestamp() - t0) * 1000)::integer);

  select jsonb_build_object('total', count(*), 'active', count(*) filter (where state = 'active'), 'idle', count(*) filter (where state = 'idle'),
           'idle_in_transaction', count(*) filter (where state like 'idle in transaction%'), 'max', current_setting('max_connections')::integer)
    into v_conn from pg_catalog.pg_stat_activity where datname = current_database();
  v_conns := (v_conn ->> 'total')::integer; v_active := (v_conn ->> 'active')::integer;

  select jsonb_build_object('size_bytes', pg_database_size(current_database()), 'commits', xact_commit, 'rollbacks', xact_rollback, 'blocks_hit', blks_hit, 'blocks_read', blks_read,
           'deadlocks', deadlocks, 'temp_files', temp_files, 'stats_reset', stats_reset)
    into v_db from pg_catalog.pg_stat_database where datname = current_database();
  v_hit := case when coalesce((v_db ->> 'blocks_hit')::numeric, 0) + coalesce((v_db ->> 'blocks_read')::numeric, 0) > 0
                then (v_db ->> 'blocks_hit')::numeric / ((v_db ->> 'blocks_hit')::numeric + (v_db ->> 'blocks_read')::numeric) end;

  select coalesce(jsonb_agg(x order by (x ->> 'size_bytes')::bigint desc), '[]'::jsonb) into v_tables from (
    select jsonb_build_object('table', s.relname, 'rows', s.n_live_tup, 'dead_rows', s.n_dead_tup, 'size_bytes', pg_total_relation_size(s.relid),
             'seq_scans', s.seq_scan, 'seq_rows_read', s.seq_tup_read, 'index_scans', coalesce(s.idx_scan, 0), 'index_rows_fetched', coalesce(s.idx_tup_fetch, 0),
             'last_vacuum', greatest(s.last_vacuum, s.last_autovacuum), 'last_analyze', greatest(s.last_analyze, s.last_autoanalyze)) x
    from pg_catalog.pg_stat_user_tables s where s.schemaname = 'public' order by pg_total_relation_size(s.relid) desc limit 25) q;

  select coalesce(jsonb_agg(x order by (x ->> 'size_bytes')::bigint desc), '[]'::jsonb) into v_indexes from (
    select jsonb_build_object('table', s.relname, 'index', s.indexrelname, 'scans', s.idx_scan, 'size_bytes', pg_relation_size(s.indexrelid),
             'unique', i.indisunique, 'primary', i.indisprimary) x
    from pg_catalog.pg_stat_user_indexes s join pg_catalog.pg_index i on i.indexrelid = s.indexrelid where s.schemaname = 'public'
    order by pg_relation_size(s.indexrelid) desc limit 250) q;

  -- Slow statements: pg_stat_statements lives in the "extensions" schema on Supabase. Statement text has its parameters already replaced by $1, $2.
  v_stmt := coalesce(to_regclass('extensions.pg_stat_statements'), to_regclass('public.pg_stat_statements'));
  if v_stmt is not null then
    begin
      execute format($q$select coalesce(jsonb_agg(jsonb_build_object('query', left(regexp_replace(query, '\s+', ' ', 'g'), 200), 'calls', calls, 'mean_ms', round(mean_exec_time::numeric, 2),
                 'max_ms', round(max_exec_time::numeric), 'total_ms', round(total_exec_time::numeric), 'rows_per_call', round(rows::numeric / greatest(calls, 1), 1),
                 'cache_hit', case when shared_blks_hit + shared_blks_read > 0 then round(shared_blks_hit::numeric / (shared_blks_hit + shared_blks_read), 4) end)
                 order by mean_exec_time desc), '[]'::jsonb)
               from (select * from %s where calls >= 3 and mean_exec_time > 50 and query ~* '(from|into|update)\s+("?public"?\.)?"?[a-z_]+' and query not ilike '%%pg_stat%%'
                     and query not ilike '%%pg_catalog%%' order by mean_exec_time desc limit 15) s$q$, v_stmt) into v_slow;
      v_slow_n := jsonb_array_length(v_slow);
    exception when others then v_slow := null;
    end;
  end if;

  -- Aggregation timing: the same kind of work the reports do (count, group by day over a time range), on the audit history, measured here and now.
  t0 := clock_timestamp(); perform count(*) from public.audit_events; v_ms1 := round(extract(epoch from clock_timestamp() - t0) * 1000, 2);
  t0 := clock_timestamp(); perform count(*) from (select date_trunc('day', occurred_at) d, count(*) from public.audit_events where occurred_at >= now() - interval '30 days' group by 1) g;
  v_ms2 := round(extract(epoch from clock_timestamp() - t0) * 1000, 2);
  v_agg := jsonb_build_object('count_audit_ms', v_ms1, 'group_by_day_ms', v_ms2);

  -- one trend point per 10 minutes, and nothing older than 30 days
  insert into public.db_perf_snapshots (at, db_size_bytes, connections, active_connections, max_connections, cache_hit_ratio, latency_ms, seq_scans, idx_scans, dead_tuples, live_tuples, slow_queries)
  select now(), (v_db ->> 'size_bytes')::bigint, v_conns, v_active, (v_conn ->> 'max')::integer, round(v_hit, 4), v_lat,
         (select coalesce(sum(seq_scan), 0) from pg_catalog.pg_stat_user_tables where schemaname = 'public'),
         (select coalesce(sum(idx_scan), 0) from pg_catalog.pg_stat_user_tables where schemaname = 'public'),
         (select coalesce(sum(n_dead_tup), 0) from pg_catalog.pg_stat_user_tables where schemaname = 'public'),
         (select coalesce(sum(n_live_tup), 0) from pg_catalog.pg_stat_user_tables where schemaname = 'public'), v_slow_n
  where not exists (select 1 from public.db_perf_snapshots where at > now() - interval '10 minutes');
  delete from public.db_perf_snapshots where at < now() - interval '30 days';
  select coalesce(jsonb_agg(to_jsonb(s) order by s.at), '[]'::jsonb) into v_trend from public.db_perf_snapshots s where s.at >= now() - make_interval(hours => v_hours);

  return jsonb_build_object('generated_at', now(), 'hours', v_hours, 'latency_ms', v_lat, 'connections', v_conn, 'database', v_db, 'cache_hit_ratio', round(v_hit, 4),
    'tables', v_tables, 'indexes', v_indexes, 'slow_queries', v_slow, 'statements_available', v_stmt is not null, 'aggregation', v_agg, 'trend', v_trend);
end $$;
revoke all on function public.admin_db_overview(integer) from public, anon;
grant execute on function public.admin_db_overview(integer) to authenticated;

-- The query report: what the browsers ran, how often, how long, how many rows came back. Locations are "table.operation": no parameters, no ids, no content.
create or replace function public.admin_db_query_report(p_hours integer default 24) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_hours integer := least(greatest(coalesce(p_hours, 24), 1), 720);
begin
  perform public._require_admin();
  return jsonb_build_object('hours', v_hours, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('location', location, 'table', table_name, 'operation', operation, 'calls', calls, 'errors', errors, 'slow', slow,
             'avg_ms', round(total_ms::numeric / greatest(calls, 1), 1), 'max_ms', max_ms, 'rows_avg', round(rows_total::numeric / greatest(calls, 1), 1)) order by total_ms desc)
    from (select location, table_name, operation, sum(calls) calls, sum(errors) errors, sum(slow) slow, sum(total_ms) total_ms, max(max_ms) max_ms, sum(rows_total) rows_total
          from public.query_stats where bucket >= now() - make_interval(hours => v_hours) group by 1, 2, 3 order by sum(total_ms) desc limit 100) q), '[]'::jsonb));
end $$;
revoke all on function public.admin_db_query_report(integer) from public, anon;
grant execute on function public.admin_db_query_report(integer) to authenticated;

create or replace function public.purge_performance_data(p_stat_days integer default 30, p_snapshot_days integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer;
begin
  with x as (delete from public.query_stats where bucket < now() - make_interval(days => p_stat_days) returning 1) select count(*) into a from x;
  with x as (delete from public.db_perf_snapshots where at < now() - make_interval(days => p_snapshot_days) returning 1) select count(*) into b from x;
  return jsonb_build_object('query_stats', a, 'db_perf_snapshots', b);
end $$;
revoke all on function public.purge_performance_data(integer, integer) from public, anon, authenticated;
grant execute on function public.purge_performance_data(integer, integer) to service_role;

-- =============================================================================================================================== 3. feature flags
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){0,3}$' and char_length(key) <= 64),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  kind text not null default 'release' check (kind in ('release', 'experiment', 'ops')),
  module text check (module is null or module ~ '^[a-z][a-z0-9_]{0,30}$'),
  is_protected boolean not null default false,        -- core.* flags: always on, never switchable
  archived boolean not null default false,
  default_value boolean not null default false,       -- the value when nothing else applies (an archived flag, or an environment without a setting)
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint feature_flags_protected_core check (is_protected = (key like 'core.%'))
);
create table if not exists public.feature_flag_envs (
  flag_key text not null references public.feature_flags(key) on delete cascade,
  env text not null check (env in ('development', 'staging', 'production')),
  enabled boolean not null default false,
  default_value boolean not null default false,       -- the value for people outside the rollout
  rollout_percent numeric(5, 2) not null default 100 check (rollout_percent between 0 and 100),
  allow_users uuid[] not null default '{}' check (cardinality(allow_users) <= 200),
  block_users uuid[] not null default '{}' check (cardinality(block_users) <= 200),
  roles text[] not null default '{}' check (roles <@ array['user', 'admin']),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (flag_key, env)
);
-- One row: the emergency controls. They can switch things off, never the protected parts.
create table if not exists public.platform_controls (
  id integer primary key check (id = 1),
  global_disable boolean not null default false,       -- every non-protected flag evaluates to off
  experiments_disabled boolean not null default false, -- every "experiment" flag evaluates to off and no one is enrolled
  disabled_modules text[] not null default '{}' check (cardinality(disabled_modules) <= 30),
  reason text not null default '' check (char_length(reason) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.platform_controls (id) values (1) on conflict do nothing;
-- Who changed what, before and after: the source for the history view and for rollback. (The Audit History gets a redacted line for each entry too.)
create table if not exists public.feature_flag_history (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('flag', 'experiment', 'controls')),
  ref_key text not null check (char_length(ref_key) <= 64),
  env text check (env is null or env in ('development', 'staging', 'production')),
  at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) <= 30),
  before jsonb, after jsonb,
  reason text not null default '' check (char_length(reason) <= 200)
);
create index if not exists feature_flag_history_ref_idx on public.feature_flag_history (ref_key, at desc);
create index if not exists feature_flag_history_at_idx on public.feature_flag_history (at desc);

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,47}$'),
  flag_key text not null references public.feature_flags(key),
  name text not null check (char_length(name) between 1 and 80),
  hypothesis text not null default '' check (char_length(hypothesis) <= 500),
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed')),
  traffic_percent numeric(5, 2) not null default 100 check (traffic_percent between 0 and 100),
  variants jsonb not null check (jsonb_typeof(variants) = 'array'),
  primary_event text not null default 'conversion' check (primary_event ~ '^[a-z][a-z0-9_]{0,39}$'),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz, ended_at timestamptz, updated_at timestamptz not null default now()
);
-- Exposure = the person was shown a variant. Conversion = they did the thing the experiment is about (reported by the app on purpose). One of each per person.
create table if not exists public.experiment_events (
  id bigint generated always as identity primary key,
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,   -- removed with the account; administrators only ever see counts
  variant text not null,
  event text not null check (event in ('exposure', 'conversion')),
  name text not null default '' check (name ~ '^[a-z0-9_]{0,40}$'),
  at timestamptz not null default now(),
  unique (experiment_id, user_id, event, name)
);
create index if not exists experiment_events_exp_idx on public.experiment_events (experiment_id, event, variant);
create index if not exists experiment_events_user_idx on public.experiment_events (user_id);

do $$
declare t text;
begin
  foreach t in array array['feature_flags', 'feature_flag_envs', 'platform_controls', 'feature_flag_history', 'experiments', 'experiment_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);   -- no policies: every read and write goes through the functions below
  end loop;
end $$;

-- ------------------------------------------------------------------------------------------------------------------ hashing and evaluation (mirrors packages/core/src/flags.js)
create or replace function public._fnv1a(p text) returns bigint
language plpgsql immutable set search_path = '' as $$
declare b bytea := convert_to(p, 'UTF8'); h bigint := 2166136261; i integer;
begin
  for i in 0 .. length(b) - 1 loop
    h := h # get_byte(b, i)::bigint;
    h := (h * 16777619) & 4294967295;
  end loop;
  return h;
end $$;
create or replace function public._flag_bucket(p_key text, p_user uuid) returns integer
language sql immutable set search_path = '' as $$ select (public._fnv1a(p_key || ':' || p_user::text) % 10000)::integer $$;

create or replace function public._flag_value(p_key text, p_env text, p_uid uuid, p_role text, c public.platform_controls) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f public.feature_flags; e public.feature_flag_envs; pct numeric;
begin
  select * into f from public.feature_flags where key = p_key;
  if not found then return jsonb_build_object('enabled', false, 'reason', 'unknown_flag'); end if;
  if f.is_protected then return jsonb_build_object('enabled', true, 'reason', 'protected'); end if;
  if f.archived then return jsonb_build_object('enabled', f.default_value, 'reason', 'archived'); end if;
  if c.global_disable then return jsonb_build_object('enabled', false, 'reason', 'kill_global'); end if;
  if c.experiments_disabled and f.kind = 'experiment' then return jsonb_build_object('enabled', false, 'reason', 'kill_experiments'); end if;
  if f.module is not null and f.module = any (c.disabled_modules) then return jsonb_build_object('enabled', false, 'reason', 'kill_module'); end if;
  select * into e from public.feature_flag_envs where flag_key = p_key and env = p_env;
  if not found then return jsonb_build_object('enabled', f.default_value, 'reason', 'no_environment'); end if;
  if not e.enabled then return jsonb_build_object('enabled', false, 'reason', 'disabled'); end if;
  if p_uid is not null and p_uid = any (e.block_users) then return jsonb_build_object('enabled', false, 'reason', 'blocked'); end if;
  if p_uid is not null and p_uid = any (e.allow_users) then return jsonb_build_object('enabled', true, 'reason', 'allowed'); end if;
  if cardinality(e.roles) > 0 and not (coalesce(p_role, 'user') = any (e.roles)) then return jsonb_build_object('enabled', false, 'reason', 'role_excluded'); end if;
  pct := e.rollout_percent;
  if pct >= 100 then return jsonb_build_object('enabled', true, 'reason', case when cardinality(e.roles) > 0 then 'role' else 'everyone' end); end if;
  if p_uid is null then return jsonb_build_object('enabled', e.default_value, 'reason', 'anonymous_default'); end if;
  if public._flag_bucket(p_key, p_uid) < round(pct * 100) then return jsonb_build_object('enabled', true, 'reason', 'rollout'); end if;
  return jsonb_build_object('enabled', e.default_value, 'reason', 'default');
end $$;
revoke all on function public._flag_value(text, text, uuid, text, public.platform_controls) from public, anon, authenticated;

-- The one call the apps make: every flag for the signed-in person, evaluated here. `version` changes whenever any flag or control changes.
create or replace function public.evaluate_flags(p_env text default 'production') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_env text := case when p_env in ('development', 'staging', 'production') then p_env else 'production' end; v_role text; c public.platform_controls; r jsonb := '{}'::jsonb; k text;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  v_role := case when public.is_platform_admin() then 'admin' else 'user' end;
  select * into c from public.platform_controls where id = 1;
  for k in select key from public.feature_flags order by key loop
    r := r || jsonb_build_object(k, (public._flag_value(k, v_env, v_uid, v_role, c) ->> 'enabled')::boolean);
  end loop;
  return jsonb_build_object('env', v_env, 'flags', r,
    'killed', c.global_disable or c.experiments_disabled or cardinality(c.disabled_modules) > 0,
    'version', greatest((select max(updated_at) from public.feature_flag_envs), (select max(updated_at) from public.feature_flags), c.updated_at));
end $$;
revoke all on function public.evaluate_flags(text) from public, anon;
grant execute on function public.evaluate_flags(text) to authenticated;

-- For database code that guards real functionality (an RPC, a policy): is this flag on for the signed-in person? The environment is the database's own
-- setting `lifetrack.environment` (default production), not something a client can choose.
create or replace function public.flag_enabled(p_key text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare c public.platform_controls;
begin
  if auth.uid() is null then return false; end if;
  select * into c from public.platform_controls where id = 1;
  return coalesce((public._flag_value(p_key, coalesce(nullif(current_setting('lifetrack.environment', true), ''), 'production'), auth.uid(),
    case when public.is_platform_admin() then 'admin' else 'user' end, c) ->> 'enabled')::boolean, false);
end $$;
revoke all on function public.flag_enabled(text) from public, anon;
grant execute on function public.flag_enabled(text) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ history + audit
create or replace function public._env_json(e public.feature_flag_envs) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('enabled', e.enabled, 'default_value', e.default_value, 'rollout_percent', e.rollout_percent, 'allow_users', to_jsonb(e.allow_users),
    'block_users', to_jsonb(e.block_users), 'roles', to_jsonb(e.roles))
$$;
-- The audit history gets counts, not the user ids of an allow- or block-list.
create or replace function public._flag_redact(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when j is null then null else (j - 'allow_users' - 'block_users') || jsonb_build_object('allow_count', jsonb_array_length(coalesce(j -> 'allow_users', '[]'::jsonb)),
    'block_count', jsonb_array_length(coalesce(j -> 'block_users', '[]'::jsonb))) end
$$;
create or replace function public._flag_log(p_scope text, p_ref text, p_env text, p_action text, p_before jsonb, p_after jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  insert into public.feature_flag_history (scope, ref_key, env, actor, action, before, after, reason) values (p_scope, p_ref, p_env, v_uid, p_action, p_before, p_after, left(coalesce(p_reason, ''), 200));
  if v_uid is not null then
    perform public._audit_insert(v_uid, 'config', null, case p_scope when 'flag' then 'feature_flag' when 'experiment' then 'experiment' else 'platform_controls' end, p_ref,
      left(format('%s %s%s', p_action, p_ref, coalesce(' (' || p_env || ')', '')), 200), '{}', public._flag_redact(p_before), public._flag_redact(p_after), false);
  end if;
end $$;
revoke all on function public._env_json(public.feature_flag_envs), public._flag_redact(jsonb), public._flag_log(text, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------------------------ administration (every function checks the caller itself)
create or replace function public.admin_flags() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.platform_controls;
begin
  perform public._require_admin();
  select * into c from public.platform_controls where id = 1;
  return jsonb_build_object('controls', to_jsonb(c) - 'id', 'flags', coalesce((
    select jsonb_agg(jsonb_build_object('key', f.key, 'name', f.name, 'description', f.description, 'kind', f.kind, 'module', f.module, 'protected', f.is_protected,
      'archived', f.archived, 'default_value', f.default_value, 'created_at', f.created_at, 'updated_at', f.updated_at,
      'envs', coalesce((select jsonb_object_agg(e.env, public._env_json(e) || jsonb_build_object('updated_at', e.updated_at)) from public.feature_flag_envs e where e.flag_key = f.key), '{}'::jsonb))
      order by f.is_protected desc, f.key) from public.feature_flags f), '[]'::jsonb));
end $$;
revoke all on function public.admin_flags() from public, anon;
grant execute on function public.admin_flags() to authenticated;

create or replace function public.admin_flag_create(p_key text, p_name text, p_description text default '', p_kind text default 'release', p_module text default null, p_default boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_env text;
begin
  perform public._require_admin();
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){0,3}$' or char_length(p_key) > 64 then raise exception 'The key needs lowercase letters, digits and underscores, with optional dots.' using errcode = '22023'; end if;
  if p_key like 'core.%' then raise exception 'Keys starting with core. are reserved for protected parts of the product.' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Give the flag a name of up to 80 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'The description can be at most 500 characters.' using errcode = '22023'; end if;
  if p_kind not in ('release', 'experiment', 'ops') then raise exception 'The kind must be release, experiment or ops.' using errcode = '22023'; end if;
  if exists (select 1 from public.feature_flags where key = p_key) then raise exception 'A flag with this key already exists.' using errcode = '23505'; end if;
  insert into public.feature_flags (key, name, description, kind, module, default_value, created_by, updated_by) values (p_key, btrim(p_name), coalesce(p_description, ''), p_kind, p_module, coalesce(p_default, false), v_uid, v_uid);
  foreach v_env in array array['development', 'staging', 'production'] loop
    insert into public.feature_flag_envs (flag_key, env, enabled, default_value, updated_by) values (p_key, v_env, false, coalesce(p_default, false), v_uid);  -- off everywhere until someone turns it on
  end loop;
  perform public._flag_log('flag', p_key, null, 'create', null, jsonb_build_object('name', p_name, 'kind', p_kind, 'module', p_module), '');
  return jsonb_build_object('key', p_key);
end $$;
revoke all on function public.admin_flag_create(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_flag_create(text, text, text, text, text, boolean) to authenticated;

create or replace function public.admin_flag_update(p_key text, p_name text, p_description text, p_module text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.feature_flags;
begin
  perform public._require_admin();
  select * into f from public.feature_flags where key = p_key for update;
  if not found then raise exception 'There is no flag with this key.' using errcode = 'P0002'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Give the flag a name of up to 80 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'The description can be at most 500 characters.' using errcode = '22023'; end if;
  if f.is_protected then p_module := null; end if;
  update public.feature_flags set name = btrim(p_name), description = coalesce(p_description, ''), module = case when f.is_protected then null else p_module end, updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform public._flag_log('flag', p_key, null, 'edit', jsonb_build_object('name', f.name, 'description', f.description, 'module', f.module), jsonb_build_object('name', p_name, 'description', p_description, 'module', p_module), '');
end $$;
revoke all on function public.admin_flag_update(text, text, text, text) from public, anon;
grant execute on function public.admin_flag_update(text, text, text, text) to authenticated;

-- Changes one environment of one flag. `p_patch` may hold: enabled, default_value, rollout_percent, allow_users, block_users, roles. Protected flags are refused.
create or replace function public.admin_flag_env_set(p_key text, p_env text, p_patch jsonb, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.feature_flags; e public.feature_flag_envs; before jsonb; v_pct numeric; v_allow uuid[]; v_block uuid[]; v_roles text[]; u text;
begin
  perform public._require_admin();
  if p_env not in ('development', 'staging', 'production') then raise exception 'Unknown environment.' using errcode = '22023'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Nothing to change.' using errcode = '22023'; end if;
  select * into f from public.feature_flags where key = p_key for update;
  if not found then raise exception 'There is no flag with this key.' using errcode = 'P0002'; end if;
  if f.is_protected then raise exception 'This is a protected part of the product. It is always on and can not be switched off or changed.' using errcode = '42501'; end if;
  if f.archived then raise exception 'This flag is archived. Restore it before changing it.' using errcode = '42501'; end if;
  insert into public.feature_flag_envs (flag_key, env, enabled, default_value) values (p_key, p_env, false, f.default_value) on conflict do nothing;
  select * into e from public.feature_flag_envs where flag_key = p_key and env = p_env for update;
  before := public._env_json(e);
  v_pct := coalesce((p_patch ->> 'rollout_percent')::numeric, e.rollout_percent);
  if v_pct < 0 or v_pct > 100 then raise exception 'Rollout must be between 0 and 100 percent.' using errcode = '22023'; end if;
  v_allow := e.allow_users; v_block := e.block_users; v_roles := e.roles;
  if p_patch ? 'allow_users' then
    if jsonb_typeof(p_patch -> 'allow_users') <> 'array' or jsonb_array_length(p_patch -> 'allow_users') > 200 then raise exception 'A user list can hold up to 200 ids.' using errcode = '22023'; end if;
    for u in select jsonb_array_elements_text(p_patch -> 'allow_users') loop
      if u !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'User lists take user ids (UUIDs).' using errcode = '22023'; end if;
    end loop;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_allow from jsonb_array_elements_text(p_patch -> 'allow_users') x;
  end if;
  if p_patch ? 'block_users' then
    if jsonb_typeof(p_patch -> 'block_users') <> 'array' or jsonb_array_length(p_patch -> 'block_users') > 200 then raise exception 'A user list can hold up to 200 ids.' using errcode = '22023'; end if;
    for u in select jsonb_array_elements_text(p_patch -> 'block_users') loop
      if u !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'User lists take user ids (UUIDs).' using errcode = '22023'; end if;
    end loop;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_block from jsonb_array_elements_text(p_patch -> 'block_users') x;
  end if;
  if p_patch ? 'roles' then
    if jsonb_typeof(p_patch -> 'roles') <> 'array' then raise exception 'Roles must be a list.' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_roles from jsonb_array_elements_text(p_patch -> 'roles') x;
    if not (v_roles <@ array['user', 'admin']) then raise exception 'Roles can be user or admin.' using errcode = '22023'; end if;
  end if;
  update public.feature_flag_envs set enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled), default_value = coalesce((p_patch ->> 'default_value')::boolean, default_value),
    rollout_percent = v_pct, allow_users = v_allow, block_users = v_block, roles = v_roles, updated_at = now(), updated_by = auth.uid()
    where flag_key = p_key and env = p_env returning * into e;
  perform public._flag_log('flag', p_key, p_env, 'env_set', before, public._env_json(e), p_reason);
  return public._env_json(e);
end $$;
revoke all on function public.admin_flag_env_set(text, text, jsonb, text) from public, anon;
grant execute on function public.admin_flag_env_set(text, text, jsonb, text) to authenticated;

-- Archiving keeps the flag and its history; an archived flag evaluates to its default and can not be changed until restored. Flags are never deleted.
create or replace function public.admin_flag_archive(p_key text, p_archived boolean, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare f public.feature_flags;
begin
  perform public._require_admin();
  select * into f from public.feature_flags where key = p_key for update;
  if not found then raise exception 'There is no flag with this key.' using errcode = 'P0002'; end if;
  if f.is_protected then raise exception 'This is a protected part of the product and can not be archived.' using errcode = '42501'; end if;
  if exists (select 1 from public.experiments x where x.flag_key = p_key and x.status in ('running', 'paused')) and p_archived then raise exception 'An experiment that is running or paused uses this flag. Complete it first.' using errcode = '23514'; end if;
  update public.feature_flags set archived = coalesce(p_archived, true), updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform public._flag_log('flag', p_key, null, case when coalesce(p_archived, true) then 'archive' else 'restore' end, jsonb_build_object('archived', f.archived), jsonb_build_object('archived', coalesce(p_archived, true)), p_reason);
end $$;
revoke all on function public.admin_flag_archive(text, boolean, text) from public, anon;
grant execute on function public.admin_flag_archive(text, boolean, text) to authenticated;

create or replace function public.admin_flag_history(p_key text default null, p_limit integer default 25, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100); v_total integer;
begin
  perform public._require_admin();
  select count(*) into v_total from public.feature_flag_history where p_key is null or ref_key = p_key;
  return jsonb_build_object('total', v_total, 'items', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
      select h.id, h.scope, h.ref_key, h.env, h.at, h.action, h.before, h.after, h.reason, coalesce(u.email, 'removed account') as actor
      from public.feature_flag_history h left join auth.users u on u.id = h.actor
      where p_key is null or h.ref_key = p_key order by h.at desc, h.id desc limit v_limit offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end $$;
revoke all on function public.admin_flag_history(text, integer, integer) from public, anon;
grant execute on function public.admin_flag_history(text, integer, integer) to authenticated;

-- Restores the configuration an earlier change replaced. Only flag-environment and emergency-control changes can be rolled back, never a protected flag.
-- The rollback is itself a new history entry (and an audit event), so it can be rolled back too.
create or replace function public.admin_flag_rollback(p_history_id bigint, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.feature_flag_history; f public.feature_flags; e public.feature_flag_envs; before jsonb; c public.platform_controls;
begin
  perform public._require_admin();
  select * into h from public.feature_flag_history where id = p_history_id;
  if not found then raise exception 'That history entry does not exist.' using errcode = 'P0002'; end if;
  if h.before is null or h.action not in ('env_set', 'rollback', 'controls') then raise exception 'This kind of change can not be rolled back.' using errcode = '22023'; end if;
  if h.scope = 'flag' then
    select * into f from public.feature_flags where key = h.ref_key for update;
    if not found or f.is_protected then raise exception 'This flag can not be changed.' using errcode = '42501'; end if;
    if f.archived then raise exception 'This flag is archived. Restore it first.' using errcode = '42501'; end if;
    select * into e from public.feature_flag_envs where flag_key = h.ref_key and env = h.env for update;
    if not found then raise exception 'That environment no longer exists.' using errcode = 'P0002'; end if;
    before := public._env_json(e);
    update public.feature_flag_envs set enabled = (h.before ->> 'enabled')::boolean, default_value = (h.before ->> 'default_value')::boolean, rollout_percent = (h.before ->> 'rollout_percent')::numeric,
      allow_users = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(h.before -> 'allow_users') x), '{}'),
      block_users = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(h.before -> 'block_users') x), '{}'),
      roles = coalesce((select array_agg(x) from jsonb_array_elements_text(h.before -> 'roles') x), '{}'), updated_at = now(), updated_by = auth.uid()
      where flag_key = h.ref_key and env = h.env returning * into e;
    perform public._flag_log('flag', h.ref_key, h.env, 'rollback', before, public._env_json(e), coalesce(nullif(p_reason, ''), 'Rolled back change #' || h.id));
    return public._env_json(e);
  elsif h.scope = 'controls' then
    select * into c from public.platform_controls where id = 1 for update;
    before := to_jsonb(c) - 'id' - 'updated_at' - 'updated_by';
    update public.platform_controls set global_disable = (h.before ->> 'global_disable')::boolean, experiments_disabled = (h.before ->> 'experiments_disabled')::boolean,
      disabled_modules = coalesce((select array_agg(x) from jsonb_array_elements_text(h.before -> 'disabled_modules') x), '{}'), reason = coalesce(h.before ->> 'reason', ''), updated_at = now(), updated_by = auth.uid() where id = 1;
    perform public._flag_log('controls', 'platform_controls', null, 'rollback', before, h.before, coalesce(nullif(p_reason, ''), 'Rolled back change #' || h.id));
    return h.before;
  end if;
  raise exception 'This kind of change can not be rolled back.' using errcode = '22023';
end $$;
revoke all on function public.admin_flag_rollback(bigint, text) from public, anon;
grant execute on function public.admin_flag_rollback(bigint, text) to authenticated;

-- Emergency controls. A reason is required. Switching things OFF is always allowed; the protected core.* flags ignore all of it (see _flag_value).
create or replace function public.admin_controls_set(p_patch jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.platform_controls; before jsonb; v_modules text[]; m text;
begin
  perform public._require_admin();
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 200 then raise exception 'Say why (3 to 200 characters): it goes in the history.' using errcode = '22023'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Nothing to change.' using errcode = '22023'; end if;
  select * into c from public.platform_controls where id = 1 for update;
  before := to_jsonb(c) - 'id' - 'updated_at' - 'updated_by';
  v_modules := c.disabled_modules;
  if p_patch ? 'disabled_modules' then
    if jsonb_typeof(p_patch -> 'disabled_modules') <> 'array' or jsonb_array_length(p_patch -> 'disabled_modules') > 30 then raise exception 'Up to 30 modules can be switched off.' using errcode = '22023'; end if;
    for m in select jsonb_array_elements_text(p_patch -> 'disabled_modules') loop
      if m !~ '^[a-z][a-z0-9_]{0,30}$' then raise exception 'Module names use lowercase letters, digits and underscores.' using errcode = '22023'; end if;
      if m in ('core', 'auth', 'security', 'recovery', 'data_integrity', 'settings') then raise exception 'Sign-in, security, data integrity and recovery can never be switched off.' using errcode = '42501'; end if;
    end loop;
    select coalesce(array_agg(distinct x), '{}') into v_modules from jsonb_array_elements_text(p_patch -> 'disabled_modules') x;
  end if;
  update public.platform_controls set global_disable = coalesce((p_patch ->> 'global_disable')::boolean, global_disable), experiments_disabled = coalesce((p_patch ->> 'experiments_disabled')::boolean, experiments_disabled),
    disabled_modules = v_modules, reason = left(btrim(p_reason), 200), updated_at = now(), updated_by = auth.uid() where id = 1 returning * into c;
  perform public._flag_log('controls', 'platform_controls', null, 'controls', before, to_jsonb(c) - 'id' - 'updated_at' - 'updated_by', p_reason);
  return to_jsonb(c) - 'id';
end $$;
revoke all on function public.admin_controls_set(jsonb, text) from public, anon;
grant execute on function public.admin_controls_set(jsonb, text) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ experiments
create or replace function public._experiment_variant(p_key text, p_traffic numeric, p_variants jsonb, p_uid uuid) returns text
language plpgsql immutable set search_path = '' as $$
declare v jsonb; acc integer := 0; point integer; last_key text;
begin
  if p_uid is null then return null; end if;
  if (public._fnv1a('exp:' || p_key || ':' || p_uid::text) % 10000) >= round(p_traffic * 100) then return null; end if;
  point := (public._fnv1a('var:' || p_key || ':' || p_uid::text) % 100)::integer;
  for v in select * from jsonb_array_elements(p_variants) loop
    acc := acc + (v ->> 'weight')::integer; last_key := v ->> 'key';
    if point < acc then return last_key; end if;
  end loop;
  return last_key;
end $$;
revoke all on function public._experiment_variant(text, numeric, jsonb, uuid) from public, anon, authenticated;

create or replace function public._variants_problem(p_variants jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare n integer; v jsonb; total integer := 0; keys text[] := '{}';
begin
  if jsonb_typeof(p_variants) <> 'array' then return 'Variants must be a list.'; end if;
  n := jsonb_array_length(p_variants);
  if n < 2 or n > 5 then return 'An experiment needs 2 to 5 variants.'; end if;
  for v in select * from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v) <> 'object' or coalesce(v ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,31}$' then return 'Variant keys use lowercase letters, digits and underscores.'; end if;
    if coalesce(v ->> 'weight', '') !~ '^[0-9]{1,3}$' or (v ->> 'weight')::integer < 1 then return 'Each variant needs a whole-number weight of at least 1.'; end if;
    if (v ->> 'key') = any (keys) then return 'Variant keys must be different.'; end if;
    keys := keys || (v ->> 'key'); total := total + (v ->> 'weight')::integer;
  end loop;
  if not ('control' = any (keys)) then return 'One variant must be named control.'; end if;
  if total <> 100 then return 'Variant weights must add up to 100.'; end if;
  return null;
end $$;
revoke all on function public._variants_problem(jsonb) from public, anon, authenticated;

create or replace function public.admin_experiment_save(p_key text, p_flag_key text, p_name text, p_hypothesis text, p_traffic numeric, p_variants jsonb, p_primary_event text default 'conversion') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.experiments; f public.feature_flags; v_problem text;
begin
  perform public._require_admin();
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{0,47}$' then raise exception 'The experiment key uses lowercase letters, digits and underscores.' using errcode = '22023'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Give the experiment a name of up to 80 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(p_hypothesis, '')) > 500 then raise exception 'The hypothesis can be at most 500 characters.' using errcode = '22023'; end if;
  if p_traffic is null or p_traffic < 0 or p_traffic > 100 then raise exception 'Traffic must be between 0 and 100 percent.' using errcode = '22023'; end if;
  if coalesce(p_primary_event, 'conversion') !~ '^[a-z][a-z0-9_]{0,39}$' then raise exception 'The conversion event uses lowercase letters, digits and underscores.' using errcode = '22023'; end if;
  v_problem := public._variants_problem(p_variants);
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  select * into f from public.feature_flags where key = p_flag_key;
  if not found then raise exception 'There is no flag with that key.' using errcode = 'P0002'; end if;
  if f.is_protected or f.kind <> 'experiment' then raise exception 'An experiment needs a flag of the kind experiment (never a protected one).' using errcode = '42501'; end if;
  select * into x from public.experiments where key = p_key for update;
  if found then
    if x.status <> 'draft' then raise exception 'Only a draft can be edited: people are already assigned to the variants.' using errcode = '23514'; end if;
    update public.experiments set flag_key = p_flag_key, name = btrim(p_name), hypothesis = coalesce(p_hypothesis, ''), traffic_percent = p_traffic, variants = p_variants,
      primary_event = coalesce(p_primary_event, 'conversion'), updated_at = now() where key = p_key;
    perform public._flag_log('experiment', p_key, null, 'edit', to_jsonb(x) - 'id', jsonb_build_object('traffic_percent', p_traffic, 'variants', p_variants), '');
  else
    insert into public.experiments (key, flag_key, name, hypothesis, traffic_percent, variants, primary_event, created_by) values (p_key, p_flag_key, btrim(p_name), coalesce(p_hypothesis, ''), p_traffic, p_variants, coalesce(p_primary_event, 'conversion'), auth.uid());
    perform public._flag_log('experiment', p_key, null, 'create', null, jsonb_build_object('flag', p_flag_key, 'traffic_percent', p_traffic, 'variants', p_variants), '');
  end if;
  return jsonb_build_object('key', p_key, 'status', 'draft');
end $$;
revoke all on function public.admin_experiment_save(text, text, text, text, numeric, jsonb, text) from public, anon;
grant execute on function public.admin_experiment_save(text, text, text, text, numeric, jsonb, text) to authenticated;

create or replace function public.admin_experiment_set_status(p_key text, p_status text, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.experiments; ok boolean;
begin
  perform public._require_admin();
  select * into x from public.experiments where key = p_key for update;
  if not found then raise exception 'There is no experiment with this key.' using errcode = 'P0002'; end if;
  ok := (x.status = 'draft' and p_status = 'running') or (x.status = 'running' and p_status in ('paused', 'completed')) or (x.status = 'paused' and p_status in ('running', 'completed'));
  if not ok then raise exception 'An experiment can not go from % to %.', x.status, p_status using errcode = '23514'; end if;
  update public.experiments set status = p_status, started_at = case when p_status = 'running' and started_at is null then now() else started_at end,
    ended_at = case when p_status = 'completed' then now() else ended_at end, updated_at = now() where key = p_key;
  perform public._flag_log('experiment', p_key, null, 'status', jsonb_build_object('status', x.status), jsonb_build_object('status', p_status), p_reason);
  return jsonb_build_object('key', p_key, 'status', p_status);
end $$;
revoke all on function public.admin_experiment_set_status(text, text, text) from public, anon;
grant execute on function public.admin_experiment_set_status(text, text, text) to authenticated;

create or replace function public.admin_experiments() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('key', x.key, 'flag_key', x.flag_key, 'name', x.name, 'hypothesis', x.hypothesis, 'status', x.status, 'traffic_percent', x.traffic_percent,
    'variants', x.variants, 'primary_event', x.primary_event, 'started_at', x.started_at, 'ended_at', x.ended_at, 'created_at', x.created_at,
    'participants', (select count(*) from public.experiment_events e where e.experiment_id = x.id and e.event = 'exposure')) order by x.created_at desc) from public.experiments x), '[]'::jsonb);
end $$;
revoke all on function public.admin_experiments() from public, anon;
grant execute on function public.admin_experiments() to authenticated;

-- Counts only: participants (people shown a variant) and conversions (of those, people who did the primary event), plus exposures per day. No user ids.
create or replace function public.admin_experiment_results(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare x public.experiments;
begin
  perform public._require_admin();
  select * into x from public.experiments where key = p_key;
  if not found then raise exception 'There is no experiment with this key.' using errcode = 'P0002'; end if;
  return jsonb_build_object('key', x.key, 'status', x.status, 'primary_event', x.primary_event, 'variants', x.variants,
    'rows', (select jsonb_agg(jsonb_build_object('variant', v ->> 'key',
        'participants', (select count(*) from public.experiment_events e where e.experiment_id = x.id and e.event = 'exposure' and e.variant = v ->> 'key'),
        'conversions', (select count(*) from public.experiment_events e where e.experiment_id = x.id and e.event = 'conversion' and e.name = x.primary_event and e.variant = v ->> 'key')))
      from jsonb_array_elements(x.variants) v),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'variant', variant, 'participants', n) order by d) from (
      select date_trunc('day', at)::date d, variant, count(*) n from public.experiment_events where experiment_id = x.id and event = 'exposure' group by 1, 2) q), '[]'::jsonb));
end $$;
revoke all on function public.admin_experiment_results(text) from public, anon;
grant execute on function public.admin_experiment_results(text) to authenticated;

-- The app asks which variant to show. Everything is decided here: the experiment must be running, the controls must allow it and its flag must be on for this person.
-- Someone who is not enrolled gets "control" and nothing is recorded. The first call that enrolls someone records their exposure (once).
create or replace function public.experiment_assign(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); x public.experiments; c public.platform_controls; v_variant text; v_env text := coalesce(nullif(current_setting('lifetrack.environment', true), ''), 'production');
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into x from public.experiments where key = p_key;
  if not found or x.status <> 'running' then return jsonb_build_object('variant', 'control', 'enrolled', false); end if;
  select * into c from public.platform_controls where id = 1;
  if c.experiments_disabled or c.global_disable then return jsonb_build_object('variant', 'control', 'enrolled', false); end if;
  if not coalesce((public._flag_value(x.flag_key, v_env, v_uid, case when public.is_platform_admin() then 'admin' else 'user' end, c) ->> 'enabled')::boolean, false) then
    return jsonb_build_object('variant', 'control', 'enrolled', false);
  end if;
  v_variant := public._experiment_variant(x.key, x.traffic_percent, x.variants, v_uid);
  if v_variant is null then return jsonb_build_object('variant', 'control', 'enrolled', false); end if;
  insert into public.experiment_events (experiment_id, user_id, variant, event, name) values (x.id, v_uid, v_variant, 'exposure', '') on conflict do nothing;
  return jsonb_build_object('variant', v_variant, 'enrolled', true);
end $$;
revoke all on function public.experiment_assign(text) from public, anon;
grant execute on function public.experiment_assign(text) to authenticated;

-- An explicit conversion event: the app calls this when the person does the thing being measured. Only someone who was enrolled can convert, once per event name.
create or replace function public.experiment_convert(p_key text, p_event text default 'conversion') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); x public.experiments; v_variant text; n integer;
begin
  if v_uid is null then return false; end if;
  if p_event is null or p_event !~ '^[a-z][a-z0-9_]{0,39}$' then return false; end if;
  select * into x from public.experiments where key = p_key and status = 'running';
  if not found then return false; end if;
  select variant into v_variant from public.experiment_events where experiment_id = x.id and user_id = v_uid and event = 'exposure';
  if v_variant is null then return false; end if;
  insert into public.experiment_events (experiment_id, user_id, variant, event, name) values (x.id, v_uid, v_variant, 'conversion', p_event) on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.experiment_convert(text, text) from public, anon;
grant execute on function public.experiment_convert(text, text) to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ built-in flags
insert into public.feature_flags (key, name, description, kind, module, is_protected, default_value) values
  ('core.auth', 'Sign-in and sessions', 'Signing in, sessions and account recovery. Always on.', 'ops', null, true, true),
  ('core.security', 'Security and privacy', 'App lock, passkeys, module locks, row-level security. Always on.', 'ops', null, true, true),
  ('core.data_integrity', 'Data integrity', 'Validation, the audit history, conflict detection and sync. Always on.', 'ops', null, true, true),
  ('core.recovery', 'Backup and recovery', 'Export, backup, restore and the undo history. Always on.', 'ops', null, true, true),
  ('module.automation', 'Automation Studio', 'The Automation Studio pages and menu entry.', 'release', 'automation', false, true),
  ('module.challenges', 'Challenges', 'The Challenges pages and menu entry.', 'release', 'challenges', false, true),
  ('module.lifemap', 'Life Map', 'The Life Map page and menu entry.', 'release', 'lifemap', false, true),
  ('module.insights', 'Insights', 'The Insights page and menu entry.', 'release', 'insights', false, true),
  ('module.developers', 'Developers (API and webhooks)', 'The Developers page and menu entry.', 'release', 'developers', false, true)
on conflict (key) do nothing;
-- The shipped modules are on in every environment (as they were before flags existed).
insert into public.feature_flag_envs (flag_key, env, enabled, default_value)
  select f.key, e.env, true, true from public.feature_flags f cross join (values ('development'), ('staging'), ('production')) e(env) where f.key like 'module.%'
on conflict do nothing;

-- Internal helpers are not callable by clients.
revoke all on function public._fnv1a(text), public._flag_bucket(text, uuid) from public, anon, authenticated;


-- ===== 0029_reminder_anchor_day.sql =====
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


-- ===== 0030_flag_fk_indexes.sql =====
-- 0030: index the foreign-key columns added by 0028 (feature flags, experiments, platform controls). ADDITIVE and idempotent: indexes only.
-- A foreign key without an index makes deleting the referenced row (or a user) scan the whole child table.
create index if not exists feature_flags_created_by_idx on public.feature_flags (created_by);
create index if not exists feature_flags_updated_by_idx on public.feature_flags (updated_by);
create index if not exists feature_flag_envs_updated_by_idx on public.feature_flag_envs (updated_by);
create index if not exists feature_flag_history_actor_idx on public.feature_flag_history (actor);
create index if not exists experiments_flag_key_idx on public.experiments (flag_key);
create index if not exists experiments_created_by_idx on public.experiments (created_by);
create index if not exists platform_controls_updated_by_idx on public.platform_controls (updated_by);
