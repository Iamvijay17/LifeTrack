// Standard pagination for every large list: offset pages (page numbers, counts) and keyset ("cursor") pages (stable while rows change, constant cost deep into
// the history). Pure functions: the data adapters turn the validated spec into a query. Page sizes are capped here once; callers can not ask for more.

export const PAGE_SIZE_DEFAULT = 25
export const PAGE_SIZE_MAX = 100

/** Per table: which columns may be sorted/filtered (a whitelist, never a caller-supplied column name) and the default order. */
export const PAGED_TABLES = {
  tasks: {
    sort: ['created_at', 'due_date', 'updated_at'],
    filter: ['status', 'category', 'priority'],
    search: 'title',
    defaultSort: ['created_at', 'desc'],
  },
  goals: {
    sort: ['created_at', 'due_date', 'updated_at'],
    filter: ['status', 'category'],
    search: 'title',
    defaultSort: ['created_at', 'desc'],
  },
  study_sessions: {
    sort: ['session_date', 'started_at', 'created_at'],
    filter: ['status', 'source'],
    search: null,
    defaultSort: ['session_date', 'desc'],
  },
  job_applications: {
    sort: ['updated_at', 'created_at', 'applied_date'],
    filter: ['status', 'source'],
    search: 'company',
    defaultSort: ['updated_at', 'desc'],
  },
  transactions: {
    sort: ['txn_date', 'created_at', 'amount_paise'],
    filter: ['type', 'category'],
    search: 'note',
    defaultSort: ['txn_date', 'desc'],
    range: 'txn_date',
  },
  workouts: {
    sort: ['workout_date', 'created_at'],
    filter: ['status', 'kind'],
    search: 'name',
    defaultSort: ['workout_date', 'desc'],
    range: 'workout_date',
  },
  habit_logs: {
    sort: ['log_date', 'created_at'],
    filter: ['status', 'habit_id'],
    search: null,
    defaultSort: ['log_date', 'desc'],
    range: 'log_date',
  },
  calendar_events: {
    sort: ['starts_at', 'created_at'],
    filter: ['category', 'priority'],
    search: 'title',
    defaultSort: ['starts_at', 'asc'],
    range: 'starts_at',
  },
  audit_events: {
    sort: ['occurred_at'],
    filter: ['action', 'entity', 'source'],
    search: 'summary',
    defaultSort: ['occurred_at', 'desc'],
    range: 'occurred_at',
    tiebreak: 'seq',
  },
  notifications: { sort: ['created_at'], filter: ['kind', 'priority'], search: 'title', defaultSort: ['created_at', 'desc'] },
}

export class PageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PageError'
    this.code = 'invalid_page_request'
  }
}

export const clampPageSize = (n) => {
  const v = Math.trunc(Number(n))
  return Number.isFinite(v) && v > 0 ? Math.min(v, PAGE_SIZE_MAX) : PAGE_SIZE_DEFAULT
}

// ------------------------------------------------------------------------------------------------ cursors (opaque to callers)
const b64 = (s) =>
  (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const unb64 = (s) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return typeof atob === 'function' ? atob(p) : Buffer.from(p, 'base64').toString('binary')
}
const utf = (s) => unescape(encodeURIComponent(s))
const unutf = (s) => decodeURIComponent(escape(s))

/** A cursor remembers the sort values of the last row of a page: [sortValue, tiebreakValue], plus the sort it belongs to (a cursor from another sort is refused). */
export function encodeCursor({ sort, dir, values }) {
  return b64(utf(JSON.stringify({ v: 1, s: sort, d: dir, x: values })))
}
export function decodeCursor(cursor) {
  try {
    const o = JSON.parse(unutf(unb64(String(cursor))))
    if (o?.v !== 1 || typeof o.s !== 'string' || !['asc', 'desc'].includes(o.d) || !Array.isArray(o.x) || o.x.length !== 2)
      throw new Error('shape')
    if (o.x.some((x) => x !== null && !['string', 'number'].includes(typeof x))) throw new Error('values')
    return { sort: o.s, dir: o.d, values: o.x }
  } catch {
    throw new PageError('That page link is not valid any more. Start again from the first page.')
  }
}

/**
 * Validates a caller's request against the table's whitelist and returns the spec the adapter runs.
 * params: { pageSize, page (0-based, offset mode), cursor + direction ('next'|'prev'), sort, dir, filters{}, search, from, to, count (default true in offset mode) }
 */
export function normalizePageRequest(table, params = {}) {
  const cfg = PAGED_TABLES[table]
  if (!cfg) throw new PageError(`“${table}” can not be listed in pages.`)
  const [defCol, defDir] = cfg.defaultSort
  const sort = params.sort ?? defCol
  if (!cfg.sort.includes(sort)) throw new PageError(`Can not sort ${table} by “${sort}”.`)
  const dir = params.dir
    ? ['asc', 'desc'].includes(params.dir)
      ? params.dir
      : (() => {
          throw new PageError('Sort direction must be asc or desc.')
        })()
    : sort === defCol
      ? defDir
      : 'desc'
  const filters = {}
  for (const [k, v] of Object.entries(params.filters ?? {})) {
    if (v === undefined || v === null || v === '') continue
    if (!cfg.filter.includes(k)) throw new PageError(`Can not filter ${table} by “${k}”.`)
    const list = (Array.isArray(v) ? v : [v]).slice(0, 20)
    if (list.some((x) => !['string', 'number', 'boolean'].includes(typeof x))) throw new PageError(`Filter “${k}” has an invalid value.`)
    filters[k] = list
  }
  let search = typeof params.search === 'string' ? params.search.trim().slice(0, 80) : ''
  if (search && !cfg.search) search = ''
  const spec = {
    table,
    pageSize: clampPageSize(params.pageSize),
    sort,
    dir,
    filters,
    search,
    range: cfg.range ? { col: cfg.range, from: params.from ?? null, to: params.to ?? null } : null,
    tiebreak: cfg.tiebreak ?? 'id',
  }
  if (params.cursor) {
    const c = decodeCursor(params.cursor)
    if (c.sort !== sort || c.dir !== dir) throw new PageError('That page link belongs to a different sort order.')
    spec.cursor = { values: c.values, direction: params.direction === 'prev' ? 'prev' : 'next' }
    spec.count = params.count === true
  } else {
    const page = Math.trunc(Number(params.page ?? 0))
    spec.page = Number.isFinite(page) && page > 0 ? Math.min(page, 100000) : 0
    spec.count = params.count !== false
  }
  return spec
}

/** Builds the response from rows fetched with `pageSize + 1` (the extra row tells whether there is a next page without a second query). */
export function buildPage(spec, fetched, total = null) {
  const hasExtra = fetched.length > spec.pageSize
  const prevMode = spec.cursor?.direction === 'prev'
  let items = hasExtra ? fetched.slice(0, spec.pageSize) : fetched.slice()
  if (prevMode) items = items.reverse() // fetched in reverse order to walk backwards
  const mk = (row) => encodeCursor({ sort: spec.sort, dir: spec.dir, values: [row[spec.sort] ?? null, row[spec.tiebreak] ?? null] })
  const first = items[0]
  const last = items[items.length - 1]
  const hasNext = prevMode ? Boolean(spec.cursor) && items.length > 0 : hasExtra
  const hasPrev = prevMode ? hasExtra : spec.cursor ? true : (spec.page ?? 0) > 0
  return {
    items,
    pageSize: spec.pageSize,
    page: spec.page ?? null,
    total,
    pages: total == null ? null : Math.max(1, Math.ceil(total / spec.pageSize)),
    hasNext: spec.cursor || spec.page != null ? hasNext : hasExtra,
    hasPrev,
    nextCursor: last && hasNext ? mk(last) : null,
    prevCursor: first && hasPrev ? mk(first) : null,
  }
}

/** Compare two rows by (sort column, tiebreak) the way the database orders them (nulls last ascending / first descending, as Postgres). */
export function comparePageRows(spec, a, b) {
  const cmp = (x, y) => (x === y ? 0 : x === null || x === undefined ? 1 : y === null || y === undefined ? -1 : x < y ? -1 : 1)
  let c = cmp(a[spec.sort], b[spec.sort])
  if (c === 0) c = cmp(a[spec.tiebreak], b[spec.tiebreak])
  return spec.dir === 'desc' ? -c : c
}

/** Does `row` come strictly after the cursor row in the spec's order (strictly before when walking backwards)? Used by the in-memory adapters. */
export function afterCursor(spec, row) {
  const ref = { [spec.sort]: spec.cursor.values[0], [spec.tiebreak]: spec.cursor.values[1] }
  const c = comparePageRows(spec, row, ref)
  return spec.cursor.direction === 'prev' ? c < 0 : c > 0
}

/** Runs a spec against an in-memory array (the local/demo adapters and tests). Same results as the database for the same data. */
export function pageOfRows(spec, all) {
  let rows = all
  for (const [k, list] of Object.entries(spec.filters)) rows = rows.filter((r) => list.some((v) => r[k] === v))
  if (spec.search) {
    const needle = spec.search.toLowerCase()
    const col = PAGED_TABLES[spec.table].search
    rows = rows.filter((r) =>
      String(r[col] ?? '')
        .toLowerCase()
        .includes(needle),
    )
  }
  if (spec.range?.from) rows = rows.filter((r) => String(r[spec.range.col]) >= spec.range.from)
  if (spec.range?.to) rows = rows.filter((r) => String(r[spec.range.col]) < spec.range.to)
  const total = rows.length
  rows = rows.slice().sort((a, b) => comparePageRows(spec, a, b))
  let fetched
  if (spec.cursor) {
    if (spec.cursor.direction === 'prev')
      fetched = rows
        .filter((r) => afterCursor(spec, r))
        .reverse()
        .slice(0, spec.pageSize + 1)
    else fetched = rows.filter((r) => afterCursor(spec, r)).slice(0, spec.pageSize + 1)
  } else fetched = rows.slice(spec.page * spec.pageSize, spec.page * spec.pageSize + spec.pageSize + 1)
  return buildPage(spec, fetched, spec.count ? total : null)
}

// ------------------------------------------------------------------------------------------------ PostgREST keyset condition
const quote = (v) => `"${String(v).replace(/(["\\])/g, '\\$1')}"`

// "strictly after the cursor row" in the page order. `desc` pages walk to smaller values; Postgres puts NULL first when descending and last when ascending.
export function keysetFilter(spec) {
  const { sort, tiebreak } = spec
  const [sv, tv] = spec.cursor.values
  const forward = spec.cursor.direction === 'next'
  const goesDown = (spec.dir === 'desc') === forward // next+desc and prev+asc both move to smaller values
  const cmp = goesDown ? 'lt' : 'gt'
  if (sv === null) {
    // after a NULL sort value: ties on NULL continue by tiebreak; non-null rows come after NULLs only when NULLs sort first (descending order, going forward)
    const nullsFirst = spec.dir === 'desc'
    const nonNullFollows = forward ? nullsFirst : !nullsFirst
    const ties = `and(${sort}.is.null,${tiebreak}.${cmp}.${quote(tv)})`
    return nonNullFollows ? `${sort}.not.is.null,${ties}` : ties
  }
  const strict = `${sort}.${cmp}.${quote(sv)}`
  const tie = `and(${sort}.eq.${quote(sv)},${tiebreak}.${cmp}.${quote(tv)})`
  // rows whose sort value is NULL come after non-null ones when ascending (going forward) and before them when descending
  const nullsComeLater = forward ? spec.dir === 'asc' : spec.dir === 'desc'
  return nullsComeLater ? `${strict},${tie},${sort}.is.null` : `${strict},${tie}`
}
