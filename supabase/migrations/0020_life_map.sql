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
