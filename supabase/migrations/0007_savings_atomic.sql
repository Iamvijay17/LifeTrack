-- 0007: atomic savings deposits.
-- The client used to read the cached total, add to it and write it back, so two devices (or two quick taps in flight) could each write a
-- stale total and silently lose a deposit. This function adds inside the database in ONE statement, so concurrent deposits accumulate.
-- (add_water, the same fix for water intake, already exists in 0004_hardening.sql.)
-- SECURITY INVOKER: row-level security still applies, so a user can only touch their own goals. Additive: no existing data or table is changed.

create or replace function public.add_savings(p_goal uuid, p_paise bigint)
returns public.savings_goals
language plpgsql security invoker set search_path = '' as $$
declare r public.savings_goals;
begin
  if p_paise is null or p_paise <= 0 then raise exception 'Enter an amount greater than 0.'; end if;
  update public.savings_goals set saved_paise = saved_paise + p_paise where id = p_goal returning * into r;
  if not found then raise exception 'Savings goal not found.'; end if;
  return r;
end $$;

revoke all on function public.add_savings(uuid, bigint) from public, anon;
grant execute on function public.add_savings(uuid, bigint) to authenticated;
