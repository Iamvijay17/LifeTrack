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
