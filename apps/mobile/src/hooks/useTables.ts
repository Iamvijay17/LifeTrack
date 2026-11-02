import { useQueries } from '@tanstack/react-query'
import { db } from '../lib/supabase'
import { tableKey, type Row } from '../data/queryStore'

/** Load several tables at once. `data[table]` is always an array. `tables` must be a stable list per call site. */
export function useTables<T extends string>(...tables: T[]) {
  const results = useQueries({ queries: tables.map((t) => ({ queryKey: tableKey(t), queryFn: () => db!.list(t) as Promise<Row[]> })) })
  const data = Object.fromEntries(tables.map((t, i) => [t, results[i].data ?? []])) as Record<T, any[]>
  return {
    data,
    loading: results.some((r) => r.isLoading),
    refreshing: results.some((r) => r.isFetching && !r.isLoading),
    error: (results.find((r) => r.error)?.error as Error | undefined) ?? null,
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  }
}
