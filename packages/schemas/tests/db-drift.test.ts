import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { AUTH_STUB } from '../../../supabase/tests/authStub'
import { TABLES, DEFAULTS } from '@lifetrack/constants/schema'
import { insertSchemas, rowSchemas, TABLE_NAMES } from '../src'

// Applies the real migrations to in-memory Postgres and compares the actual columns with the Zod schemas.
const migrations = new URL('../../../supabase/migrations/', import.meta.url)
const SYSTEM = new Set(['id', 'user_id', 'created_at', 'updated_at'])
// Security tables (0012, 0014): clients have no table privileges on them and reach them only through SECURITY DEFINER
// functions and Edge Functions, so they have no Zod row/insert schema.
// 0026 (integrations) and 0027 (audit, health, API keys, webhooks) tables are read through functions or read-only policies and written by the server, so the
// apps have no insert/update schema for them.
const SERVER_ONLY = new Set([
  'app_unlocks', 'device_key_challenges', 'device_keys', 'passkeys', 'password_attempts', 'user_security', 'webauthn_challenges',
  'integrations', 'integration_events', 'integration_tokens',
  'audit_events', 'api_keys', 'api_request_log', 'app_errors', 'job_runs', 'platform_admins', 'rate_windows', 'request_metrics',
  'webhook_endpoints', 'webhook_secrets', 'webhook_deliveries', 'webhook_attempts',
])
let cols: Record<string, { name: string; nullable: boolean; hasDefault: boolean }[]> = {}

beforeAll(async () => {
  // Same Supabase stand-in as the SQL suites (auth.sessions, auth.jwt(), pgcrypto): the later migrations need them, and a
  // private copy of the stub fell behind and made this whole file fail before a single comparison ran.
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(AUTH_STUB)
  for (const f of readdirSync(migrations).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, migrations), 'utf8'))
  const { rows } = await db.query<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }>(
    `select table_name, column_name, is_nullable, column_default from information_schema.columns where table_schema='public' order by table_name, ordinal_position`)
  for (const r of rows) (cols[r.table_name] ??= []).push({ name: r.column_name, nullable: r.is_nullable === 'YES', hasDefault: r.column_default != null })
}, 60_000)

describe('schemas match the migrated database', () => {
  it('covers every public table the apps read or write', () => {
    expect([...TABLE_NAMES].sort()).toEqual(Object.keys(cols).filter((t) => !SERVER_ONLY.has(t)).sort())
  })
  it('lists only real tables as server-only', () => {
    for (const t of SERVER_ONLY) expect(Object.keys(cols)).toContain(t)
  })
  it.each(TABLE_NAMES)('%s: row columns equal database columns', (t) => {
    expect(Object.keys(rowSchemas[t].shape).sort()).toEqual(cols[t].map((c) => c.name).sort())
  })
  it.each(TABLE_NAMES)('%s: required insert fields are exactly the NOT NULL columns without a default', (t) => {
    const required = Object.entries(insertSchemas[t].shape).filter(([, s]) => !(s as any).isOptional()).map(([k]) => k).sort()
    const expected = cols[t].filter((c) => !SYSTEM.has(c.name) && !c.nullable && !c.hasDefault).map((c) => c.name).sort()
    expect(required).toEqual(expected)
  })
})

describe('constants stay consistent', () => {
  it('every synced table has a schema', () => {
    for (const t of TABLES) expect(TABLE_NAMES).toContain(t)
  })
  it('client-side DEFAULTS only name real writable columns', () => {
    for (const [t, d] of Object.entries(DEFAULTS)) for (const k of Object.keys(d)) expect(Object.keys(insertSchemas[t as keyof typeof insertSchemas].shape), `${t}.${k}`).toContain(k)
  })
})
