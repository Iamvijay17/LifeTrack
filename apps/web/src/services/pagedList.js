// Paged reads of the large lists (tasks, goals, study sessions, applications, transactions, workouts, habit history, calendar events, notifications), cached
// per person with the rules from @lifetrack/core/cache: keys carry the user id (one person's pages can never be served to another), entries expire in seconds,
// and any write to the table (here, on another device through Realtime, or a refetch) drops that table's pages. Money is never served late after a failure.
import { createCache, FRESHNESS } from '@lifetrack/core/cache'
import { getUserId } from '@lifetrack/data'
import { onTableChange } from '@/hooks/store'
import { db } from './db'

const cache = createCache({ ttlMs: FRESHNESS.records.ttlMs, maxEntries: 120 })
const SENSITIVE = new Set(['transactions', 'budgets', 'savings_goals', 'recurring_rules', 'health_logs', 'journal_entries'])

onTableChange((table) => (table === '*' ? cache.clear() : cache.bump(table)))

/** One page. `params`: see normalizePageRequest in @lifetrack/core/pagination (pageSize, page | cursor + direction, sort, dir, filters, search, from, to, count). */
export function fetchPage(table, params = {}, { force = false } = {}) {
  const policy = SENSITIVE.has(table) ? FRESHNESS.sensitive : FRESHNESS.records
  return cache.get(cache.key(table, getUserId(), params), () => db.listPage(table, params), { ...policy, force })
}
export const pagedCacheStats = () => cache.stats()
export const clearPagedCache = () => cache.clear()
