-- 0005: close the cross-owner foreign-key gap.
-- RLS checks the ROW's user_id, not the rows it points at, so before this migration a signed-in user who learned another
-- user's parent id (uuid) could attach their own child row to it (e.g. a habit_log pointing at someone else's habit).
-- No data is read or changed by this migration; it only adds BEFORE INSERT/UPDATE triggers (additive, reversible with DROP TRIGGER).
-- milestones and notes were already covered by check_same_owner() in 0003.

create or replace function public.enforce_same_owner() returns trigger
language plpgsql as $$
declare
  col text := tg_argv[0];
  parent text := tg_argv[1];
  ref uuid := nullif(to_jsonb(new) ->> col, '')::uuid;
  parent_owner uuid;
begin
  if ref is null then return new; end if;               -- optional link left empty
  execute format('select user_id from public.%I where id = $1', parent) into parent_owner using ref;
  if parent_owner is distinct from new.user_id then
    raise exception '% does not belong to this user', col using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare l record;
begin
  for l in select * from (values
    ('habit_logs',          'habit_id',       'habits'),
    ('application_history', 'application_id', 'job_applications'),
    ('interview_events',    'application_id', 'job_applications'),
    ('exercise_logs',       'workout_id',     'workouts'),
    ('exercise_logs',       'exercise_id',    'exercises'),
    ('goals',               'topic_id',       'learning_topics'),
    ('study_sessions',      'goal_id',        'goals'),
    ('study_sessions',      'topic_id',       'learning_topics'),
    ('workouts',            'routine_id',     'routines'),
    ('focus_sessions',      'task_id',        'tasks'),
    ('focus_sessions',      'topic_id',       'learning_topics')
  ) as t(child, col, parent) loop
    execute format('drop trigger if exists %I on public.%I', l.child || '_' || l.col || '_owner', l.child);
    execute format('create trigger %I before insert or update of %I, user_id on public.%I for each row execute function public.enforce_same_owner(%L, %L)',
      l.child || '_' || l.col || '_owner', l.col, l.child, l.col, l.parent);
  end loop;
end $$;
