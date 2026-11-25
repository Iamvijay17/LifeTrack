import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { AUTH_STUB } from '../authStub'

const MIGRATIONS = new URL('../../migrations/', import.meta.url)

/** In-memory Postgres with the real migrations applied and a minimal Supabase auth stub (roles, auth.users, auth.uid()). */
export async function createDb() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(AUTH_STUB)
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'))

  const newUser = async (email: string) => (await db.query<{ id: string }>(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id

  /** Run `fn` as the `authenticated` role with auth.uid() = id (what PostgREST does for a signed-in request). */
  const asUser = async <T>(id: string, fn: (q: Q) => Promise<T>, session?: string): Promise<T> => {
    const claims = JSON.stringify({ sub: id, role: 'authenticated', ...(session ? { session_id: session } : {}) })
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claims','${claims}',false);`)
    try { return await fn(q) } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','',false);`) }
  }
  /** Run `fn` as the service role (the Edge Function's key). */
  const asService = async <T>(fn: (q: Q) => Promise<T>): Promise<T> => {
    await db.exec(`set role service_role;`)
    try { return await fn(q) } finally { await db.exec('reset role;') }
  }
  /** A GoTrue session row for `userId`, started `ageMinutes` ago. Its id is what a JWT's session_id claim carries. */
  const newSession = async (userId: string, ageMinutes = 0) =>
    (await db.query<{ id: string }>(`insert into auth.sessions(user_id, created_at, updated_at) values ($1, now() - make_interval(mins => $2), now()) returning id`, [userId, ageMinutes])).rows[0].id
  /** Run `fn` as the anonymous role (a request with only the public anon key). */
  const asAnon = async <T>(fn: (q: Q) => Promise<T>): Promise<T> => {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub','',false);`)
    try { return await fn(q) } finally { await db.exec('reset role;') }
  }
  const q: Q = (sql, params) => db.query(sql, params) as Promise<{ rows: any[]; affectedRows?: number }>
  /** Resolves with the error message if the statement fails (inside a savepoint-free single statement), else null. */
  const fails = async (p: Promise<unknown>) => { try { await p; return null } catch (e) { return (e as Error).message } }
  return { db, q, newUser, newSession, asUser, asAnon, asService, fails }
}
export type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }>
