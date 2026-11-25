// Global search: what can be searched, how a query is read, and the same ranking the database function (0022_global_search.sql) uses.
// Pure functions, no I/O. The web app runs `searchRows` over the rows of its in-browser dev backend; with Supabase the database does the
// work (public.global_search) and the page only draws what comes back, using `resultFromRow`, `highlightParts` and `buildSuggestions`.
// The module keys are the app's navigation modules (lib/nav.js); `tables` is what the database refuses to a locked session (moduleLocks.js).

import { tableClosed } from './moduleLocks'

export const SORTS = ['relevance', 'newest', 'oldest']
export const PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50
export const MAX_TERMS = 8

const clip = (s, n) => String(s ?? '').slice(0, n)
const ymd = (iso) => String(iso ?? '').slice(0, 10)

/**
 * Every kind of record that can be found. `title` / `body` build the two searched texts; `day` is the date the date filter and the
 * newest/oldest sort use; `to` is where the record opens. `status`, `category` and `priority` feed the filters (null = the kind has none).
 */
export const SOURCES = [
  {
    kind: 'task',
    table: 'tasks',
    module: 'planner',
    label: 'Task',
    plural: 'Tasks',
    title: (r) => r.title,
    body: (r) => r.notes,
    status: (r) => r.status,
    category: (r) => r.category,
    priority: (r) => r.priority,
    day: (r) => r.due_date,
    to: (r) => (r.due_date ? `/planner?date=${r.due_date}` : '/planner'),
  },
  {
    kind: 'goal',
    table: 'goals',
    module: 'goals',
    label: 'Goal',
    plural: 'Goals',
    title: (r) => r.title,
    body: (r) => r.notes,
    status: (r) => r.status,
    category: (r) => r.category,
    day: (r) => r.due_date,
    to: () => '/goals',
  },
  {
    kind: 'habit',
    table: 'habits',
    module: 'habits',
    label: 'Habit',
    plural: 'Habits',
    title: (r) => r.name,
    body: (r) => r.description,
    status: (r) => (r.archived_at ? 'archived' : 'active'),
    day: (r) => r.start_date,
    to: () => '/habits',
  },
  {
    kind: 'transaction',
    table: 'transactions',
    module: 'finance',
    label: 'Transaction',
    plural: 'Expenses & income',
    title: (r) => r.note || r.category,
    body: (r) => `${r.category} ${r.note}`,
    status: (r) => r.type,
    category: (r) => r.category,
    day: (r) => r.txn_date,
    to: (r) => `/finance?month=${String(r.txn_date).slice(0, 7)}-01`,
  },
  {
    kind: 'workout',
    table: 'workouts',
    module: 'fitness',
    label: 'Workout',
    plural: 'Workouts',
    title: (r) => r.name,
    body: (r) => r.notes,
    status: (r) => r.status,
    category: (r) => r.kind,
    day: (r) => r.workout_date,
    to: () => '/fitness',
  },
  {
    kind: 'study',
    table: 'study_sessions',
    module: 'learning',
    label: 'Study session',
    plural: 'Study sessions',
    // A study session has no name of its own: it is named after its topic, then its goal.
    title: (r, ctx) => ctx?.topics?.get(r.topic_id) || ctx?.goals?.get(r.goal_id) || 'Study session',
    body: (r) => r.notes,
    status: (r) => r.status,
    category: (r) => r.source,
    day: (r) => r.session_date,
    to: () => '/learning',
  },
  {
    kind: 'event',
    table: 'calendar_events',
    module: 'calendar',
    label: 'Event',
    plural: 'Calendar events',
    title: (r) => r.title,
    body: (r) => `${r.description} ${r.location}`,
    category: (r) => r.category,
    priority: (r) => r.priority,
    day: (r) => ymd(r.starts_at),
    to: (r) => `/calendar?date=${ymd(r.starts_at)}`,
  },
  {
    kind: 'note',
    table: 'notes',
    module: 'notes',
    label: 'Note',
    plural: 'Notes',
    title: (r) => r.title || clip(r.body, 60) || 'Untitled note',
    body: (r) => `${r.body} ${(r.tags ?? []).join(' ')}`,
    status: (r) => (r.pinned ? 'pinned' : null),
    category: (r) => r.category,
    day: (r) => ymd(r.updated_at),
    to: (r) => `/notes?note=${r.id}`,
  },
  {
    kind: 'journal',
    table: 'journal_entries',
    module: 'notes',
    label: 'Journal entry',
    plural: 'Journal',
    title: (r) => `Journal — ${r.entry_date}`,
    body: (r) => `${r.content} ${r.wins}`,
    day: (r) => r.entry_date,
    to: () => '/notes',
  },
  {
    kind: 'application',
    table: 'job_applications',
    module: 'jobs',
    label: 'Job application',
    plural: 'Job applications',
    title: (r) => `${r.company} — ${r.job_title}`,
    body: (r) => `${r.location} ${r.source} ${r.notes}`,
    status: (r) => r.status,
    day: (r) => r.applied_date || ymd(r.created_at),
    to: (r) => `/jobs?app=${r.id}`,
  },
  {
    kind: 'reminder',
    table: 'reminders',
    module: 'notifications',
    label: 'Reminder',
    plural: 'Reminders',
    title: (r) => r.title,
    body: (r) => r.kind,
    status: (r) => (r.active ? 'active' : 'off'),
    category: (r) => r.kind,
    day: (r) => r.remind_date,
    to: () => '/notifications?tab=reminders',
  },
  {
    kind: 'food',
    table: 'food_logs',
    module: 'nutrition',
    label: 'Food log',
    plural: 'Food log',
    title: (r) => r.name,
    body: (r) => `${r.variant} ${r.notes}`,
    status: (r) => r.meal_type,
    category: (r) => r.category,
    day: (r) => r.log_date,
    to: () => '/nutrition',
  },
  {
    kind: 'topic',
    table: 'learning_topics',
    module: 'learning',
    label: 'Learning topic',
    plural: 'Learning topics',
    title: (r) => r.name,
    body: (r) => r.notes,
    status: (r) => (r.archived ? 'archived' : 'active'),
    category: (r) => r.group_name,
    day: (r) => ymd(r.created_at),
    to: () => '/learning',
  },
]

export const SOURCE_BY_KIND = Object.fromEntries(SOURCES.map((s) => [s.kind, s]))
/** The tables the search reads (used by the in-browser backend). */
export const SEARCH_TABLES = [...new Set(SOURCES.map((s) => s.table))]
/** The modules that can be searched, in the order the filter shows them. */
export const SEARCH_MODULES = [
  { key: 'planner', label: 'Tasks' },
  { key: 'goals', label: 'Goals' },
  { key: 'habits', label: 'Habits' },
  { key: 'finance', label: 'Finance' },
  { key: 'fitness', label: 'Workouts' },
  { key: 'learning', label: 'Learning' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'notes', label: 'Notes & journal' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'notifications', label: 'Reminders' },
  { key: 'nutrition', label: 'Food' },
]

// ---------------------------------------------------------------------------------------------------------------- reading a query

const fold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')

/**
 * The terms of what was typed: words, with "quoted phrases" kept whole. Lower-cased, at most MAX_TERMS, no repeats. Accents are kept (the
 * database compares as typed); the in-browser search ignores them.
 * `tag:` style operators are not special: everything typed is plain text.
 */
export function parseQuery(input) {
  const out = []
  const re = /"([^"]+)"|(\S+)/g
  for (let m = re.exec(String(input ?? '')); m; m = re.exec(String(input ?? ''))) {
    const t = String(m[1] ?? m[2])
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    if (t.replace(/["]/g, '') && !out.includes(t)) out.push(clip(t.replace(/"/g, ''), 100))
  }
  return out.slice(0, MAX_TERMS)
}

/** The filters as the database function and the in-browser search both take them (anything blank is "no filter"). */
export function normalizeParams(p = {}) {
  const list = (v) => (Array.isArray(v) && v.length ? [...new Set(v.map(String))] : null)
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? v : null)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(p.limit)) || PAGE_SIZE))
  const from = day(p.from)
  const to = day(p.to)
  return {
    terms: Array.isArray(p.terms) ? p.terms : parseQuery(p.q),
    modules: list(p.modules),
    from: from && to && from > to ? to : from,
    to: from && to && from > to ? from : to,
    status: list(p.status),
    category: list(p.category),
    priority: list(p.priority),
    sort: SORTS.includes(p.sort) ? p.sort : 'relevance',
    limit,
    offset: Math.min(10000, Math.max(0, Math.trunc(Number(p.offset)) || 0)),
  }
}

/** True when the search has something to look for: text, or at least one filter (filters alone browse the data, newest first). */
export const hasCriteria = (p) => {
  const n = normalizeParams(p)
  return n.terms.length > 0 || !!(n.modules || n.from || n.to || n.status || n.category || n.priority)
}

// ---------------------------------------------------------------------------------------------------------------------- ranking

/** How well a title matches, mirroring the database function: exact 100, starts with 85, a word starts with 70, contains 55, every term 40, body only 20. */
export function rankOf(terms, title) {
  if (!terms.length) return 0
  const q = terms.join(' ')
  const t = fold(title)
  if (t === q) return 100
  if (t.startsWith(q)) return 85
  if ((' ' + t).includes(' ' + q)) return 70
  if (t.includes(q)) return 55
  if (terms.every((x) => t.includes(x))) return 40
  return 20
}

/** The part of the text around the first match, about 160 characters, with … where it was cut. */
export function snippetOf(text, terms, width = 160) {
  const s = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return ''
  const low = fold(s)
  // Folding can change the length of an exotic character; then there is no safe way to point at the match, so start from the top.
  const at = low.length === s.length ? Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0), Infinity) : Infinity
  if (!Number.isFinite(at) || s.length <= width) return s.length > width ? s.slice(0, width) + '…' : s
  const start = Math.max(0, at - 50)
  return (start > 0 ? '…' : '') + s.slice(start, start + width) + (start + width < s.length ? '…' : '')
}

/** The pieces of `text` to draw, each `{ text, hit }`, with every term marked. Case and accent blind. */
export function highlightParts(text, terms) {
  const source = String(text ?? '')
  const list = [...new Set((terms ?? []).map(fold).filter(Boolean))]
  if (!source || !list.length) return [{ text: source, hit: false }]
  const low = fold(source)
  // If folding changed the length, indexes would no longer line up: draw it plain rather than cut it wrong.
  if (low.length !== source.length) return [{ text: source, hit: false }]
  const mark = new Array(source.length).fill(false)
  for (const t of list)
    for (let i = low.indexOf(t); i >= 0; i = low.indexOf(t, i + t.length)) for (let j = i; j < i + t.length; j++) mark[j] = true
  const out = []
  for (let i = 0; i < source.length; i++) {
    const last = out[out.length - 1]
    if (last && last.hit === mark[i]) last.text += source[i]
    else out.push({ text: source[i], hit: mark[i] })
  }
  return out
}

// ------------------------------------------------------------------------------------------------------- the in-browser search

/** Names to give study sessions: topic and goal names by id. */
function lookups(tables) {
  return {
    topics: new Map((tables.learning_topics ?? []).map((t) => [t.id, t.name])),
    goals: new Map((tables.goals ?? []).map((g) => [g.id, g.title])),
  }
}

/** A plain result from a source row (the shape `resultFromRow` gives for the database's rows too). */
function toResult(src, row, ctx, terms) {
  const title = clip(src.title(row, ctx), 300)
  const body = String(src.body(row, ctx) ?? '')
  return {
    kind: src.kind,
    id: row.id,
    module: src.module,
    title,
    snippet: snippetOf(body, terms),
    status: src.status?.(row) ?? null,
    category: src.category?.(row) ?? null,
    priority: src.priority?.(row) ?? null,
    day: src.day?.(row) || null,
    updatedAt: row.updated_at ?? null,
    rank: rankOf(terms, title),
    to: src.to(row),
  }
}

const sortKey = (r) => r.day || ymd(r.updatedAt) || ''

/**
 * Searches rows already in memory (the dev backend's tables). Same rules as the database function: every term must be found in the title
 * or the text, filters narrow, then rank / date order, then one page. `closed` lists locked modules, whose rows are left out.
 * Returns `{ total, rows }` where each row is a result.
 */
export function searchRows(tables, params, { closed = [] } = {}) {
  const p = normalizeParams(params)
  const terms = p.terms.map(fold)
  const ctx = lookups(tables)
  const all = []
  for (const src of SOURCES) {
    if (closed.includes(src.module) || tableClosed(closed, src.table)) continue
    if (p.modules && !p.modules.includes(src.module)) continue
    for (const row of tables[src.table] ?? []) {
      const res = toResult(src, row, ctx, terms)
      const hay = fold(`${res.title} ${src.body(row, ctx) ?? ''}`)
      if (!terms.every((t) => hay.includes(t))) continue
      if (p.from && !(res.day && res.day >= p.from)) continue
      if (p.to && !(res.day && res.day <= p.to)) continue
      if (p.status && !p.status.includes(res.status)) continue
      if (p.category && !p.category.includes(res.category)) continue
      if (p.priority && !p.priority.includes(res.priority)) continue
      all.push(res)
    }
  }
  const tie = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const byNewest = (a, b) => (sortKey(b) < sortKey(a) ? -1 : sortKey(b) > sortKey(a) ? 1 : tie(a, b))
  const byOldest = (a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : tie(a, b))
  // With no text to rank by, "relevance" is simply newest first.
  const order =
    p.sort === 'oldest' ? byOldest : p.sort === 'newest' || !p.terms.length ? byNewest : (a, b) => b.rank - a.rank || byNewest(a, b)
  all.sort(order)
  return { total: all.length, rows: all.slice(p.offset, p.offset + p.limit) }
}

// ------------------------------------------------------------------------------------------------- the database function's rows

/** The database function's JSON for one record, in the same shape `searchRows` gives. */
export function resultFromRow(r) {
  const src = SOURCE_BY_KIND[r.kind]
  if (!src) return null
  return {
    kind: r.kind,
    id: r.id,
    module: src.module,
    title: r.title ?? '',
    snippet: r.snippet ?? '',
    status: r.status ?? null,
    category: r.category ?? null,
    priority: r.priority ?? null,
    day: r.day ?? null,
    updatedAt: r.updated_at ?? null,
    rank: Number(r.rank) || 0,
    to: src.to(rowForLink(r)),
  }
}

/** The few columns each link needs, taken from the function's flattened row. */
const rowForLink = (r) => ({
  id: r.id,
  due_date: r.day,
  txn_date: r.day,
  starts_at: r.day,
})

// ---------------------------------------------------------------------------------------------------------------------- suggestions

/**
 * Autocomplete: up to `max` distinct titles that start with what is typed (or whose word does), best first, then those that contain it.
 * `results` are what a search for the typed text found; `recent` are the person's earlier searches, which come first when they match.
 */
export function buildSuggestions(typed, results, recent = [], max = 6) {
  const q = fold(typed).trim()
  if (!q) return []
  const seen = new Set()
  const out = []
  const add = (text, type) => {
    const key = fold(text)
    if (!text || seen.has(key) || key === q) return
    seen.add(key)
    out.push({ text, type })
  }
  for (const r of recent) if (fold(r).startsWith(q)) add(r, 'recent')
  const rank = (t) => (fold(t).startsWith(q) ? 0 : (' ' + fold(t)).includes(' ' + q) ? 1 : 2)
  for (const r of [...results].sort((a, b) => rank(a.title) - rank(b.title) || a.title.length - b.title.length)) add(r.title, 'title')
  return out.slice(0, max)
}
