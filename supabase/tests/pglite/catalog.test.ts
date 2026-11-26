// Catalog-wide security guards. The per-table suites (rls.test.ts and friends) test behaviour table by table; these tests read the system
// catalog after every migration has run, so a table or function added later cannot slip past RLS, the fixture map or the search_path rule.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES } from './fixtures'
import { createDb } from './helpers'

let ctx: Awaited<ReturnType<typeof createDb>>
beforeAll(async () => { ctx = await createDb() })
afterAll(async () => { await ctx.db.close() })

const tables = async () =>
  (await ctx.q(`select c.relname as name, c.relrowsecurity as rls,
                       exists(select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped) as has_user
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind in ('r','p') order by 1`)).rows as { name: string; rls: boolean; has_user: boolean }[]

describe('catalog: tables', () => {
  it('every table in public has row level security turned on', async () => {
    const off = (await tables()).filter((t) => !t.rls).map((t) => t.name)
    expect(off, 'tables without RLS').toEqual([])
  })

  it('every table with a user_id column is covered by the RLS fixture map (so rls.test.ts exercises it)', async () => {
    const missing = (await tables()).filter((t) => t.has_user && !FIXTURES[t.name]).map((t) => t.name)
    expect(missing, 'add these to supabase/tests/pglite/fixtures.ts').toEqual([])
  })

  it('the anonymous role holds no privilege on any table in public', async () => {
    const { rows } = await ctx.q(`select table_name, privilege_type from information_schema.role_table_grants
                                   where grantee = 'anon' and table_schema = 'public' order by 1, 2`)
    expect(rows.map((r) => `${r.table_name}:${r.privilege_type}`)).toEqual([])
  })
})

describe('catalog: functions', () => {
  const definers = async () =>
    (await ctx.q(`select p.proname as name, p.oid::regprocedure::text as sig, coalesce(array_to_string(p.proconfig, ','), '') as config,
                         has_function_privilege('anon', p.oid, 'execute') as anon_exec,
                         has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.prosecdef order by 1`)).rows as { name: string; sig: string; config: string; anon_exec: boolean; auth_exec: boolean }[]

  it('every SECURITY DEFINER function pins its search_path (no schema-shadowing)', async () => {
    const loose = (await definers()).filter((f) => !/search_path=/.test(f.config)).map((f) => f.sig)
    expect(loose, 'add `set search_path = public` (or empty) to these').toEqual([])
  })

  it('no SECURITY DEFINER function can be called with only the anon key', async () => {
    const open = (await definers()).filter((f) => f.anon_exec).map((f) => f.sig)
    expect(open, 'revoke execute from anon (and public)').toEqual([])
  })

  // Helpers a signed-in person's own statements must reach. Each is safe to call directly: it only ever acts on auth.uid()'s rows.
  const CALLED_AS_USER: Record<string, string> = {
    '_audit_gate(text)': 'runs inside the restrictive module_gate policy on audit_events, which evaluates as the querying user',
    '_assert_unlocked()': 'called by audit_restore (SECURITY INVOKER); raises unless the caller is unlocked',
    '_emit_restored(uuid,text)': 'called by audit_restore (SECURITY INVOKER); since 0032 it queues a webhook only for an event the caller owns AND has really restored, once',
  }

  it('internal helpers (names starting with _) are not callable by signed-in users, apart from the reviewed list', async () => {
    const open = (await definers()).filter((f) => f.name.startsWith('_') && f.auth_exec).map((f) => f.sig)
    expect(open.filter((s) => !CALLED_AS_USER[s]), 'revoke execute from authenticated (and public), or review and list it').toEqual([])
    expect(Object.keys(CALLED_AS_USER).filter((s) => !open.includes(s)), 'stale entries in CALLED_AS_USER').toEqual([])
  })

  it('a revoked trigger function still fires for a non-superuser role (so 0031 cannot break sign-up)', async () => {
    // Every other test inserts into auth.users as the PGlite superuser, which bypasses grants. On hosted Supabase the insert comes from
    // supabase_auth_admin; Postgres checks EXECUTE when a trigger is created, not when it fires. Prove that with a throwaway role and function.
    await ctx.db.exec(`create role zz_auth_service nologin; create table zz_t (id int); create table zz_log (id int);
      create function zz_f() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into zz_log values (new.id); return new; end $$;
      create trigger zz_tr after insert on zz_t for each row execute function zz_f();
      revoke all on function zz_f() from public; grant insert on zz_t to zz_auth_service;`)
    try {
      await ctx.db.exec(`set role zz_auth_service; insert into zz_t values (1); reset role;`)
      expect((await ctx.q(`select count(*)::int n from zz_log`)).rows[0].n).toBe(1)
      expect((await ctx.q(`select has_function_privilege('zz_auth_service', 'zz_f()', 'execute') x`)).rows[0].x).toBe(false)
    } finally {
      await ctx.db.exec(`reset role; drop table zz_t; drop table zz_log; drop function zz_f(); drop role zz_auth_service;`)
    }
  })

  it('trigger functions are not executable by any client role', async () => {
    const { rows } = await ctx.q(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'public' and p.prosecdef and p.prorettype = 'trigger'::regtype
                                     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)
    // Not exploitable (Postgres refuses to call a trigger function directly) but flagged by the hosted advisor; 0031 closed handle_new_user.
    expect(rows.map((r) => r.sig)).toEqual([])
  })
})
