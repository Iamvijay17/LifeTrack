// Life Map: how daily activity connects to long-term goals. Pure functions (no React, no Supabase, nothing written).
//
// Nothing here is duplicated data. Goals, milestones, tasks and habits are the records the rest of LifeTrack already keeps; the map only adds
//  - "custom" nodes (a project, an area of life) that have no other home,
//  - links between any two nodes ("A contributes to B"), and
//  - where each node was left on the canvas.
// A node is named by a key `kind:id`, so a link or position can point at any record without a foreign key. The database removes them when the
// record is deleted (migration 0020), and `buildMap` ignores any that are left over, so the screen can never show a link to nothing.
//
// Direction: a link reads "from contributes to to" (a habit feeds a goal, a task feeds a milestone, a milestone feeds its goal). Progress
// flows the same way: an outcome shows how much of what feeds it is done.
import { goalPercent } from './goals'

export const NODE_W = 184
export const NODE_H = 56
export const KINDS = ['goal', 'milestone', 'project', 'area', 'habit', 'task']
export const KIND_LABEL = { goal: 'Goal', milestone: 'Milestone', project: 'Project', area: 'Area', habit: 'Habit', task: 'Task' }
export const CUSTOM_KINDS = ['project', 'area']
export const CATEGORIES = ['Learning', 'Career', 'Fitness', 'Health', 'Finance', 'Personal']

const TASK_CATEGORY = {
  Learning: 'Learning',
  'Job Search': 'Career',
  Gym: 'Fitness',
  Health: 'Health',
  Personal: 'Personal',
  Finance: 'Finance',
}
const KEY_RE = /^(goal|habit|task|milestone|project|area):[0-9a-fA-F-]{8,40}$/

export const nodeKey = (kind, id) => `${kind}:${id}`
export const isNodeKey = (k) => typeof k === 'string' && KEY_RE.test(k)
export const parseKey = (k) => {
  const i = k.indexOf(':')
  return { kind: k.slice(0, i), id: k.slice(i + 1) }
}
const normCategory = (c) => (CATEGORIES.includes(c) ? c : null)
const clamp01 = (n) => Math.min(1, Math.max(0, n))

/**
 * The whole map for the data at hand.
 * @param {object} src goals, milestones, tasks, habits, habitStats (buildHabitStats rows, optional), customNodes, links, positions, sessions
 * @param {{ today: string, tasks?: 'linked'|'all'|'none' }} opts  `tasks`: which tasks get a node. By default only tasks you linked to something,
 *   because a list of two hundred unconnected to-dos would bury the map.
 * @returns {{ nodes: object[], edges: object[], byKey: Map }}
 */
export function buildMap(src, opts = {}) {
  const {
    goals = [],
    milestones = [],
    tasks = [],
    habits = [],
    habitStats = [],
    customNodes = [],
    links = [],
    positions = [],
    sessions = [],
  } = src
  const taskMode = opts.tasks ?? 'linked'
  const stat = new Map(habitStats.map((s) => [s.habit.id, s]))
  const linked = new Set()
  for (const l of links) {
    linked.add(l.from_key)
    linked.add(l.to_key)
  }
  const nodes = []
  const add = (n) => nodes.push({ category: null, notes: '', due: null, ...n })

  for (const g of goals) {
    if (g.status === 'archived') continue
    const p = goalPercent(g, milestones, sessions)
    add({
      key: nodeKey('goal', g.id),
      kind: 'goal',
      id: g.id,
      title: g.title,
      category: normCategory(g.category),
      due: g.due_date ?? null,
      status: g.status === 'completed' ? 'done' : 'active',
      progress: clamp01(p.percent / 100),
      detail: g.status === 'completed' ? 'Completed' : `${p.percent}%`,
      notes: g.notes ?? '',
      href: '/goals',
    })
  }
  const goalById = new Map(goals.map((g) => [g.id, g]))
  for (const m of milestones) {
    const g = goalById.get(m.goal_id)
    if (!g || g.status === 'archived') continue
    add({
      key: nodeKey('milestone', m.id),
      kind: 'milestone',
      id: m.id,
      title: m.title,
      category: normCategory(g.category),
      due: m.due_date ?? null,
      status: m.done ? 'done' : 'active',
      progress: m.done ? 1 : 0,
      detail: m.done ? 'Done' : 'Open',
      href: '/goals',
    })
  }
  for (const h of habits) {
    if (h.archived_at) continue
    const s = stat.get(h.id)
    const paused = (h.pauses ?? []).some((p) => p.end_date == null)
    const doneToday = !!s?.today && s.today.status === 'done'
    add({
      key: nodeKey('habit', h.id),
      kind: 'habit',
      id: h.id,
      title: h.name,
      color: h.color,
      status: paused ? 'paused' : doneToday ? 'done' : 'active',
      progress: clamp01(s?.rate30 ?? 0),
      detail: paused ? 'Paused' : s ? `${s.current}${s.unit} streak` : 'Habit',
      notes: h.description ?? '',
      href: '/habits',
    })
  }
  for (const t of tasks) {
    if (t.status === 'cancelled' || t.status === 'skipped') continue
    const key = nodeKey('task', t.id)
    if (taskMode === 'none' || (taskMode === 'linked' && !linked.has(key))) continue
    add({
      key,
      kind: 'task',
      id: t.id,
      title: t.title,
      category: TASK_CATEGORY[t.category] ?? null,
      due: t.due_date ?? null,
      status: t.status === 'done' ? 'done' : 'active',
      progress: t.status === 'done' ? 1 : 0,
      detail: t.status === 'done' ? 'Done' : t.due_date ? `Due ${t.due_date}` : 'Open',
      notes: t.notes ?? '',
      href: '/planner',
    })
  }
  for (const c of customNodes) {
    add({
      key: nodeKey(c.kind, c.id),
      kind: c.kind,
      id: c.id,
      title: c.title,
      category: normCategory(c.category),
      color: c.color ?? null,
      status: c.status === 'done' ? 'done' : 'active',
      progress: c.status === 'done' ? 1 : 0,
      detail: c.status === 'done' ? 'Done' : KIND_LABEL[c.kind],
      notes: c.notes ?? '',
      own: true,
    })
  }

  const byKey = new Map(nodes.map((n) => [n.key, n]))

  // Edges: the ones the person drew, plus the one the app already knows (a milestone belongs to its goal).
  const edges = []
  const seen = new Set()
  const addEdge = (from, to, extra) => {
    const id = `${from}>${to}`
    if (from === to || seen.has(id) || !byKey.has(from) || !byKey.has(to)) return // a link to something that is gone, or hidden, is not drawn
    seen.add(id)
    edges.push({ key: id, from, to, ...extra })
  }
  for (const l of links) addEdge(l.from_key, l.to_key, { source: 'explicit', id: l.id, label: l.label ?? '' })
  for (const m of milestones) addEdge(nodeKey('milestone', m.id), nodeKey('goal', m.goal_id), { source: 'implicit', id: null, label: '' })
  for (const e of edges) e.state = byKey.get(e.from).status === 'done' ? 'done' : 'pending'

  // What feeds each node, and a rollup of how much of it is done.
  const into = new Map()
  const out = new Map()
  for (const e of edges) {
    ;(into.get(e.to) ?? into.set(e.to, []).get(e.to)).push(e.from)
    ;(out.get(e.from) ?? out.set(e.from, []).get(e.from)).push(e.to)
  }
  for (const n of nodes) {
    const feeders = (into.get(n.key) ?? []).map((k) => byKey.get(k))
    n.feeders = feeders.length
    n.feedersDone = feeders.filter((f) => f.status === 'done').length
    n.rollup = feeders.length ? feeders.reduce((a, f) => a + f.progress, 0) / feeders.length : null
    // A project or area has no progress of its own: it is whatever feeds it.
    if (n.own && n.rollup != null && n.status !== 'done') {
      n.progress = n.rollup
      n.detail = `${n.feedersDone}/${n.feeders} done`
    }
  }
  // A node with no category borrows one from what it leads to (else what feeds it), so a category filter keeps whole chains together.
  for (const n of nodes) {
    if (n.category) continue
    const near = [...(out.get(n.key) ?? []), ...(into.get(n.key) ?? [])].map((k) => byKey.get(k)?.category).find(Boolean)
    if (near) n.category = near
  }
  const saved = new Map(positions.map((p) => [p.node_key, p]))
  const auto = autoLayout(nodes, edges)
  for (const n of nodes) {
    const p = saved.get(n.key)
    n.placed = !!p
    n.x = p ? p.x : auto.get(n.key).x
    n.y = p ? p.y : auto.get(n.key).y
  }
  return { nodes, edges, byKey, into, out }
}

/**
 * Left-to-right flow layout: what feeds a node sits to its left. Columns are the longest chain of feeders; inside a column nodes are ordered
 * by the average height of what they connect to, which keeps most lines from crossing. Nodes with no links at all go in a block underneath,
 * grouped by kind. Returns Map<key, {x, y}> (top-left corners).
 */
export function autoLayout(nodes, edges, { gapX = 90, gapY = 26 } = {}) {
  const keys = new Set(nodes.map((n) => n.key))
  const into = new Map()
  const out = new Map()
  for (const e of edges) {
    if (!keys.has(e.from) || !keys.has(e.to)) continue
    ;(into.get(e.to) ?? into.set(e.to, []).get(e.to)).push(e.from)
    ;(out.get(e.from) ?? out.set(e.from, []).get(e.from)).push(e.to)
  }
  const connected = nodes.filter((n) => into.has(n.key) || out.has(n.key))
  // Layer = longest path from a source. A visiting set breaks cycles (the link that closes one is ignored for layering).
  const layer = new Map()
  const visiting = new Set()
  const depth = (k) => {
    if (layer.has(k)) return layer.get(k)
    if (visiting.has(k)) return 0
    visiting.add(k)
    let d = 0
    for (const f of into.get(k) ?? []) d = Math.max(d, depth(f) + 1)
    visiting.delete(k)
    layer.set(k, d)
    return d
  }
  for (const n of connected) depth(n.key)
  const cols = new Map()
  for (const n of connected) (cols.get(layer.get(n.key)) ?? cols.set(layer.get(n.key), []).get(layer.get(n.key))).push(n)
  const pos = new Map()
  const stepY = NODE_H + gapY
  const stepX = NODE_W + gapX
  let height = 0
  for (const c of [...cols.keys()].sort((a, b) => a - b)) {
    const list = cols.get(c)
    const rank = (n) => {
      const near = (into.get(n.key) ?? []).map((k) => pos.get(k)?.y).filter((y) => y != null)
      return near.length ? near.reduce((a, b) => a + b, 0) / near.length : Infinity
    }
    list.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
    list.forEach((n, i) => pos.set(n.key, { x: c * stepX, y: i * stepY }))
    height = Math.max(height, list.length * stepY)
  }
  // Unlinked nodes: a tidy grid below, a row per kind.
  let row = 0
  const top = connected.length ? height + 40 : 0
  for (const kind of KINDS) {
    const list = nodes.filter((n) => !connected.includes(n) && n.kind === kind).sort((a, b) => a.title.localeCompare(b.title))
    if (!list.length) continue
    list.forEach((n, i) => pos.set(n.key, { x: (i % 6) * stepX, y: top + (row + Math.floor(i / 6)) * stepY }))
    row += Math.ceil(list.length / 6)
  }
  return pos
}

/**
 * Which nodes are shown, which are only dimmed, and which edges are drawn.
 * filters: { kinds: Set|null (null = all), category: string|'' , hideDone: boolean, query: string, focus: key|null }
 * - kinds, category and hideDone REMOVE nodes (the map gets quieter);
 * - query only DIMS the ones that do not match (the map keeps its shape, matches stand out);
 * - focus keeps the chosen node and everything one link away, and dims nothing else in: it hides the rest.
 */
export function filterMap(map, { kinds = null, category = '', hideDone = false, query = '', focus = null } = {}) {
  const q = query.trim().toLowerCase()
  const visible = new Set()
  for (const n of map.nodes) {
    if (kinds && !kinds.has(n.kind)) continue
    if (category && n.category !== category) continue
    if (hideDone && n.status === 'done') continue
    visible.add(n.key)
  }
  if (focus && map.byKey.has(focus)) {
    const near = new Set([focus, ...(map.into.get(focus) ?? []), ...(map.out.get(focus) ?? [])])
    for (const k of [...visible]) if (!near.has(k)) visible.delete(k)
  }
  const matches = new Set()
  if (q)
    for (const n of map.nodes)
      if (visible.has(n.key) && (n.title.toLowerCase().includes(q) || (n.category ?? '').toLowerCase().includes(q))) matches.add(n.key)
  const edges = map.edges.filter((e) => visible.has(e.from) && visible.has(e.to))
  return { visible, matches, query: q, edges, dim: (k) => !!q && !matches.has(k) }
}

/** Headline numbers for the map's toolbar. */
export function mapStats(map) {
  const done = map.nodes.filter((n) => n.status === 'done').length
  const connected = new Set()
  for (const e of map.edges) {
    connected.add(e.from)
    connected.add(e.to)
  }
  return {
    nodes: map.nodes.length,
    links: map.edges.length,
    done,
    pendingLinks: map.edges.filter((e) => e.state === 'pending').length,
    unlinked: map.nodes.length - connected.size,
  }
}

/** Would linking from → to close a loop (to already leads back to from)? A loop has no "outcome", so the map refuses it. */
export function wouldCycle(map, from, to) {
  if (from === to) return true
  const seen = new Set()
  const stack = [to]
  while (stack.length) {
    const k = stack.pop()
    if (k === from) return true
    if (seen.has(k)) continue
    seen.add(k)
    for (const next of map.out.get(k) ?? []) stack.push(next)
  }
  return false
}

/** The bounding box of some nodes, for "fit to screen". */
export function bounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, w: NODE_W, h: NODE_H }
  const x0 = Math.min(...nodes.map((n) => n.x))
  const y0 = Math.min(...nodes.map((n) => n.y))
  const x1 = Math.max(...nodes.map((n) => n.x + NODE_W))
  const y1 = Math.max(...nodes.map((n) => n.y + NODE_H))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Validate a link a person asked for. Returns an error message or null. */
export function checkLink(map, from, to) {
  if (!isNodeKey(from) || !isNodeKey(to)) return 'Pick two items on the map.'
  if (from === to) return 'An item cannot feed itself.'
  if (!map.byKey.has(from) || !map.byKey.has(to)) return 'One of those items is no longer on the map.'
  if (map.edges.some((e) => e.from === from && e.to === to)) return 'Those two are already connected.'
  if (map.edges.some((e) => e.from === to && e.to === from)) return 'They are already connected the other way. Reverse that link instead.'
  if (wouldCycle(map, from, to)) return 'That would make a loop: the second item already leads back to the first.'
  return null
}
