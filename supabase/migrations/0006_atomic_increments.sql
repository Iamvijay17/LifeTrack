-- 0006: atomic counters for water intake and savings deposits.
-- The client used to read the cached value, add to it and write the result back. Two devices (or two quick taps in flight)
-- could each write a stale total and silently lose an addition. These functions add inside the database in ONE statement,
-- so concurrent additions always accumulate. SECURITY INVOKER: row-level security still applies, so a user can only touch their own rows.
-- Additive: no existing data or table is changed.

create or replace function public.add_water(p_date date, p_ml int)
returns public.health_logs
language plpgsql security invoker set search_path = public as $$
declare r public.health_logs;
begin
  insert into public.health_logs as h (user_id, log_date, water_ml)
  values (auth.uid(), p_date, greatest(0, p_ml))
  on conflict (user_id, log_date) do update set water_ml = greatest(0, h.water_ml + p_ml)
  returning * into r;
  return r;
end $$;

create or replace function public.add_savings(p_goal uuid, p_paise bigint)
returns public.savings_goals
language plpgsql security invoker set search_path = public as $$
declare r public.savings_goals;
begin
  if p_paise is null or p_paise <= 0 then raise exception 'Enter an amount greater than 0.'; end if;
  update public.savings_goals set saved_paise = saved_paise + p_paise where id = p_goal returning * into r;
  if not found then raise exception 'Savings goal not found.'; end if;
  return r;
end $$;

revoke all on function public.add_water(date, int), public.add_savings(uuid, bigint) from public, anon;
grant execute on function public.add_water(date, int), public.add_savings(uuid, bigint) to authenticated;
