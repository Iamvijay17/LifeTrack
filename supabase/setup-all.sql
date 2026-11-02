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
