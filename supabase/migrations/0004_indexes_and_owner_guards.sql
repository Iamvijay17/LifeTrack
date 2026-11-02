-- 0004: performance + integrity hardening (idempotent; safe to run on a database that already has 0001–0003).
--  1. Index every foreign-key column. Without these, deleting a parent row (a goal, task, routine…) scans the whole child
--     table, and ON DELETE SET NULL / CASCADE get slower as history grows. Nullable FKs use partial indexes (smaller).
--  2. Index user_id on the three tables RLS filters by user_id but that lacked a user_id-leading index.
--  3. Extend the "child must belong to the same user as its parent" guard from milestones/notes to EVERY parent link.
--     Row Level Security alone does not check foreign keys, so without this a user could point their own row at another
--     user's id (it would be unreadable, but it is an existence oracle and violates data isolation).

-- 1. Foreign-key indexes -----------------------------------------------------
create index if not exists goals_topic_idx            on public.goals (topic_id)            where topic_id is not null;
create index if not exists study_goal_idx             on public.study_sessions (goal_id)    where goal_id is not null;
create index if not exists study_topic_idx            on public.study_sessions (topic_id)   where topic_id is not null;
create index if not exists interview_application_idx  on public.interview_events (application_id);
create index if not exists workouts_routine_idx       on public.workouts (routine_id)       where routine_id is not null;
create index if not exists exercise_logs_exercise_idx on public.exercise_logs (exercise_id) where exercise_id is not null;
create index if not exists focus_task_idx             on public.focus_sessions (task_id)    where task_id is not null;
create index if not exists focus_topic_idx            on public.focus_sessions (topic_id)   where topic_id is not null;
create index if not exists notes_goal_idx             on public.notes (goal_id)             where goal_id is not null;
create index if not exists notes_task_idx             on public.notes (task_id)             where task_id is not null;

-- 2. user_id-leading indexes ----------------------------------------------------
create index if not exists app_history_user_idx       on public.application_history (user_id, changed_at);
create index if not exists routines_user_idx          on public.routines (user_id);
create index if not exists savings_goals_user_idx     on public.savings_goals (user_id);

-- 3. Same-owner guard for every parent link ------------------------------------
create or replace function public.check_same_owner() returns trigger
language plpgsql as $$
declare
  -- table -> [[fk column, parent table], ...]
  links constant jsonb := '{
    "goals":               [["topic_id","learning_topics"]],
    "habit_logs":          [["habit_id","habits"]],
    "study_sessions":      [["goal_id","goals"],["topic_id","learning_topics"]],
    "application_history": [["application_id","job_applications"]],
    "interview_events":    [["application_id","job_applications"]],
    "workouts":            [["routine_id","routines"]],
    "exercise_logs":       [["workout_id","workouts"],["exercise_id","exercises"]],
    "milestones":          [["goal_id","goals"]],
    "focus_sessions":      [["task_id","tasks"],["topic_id","learning_topics"]],
    "notes":               [["goal_id","goals"],["task_id","tasks"]]
  }';
  link jsonb;
  fk uuid;
  parent_owner uuid;
begin
  for link in select * from jsonb_array_elements(coalesce(links -> tg_table_name, '[]'::jsonb)) loop
    fk := nullif(to_jsonb(new) ->> (link ->> 0), '')::uuid;
    if fk is not null then
      -- Runs as the caller, so RLS hides other users' rows: a foreign parent reads as "not found".
      execute format('select user_id from public.%I where id = $1', link ->> 1) into parent_owner using fk;
      if parent_owner is distinct from new.user_id then
        raise exception '% does not refer to one of your records', link ->> 0 using errcode = '23503';
      end if;
    end if;
  end loop;
  return new;
end $$;

do $$
declare
  spec text[][] := array[
    ['goals','topic_id'], ['habit_logs','habit_id'], ['study_sessions','goal_id, topic_id'], ['application_history','application_id'],
    ['interview_events','application_id'], ['workouts','routine_id'], ['exercise_logs','workout_id, exercise_id'],
    ['milestones','goal_id'], ['focus_sessions','task_id, topic_id'], ['notes','goal_id, task_id']
  ];
  i int;
begin
  for i in 1 .. array_length(spec, 1) loop
    execute format('drop trigger if exists %I on public.%I', spec[i][1] || '_owner', spec[i][1]);
    execute format(
      'create trigger %I before insert or update of %s on public.%I for each row execute function public.check_same_owner()',
      spec[i][1] || '_owner', spec[i][2], spec[i][1]);
  end loop;
end $$;
