import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = new URL('../../migrations/', import.meta.url)

/** In-memory Postgres with the real migrations applied and a minimal Supabase auth stub (roles, auth.users, auth.uid()). */
export async function createDb() {
  const db = new PGlite()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create publication supabase_realtime;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `)
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'))

  const newUser = async (email: string) => (await db.query<{ id: string }>(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id

  /** Run `fn` as the `authenticated` role with auth.uid() = id (what PostgREST does for a signed-in request). */
  const asUser = async <T>(id: string, fn: (q: Q) => Promise<T>): Promise<T> => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`)
    try { return await fn(q) } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`) }
  }
  /** Run `fn` as the anonymous role (a request with only the public anon key). */
  const asAnon = async <T>(fn: (q: Q) => Promise<T>): Promise<T> => {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub','',false);`)
    try { return await fn(q) } finally { await db.exec('reset role;') }
  }
  const q: Q = (sql, params) => db.query(sql, params) as Promise<{ rows: any[]; affectedRows?: number }>
  /** Resolves with the error message if the statement fails (inside a savepoint-free single statement), else null. */
  const fails = async (p: Promise<unknown>) => { try { await p; return null } catch (e) { return (e as Error).message } }
  return { db, q, newUser, asUser, asAnon, fails }
}
export type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }>
