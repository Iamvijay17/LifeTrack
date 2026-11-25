// One paged read for every large list, over PostgREST. The request is validated against the table's whitelist (@lifetrack/core/pagination) before any query
// is built, page sizes are capped, and the keyset ("cursor") form never uses OFFSET, so page 500 costs what page 1 does.
import { normalizePageRequest, buildPage, keysetFilter, PAGED_TABLES } from '@lifetrack/core/pagination'
import { toAppError } from './errors'

const likeSafe = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()"]/g, ' ')

export async function listPageSupabase(supabase, table, params = {}) {
  const spec = normalizePageRequest(table, params)
  let q = supabase.from(table).select('*', spec.count ? { count: 'exact' } : undefined)
  for (const [col, list] of Object.entries(spec.filters)) q = list.length === 1 ? q.eq(col, list[0]) : q.in(col, list)
  if (spec.search) {
    q = q.ilike(PAGED_TABLES[table].search, `%${likeSafe(spec.search)}%`)
  }
  if (spec.range?.from) q = q.gte(spec.range.col, spec.range.from)
  if (spec.range?.to) q = q.lt(spec.range.col, spec.range.to)
  const reverse = spec.cursor?.direction === 'prev'
  const ascending = (spec.dir === 'asc') !== reverse
  q = q.order(spec.sort, { ascending }).order(spec.tiebreak, { ascending })
  if (spec.cursor) q = q.or(keysetFilter(spec)).limit(spec.pageSize + 1)
  else q = q.range(spec.page * spec.pageSize, spec.page * spec.pageSize + spec.pageSize) // pageSize + 1 rows: the extra one says whether a next page exists
  const { data, error, count } = await q
  if (error) throw toAppError(error)
  return buildPage(spec, data ?? [], spec.count ? (count ?? null) : null)
}
