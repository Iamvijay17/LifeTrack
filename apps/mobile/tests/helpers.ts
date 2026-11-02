import { QueryClient } from '@tanstack/react-query'
import { createApi, withSchemaValidation } from '@lifetrack/data'
import { DEFAULTS } from '@lifetrack/constants/schema'
import { insertSchemas, updateSchemas } from '@lifetrack/schemas'
import { createQueryStore, type DbAdapter } from '../src/data/queryStore'

/** In-memory Postgres stand-in with the unique constraints the real schema has. */
export function fakeDb() {
  const tables: Record<string, any[]> = {}
  let n = 0
  const newId = () => { n++; return crypto.randomUUID() }
  const rows = (t: string) => (tables[t] ??= [])
  const dup = () => Object.assign(new Error('duplicate key'), { code: '23505' })
  const raw: DbAdapter = {
    async list(t) { return rows(t).map((r) => ({ ...r })) },
    async insert(t, input) {
      return input.map((r) => {
        if (t === 'tasks' && r.series_id && rows(t).some((x) => x.series_id === r.series_id && x.due_date === r.due_date)) throw dup()
        const row = { ...(DEFAULTS as any)[t], id: newId(), user_id: 'u1', created_at: `2026-11-0${1 + (n % 5)}T00:00:00Z`, ...r } as any
        rows(t).push(row); return { ...row }
      })
    },
    async update(t, id, patch) { const r = rows(t).find((x) => x.id === id); if (!r) throw new Error('not found'); Object.assign(r, patch); return { ...r } },
    async upsert(t, input, opts) {
      const cols = (opts?.onConflict ?? 'id').split(',')
      return input.map((raw) => {
        const r: Record<string, any> = { user_id: 'u1', ...raw } // the real adapter stamps user_id before the conflict check
        const ex = rows(t).find((x) => cols.every((c) => x[c] === r[c]))
        if (ex) { Object.assign(ex, r); return { ...ex } }
        const row = { ...(DEFAULTS as any)[t], id: newId(), ...r } as any
        rows(t).push(row); return { ...row }
      })
    },
    async remove(t, id) { tables[t] = rows(t).filter((x) => x.id !== id) },
    async removeMany(t, ids) { tables[t] = rows(t).filter((x) => !ids.includes(x.id)) },
  }
  return { tables, raw }
}
export const setup = () => {
  const { tables, raw } = fakeDb()
  const db = withSchemaValidation(raw, { insertSchemas, updateSchemas }) as DbAdapter
  const store = createQueryStore(db, new QueryClient())
  return { tables, store, api: createApi(store as any) }
}
