// The Command Center's logic, free of React so it can be tested on its own: matching, ranking, highlighting, capture parsing,
// context-aware actions and the shortcut table. Nothing here reads or writes data; the palette hands it rows and acts on the result.
import { addDays, format, parseISO } from 'date-fns'
import { tableClosed } from '@lifetrack/core/moduleLocks'
import { NAV } from '@/lib/nav'

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')

/**
 * How well the fields match the query, 0 for no match. Prefix and word-start matches beat a match in the middle of a word, and every
 * whitespace-separated term of the query must be found (in any order, in any field).
 */
export function scoreMatch(query, ...fields) {
  const terms = norm(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return 0
  const hay = fields.map(norm).filter(Boolean)
  if (!hay.length) return 0
  let total = 0
  for (const term of terms) {
    let best = 0
    hay.forEach((h, i) => {
      const at = h.indexOf(term)
      if (at < 0) return
      const wordStart = at === 0 || /[\s\-_/·—:,.]/.test(h[at - 1])
      const s = (at === 0 ? 100 : wordStart ? 70 : 30) - Math.min(at, 20) / 2 + (i === 0 ? 10 : 0)
      if (s > best) best = s
    })
    if (!best) return 0
    total += best
  }
  return total / terms.length
}

/** The pieces of `text` to draw, each `{ text, hit }`, with every query term marked. Case and accent blind. */
export function highlightParts(text, query) {
  const source = String(text ?? '')
  const terms = [...new Set(norm(query).split(/\s+/).filter(Boolean))]
  if (!source || !terms.length) return [{ text: source, hit: false }]
  // If folding changed the length (a character that expands), indexes would no longer line up: draw it plain rather than cut it wrong.
  const low = norm(source)
  if (low.length !== source.length) return [{ text: source, hit: false }]
  const mark = new Array(source.length).fill(false)
  for (const t of terms) {
    for (let i = low.indexOf(t); i >= 0; i = low.indexOf(t, i + t.length)) for (let j = i; j < i + t.length; j++) mark[j] = true
  }
  const out = []
  for (let i = 0; i < source.length; i++) {
    const last = out[out.length - 1]
    if (last && last.hit === mark[i]) last.text += source[i]
    else out.push({ text: source[i], hit: mark[i] })
  }
  return out
}

// ------------------------------------------------------------------------------------------------------------------ data search

const ymd = (iso) => String(iso ?? '').slice(0, 10)

/** Each source: which fields to match, and how to show and open a row. `kind` names the group and keys the recents. */
const SOURCES = [
  {
    table: 'tasks',
    kind: 'task',
    title: 'Tasks',
    module: 'planner',
    text: (t) => [t.title, t.notes, t.category],
    item: (t) => ({
      label: t.title,
      sub: t.status === 'done' ? 'Done' : (t.due_date ?? 'No date'),
      to: t.due_date ? `/planner?date=${t.due_date}` : '/planner',
    }),
  },
  {
    table: 'notes',
    kind: 'note',
    title: 'Notes',
    module: 'notes',
    text: (n) => [n.title, n.body, n.category, (n.tags ?? []).join(' ')],
    item: (n) => ({ label: n.title || String(n.body ?? '').slice(0, 60) || 'Untitled note', sub: n.category, to: `/notes?note=${n.id}` }),
  },
  {
    table: 'goals',
    kind: 'goal',
    title: 'Goals',
    module: 'goals',
    text: (g) => [g.title, g.notes],
    item: (g) => ({ label: g.title, sub: g.status, to: '/goals' }),
  },
  {
    table: 'job_applications',
    kind: 'application',
    title: 'Job applications',
    module: 'jobs',
    text: (a) => [`${a.company} ${a.job_title}`, a.location],
    item: (a) => ({ label: `${a.company} — ${a.job_title}`, sub: a.status, to: `/jobs?app=${a.id}` }),
  },
  {
    table: 'habits',
    kind: 'habit',
    title: 'Habits',
    module: 'habits',
    text: (h) => [h.name],
    item: (h) => ({ label: h.name, to: '/habits' }),
  },
  {
    table: 'transactions',
    kind: 'transaction',
    title: 'Transactions',
    module: 'finance',
    text: (t) => [t.note, t.category],
    item: (t) => ({ label: t.note || t.category, sub: t.txn_date, to: `/finance?month=${String(t.txn_date).slice(0, 7)}-01` }),
  },
  {
    table: 'reminders',
    kind: 'reminder',
    title: 'Reminders',
    module: 'notifications',
    text: (r) => [r.title, r.body],
    item: (r) => ({ label: r.title, sub: r.remind_date, to: '/notifications?tab=reminders' }),
  },
  {
    table: 'calendar_events',
    kind: 'event',
    title: 'Events',
    module: 'calendar',
    text: (e) => [e.title, e.description, e.location],
    item: (e) => ({ label: e.title, sub: ymd(e.starts_at), to: `/calendar?date=${ymd(e.starts_at)}` }),
  },
  {
    table: 'food_logs',
    kind: 'food',
    title: 'Food log',
    module: 'nutrition',
    text: (f) => [f.name, f.meal_type],
    item: (f) => ({ label: f.name, sub: f.log_date, to: '/nutrition' }),
  },
  {
    table: 'workouts',
    kind: 'workout',
    title: 'Workouts',
    module: 'fitness',
    text: (w) => [w.name, w.notes],
    item: (w) => ({ label: w.name, sub: w.workout_date, to: '/fitness' }),
  },
  {
    table: 'learning_topics',
    kind: 'topic',
    title: 'Learning topics',
    module: 'learning',
    text: (t) => [t.name, t.notes],
    item: (t) => ({ label: t.name, to: '/learning' }),
  },
]

/** The tables the palette searches. */
export const SEARCH_TABLES = SOURCES.map((s) => s.table)

/**
 * Grouped search results across the app's pages and the user's own rows, best match first. `closed` lists locked modules: their rows
 * and pages are left out, so the palette never shows what the database would refuse. Each result: `{ id, kind, label, sub, to, module }`.
 */
export function searchData(query, data, { limit = 5, closed = [] } = {}) {
  const q = String(query ?? '').trim()
  if (!q) return []
  const groups = []
  const pages = NAV.map((n) => ({ n, s: scoreMatch(q, n.label, n.short) }))
    .filter((x) => x.s > 0 && !closed.includes(x.n.module))
    .sort((a, b) => b.s - a.s)
    .map(({ n }) => ({ id: n.to, kind: 'page', label: n.label, to: n.to, module: n.module, icon: n.icon }))
  if (pages.length) groups.push({ key: 'page', title: 'Pages', items: pages.slice(0, limit) })
  for (const src of SOURCES) {
    if (tableClosed(closed, src.table) || closed.includes(src.module)) continue
    const items = (data?.[src.table] ?? [])
      .map((row) => ({ row, s: scoreMatch(q, ...src.text(row)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(({ row }) => ({ id: row.id, kind: src.kind, module: src.module, ...src.item(row) }))
    if (items.length) groups.push({ key: src.kind, title: src.title, items })
  }
  return groups
}

/** Filters commands (`{ label, keywords }`) by the query, best match first. An empty query keeps them all in order. */
export function filterCommands(items, query) {
  const q = String(query ?? '').trim()
  if (!q) return items
  return items
    .map((it) => ({ it, s: scoreMatch(q, it.label, it.keywords) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it)
}

// -------------------------------------------------------------------------------------------------------------------- capture

export const CAPTURE_KINDS = [
  { kind: 'task', label: 'Add task', words: ['task'], short: 't' },
  { kind: 'note', label: 'Save note', words: ['note'], short: 'n' },
  { kind: 'reminder', label: 'Set reminder', words: ['remind', 'reminder'], short: 'r' },
]

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Pulls a date ("today", "tomorrow", "mon", "2026-11-20") and a time ("5pm", "17:30", "at 9") out of free text; what is left is the title. */
export function parseWhen(text, today) {
  let rest = ` ${String(text ?? '')} `
  let date = null
  let time = null
  const take = (re, fn) => {
    const m = rest.match(re)
    if (!m) return false
    fn(m)
    rest = rest.replace(re, ' ')
    return true
  }
  const base = parseISO(today)
  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => (date = m[1]))
  if (!date) take(/\s(?:today|tonight)(?=\s)/i, () => (date = today))
  if (!date) take(/\s(?:tomorrow|tmrw)(?=\s)/i, () => (date = format(addDays(base, 1), 'yyyy-MM-dd')))
  if (!date)
    take(/\s(?:on\s+|next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*(?=\s)/i, (m) => {
      const want = DAYS.findIndex((d) => d.startsWith(m[1].toLowerCase()))
      date = format(addDays(base, (want - base.getDay() + 7) % 7 || 7), 'yyyy-MM-dd')
    })
  const clock = (h, min, ap) => {
    let hh = Number(h)
    if (ap) {
      if (hh < 1 || hh > 12) return
      hh = (hh % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0)
    }
    if (hh > 23 || Number(min ?? 0) > 59) return
    time = `${String(hh).padStart(2, '0')}:${min ?? '00'}`
  }
  if (!take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i, (m) => clock(m[1], m[2], m[3])))
    if (!take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => clock(m[1], m[2]))) take(/\sat\s+(\d{1,2})(?=\s)/i, (m) => clock(m[1]))
  return { title: rest.replace(/\s+/g, ' ').trim(), date, time }
}

/**
 * Reads the line typed in the palette as a capture. `task: buy milk tomorrow`, `n: idea` and `remind call mum 5pm` choose the kind;
 * anything else is offered as every kind. Returns null for empty input; `{ kind: null }` when the kind is the person's to choose.
 */
export function parseCapture(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const colon = raw.match(/^([a-z]+)\s*:\s*(\S[\s\S]*)$/i)
  const word = raw.match(/^(task|note|remind|reminder)\s+(\S[\s\S]*)$/i)
  const [, prefix, text] = colon ?? word ?? []
  const k = prefix && CAPTURE_KINDS.find((c) => c.words.includes(prefix.toLowerCase()) || (colon && c.short === prefix.toLowerCase()))
  return k ? { kind: k.kind, text: text.trim() } : { kind: null, text: raw }
}

/** What a capture will save, as `{ table, row, label }` (or null for nothing to save). Defaults match what the dialogs save. */
export function captureRow(kind, text, today) {
  const clean = String(text ?? '').trim()
  if (!clean) return null
  if (kind === 'task') {
    const w = parseWhen(clean, today)
    const title = (w.title || clean).slice(0, 120)
    return {
      table: 'tasks',
      row: { title, category: 'Personal', priority: 'medium', due_date: w.date ?? today, recurrence: 'none' },
      label: title,
      when: w.date,
    }
  }
  if (kind === 'reminder') {
    const w = parseWhen(clean, today)
    const title = (w.title || clean).slice(0, 160)
    return {
      table: 'reminders',
      row: {
        kind: 'custom',
        title,
        remind_date: w.date ?? today,
        remind_time: w.time ?? '09:00',
        repeat: 'none',
        priority: 'normal',
        body: '',
        active: true,
        last_fired_on: null,
      },
      label: title,
      when: `${w.date ?? today} ${w.time ?? '09:00'}`,
    }
  }
  if (kind === 'note') {
    const [first, ...more] = clean.split('\n')
    const title = first.length <= 80 && more.length ? first : ''
    return {
      table: 'notes',
      row: { title, body: title ? more.join('\n').trim() : clean, category: 'Quick', tags: [], pinned: false },
      label: title || clean.slice(0, 60),
    }
  }
  return null
}

// --------------------------------------------------------------------------------------------------------------- context actions

/** What makes sense on each page, as palette commands that name a quick-add `quick` kind or a `to`. Looked up by the first path segment. */
const CONTEXT = {
  '': [{ id: 'ctx-task', label: 'Add a task for today', quick: 'task' }],
  planner: [{ id: 'ctx-task', label: 'Add a task', quick: 'task' }],
  calendar: [{ id: 'ctx-task', label: 'Add a task', quick: 'task' }],
  habits: [{ id: 'ctx-habit', label: 'Complete a habit', quick: 'habit' }],
  notes: [{ id: 'ctx-note', label: 'Write a new note', to: '/notes?new=1' }],
  fitness: [
    { id: 'ctx-workout', label: 'Record a workout', quick: 'workout' },
    { id: 'ctx-exercises', label: 'Browse the exercise library', to: '/fitness?tab=library' },
  ],
  nutrition: [
    { id: 'ctx-food', label: 'Log food', to: '/nutrition?add=1' },
    { id: 'ctx-water', label: 'Log water', quick: 'water' },
  ],
  health: [{ id: 'ctx-water', label: 'Log water', quick: 'water' }],
  finance: [{ id: 'ctx-expense', label: 'Add an expense', quick: 'expense' }],
  jobs: [{ id: 'ctx-app', label: 'Add a job application', quick: 'application' }],
  learning: [{ id: 'ctx-study', label: 'Start a study session', quick: 'study' }],
  focus: [{ id: 'ctx-focus', label: 'Start a focus session', to: '/focus?start=1' }],
  notifications: [{ id: 'ctx-reminder', label: 'New reminder', to: '/notifications?tab=reminders&new=1' }],
}

/** The context commands for a pathname (`[]` where nothing is specific to the page). */
export function contextActions(pathname) {
  const seg =
    String(pathname ?? '/')
      .split(/[?#]/)[0]
      .split('/')
      .filter(Boolean)[0] ?? ''
  return CONTEXT[seg] ?? []
}

// ---------------------------------------------------------------------------------------------------------------------- recents

export const RECENTS_MAX = 8

/** Adds (or moves to the front) an entry, keyed by kind and id, and keeps the newest few. Returns a new list. */
export function pushRecent(list, entry, max = RECENTS_MAX) {
  const key = (e) => `${e.kind}:${e.id}`
  return [entry, ...(list ?? []).filter((e) => key(e) !== key(entry))].slice(0, max)
}

/** Drops anything malformed from stored recents (storage is the user's to edit, and other versions may have written other shapes). */
export function sanitizeRecents(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        typeof e.kind === 'string' &&
        typeof e.label === 'string' &&
        typeof e.to === 'string' &&
        e.to.startsWith('/'),
    )
    .slice(0, RECENTS_MAX)
    .map(({ id, kind, label, sub, to, module }) => ({ id, kind, label, sub: typeof sub === 'string' ? sub : undefined, to, module }))
}

// -------------------------------------------------------------------------------------------------------------------- shortcuts

/** `g` then a key goes to a page; `c` then a key creates something. Both are listed in the palette's shortcut sheet. */
export const GO_KEYS = {
  d: '/',
  p: '/planner',
  c: '/calendar',
  f: '/focus',
  h: '/habits',
  n: '/notes',
  l: '/learning',
  j: '/jobs',
  o: '/goals',
  w: '/fitness',
  s: '/health',
  u: '/nutrition',
  m: '/finance',
  a: '/analytics',
  r: '/reports',
  i: '/notifications',
  ',': '/settings',
}
export const CREATE_KEYS = { t: 'task', w: 'workout', f: 'food', n: 'note', r: 'reminder', e: 'expense', s: 'focus' }

/** What each create shortcut and quick action opens: a quick-add dialog (`quick`) or a page that opens its own form (`to`). */
export const CREATE_TARGETS = {
  task: { quick: 'task' },
  workout: { quick: 'workout' },
  expense: { quick: 'expense' },
  food: { to: '/nutrition?add=1' },
  note: { to: '/notes?new=1' },
  reminder: { to: '/notifications?tab=reminders&new=1' },
  focus: { to: '/focus?start=1' },
}

/** Is the event aimed at something the person types into? Single-key shortcuts must stay out of the way of these. */
export function isTypingTarget(target) {
  if (!target || typeof target !== 'object' || !('tagName' in target)) return false
  const tag = String(target.tagName).toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input')
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(
      String(target.type).toLowerCase(),
    )
  return !!target.isContentEditable || target.getAttribute?.('contenteditable') === 'true' || !!target.closest?.('[role="textbox"]')
}
