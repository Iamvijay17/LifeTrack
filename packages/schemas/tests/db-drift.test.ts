import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { TABLES, DEFAULTS } from '@lifetrack/constants/schema'
import { insertSchemas, rowSchemas, TABLE_NAMES } from '../src'

// Applies the real migrations to in-memory Postgres and compares the actual columns with the Zod schemas.
const migrations = new URL('../../../supabase/migrations/', import.meta.url)
const SYSTEM = new Set(['id', 'user_id', 'created_at', 'updated_at'])
let cols: Record<string, { name: string; nullable: boolean; hasDefault: boolean }[]> = {}

beforeAll(async () => {
  const db = new PGlite()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create role anon nologin; create role authenticated nologin; create publication supabase_realtime;`)
  for (const f of readdirSync(migrations).sort()) await db.exec(readFileSync(new URL(f, migrations), 'utf8'))
  const { rows } = await db.query<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }>(
    `select table_name, column_name, is_nullable, column_default from information_schema.columns where table_schema='public' order by table_name, ordinal_position`)
  for (const r of rows) (cols[r.table_name] ??= []).push({ name: r.column_name, nullable: r.is_nullable === 'YES', hasDefault: r.column_default != null })
}, 60_000)

describe('schemas match the migrated database', () => {
  it('covers every public table', () => {
    expect([...TABLE_NAMES].sort()).toEqual(Object.keys(cols).sort())
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
