// The web dashboard builder's rules: widget catalog, workspaces, grid layouts and templates. Pure functions, no React, so every rule is tested
// without a screen. Everything is stored in the existing `user_settings.dashboard_widgets` json under the reserved key `ws`; nothing else in the
// database changes, and the rest of that object (the hide flags, order and sizes the mobile app reads) is kept in step with the default workspace.
//
//   ws = { v: 1, rev, defaultId, workspaces: [Workspace], templates: [Template] }
//   Workspace = { id, name, createdAt, updatedAt, widgets: [Widget], layouts: { lg: [Item], md: [Item], sm: [Item] } }
//   Widget = { id, type, title, config, hidden, size }      (`size` is the {w,h} it had on the large grid, kept while hidden)
//   Item = { i: widgetId, x, y, w, h }                      (grid cells; sm is a single column)
//
// A widget on the dashboard only shows figures; removing one never touches the tasks, habits, transactions... behind it.
import { COMMAND_KEYS, COMMAND_WIDGETS, widgetSize, WIDGET_SIZES } from './commandCenter'
import { widgetOrder } from './dashboard'

export { WIDGET_SIZES }

/** Container-width breakpoints (the grid measures its own box, so the sidebar is already accounted for) and columns at each. */
export const GRID = {
  breakpoints: { lg: 900, md: 560, sm: 0 },
  cols: { lg: 12, md: 6, sm: 1 },
  rowHeight: 56,
  margin: 16,
}
export const BREAKPOINTS = ['lg', 'md', 'sm']
export const STATE_VERSION = 1
export const MAX_WORKSPACES = 12
export const MAX_TEMPLATES = 12
export const MAX_NAME = 40

export const CATEGORIES = [
  { key: 'productivity', label: 'Productivity' },
  { key: 'career', label: 'Career & Learning' },
  { key: 'fitness', label: 'Fitness & Health' },
  { key: 'finance', label: 'Finance' },
  { key: 'planning', label: 'Planning' },
  { key: 'overview', label: 'Overview' },
]

const LABELS = Object.fromEntries(COMMAND_WIDGETS.map((w) => [w.key, w.label]))

// w/h are grid cells (12 columns, 56px rows); min/max keep a card from getting too small to read or absurdly large. `needs` is the module whose
// lock hides the widget (see moduleLocks). `config` describes the options in the widget's settings dialog.
const W = (type, category, description, w, h, o = {}) => ({
  type,
  label: o.label ?? LABELS[type],
  category,
  description,
  w,
  h,
  minW: o.minW ?? Math.min(w, 3),
  minH: o.minH ?? Math.min(h, 4),
  maxW: o.maxW ?? 12,
  maxH: o.maxH ?? 14,
  multi: !!o.multi,
  config: o.config ?? [],
  fixedWidth: !!o.fixedWidth,
})

const COUNT = (def, max = 10) => ({ key: 'count', label: 'Rows to show', type: 'number', min: 3, max, default: def })

/** Every widget a user can put on a workspace. Each one is backed by data the app already holds. */
export const WIDGET_CATALOG = [
  W('priorities', 'productivity', 'Today’s tasks: the most important ones first, tick them off in place.', 4, 6, { label: 'Today’s tasks', minW: 3, minH: 5 }),
  W('upcoming', 'productivity', 'Tasks, interviews, goals and reminders due in the next week.', 4, 6, { minW: 3, minH: 5 }),
  W('progress', 'productivity', 'How much of today you have finished: tasks, habits, study, workout and sleep.', 8, 5, { minW: 4, minH: 4 }),
  W('habits', 'productivity', 'Habits due today, streaks and the routine progress.', 6, 6, { minW: 3, minH: 5 }),
  W('focus', 'productivity', 'Study and focus minutes today, with a shortcut to start a session.', 4, 4, { label: 'Focus timer', minW: 3, minH: 3, maxH: 7 }),
  W('notes', 'productivity', 'Your latest notes, and a shortcut to write one.', 4, 6, {
    label: 'Quick notes',
    multi: true,
    minH: 4,
    maxW: 8,
    config: [COUNT(4, 8)],
  }),
  W('learning', 'career', 'Study time, learning goals, topics and what to revise. Covers course progress and skills studied.', 6, 6, {
    label: 'Learning progress',
    minW: 3,
    minH: 5,
  }),
  W('jobs', 'career', 'Applications by stage, next interviews and follow-ups.', 6, 6, { label: 'Job applications', minW: 3, minH: 5 }),
  W('interviews', 'career', 'Upcoming interviews and the preparation notes you saved for them.', 4, 5, {
    label: 'Interview preparation',
    minH: 4,
    config: [COUNT(4, 8)],
  }),
  W('fitness', 'fitness', 'This week’s workouts, weight and what is planned today.', 6, 7, { label: 'Workout & fitness progress', minW: 3, minH: 5 }),
  W('nutrition', 'fitness', 'Calories and macros against your targets today.', 4, 5, { label: 'Nutrition summary', minW: 3, minH: 4 }),
  W('sleep', 'fitness', 'Last night, the week’s average and sleep against your goal.', 6, 6, { label: 'Sleep overview', minW: 3, minH: 5 }),
  W('spending', 'finance', 'Spending against the budget this month, income, and the latest transactions.', 6, 7, {
    label: 'Monthly expenses',
    minW: 3,
    minH: 5,
  }),
  W('budget', 'finance', 'How much of this month’s budget is used, and what is left.', 4, 4, { label: 'Budget overview', minW: 3, minH: 3, maxH: 7 }),
  W('transactions', 'finance', 'Your most recent income and expenses.', 4, 6, {
    label: 'Recent transactions',
    multi: true,
    minH: 4,
    maxW: 8,
    config: [COUNT(5, 10)],
  }),
  W('calendar', 'planning', 'A month at a glance. Days with something due are marked.', 4, 6, {
    label: 'Mini calendar',
    minW: 3,
    minH: 5,
    maxW: 6,
    maxH: 8,
  }),
  W('today', 'planning', 'Your whole day in time order: tasks, habits, workout, reminders and interviews.', 8, 8, {
    label: 'Daily schedule',
    minW: 4,
    minH: 5,
  }),
  W('goals', 'planning', 'Progress on your active goals.', 4, 5, { minH: 4 }),
  W('weekly', 'planning', 'Your Life Score for the week, month and year, with streaks.', 8, 6, { label: 'Weekly overview', minW: 4, minH: 5 }),
  W('score', 'overview', 'One number for how the week is going, and what it is made of.', 4, 7, { minW: 3, minH: 6 }),
  W('stats', 'overview', 'The day’s key numbers across every module.', 12, 5, { minW: 6, minH: 4, maxH: 8 }),
  W('activity', 'overview', 'The latest things you did, across the app.', 4, 6, { minH: 4 }),
  W('quick', 'overview', 'Shortcuts to add a task, expense, workout and more.', 12, 3, { minW: 4, minH: 2, maxH: 5 }),
  W('getting_started', 'overview', 'A short guide for a new account. It disappears once you have started.', 12, 4, { minW: 6, minH: 3, maxH: 8 }),
]
const BY_TYPE = Object.fromEntries(WIDGET_CATALOG.map((w) => [w.type, w]))
export const WIDGET_TYPES = WIDGET_CATALOG.map((w) => w.type)
export const widgetDef = (type) => BY_TYPE[type] ?? null

/** Does the widget have a settings dialog? */
export const hasConfig = (type) => (BY_TYPE[type]?.config.length ?? 0) > 0
export const defaultConfig = (type) => Object.fromEntries((BY_TYPE[type]?.config ?? []).map((c) => [c.key, c.default]))

/** Config limited to the options the widget declares, each clamped to its range, so a hand-edited value can never break a card. */
export function cleanConfig(type, config) {
  const out = defaultConfig(type)
  for (const c of BY_TYPE[type]?.config ?? []) {
    const v = config?.[c.key]
    if (c.type === 'number' && Number.isFinite(Number(v))) out[c.key] = Math.min(c.max, Math.max(c.min, Math.round(Number(v))))
    else if (c.type === 'select' && c.options.some((o) => o.value === v)) out[c.key] = v
    else if (c.type === 'toggle' && typeof v === 'boolean') out[c.key] = v
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Ids and names

let counter = 0
/** A short random id, unique within a user's dashboard. Injectable for tests. */
export const newId = (prefix = 'x') => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const cleanName = (name, fallback) => {
  const t = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  return t || fallback
}

/** `Name`, or `Name 2`, `Name 3`... when taken (case-insensitive). */
export function uniqueName(names, base) {
  const taken = new Set(names.map((n) => n.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Grid maths

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const bottomOf = (items) => items.reduce((m, it) => Math.max(m, it.y + it.h), 0)

/** Size limits for a widget on a grid with `cols` columns (a single column has fixed width 1). */
export function limitsFor(type, cols) {
  const d = BY_TYPE[type]
  if (!d) return { minW: 1, maxW: cols, minH: 2, maxH: 14 }
  if (cols === 1) return { minW: 1, maxW: 1, minH: d.minH, maxH: d.maxH }
  const scale = cols / 12
  const minW = clamp(Math.ceil(d.minW * scale), 1, cols)
  return { minW, maxW: clamp(Math.floor(d.maxW * scale), minW, cols), minH: d.minH, maxH: d.maxH }
}

/** Fit one item to its widget's limits and to the grid's width. */
export function fitItem(type, item, cols) {
  const l = limitsFor(type, cols)
  const w = clamp(Math.round(item.w), l.minW, l.maxW)
  const h = clamp(Math.round(item.h), l.minH, l.maxH)
  const x = clamp(Math.round(item.x), 0, Math.max(0, cols - w))
  return { i: item.i, x, y: Math.max(0, Math.round(item.y)), w, h }
}

/**
 * Lay items out left to right in rows of `cols`: { i, w, h } in, { i, x, y, w, h } out. With `stretch` a row that ends short has its last
 * widget widened to fill it, so nothing is left with a hole beside it.
 */
export function packRows(items, cols = 12, { stretch = false } = {}) {
  const out = []
  let row = []
  let used = 0
  let y = 0
  const flush = () => {
    if (!row.length) return
    if (stretch && used < cols) row[row.length - 1] = { ...row[row.length - 1], w: row[row.length - 1].w + (cols - used) }
    let x = 0
    for (const it of row) {
      out.push({ i: it.i, x, y, w: it.w, h: it.h })
      x += it.w
    }
    y += Math.max(...row.map((r) => r.h))
    row = []
    used = 0
  }
  for (const it of items) {
    const w = Math.min(it.w, cols)
    if (used + w > cols) flush()
    row.push({ ...it, w })
    used += w
  }
  flush()
  return out
}

/** Reading order of a layout: top to bottom, then left to right. */
export const readingOrder = (items) => [...items].sort((a, b) => a.y - b.y || a.x - b.x)

/** A single-column layout in the order of `items`. */
export function stackItems(items, typeOf) {
  let y = 0
  return items.map((it) => {
    const { minH, maxH } = limitsFor(typeOf(it.i), 1)
    const h = clamp(it.h, minH, maxH)
    const out = { i: it.i, x: 0, y, w: 1, h }
    y += h
    return out
  })
}

/** The 6-column layout for a 12-column one: widths halved (rounded up so a widget never gets narrower than it can be), then repacked. */
export function scaleToColumns(items, typeOf, cols) {
  const ordered = readingOrder(items)
  const scaled = ordered.map((it) => {
    const l = limitsFor(typeOf(it.i), cols)
    return { i: it.i, w: clamp(Math.round((it.w * cols) / 12), l.minW, l.maxW), h: it.h }
  })
  return packRows(scaled, cols)
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Workspaces

const typeMap = (ws) => Object.fromEntries(ws.widgets.map((w) => [w.id, w.type]))
export const visibleWidgets = (ws) => ws.widgets.filter((w) => !w.hidden)

/**
 * Make `ws` internally consistent: every visible widget has exactly one item in each layout, inside the limits; hidden widgets and unknown ids
 * have none; a breakpoint nobody has laid out is derived from the large one (6 columns by scaling, one column by stacking).
 */
export function ensureLayouts(ws) {
  const types = typeMap(ws)
  const typeOf = (id) => types[id]
  const visible = visibleWidgets(ws)
  const ids = new Set(visible.map((w) => w.id))
  const layouts = {}
  const lg = tidy(ws.layouts?.lg, ids, typeOf, 12, visible)
  layouts.lg = lg
  for (const bp of ['md', 'sm']) {
    const cols = GRID.cols[bp]
    const own = ws.layouts?.[bp]
    if (Array.isArray(own) && own.length) {
      layouts[bp] = tidy(own, ids, typeOf, cols, visible)
    } else {
      // Derived layouts are settled the same way the grid settles them (gravity), so opening the editor never looks like a change.
      layouts[bp] = cols === 1 ? stackItems(readingOrder(lg), typeOf) : resolveOverlaps(scaleToColumns(lg, typeOf, cols), cols)
    }
  }
  return { ...ws, layouts }
}

function tidy(items, ids, typeOf, cols, visible) {
  const seen = new Set()
  const kept = (Array.isArray(items) ? items : [])
    .filter((it) => it && ids.has(it.i) && !seen.has(it.i) && seen.add(it.i))
    .filter((it) => [it.x, it.y, it.w, it.h].every(Number.isFinite))
    .map((it) => fitItem(typeOf(it.i), it, cols))
  // Anything without a position goes underneath the rest, at the size it had (or its default).
  let y = bottomOf(kept)
  for (const w of visible) {
    if (seen.has(w.id)) continue
    const d = BY_TYPE[w.type]
    const base = w.size ?? { w: d.w, h: d.h }
    const item = fitItem(w.type, { i: w.id, x: 0, y, w: cols === 1 ? 1 : Math.round((base.w * cols) / 12) || 1, h: base.h }, cols)
    kept.push(item)
    y += item.h
  }
  return resolveOverlaps(kept, cols)
}

/**
 * Settle items the way the grid does (vertical gravity): reading order, each one as high as it can go without touching one placed before it.
 * So a stored layout can never show two widgets on top of each other or leave a gap the grid would close, and what is saved is what is drawn.
 */
export function resolveOverlaps(items, cols) {
  const placed = []
  for (const it of readingOrder(items)) {
    const x = clamp(it.x, 0, Math.max(0, cols - it.w))
    let y = 0
    while (placed.some((p) => x < p.x + p.w && p.x < x + it.w && y < p.y + p.h && p.y < y + it.h)) y++
    placed.push({ ...it, x, y })
  }
  return items.map((it) => placed.find((p) => p.i === it.i))
}

export function makeWorkspace({ name, widgets = [], layouts = {}, now = new Date().toISOString(), id = newId('ws') }) {
  return ensureLayouts({ id, name, createdAt: now, updatedAt: now, widgets, layouts })
}

export function makeWidget(type, o = {}) {
  const d = BY_TYPE[type]
  return {
    id: o.id ?? newId('w'),
    type,
    title: o.title ?? '',
    config: cleanConfig(type, o.config),
    hidden: !!o.hidden,
    size: o.size ?? { w: d.w, h: d.h },
  }
}

/** Is there room for another `type` here: single-instance widgets only once, `multi` widgets up to five times. */
export function canAdd(ws, type) {
  const d = BY_TYPE[type]
  if (!d) return false
  const n = ws.widgets.filter((w) => w.type === type).length
  return d.multi ? n < 5 : n === 0
}

const touch = (ws, now) => ({ ...ws, updatedAt: now ?? new Date().toISOString() })

/** Add a widget at the bottom of every layout (visible, at its default size). A type already there is returned unchanged unless `multi`. */
export function addWidget(ws, type, { id, config, title, now } = {}) {
  if (!canAdd(ws, type)) return ws
  const widget = makeWidget(type, { id, config, title })
  return touch(ensureLayouts({ ...ws, widgets: [...ws.widgets, widget] }), now)
}

export function removeWidget(ws, id, now) {
  if (!ws.widgets.some((w) => w.id === id)) return ws
  const widgets = ws.widgets.filter((w) => w.id !== id)
  const layouts = Object.fromEntries(BREAKPOINTS.map((bp) => [bp, (ws.layouts[bp] ?? []).filter((it) => it.i !== id)]))
  return touch(ensureLayouts({ ...ws, widgets, layouts }), now)
}

/** Hide keeps the widget and its settings (and remembers its size); showing it again puts it back at the bottom. */
export function setHidden(ws, id, hidden, now) {
  const w = ws.widgets.find((x) => x.id === id)
  if (!w || w.hidden === hidden) return ws
  const lg = ws.layouts.lg.find((it) => it.i === id)
  const widgets = ws.widgets.map((x) => (x.id === id ? { ...x, hidden, size: lg ? { w: lg.w, h: lg.h } : x.size } : x))
  const layouts = hidden ? Object.fromEntries(BREAKPOINTS.map((bp) => [bp, ws.layouts[bp].filter((it) => it.i !== id)])) : ws.layouts
  return touch(ensureLayouts({ ...ws, widgets, layouts }), now)
}

export function updateWidget(ws, id, patch, now) {
  if (!ws.widgets.some((w) => w.id === id)) return ws
  const widgets = ws.widgets.map((w) => {
    if (w.id !== id) return w
    const next = { ...w }
    if ('title' in patch) next.title = cleanName(patch.title, '')
    if ('config' in patch) next.config = cleanConfig(w.type, patch.config)
    return next
  })
  return touch({ ...ws, widgets }, now)
}

/** A copy of a widget (same settings, new id) placed at the bottom. Only for widgets that allow several. */
export function duplicateWidget(ws, id, { newWidgetId, now } = {}) {
  const w = ws.widgets.find((x) => x.id === id)
  if (!w || !canAdd(ws, w.type)) return ws
  const copy = makeWidget(w.type, { id: newWidgetId, title: w.title ? `${w.title} copy`.slice(0, MAX_NAME) : '', config: w.config })
  const item = ws.layouts.lg.find((it) => it.i === id)
  copy.size = item ? { w: item.w, h: item.h } : w.size
  return touch(ensureLayouts({ ...ws, widgets: [...ws.widgets, copy] }), now)
}

/** Resize one widget on the large grid to a named width (Small/Medium/Large/Full) keeping its height; the other grids are rebuilt. */
export function resizeWidget(ws, id, sizeKey, now) {
  const span = WIDGET_SIZES.find((s) => s.key === sizeKey)?.span
  const w = ws.widgets.find((x) => x.id === id)
  const item = ws.layouts.lg.find((it) => it.i === id)
  if (!span || !w || !item) return ws
  const lg = ws.layouts.lg.map((it) => (it.i === id ? fitItem(w.type, { ...it, w: span }, 12) : it))
  return touch(ensureLayouts({ ...ws, layouts: { lg, md: undefined, sm: undefined } }), now)
}

/** Back to the catalog size, no custom title and default settings. */
export function resetWidget(ws, id, now) {
  const w = ws.widgets.find((x) => x.id === id)
  const d = w && BY_TYPE[w.type]
  if (!d) return ws
  const widgets = ws.widgets.map((x) => (x.id === id ? { ...x, title: '', config: defaultConfig(x.type), size: { w: d.w, h: d.h } } : x))
  const patch = (bp, cols) => ws.layouts[bp].map((it) => (it.i === id ? fitItem(w.type, { ...it, w: cols === 1 ? 1 : Math.round((d.w * cols) / 12), h: d.h }, cols) : it))
  const layouts = { lg: patch('lg', 12), md: patch('md', 6), sm: patch('sm', 1) }
  return touch(ensureLayouts({ ...ws, widgets, layouts }), now)
}

/** Which named width (sm/md/lg/full) a widget currently is on the large grid, or null for a custom one. */
export function sizeKeyOf(ws, id) {
  const it = ws.layouts.lg.find((x) => x.i === id)
  return WIDGET_SIZES.find((s) => s.span === it?.w)?.key ?? null
}

/** Move a widget up (-1) or down (+1) in the single-column (phone) order. */
export function moveInColumn(ws, id, by, now) {
  const order = readingOrder(ws.layouts.sm)
  const at = order.findIndex((it) => it.i === id)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return ws
  const next = [...order]
  const [it] = next.splice(at, 1)
  next.splice(to, 0, it)
  const types = typeMap(ws)
  return touch({ ...ws, layouts: { ...ws.layouts, sm: stackItems(next, (i) => types[i]) } }, now)
}

/** Replace one breakpoint's layout (from the grid after a drag or resize), fitted to the widgets' limits. */
export function setLayout(ws, bp, items, now) {
  const cols = GRID.cols[bp]
  const types = typeMap(ws)
  const ids = new Set(visibleWidgets(ws).map((w) => w.id))
  const next = items.filter((it) => ids.has(it.i)).map((it) => fitItem(types[it.i], it, cols))
  if (JSON.stringify(sorted(next)) === JSON.stringify(sorted(ws.layouts[bp] ?? []))) return ws
  const widgets = bp === 'lg' ? ws.widgets.map((w) => (next.find((it) => it.i === w.id) ? { ...w, size: pick(next, w.id) } : w)) : ws.widgets
  return touch({ ...ws, widgets, layouts: { ...ws.layouts, [bp]: next } }, now)
}
const sorted = (items) => [...items].sort((a, b) => (a.i < b.i ? -1 : 1)).map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
const pick = (items, id) => {
  const it = items.find((x) => x.i === id)
  return { w: it.w, h: it.h }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The whole state

export const emptyState = () => ({ v: STATE_VERSION, rev: 0, defaultId: null, workspaces: [], templates: [] })

/**
 * The first workspace for an account that has only the old layout (hide flags, order, sizes): the same widgets, in the same order and widths,
 * laid out on the grid. Widgets the user hid are simply not on it (the library offers them again).
 */
// The timestamp is fixed (the epoch) so that reading the same old layout twice gives the same state, which the editor compares to see what changed.
export function stateFromLegacy(prefs, { now = new Date(0).toISOString(), id = 'ws_main' } = {}) {
  const order = widgetOrder(prefs, COMMAND_KEYS).filter((k) => prefs?.[k] !== false)
  const widgets = order.map((type) => makeWidget(type, { id: `w_${type}` }))
  const items = order.map((type) => {
    const d = BY_TYPE[type]
    const span = WIDGET_SIZES.find((s) => s.key === widgetSize(prefs, type))?.span ?? d.w
    return { i: `w_${type}`, w: span, h: d.h }
  })
  const lg = packRows(items, 12, { stretch: true })
  const ws = makeWorkspace({ id, name: 'My Daily Life', widgets, layouts: { lg }, now })
  return { ...emptyState(), defaultId: ws.id, workspaces: [ws] }
}

/** Repair a stored state: drop what is unknown, keep what is valid. Never throws. */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.workspaces)) return null
  const seen = new Set()
  const workspaces = []
  for (const w of raw.workspaces.slice(0, MAX_WORKSPACES)) {
    if (!w || typeof w.id !== 'string' || seen.has(w.id)) continue
    seen.add(w.id)
    const ids = new Set()
    const widgets = (Array.isArray(w.widgets) ? w.widgets : [])
      .filter((x) => x && typeof x.id === 'string' && BY_TYPE[x.type] && !ids.has(x.id) && ids.add(x.id))
      .map((x) => ({
        id: x.id,
        type: x.type,
        title: cleanName(x.title, ''),
        config: cleanConfig(x.type, x.config),
        hidden: !!x.hidden,
        size: x.size && Number.isFinite(x.size.w) && Number.isFinite(x.size.h) ? { w: x.size.w, h: x.size.h } : { w: BY_TYPE[x.type].w, h: BY_TYPE[x.type].h },
      }))
      // A single-instance type that somehow appears twice keeps only its first copy.
      .filter((x, i, all) => BY_TYPE[x.type].multi || all.findIndex((y) => y.type === x.type) === i)
    workspaces.push(
      ensureLayouts({
        id: w.id,
        name: cleanName(w.name, 'Workspace'),
        createdAt: typeof w.createdAt === 'string' ? w.createdAt : new Date(0).toISOString(),
        updatedAt: typeof w.updatedAt === 'string' ? w.updatedAt : new Date(0).toISOString(),
        widgets,
        layouts: w.layouts ?? {},
      }),
    )
  }
  if (!workspaces.length) return null
  const templates = (Array.isArray(raw.templates) ? raw.templates : [])
    .slice(0, MAX_TEMPLATES)
    .filter((t) => t && typeof t.id === 'string' && Array.isArray(t.widgets))
    .map((t) => ({
      id: t.id,
      name: cleanName(t.name, 'Template'),
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date(0).toISOString(),
      widgets: t.widgets
        .filter((x) => x && BY_TYPE[x.type])
        .map((x) => ({ type: x.type, title: cleanName(x.title, ''), config: cleanConfig(x.type, x.config), w: Number(x.w) || BY_TYPE[x.type].w, h: Number(x.h) || BY_TYPE[x.type].h })),
    }))
  const defaultId = workspaces.some((w) => w.id === raw.defaultId) ? raw.defaultId : workspaces[0].id
  return { v: STATE_VERSION, rev: Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0, defaultId, workspaces, templates }
}

/** The state held by a `dashboard_widgets` value: the saved one, or the one built from the old layout (not saved until the user changes it). */
export function readState(prefs, opts) {
  return normalizeState(prefs?.ws) ?? stateFromLegacy(prefs, opts)
}

/**
 * The `dashboard_widgets` value to save for `state`: the old keys follow the default workspace (shown/hidden and order), so the mobile app keeps
 * showing the same widgets, and `ws` carries a new revision.
 */
export function writeState(prefs, state) {
  const def = state.workspaces.find((w) => w.id === state.defaultId) ?? state.workspaces[0]
  const on = new Set(visibleWidgets(def).map((w) => w.type))
  const order = readingOrder(def.layouts.lg).map((it) => def.widgets.find((w) => w.id === it.i)?.type)
  const out = { ...prefs }
  for (const k of COMMAND_KEYS) out[k] = on.has(k) ? true : false
  out.order = [...new Set([...order, ...COMMAND_KEYS])].filter((k) => COMMAND_KEYS.includes(k))
  out.ws = { ...state, rev: state.rev + 1 }
  return out
}

export const revOf = (prefs) => (Number.isInteger(prefs?.ws?.rev) ? prefs.ws.rev : 0)

export const getWorkspace = (state, id) => state.workspaces.find((w) => w.id === id) ?? state.workspaces.find((w) => w.id === state.defaultId) ?? state.workspaces[0]
export const mapWorkspace = (state, id, fn) => ({ ...state, workspaces: state.workspaces.map((w) => (w.id === id ? fn(w) : w)) })

export function createWorkspace(state, name, { widgets, layouts, id, now } = {}) {
  if (state.workspaces.length >= MAX_WORKSPACES) return { state, id: null }
  const ws = makeWorkspace({ id, now, name: uniqueName(state.workspaces.map((w) => w.name), cleanName(name, 'New workspace')), widgets: widgets ?? [], layouts: layouts ?? {} })
  return { state: { ...state, workspaces: [...state.workspaces, ws] }, id: ws.id }
}

export function renameWorkspace(state, id, name, now) {
  const clean = cleanName(name, '')
  if (!clean) return state
  const taken = state.workspaces.filter((w) => w.id !== id).map((w) => w.name)
  return mapWorkspace(state, id, (w) => touch({ ...w, name: uniqueName(taken, clean) }, now))
}

export function duplicateWorkspace(state, id, { newWorkspaceId, now } = {}) {
  const src = state.workspaces.find((w) => w.id === id)
  if (!src || state.workspaces.length >= MAX_WORKSPACES) return { state, id: null }
  const widgetIds = new Map(src.widgets.map((w) => [w.id, newId('w')]))
  const widgets = src.widgets.map((w) => ({ ...w, id: widgetIds.get(w.id), config: { ...w.config }, size: { ...w.size } }))
  const layouts = Object.fromEntries(BREAKPOINTS.map((bp) => [bp, src.layouts[bp].map((it) => ({ ...it, i: widgetIds.get(it.i) }))]))
  return createWorkspace(state, `${src.name} copy`, { widgets, layouts, id: newWorkspaceId, now })
}

/** Delete a workspace. The last one cannot go; deleting the default makes the first remaining one the default. */
export function deleteWorkspace(state, id) {
  if (state.workspaces.length <= 1 || !state.workspaces.some((w) => w.id === id)) return state
  const workspaces = state.workspaces.filter((w) => w.id !== id)
  return { ...state, workspaces, defaultId: state.defaultId === id ? workspaces[0].id : state.defaultId }
}

export const setDefault = (state, id) => (state.workspaces.some((w) => w.id === id) ? { ...state, defaultId: id } : state)

/** Why a widget cannot move to another workspace, or null when it can. */
export function moveBlocker(state, fromId, widgetId, toId) {
  const from = state.workspaces.find((w) => w.id === fromId)
  const to = state.workspaces.find((w) => w.id === toId)
  const w = from?.widgets.find((x) => x.id === widgetId)
  if (!from || !to || !w || fromId === toId) return 'Nothing to move'
  return canAdd(to, w.type) ? null : `${to.name} already has ${BY_TYPE[w.type].label}`
}

/** Move a widget (with its settings and size) to the bottom of another workspace. */
export function moveWidgetToWorkspace(state, fromId, widgetId, toId, now) {
  if (moveBlocker(state, fromId, widgetId, toId)) return state
  const w = state.workspaces.find((x) => x.id === fromId).widgets.find((x) => x.id === widgetId)
  const lg = state.workspaces.find((x) => x.id === fromId).layouts.lg.find((it) => it.i === widgetId)
  const moved = { ...w, hidden: false, size: lg ? { w: lg.w, h: lg.h } : w.size }
  return mapWorkspace(mapWorkspace(state, fromId, (x) => removeWidget(x, widgetId, now)), toId, (x) => touch(ensureLayouts({ ...x, widgets: [...x.widgets, moved] }), now))
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Templates

const T = (key, label, description, widgets) => ({ key, label, description, widgets })

/** Ready-made dashboards: lists of widget types (optionally with a size) packed onto the grid. Only widgets that exist, so each has real data. */
export const BUILTIN_TEMPLATES = [
  T('balanced', 'Balanced', 'Everything, in the standard order.', null),
  T('minimal', 'Minimal', 'Today’s tasks, a calendar and your daily progress.', [
    { type: 'priorities' },
    { type: 'calendar' },
    { type: 'progress', w: 4 },
  ]),
  T('productivity', 'Productivity', 'Tasks, focus, habits, goals and a weekly overview.', [
    { type: 'priorities' },
    { type: 'focus' },
    { type: 'habits', w: 4 },
    { type: 'goals' },
    { type: 'weekly', w: 8 },
    { type: 'notes' },
  ]),
  T('career', 'Career', 'Job applications, learning, interview preparation and goals.', [
    { type: 'jobs', w: 8 },
    { type: 'interviews' },
    { type: 'learning', w: 8 },
    { type: 'goals' },
  ]),
  T('fitness', 'Fitness', 'Workouts, nutrition, sleep and fitness progress.', [
    { type: 'fitness', w: 8 },
    { type: 'nutrition' },
    { type: 'sleep', w: 8 },
    { type: 'habits' },
  ]),
  T('finance', 'Finance', 'Monthly expenses, budget and recent transactions.', [
    { type: 'spending', w: 8 },
    { type: 'budget' },
    { type: 'transactions', w: 6 },
    { type: 'upcoming', w: 6 },
  ]),
  T('focus', 'Focus', 'Today, your priorities, goals and habits. Nothing else.', [
    { type: 'today' },
    { type: 'priorities' },
    { type: 'goals' },
    { type: 'habits' },
    { type: 'upcoming' },
    { type: 'progress' },
  ]),
  T('health', 'Health', 'Fitness, sleep, food and habits next to your daily progress.', [
    { type: 'progress' },
    { type: 'score' },
    { type: 'fitness', w: 6 },
    { type: 'sleep', w: 6 },
    { type: 'nutrition' },
    { type: 'habits', w: 8 },
  ]),
]
const TEMPLATE_BY_KEY = Object.fromEntries(BUILTIN_TEMPLATES.map((t) => [t.key, t]))

/** The built-in templates as saved-template-shaped objects: { id, name, builtin, description, widgets: [{type,w,h,title,config}] }. */
export function builtinTemplate(key) {
  const t = TEMPLATE_BY_KEY[key]
  if (!t) return null
  const list = t.widgets ?? COMMAND_KEYS.map((type) => ({ type }))
  return {
    id: key,
    name: t.label,
    description: t.description,
    builtin: true,
    widgets: list.map((x) => ({ type: x.type, title: '', config: defaultConfig(x.type), w: x.w ?? BY_TYPE[x.type].w, h: x.h ?? BY_TYPE[x.type].h })),
  }
}
export const allBuiltinTemplates = () => BUILTIN_TEMPLATES.map((t) => builtinTemplate(t.key))

/** The widgets and layouts a template produces (new ids), ready to become a workspace or replace one. */
export function instantiateTemplate(tpl, { stretch = true } = {}) {
  const widgets = tpl.widgets.filter((x) => BY_TYPE[x.type]).map((x) => ({ ...makeWidget(x.type, { title: x.title, config: x.config }), size: { w: x.w, h: x.h } }))
  const lg = packRows(widgets.map((w) => ({ i: w.id, w: w.size.w, h: w.size.h })), 12, { stretch })
  return { widgets, layouts: { lg } }
}

/** Replace a workspace's widgets with a template's. Only the dashboard changes: no application data is touched. */
export function applyTemplate(state, workspaceId, tpl, now) {
  const { widgets, layouts } = instantiateTemplate(tpl)
  return mapWorkspace(state, workspaceId, (w) => touch(ensureLayouts({ ...w, widgets, layouts }), now))
}

/** A reusable template from a workspace's current widgets, sizes and settings (hidden widgets are left out). */
export function templateFromWorkspace(ws, name, { id, now } = {}) {
  const lg = ws.layouts.lg
  const widgets = readingOrder(lg)
    .map((it) => ({ it, w: ws.widgets.find((x) => x.id === it.i) }))
    .filter((x) => x.w)
    .map(({ it, w }) => ({ type: w.type, title: w.title, config: { ...w.config }, w: it.w, h: it.h }))
  return { id: id ?? newId('tpl'), name: cleanName(name, 'My template'), createdAt: now ?? new Date().toISOString(), widgets }
}

export function saveTemplate(state, tpl) {
  const existing = state.templates.filter((t) => t.id !== tpl.id)
  const name = uniqueName(existing.map((t) => t.name), tpl.name)
  return { ...state, templates: [...existing, { ...tpl, name }].slice(-MAX_TEMPLATES) }
}
export const deleteTemplate = (state, id) => ({ ...state, templates: state.templates.filter((t) => t.id !== id) })
