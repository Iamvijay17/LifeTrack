import { execFileSync } from 'node:child_process'
import { mkdtempSync, chownSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { AUTH_STUB } from '../authStub'

const BIN = readdirSync('/usr/lib/postgresql').sort().map((v) => `/usr/lib/postgresql/${v}/bin`).pop()
const MIGRATIONS = new URL('../../migrations/', import.meta.url)
const asPostgres = (cmd: string, args: string[]) => (process.getuid?.() === 0 ? execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' }) : execFileSync(cmd, args, { stdio: 'pipe' }))

/** True when a local PostgreSQL server install is present (CI images and most dev machines); the suite skips otherwise. */
export const hasPostgres = (() => { try { return !!BIN && readdirSync(BIN).includes('initdb') } catch { return false } })()

/** Starts a throwaway real PostgreSQL server (separate OS processes/connections, true concurrency), with migrations + a minimal auth stub. */
export async function startCluster() {
  const dir = mkdtempSync(join(tmpdir(), 'lt-pg-'))
  if (process.getuid?.() === 0) chownSync(dir, Number(execFileSync('id', ['-u', 'postgres']).toString()), Number(execFileSync('id', ['-g', 'postgres']).toString()))
  const data = join(dir, 'data'), sock = dir
  asPostgres(`${BIN}/initdb`, ['-D', data, '-A', 'trust', '-U', 'postgres'])
  asPostgres(`${BIN}/pg_ctl`, ['-D', data, '-o', `-k ${sock} -c listen_addresses= -c fsync=off`, '-w', '-l', join(dir, 'log'), 'start'])
  const connect = async (user = 'postgres') => { const c = new pg.Client({ host: sock, user, database: 'postgres' }); await c.connect(); return c }
  const admin = await connect()
  await admin.query(AUTH_STUB)
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) await admin.query(readFileSync(new URL(f, MIGRATIONS), 'utf8'))
  const newUser = async (email: string) => (await admin.query('insert into auth.users(email) values ($1) returning id', [email])).rows[0].id as string
  /** A separate connection (= a separate request, as PostgREST would use) acting as `userId` in the authenticated role. */
  const session = async (userId: string) => {
    const c = await connect()
    await c.query(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false)`)
    return c
  }
  const stop = async () => { await admin.end(); try { asPostgres(`${BIN}/pg_ctl`, ['-D', data, '-m', 'immediate', 'stop']) } catch { /* already down */ } }
  return { admin, newUser, session, stop }
}
