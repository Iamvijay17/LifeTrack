import { useQuery } from '@tanstack/react-query'
import { db } from '../lib/supabase'
import { tableKey, type Row } from './queryStore'

/** Live rows of a table (RLS limits them to the signed-in user). */
export function useTable<T extends Row = Row>(table: string) {
  const q = useQuery({ queryKey: tableKey(table), queryFn: () => db!.list(table) as Promise<T[]> })
  return { rows: (q.data ?? []) as T[], loading: q.isLoading, error: q.error as Error | null, refetch: q.refetch, fetching: q.isFetching }
}
