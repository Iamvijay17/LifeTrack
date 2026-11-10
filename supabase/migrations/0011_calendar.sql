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
