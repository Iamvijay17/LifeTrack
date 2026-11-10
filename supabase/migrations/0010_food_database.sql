-- 0010: food database metadata. ADDITIVE and safe to re-run: two new columns and three indexes on tables from 0009. No row changes.
--   foods.aliases   other names the user's own food can be found by (a Tamil name, a spelling, "amma's sambar"). The built-in foods carry theirs
--                   in the app, so this only holds what the user typed. An edited copy of a built-in food keeps the built-in names automatically.
--   foods.source    where the user's numbers came from ("packet label", "my recipe", "restaurant menu"). Free text, optional.
-- The built-in food list is NOT stored in the database (it ships with the apps), so growing it never touches anyone's data, and a log entry is
-- a snapshot of its nutrition, so no list change can rewrite history. Categories saved earlier (Tiffin, Rice & Grains, ...) stay as they are;
-- the apps map them onto the current categories when they read them.

alter table public.foods add column if not exists aliases text[] not null default '{}'
  check (cardinality(aliases) <= 12 and char_length(array_to_string(aliases, ' ')) <= 800);
alter table public.foods add column if not exists source text not null default ''
  check (char_length(source) <= 80);

-- Browsing "My foods" by category, finding a food by an other-name, and showing a food's recent logs.
create index if not exists foods_user_category_idx on public.foods (user_id, category);
create index if not exists foods_aliases_gin on public.foods using gin (aliases);
create index if not exists food_logs_user_base_idx on public.food_logs (user_id, base_key) where base_key is not null;
