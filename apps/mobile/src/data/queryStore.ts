import type { QueryClient } from '@tanstack/react-query'

// Cache/mutation layer for mobile: implements the store contract that @lifetrack/data's createApi() expects
// (insert, update, upsert, remove, removeMany, peek, load, refetch) on top of TanStack Query.
// Supabase stays the source of truth; the cache is in-memory only and is updated from confirmed responses.

export interface Row { id: string; [k: string]: unknown }
export interface DbAdapter {
  list(table: string): Promise<Row[]>
  insert(table: string, rows: Record<string, unknown>[]): Promise<Row[]>
  update(table: string, id: string, patch: Record<string, unknown>): Promise<Row>
  upsert(table: string, rows: Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): Promise<Row[]>
  remove(table: string, id: string): Promise<void>
  removeMany(table: string, ids: string[]): Promise<void>
}

export const tableKey = (table: string) => ['table', table] as const
// Tables that database triggers write to as a side effect of writing another table.
const TRIGGER_TARGETS: Record<string, string[]> = { job_applications: ['application_history'] }

export function createQueryStore(db: DbAdapter, qc: QueryClient) {
  const rows = (t: string) => qc.getQueryData<Row[]>(tableKey(t)) ?? []
  const merge = (t: string, incoming: Row[]) =>
    qc.setQueryData<Row[]>(tableKey(t), (cur = []) => {
      const next = [...cur]
      for (const r of incoming) {
        const i = next.findIndex((x) => x.id === r.id)
        if (i >= 0) next[i] = r
        else next.push(r)
      }
      return next
    })
  const drop = (t: string, ids: string[]) => {
    const s = new Set(ids)
    qc.setQueryData<Row[]>(tableKey(t), (cur = []) => cur.filter((r) => !s.has(r.id)))
  }
  const afterWrite = (t: string) => { for (const x of TRIGGER_TARGETS[t] ?? []) qc.invalidateQueries({ queryKey: tableKey(x) }) }
  const fetchTable = (t: string) => qc.fetchQuery({ queryKey: tableKey(t), queryFn: () => db.list(t), staleTime: 0 })
  const one = <T>(input: unknown, out: T[]) => (Array.isArray(input) ? out : out[0])

  return {
    peek: rows,
    load: (t: string) => (qc.getQueryData(tableKey(t)) ? Promise.resolve() : fetchTable(t).then(() => undefined)),
    refetch: (t: string) => fetchTable(t).then(() => undefined),
    async insert(t: string, input: Record<string, unknown> | Record<string, unknown>[]) {
      const out = await db.insert(t, Array.isArray(input) ? input : [input])
      merge(t, out); afterWrite(t)
      return one(input, out)
    },
    async update(t: string, id: string, patch: Record<string, unknown>) {
      const row = await db.update(t, id, patch)
      merge(t, [row]); afterWrite(t)
      return row
    },
    async upsert(t: string, input: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      const out = await db.upsert(t, Array.isArray(input) ? input : [input], opts)
      merge(t, out); afterWrite(t)
      return one(input, out)
    },
    async remove(t: string, id: string) { await db.remove(t, id); drop(t, [id]) },
    async removeMany(t: string, ids: string[]) { await db.removeMany(t, ids); drop(t, ids) },
    /** Re-pull every table that has been loaded (focus / reconnect / realtime catch-up). */
    refetchLoaded: () => qc.invalidateQueries({ queryKey: ['table'] }),
    invalidate: (t: string) => qc.invalidateQueries({ queryKey: tableKey(t) }),
  }
}
export type QueryStore = ReturnType<typeof createQueryStore>
