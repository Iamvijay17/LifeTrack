// Shared by every SQL test harness (PGlite and the real-Postgres cluster).
/** The parts of Supabase the migrations lean on: roles, the auth schema (users, sessions, uid(), jwt()), the extensions schema, realtime. */
export const AUTH_STUB = `
  create schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(), updated_at timestamptz, user_agent text, ip inet, not_after timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  create publication supabase_realtime;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`
