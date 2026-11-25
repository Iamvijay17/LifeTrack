import { describe, expect, it } from 'vitest'
import {
  NODE_H,
  NODE_W,
  autoLayout,
  bounds,
  buildMap,
  checkLink,
  filterMap,
  isNodeKey,
  mapStats,
  nodeKey,
  parseKey,
  wouldCycle,
} from '../src/lifeMap'

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const goal = (n, extra = {}) => ({
  id: U(n),
  title: `Goal ${n}`,
  category: 'Career',
  status: 'active',
  manual_progress: 0,
  target_minutes: 0,
  ...extra,
})
const habit = (n, extra = {}) => ({ id: U(n), name: `Habit ${n}`, color: '#8B5CF6', archived_at: null, description: '', ...extra })
const task = (n, extra = {}) => ({ id: U(n), title: `Task ${n}`, category: 'Learning', status: 'pending', due_date: null, ...extra })
const link = (from, to, n = 1) => ({ id: U(900 + n), from_key: from, to_key: to, label: '' })
const G = (n) => nodeKey('goal', U(n))
const H = (n) => nodeKey('habit', U(n))
const T = (n) => nodeKey('task', U(n))

describe('keys', () => {
  it('round-trips and rejects junk', () => {
    expect(parseKey(G(1))).toEqual({ kind: 'goal', id: U(1) })
    expect(isNodeKey(G(1))).toBe(true)
    for (const bad of ['', 'goal', 'goal:', 'robot:' + U(1), null, 5]) expect(isNodeKey(bad)).toBe(false)
  })
})

describe('buildMap', () => {
  it('shows goals, habits and milestones from the existing records, and skips archived ones', () => {
    const m = buildMap({
      goals: [goal(1), goal(2, { status: 'archived' }), goal(3, { status: 'completed' })],
      milestones: [
        { id: U(10), goal_id: U(1), title: 'Ship', done: false },
        { id: U(11), goal_id: U(2), title: 'Hidden', done: false },
      ],
      habits: [habit(20), habit(21, { archived_at: 'x' })],
    })
    expect(m.nodes.map((n) => n.key).sort()).toEqual([G(1), G(3), nodeKey('milestone', U(10)), H(20)].sort())
    expect(m.byKey.get(G(3)).status).toBe('done')
  })
  it('only draws tasks that are linked, unless asked for all', () => {
    const src = { goals: [goal(1)], tasks: [task(5), task(6)], links: [link(T(5), G(1))] }
    expect(
      buildMap(src)
        .nodes.map((n) => n.kind)
        .sort(),
    ).toEqual(['goal', 'task'])
    expect(buildMap(src, { tasks: 'all' }).nodes.filter((n) => n.kind === 'task')).toHaveLength(2)
    expect(buildMap(src, { tasks: 'none' }).nodes.filter((n) => n.kind === 'task')).toHaveLength(0)
  })
  it('adds the milestone → goal link the app already knows, and never a link to something missing', () => {
    const m = buildMap({
      goals: [goal(1)],
      milestones: [{ id: U(10), goal_id: U(1), title: 'Ship', done: true }],
      links: [link(H(99), G(1))], // the habit is gone
    })
    expect(m.edges).toHaveLength(1)
    expect(m.edges[0]).toMatchObject({ source: 'implicit', state: 'done' })
  })
  it('marks an edge done when what feeds it is done, pending otherwise', () => {
    const m = buildMap({
      goals: [goal(1)],
      tasks: [task(5, { status: 'done' }), task(6)],
      links: [link(T(5), G(1), 1), link(T(6), G(1), 2)],
    })
    expect(Object.fromEntries(m.edges.map((e) => [e.from, e.state]))).toEqual({ [T(5)]: 'done', [T(6)]: 'pending' })
    expect(m.byKey.get(G(1))).toMatchObject({ feeders: 2, feedersDone: 1, rollup: 0.5 })
  })
  it('a project has no progress of its own: it is what feeds it', () => {
    const m = buildMap({
      customNodes: [{ id: U(30), kind: 'project', title: 'Portfolio', category: 'Career', status: 'active' }],
      tasks: [task(5, { status: 'done' }), task(6)],
      links: [link(T(5), nodeKey('project', U(30))), link(T(6), nodeKey('project', U(30)), 2)],
    })
    const p = m.byKey.get(nodeKey('project', U(30)))
    expect(p.progress).toBe(0.5)
    expect(p.detail).toBe('1/2 done')
  })
  it('borrows a category from a neighbour so a category filter keeps chains whole', () => {
    const m = buildMap({ goals: [goal(1, { category: 'Fitness' })], habits: [habit(20)], links: [link(H(20), G(1))] })
    expect(m.byKey.get(H(20)).category).toBe('Fitness')
  })
  it('keeps saved positions and places the rest automatically', () => {
    const m = buildMap({ goals: [goal(1), goal(2)], positions: [{ node_key: G(1), x: 500, y: 300 }] })
    expect(m.byKey.get(G(1))).toMatchObject({ x: 500, y: 300, placed: true })
    expect(m.byKey.get(G(2)).placed).toBe(false)
  })
  it('counts habit progress and paused state from the stats rows', () => {
    const h = habit(20, { pauses: [{ start_date: '2026-11-01', end_date: null }] })
    const m = buildMap({ habits: [h], habitStats: [{ habit: h, rate30: 0.8, current: 4, unit: 'd', today: null }] })
    expect(m.byKey.get(H(20))).toMatchObject({ status: 'paused', progress: 0.8 })
  })
})

describe('autoLayout', () => {
  const n = (k, t = k) => ({ key: k, kind: 'task', title: t })
  it('puts what feeds a node to its left, in columns by longest chain', () => {
    const nodes = [n('task:a'), n('task:b'), n('task:c')]
    const pos = autoLayout(nodes, [
      { from: 'task:a', to: 'task:b' },
      { from: 'task:b', to: 'task:c' },
      { from: 'task:a', to: 'task:c' },
    ])
    expect(pos.get('task:a').x).toBeLessThan(pos.get('task:b').x)
    expect(pos.get('task:b').x).toBeLessThan(pos.get('task:c').x)
  })
  it('survives a cycle and never overlaps two nodes', () => {
    const nodes = [n('task:a'), n('task:b'), n('task:c'), n('task:d')]
    const pos = autoLayout(nodes, [
      { from: 'task:a', to: 'task:b' },
      { from: 'task:b', to: 'task:a' },
    ])
    const cells = [...pos.values()].map((p) => `${p.x},${p.y}`)
    expect(new Set(cells).size).toBe(4)
    for (const p of pos.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })
  it('puts unlinked nodes in a block below the linked ones', () => {
    const pos = autoLayout([n('task:a'), n('task:b'), n('task:z')], [{ from: 'task:a', to: 'task:b' }])
    expect(pos.get('task:z').y).toBeGreaterThan(pos.get('task:a').y + NODE_H)
  })
  it('handles an empty map', () => expect(autoLayout([], []).size).toBe(0))
})

describe('filterMap', () => {
  const map = buildMap({
    goals: [goal(1, { category: 'Career' }), goal(2, { category: 'Fitness' }), goal(3, { category: 'Career', status: 'completed' })],
    habits: [habit(20)],
    links: [link(H(20), G(2))],
  })
  it('removes by kind, category and done, but only dims by search', () => {
    expect(filterMap(map, { kinds: new Set(['goal']) }).visible.has(H(20))).toBe(false)
    expect([...filterMap(map, { category: 'Career' }).visible].sort()).toEqual([G(1), G(3)].sort())
    expect(filterMap(map, { hideDone: true }).visible.has(G(3))).toBe(false)
    const f = filterMap(map, { query: 'goal 2' })
    expect(f.visible.size).toBe(map.nodes.length)
    expect([...f.matches]).toEqual([G(2)])
    expect(f.dim(G(1))).toBe(true)
    expect(f.dim(G(2))).toBe(false)
  })
  it('hides edges whose ends are hidden, and focus keeps one hop', () => {
    expect(filterMap(map, { kinds: new Set(['goal']) }).edges).toHaveLength(0)
    const f = filterMap(map, { focus: G(2) })
    expect([...f.visible].sort()).toEqual([G(2), H(20)].sort())
    expect(f.edges).toHaveLength(1)
  })
})

describe('links', () => {
  const map = buildMap({
    goals: [goal(1), goal(2)],
    habits: [habit(20)],
    tasks: [task(5)],
    links: [link(H(20), G(1)), link(T(5), H(20), 2)],
  })
  it('detects loops', () => {
    expect(wouldCycle(map, G(1), H(20))).toBe(true)
    expect(wouldCycle(map, G(1), T(5))).toBe(true)
    expect(wouldCycle(map, H(20), G(2))).toBe(false)
  })
  it('explains why a link is refused', () => {
    expect(checkLink(map, H(20), G(2))).toBeNull()
    expect(checkLink(map, H(20), H(20))).toMatch(/itself/)
    expect(checkLink(map, H(20), G(1))).toMatch(/already connected/)
    expect(checkLink(map, G(1), H(20))).toMatch(/other way/)
    expect(checkLink(map, G(1), T(5))).toMatch(/loop/)
    expect(checkLink(map, G(1), 'bad')).toMatch(/Pick two/)
    expect(checkLink(map, G(1), G(77))).toMatch(/no longer/)
  })
  it('summarises and bounds', () => {
    expect(mapStats(map)).toMatchObject({ nodes: 4, links: 2, unlinked: 1 })
    const b = bounds(map.nodes)
    expect(b.w).toBeGreaterThanOrEqual(NODE_W)
    expect(bounds([])).toEqual({ x: 0, y: 0, w: NODE_W, h: NODE_H })
  })
})
