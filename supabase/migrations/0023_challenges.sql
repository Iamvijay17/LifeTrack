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
