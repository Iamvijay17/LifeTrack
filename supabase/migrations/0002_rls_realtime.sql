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
