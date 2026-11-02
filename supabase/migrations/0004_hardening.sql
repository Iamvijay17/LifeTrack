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
