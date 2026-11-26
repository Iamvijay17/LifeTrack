-- 0031: tighten two function grants found by the catalog-wide test (supabase/tests/pglite/catalog.test.ts). ADDITIVE and idempotent: no table,
-- column or function body changes, only who may EXECUTE.
--
--  * _audit_gate(text) (0027) was executable by PUBLIC, so the anon key could call it through /rest/v1/rpc. It only answers "is this module open
--    for auth.uid()", which is nothing for an anonymous caller, but it is an internal helper. It stays callable by `authenticated` because the
--    restrictive "module_gate" policy on audit_events runs it as the querying user.
--  * handle_new_user() (0001) is the auth.users insert trigger. Trigger functions cannot be called directly, and firing a trigger does not check
--    EXECUTE, so revoking it from every client role changes nothing for sign-up; it clears the "security definer function executable by anon"
--    advisor warning on hosted Supabase.

revoke all on function public._audit_gate(text) from public, anon;
grant execute on function public._audit_gate(text) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
