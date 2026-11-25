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
