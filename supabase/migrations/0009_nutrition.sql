-- 0009: Food & Nutrition tracking. ADDITIVE: four new tables and two functions; no existing table, column or row changes.
--   foods              the user's own foods, and their edited copies of the built-in Indian starter list (the starter list itself ships with the apps)
--   food_logs          one row per food eaten (a snapshot of its nutrition, so editing a food later never rewrites history)
--   water_logs         one row per drink of water; the day's total is also kept in health_logs.water_ml so Sleep & Health stays in step
--   nutrition_settings one row per user: daily targets (null = not set) and favourite foods
-- Dates are plain `date` values in the user's own timezone (chosen by the app, like every other *_date column), so there is no UTC boundary to cross.

-- ------------------------------------------------------------------ foods
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'Other' check (char_length(category) between 1 and 40),
  base_key text check (base_key is null or char_length(base_key) between 1 and 60), -- set when this row is the user's edited copy of a starter food
  serving_label text not null default '1 serving' check (char_length(serving_label) between 1 and 60),
  serving_g numeric(7,1) check (serving_g is null or serving_g > 0),
  kcal numeric(7,1) not null default 0 check (kcal between 0 and 5000),   -- all nutrition is per ONE serving_label
  protein_g numeric(6,1) not null default 0 check (protein_g between 0 and 500),
  carbs_g numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g numeric(6,1) not null default 0 check (fat_g between 0 and 500),
  fiber_g numeric(6,1) not null default 0 check (fiber_g between 0 and 200),
  servings jsonb not null default '[]'::jsonb check (jsonb_typeof(servings) = 'array' and jsonb_array_length(servings) <= 12),   -- [{label, factor}]: other serving sizes, as multiples of serving_label
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 12),   -- [{label, kcal, protein_g, carbs_g, fat_g, fiber_g}]: preparation styles
  notes text not null default '' check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists foods_user_base_uq on public.foods (user_id, base_key) where base_key is not null;
create index if not exists foods_user_name_idx on public.foods (user_id, lower(name));

-- --------------------------------------------------------------- food_logs
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  log_time time,
  meal_type text not null check (meal_type in ('breakfast','lunch','snack','dinner')),
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'Other' check (char_length(category) between 1 and 40),
  food_id uuid references public.foods(id) on delete set null,
  base_key text check (base_key is null or char_length(base_key) between 1 and 60),   -- the starter food it came from, if any
  variant text not null default '' check (char_length(variant) <= 60),
  quantity numeric(7,2) not null default 1 check (quantity > 0 and quantity <= 1000),
  serving_label text not null default '1 serving' check (char_length(serving_label) between 1 and 60),
  kcal numeric(8,1) not null default 0 check (kcal between 0 and 20000),             -- totals for the whole entry (quantity already applied)
  protein_g numeric(7,1) not null default 0 check (protein_g between 0 and 2000),
  carbs_g numeric(7,1) not null default 0 check (carbs_g between 0 and 4000),
  fat_g numeric(7,1) not null default 0 check (fat_g between 0 and 2000),
  fiber_g numeric(7,1) not null default 0 check (fiber_g between 0 and 1000),
  notes text not null default '' check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_logs_user_date_idx on public.food_logs (user_id, log_date desc, log_time);
create index if not exists food_logs_updated_idx on public.food_logs (user_id, updated_at);
create index if not exists food_logs_food_idx on public.food_logs (food_id) where food_id is not null;

-- --------------------------------------------------------------- water_logs
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  log_time time,
  amount_ml int not null check (amount_ml between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists water_logs_user_date_idx on public.water_logs (user_id, log_date desc, created_at);

-- ------------------------------------------------------ nutrition_settings
create table if not exists public.nutrition_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() unique references auth.users(id) on delete cascade,
  calorie_goal int check (calorie_goal is null or calorie_goal between 500 and 10000),
  protein_goal_g int check (protein_goal_g is null or protein_goal_g between 1 and 1000),
  carbs_goal_g int check (carbs_goal_g is null or carbs_goal_g between 1 and 2000),
  fat_goal_g int check (fat_goal_g is null or fat_goal_g between 1 and 1000),
  fiber_goal_g int check (fiber_goal_g is null or fiber_goal_g between 1 and 500),
  favorite_foods jsonb not null default '[]'::jsonb check (jsonb_typeof(favorite_foods) = 'array' and jsonb_array_length(favorite_foods) <= 200), -- ["starter:idli", "custom:<uuid>"]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------- triggers, RLS, realtime (as in 0008)
do $$
declare t text;
begin
  foreach t in array array['foods','food_logs','water_logs','nutrition_settings'] loop
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

-- Same-owner guard from 0004: a food log can't point at another user's food.
drop trigger if exists fk_owner on public.food_logs;
create trigger fk_owner before insert or update on public.food_logs
  for each row execute function public.check_fk_owner('food_id', 'foods');

-- ------------------------------------------------------- atomic water entries
-- Both run as the caller (security invoker), so RLS still applies. They keep health_logs.water_ml (what Sleep & Health shows) equal to the
-- day's total, in the same transaction, so two devices adding water at once never lose an increment and a failure never leaves the two apart.
create or replace function public.log_water(p_date date, p_ml int, p_time time default null) returns jsonb
language plpgsql set search_path = '' as $$
declare
  w public.water_logs;
  h public.health_logs;
begin
  if p_ml is null or p_ml < 1 or p_ml > 5000 then
    raise exception 'amount must be between 1 and 5000 ml' using errcode = '22023';
  end if;
  insert into public.water_logs (log_date, log_time, amount_ml) values (p_date, p_time, p_ml) returning * into w;
  select * into h from public.add_water(p_date, p_ml);
  return jsonb_build_object('entry', to_jsonb(w), 'health', to_jsonb(h)); -- both rows, so the app updates its cache exactly
end $$;

create or replace function public.delete_water_log(p_id uuid) returns public.health_logs
language plpgsql set search_path = '' as $$
declare
  w public.water_logs;
  h public.health_logs;
begin
  delete from public.water_logs where id = p_id returning * into w;
  if not found then
    raise exception 'water entry not found' using errcode = 'P0002';
  end if;
  select * into h from public.add_water(w.log_date, -w.amount_ml);
  return h;
end $$;

revoke all on function public.log_water(date, int, time) from public, anon;
revoke all on function public.delete_water_log(uuid) from public, anon;
grant execute on function public.log_water(date, int, time) to authenticated;
grant execute on function public.delete_water_log(uuid) to authenticated;
