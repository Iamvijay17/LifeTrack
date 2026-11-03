import { AppError } from './errors'

const SERVER_MANAGED = ['id', 'user_id', 'created_at', 'updated_at']
const strip = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !SERVER_MANAGED.includes(k)))

/**
 * Test/dev helper: wraps a data adapter so every insert/update/upsert payload is validated against the shared
 * Zod schemas (@lifetrack/schemas insertSchemas / updateSchemas) before reaching the database. A payload that
 * drifts from the real table (unknown column, wrong type, missing required field) throws instead of silently
 * failing in production. Server-managed columns (id, user_id, timestamps) are ignored.
 */
export function withSchemaValidation(adapter, { insertSchemas, updateSchemas }) {
  const check = (schemas, table, row, op) => {
    const schema = schemas[table]
    if (!schema) throw new AppError(`No schema for table "${table}"`)
    const r = schema.safeParse(strip(row))
    if (!r.success) throw new AppError(`Invalid ${op} payload for ${table}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  return {
    ...adapter,
    insert: (t, rows) => { rows.forEach((r) => check(insertSchemas, t, r, 'insert')); return adapter.insert(t, rows) },
    update: (t, id, patch) => { check(updateSchemas, t, patch, 'update'); return adapter.update(t, id, patch) },
    upsert: (t, rows, opts) => { rows.forEach((r) => check(updateSchemas, t, r, 'upsert')); return adapter.upsert(t, rows, opts) },
  }
}
