import { SEARCH_TABLES, normalizeParams, resultFromRow, searchRows } from '@lifetrack/core/globalSearch'
import { db } from './db'

/**
 * One page of search results for `params` (see normalizeParams): `{ total, rows }`, each row `{ kind, id, module, title, snippet, status,
 * category, priority, day, updatedAt, rank, to }`.
 *
 * With Supabase the work is done in the database by public.global_search (one round trip, the person's own rows only, locked modules refused
 * by row-level security). The in-browser dev backend has no SQL, so it runs the same rules over its tables; `closed` (locked modules) is only
 * used there.
 */
export async function globalSearch(params, { closed = [] } = {}) {
  const p = normalizeParams(params)
  if (db.name === 'supabase') {
    const r = await db.rpc('global_search', {
      p_terms: p.terms,
      p_modules: p.modules,
      p_from: p.from,
      p_to: p.to,
      p_status: p.status,
      p_category: p.category,
      p_priority: p.priority,
      p_sort: p.sort,
      p_limit: p.limit,
      p_offset: p.offset,
    })
    return { total: Number(r?.total) || 0, rows: (r?.rows ?? []).map(resultFromRow).filter(Boolean) }
  }
  const tables = Object.fromEntries(await Promise.all(SEARCH_TABLES.map(async (t) => [t, await db.list(t)])))
  return searchRows(tables, p, { closed })
}
