import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TEMPLATES, GRID, WIDGET_CATALOG, addWidget, allBuiltinTemplates, applyTemplate, builtinTemplate, canAdd, createWorkspace, deleteWorkspace,
  duplicateWidget, duplicateWorkspace, ensureLayouts, instantiateTemplate, makeWorkspace, moveInColumn, moveWidgetToWorkspace, moveBlocker, normalizeState,
  packRows, readState, removeWidget, renameWorkspace, resetWidget, resizeWidget, revOf, saveTemplate, setDefault, setHidden, setLayout, sizeKeyOf,
  stateFromLegacy, templateFromWorkspace, updateWidget, writeState, cleanConfig, limitsFor,
} from '../src/dashboardBuilder'
import { COMMAND_KEYS } from '../src/commandCenter'

const overlaps = (items) => items.some((a, n) => items.some((b, m) => n < m && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h))
const inside = (items, cols) => items.every((it) => it.x >= 0 && it.x + it.w <= cols)
const ws0 = () => makeWorkspace({ id: 'ws1', name: 'A', now: '2026-01-01T00:00:00Z' })

describe('catalog', () => {
  it('lists every existing dashboard widget once, with sane limits', () => {
    const types = WIDGET_CATALOG.map((w) => w.type)
    expect(new Set(types).size).toBe(types.length)
    for (const k of COMMAND_KEYS) expect(types).toContain(k)
    for (const d of WIDGET_CATALOG) {
      expect(d.label).toBeTruthy()
      expect(d.minW).toBeLessThanOrEqual(d.w)
      expect(d.w).toBeLessThanOrEqual(d.maxW)
      expect(d.minH).toBeLessThanOrEqual(d.h)
      expect(d.h).toBeLessThanOrEqual(d.maxH)
    }
  })
  it('clamps settings to what the widget declares', () => {
    expect(cleanConfig('notes', { count: 99 })).toEqual({ count: 8 })
    expect(cleanConfig('notes', { count: 'x' })).toEqual({ count: 4 })
    expect(cleanConfig('score', { evil: 1 })).toEqual({})
  })
})

describe('packing', () => {
  it('flows into rows without overlap, and stretches a short last row on request', () => {
    const items = [{ i: 'a', w: 8, h: 5 }, { i: 'b', w: 4, h: 3 }, { i: 'c', w: 6, h: 4 }]
    const out = packRows(items)
    expect(out).toEqual([{ i: 'a', x: 0, y: 0, w: 8, h: 5 }, { i: 'b', x: 8, y: 0, w: 4, h: 3 }, { i: 'c', x: 0, y: 5, w: 6, h: 4 }])
    expect(packRows(items, 12, { stretch: true })[2].w).toBe(12)
  })
})

describe('widgets', () => {
  it('adds at the bottom of every grid and refuses a second single-instance widget', () => {
    let ws = addWidget(ws0(), 'score', { id: 'a' })
    ws = addWidget(ws, 'habits', { id: 'b' })
    expect(ws.layouts.lg.map((i) => i.i)).toEqual(['a', 'b'])
    expect(ws.layouts.lg[1].y).toBeGreaterThanOrEqual(ws.layouts.lg[0].y + ws.layouts.lg[0].h - 0)
    expect(canAdd(ws, 'score')).toBe(false)
    expect(addWidget(ws, 'score', { id: 'c' })).toBe(ws)
    expect(ws.layouts.sm.every((i) => i.w === 1 && i.x === 0)).toBe(true)
    expect(overlaps(ws.layouts.lg)).toBe(false)
  })
  it('allows several of a multi widget, up to five, and duplicates it with its settings', () => {
    let ws = addWidget(ws0(), 'notes', { id: 'n1', config: { count: 6 } })
    ws = duplicateWidget(ws, 'n1', { newWidgetId: 'n2' })
    expect(ws.widgets.map((w) => w.id)).toEqual(['n1', 'n2'])
    expect(ws.widgets[1].config).toEqual({ count: 6 })
    expect(duplicateWidget(addWidget(ws0(), 'score', { id: 's' }), 's')).toEqual(expect.objectContaining({ widgets: expect.any(Array) }))
    expect(duplicateWidget(addWidget(ws0(), 'score', { id: 's' }), 's').widgets).toHaveLength(1)
  })
  it('removes a widget from every layout and leaves the rest', () => {
    let ws = addWidget(addWidget(ws0(), 'score', { id: 'a' }), 'habits', { id: 'b' })
    ws = removeWidget(ws, 'a')
    expect(ws.widgets.map((w) => w.id)).toEqual(['b'])
    for (const bp of ['lg', 'md', 'sm']) expect(ws.layouts[bp].map((i) => i.i)).toEqual(['b'])
  })
  it('hides a widget keeping its size and settings, and shows it again', () => {
    let ws = addWidget(ws0(), 'notes', { id: 'n', config: { count: 7 } })
    ws = setLayout(ws, 'lg', [{ i: 'n', x: 0, y: 0, w: 6, h: 8 }])
    ws = setHidden(ws, 'n', true)
    expect(ws.layouts.lg).toEqual([])
    ws = setHidden(ws, 'n', false)
    expect(ws.layouts.lg[0]).toMatchObject({ w: 6, h: 8 })
    expect(ws.widgets[0].config).toEqual({ count: 7 })
  })
  it('keeps sizes inside the widget limits', () => {
    let ws = addWidget(ws0(), 'budget', { id: 'b' })
    ws = setLayout(ws, 'lg', [{ i: 'b', x: 11, y: 0, w: 1, h: 1 }])
    const it = ws.layouts.lg[0]
    expect(it.w).toBeGreaterThanOrEqual(limitsFor('budget', 12).minW)
    expect(it.h).toBeGreaterThanOrEqual(limitsFor('budget', 12).minH)
    expect(it.x + it.w).toBeLessThanOrEqual(12)
  })
  it('resizes to a named width, tells which one it is, and resets to default', () => {
    let ws = addWidget(ws0(), 'habits', { id: 'h' })
    ws = resizeWidget(ws, 'h', 'full')
    expect(sizeKeyOf(ws, 'h')).toBe('full')
    expect(ws.layouts.md[0].w).toBe(6)
    ws = updateWidget(ws, 'h', { title: '  Daily   habits ' })
    expect(ws.widgets[0].title).toBe('Daily habits')
    ws = resetWidget(ws, 'h')
    expect(ws.widgets[0].title).toBe('')
    expect(ws.layouts.lg[0].w).toBe(6)
  })
  it('reorders the phone column', () => {
    let ws = addWidget(addWidget(ws0(), 'score', { id: 'a' }), 'habits', { id: 'b' })
    ws = moveInColumn(ws, 'b', -1)
    expect(ws.layouts.sm.sort((x, y) => x.y - y.y).map((i) => i.i)).toEqual(['b', 'a'])
    expect(moveInColumn(ws, 'b', -1)).toBe(ws)
  })
  it('keeps the desktop layout when the phone one changes', () => {
    let ws = addWidget(addWidget(ws0(), 'score', { id: 'a' }), 'habits', { id: 'b' })
    const lg = ws.layouts.lg
    ws = moveInColumn(ws, 'b', -1)
    expect(ws.layouts.lg).toEqual(lg)
  })
})

describe('repairing a layout', () => {
  it('removes overlaps, out-of-range items, unknown ids and duplicates', () => {
    let ws = addWidget(addWidget(ws0(), 'score', { id: 'a' }), 'habits', { id: 'b' })
    ws = ensureLayouts({
      ...ws,
      layouts: { lg: [{ i: 'a', x: 0, y: 0, w: 4, h: 7 }, { i: 'b', x: 2, y: 1, w: 20, h: 6 }, { i: 'zzz', x: 0, y: 0, w: 1, h: 1 }, { i: 'a', x: 5, y: 5, w: 4, h: 5 }] },
    })
    expect(ws.layouts.lg).toHaveLength(2)
    expect(overlaps(ws.layouts.lg)).toBe(false)
    expect(inside(ws.layouts.lg, 12)).toBe(true)
  })
})

describe('workspaces', () => {
  const base = () => stateFromLegacy({}, { id: 'ws_main' })
  it('starts from the old layout: order, hidden widgets and widths', () => {
    const s = stateFromLegacy({ order: ['goals', 'today'], goals: true, nutrition: false, sizes: { goals: 'full' } }, { id: 'w' })
    const ws = s.workspaces[0]
    expect(ws.name).toBe('My Daily Life')
    expect(ws.widgets.map((x) => x.type)).not.toContain('nutrition')
    expect(ws.widgets[0].type).toBe('goals')
    expect(sizeKeyOf(ws, 'w_goals')).toBe('full')
    expect(s.defaultId).toBe('w')
    expect(overlaps(ws.layouts.lg)).toBe(false)
  })
  it('creates, renames (unique names), duplicates with new ids, and sets a default', () => {
    let { state, id } = createWorkspace(base(), 'Fitness', { id: 'ws_f' })
    expect(id).toBe('ws_f')
    state = renameWorkspace(state, 'ws_f', 'my daily life')
    expect(state.workspaces[1].name).toBe('my daily life 2')
    state = renameWorkspace(state, 'ws_f', '   ')
    expect(state.workspaces[1].name).toBe('my daily life 2')
    const copy = duplicateWorkspace(state, 'ws_main', { newWorkspaceId: 'ws_c' })
    const orig = copy.state.workspaces[0]
    const dup = copy.state.workspaces.find((w) => w.id === 'ws_c')
    expect(dup.widgets).toHaveLength(orig.widgets.length)
    expect(dup.widgets.every((w) => !orig.widgets.some((o) => o.id === w.id))).toBe(true)
    expect(dup.layouts.lg.every((it) => dup.widgets.some((w) => w.id === it.i))).toBe(true)
    expect(setDefault(copy.state, 'ws_c').defaultId).toBe('ws_c')
    expect(setDefault(copy.state, 'nope').defaultId).toBe('ws_main')
  })
  it('never deletes the last workspace, and passes the default on when it is deleted', () => {
    const one = base()
    expect(deleteWorkspace(one, 'ws_main')).toBe(one)
    const { state } = createWorkspace(one, 'B', { id: 'b' })
    const after = deleteWorkspace(state, 'ws_main')
    expect(after.workspaces.map((w) => w.id)).toEqual(['b'])
    expect(after.defaultId).toBe('b')
  })
  it('moves a widget between workspaces, refusing a duplicate single-instance widget', () => {
    let { state } = createWorkspace(base(), 'B', { id: 'b' })
    expect(moveBlocker(state, 'ws_main', 'w_score', 'b')).toBeNull()
    state = moveWidgetToWorkspace(state, 'ws_main', 'w_score', 'b')
    expect(state.workspaces[0].widgets.some((w) => w.id === 'w_score')).toBe(false)
    expect(state.workspaces[1].widgets.map((w) => w.id)).toEqual(['w_score'])
    expect(moveBlocker(state, 'b', 'w_score', 'ws_main')).toBeNull()
    state = { ...state, workspaces: state.workspaces.map((w) => (w.id === 'ws_main' ? addWidget(w, 'score', { id: 'dup' }) : w)) }
    expect(moveBlocker(state, 'b', 'w_score', 'ws_main')).toMatch(/already has/)
    expect(moveWidgetToWorkspace(state, 'b', 'w_score', 'ws_main')).toBe(state)
  })
  it('keeps workspaces independent', () => {
    let { state } = createWorkspace(base(), 'B', { id: 'b' })
    state = { ...state, workspaces: state.workspaces.map((w) => (w.id === 'b' ? addWidget(w, 'goals', { id: 'g' }) : w)) }
    expect(state.workspaces[0].widgets.some((w) => w.type === 'goals' && w.id === 'g')).toBe(false)
  })
})

describe('persistence format', () => {
  it('round-trips and bumps the revision', () => {
    const s = readState({}, { id: 'w' })
    const saved = writeState({}, s)
    expect(revOf(saved)).toBe(1)
    const back = readState(saved)
    expect(back.workspaces[0].widgets).toEqual(s.workspaces[0].widgets)
    expect(back.workspaces[0].layouts.lg).toEqual(s.workspaces[0].layouts.lg)
    expect(back.rev).toBe(1)
  })
  it('keeps the old keys in step with the default workspace and keeps keys it does not know', () => {
    let s = readState({ somethingElse: 1 }, { id: 'w' })
    s = { ...s, workspaces: [removeWidget(s.workspaces[0], 'w_nutrition')] }
    const out = writeState({ somethingElse: 1 }, s)
    expect(out.nutrition).toBe(false)
    expect(out.today).toBe(true)
    expect(out.somethingElse).toBe(1)
    expect(out.order[0]).toBeTruthy()
    expect(new Set(out.order)).toEqual(new Set(COMMAND_KEYS))
  })
  it('survives corrupt stored data', () => {
    expect(normalizeState(null)).toBeNull()
    expect(normalizeState({ workspaces: 'x' })).toBeNull()
    const s = normalizeState({
      rev: -3,
      defaultId: 'missing',
      workspaces: [
        { id: 'a', name: 5, widgets: [{ id: 'x', type: 'nope' }, { id: 'y', type: 'score' }, { id: 'y', type: 'score' }, { id: 'z', type: 'score' }], layouts: { lg: 'bad' } },
        { id: 'a', name: 'dup' },
      ],
    })
    expect(s.workspaces).toHaveLength(1)
    expect(s.workspaces[0].widgets.map((w) => w.id)).toEqual(['y'])
    expect(s.defaultId).toBe('a')
    expect(s.rev).toBe(0)
    expect(readState({ ws: 'garbage', order: ['goals'] }).workspaces[0].widgets[0].type).toBe('goals')
  })
})

describe('templates', () => {
  it('every built-in template uses real widgets and packs without overlap', () => {
    for (const t of allBuiltinTemplates()) {
      const { widgets, layouts } = instantiateTemplate(t)
      expect(widgets.length).toBeGreaterThan(0)
      expect(widgets.every((w) => WIDGET_CATALOG.some((d) => d.type === w.type))).toBe(true)
      expect(overlaps(layouts.lg)).toBe(false)
      expect(inside(layouts.lg, GRID.cols.lg)).toBe(true)
    }
    expect(BUILTIN_TEMPLATES.map((t) => t.key)).toEqual(expect.arrayContaining(['minimal', 'productivity', 'career', 'fitness', 'finance']))
  })
  it('applies to a workspace, replacing its widgets, and saves a workspace as a template', () => {
    let s = readState({}, { id: 'w' })
    s = applyTemplate(s, 'w', builtinTemplate('minimal'))
    expect(s.workspaces[0].widgets.map((x) => x.type)).toEqual(['priorities', 'calendar', 'progress'])
    expect(s.workspaces[0].layouts.sm).toHaveLength(3)
    const tpl = templateFromWorkspace(resizeWidget(s.workspaces[0], s.workspaces[0].widgets[0].id, 'lg'), '  Mine ', { id: 't1' })
    expect(tpl.widgets[0]).toMatchObject({ type: 'priorities', w: 8 })
    const withT = saveTemplate(saveTemplate(s, tpl), { ...tpl, id: 't2' })
    expect(withT.templates.map((t) => t.name)).toEqual(['Mine', 'Mine 2'])
    expect(normalizeState({ ...withT }).templates).toHaveLength(2)
    const again = applyTemplate(s, 'w', withT.templates[0])
    expect(again.workspaces[0].widgets[0].type).toBe('priorities')
  })
})

describe('derived layouts', () => {
  it('are settled like the grid settles them, so no gap is left under a short widget', () => {
    let ws = ws0()
    for (const t of ['score', 'habits', 'goals', 'upcoming', 'learning']) ws = addWidget(ws, t, { id: t })
    ws = ensureLayouts({ ...ws, layouts: { lg: ws.layouts.lg } })
    for (const bp of ['md', 'sm']) {
      const items = ws.layouts[bp]
      expect(overlaps(items)).toBe(false)
      // nothing can move up: every item is either at the top or resting on another
      for (const it of items) {
        const free = it.y > 0 && !items.some((o) => o !== it && it.x < o.x + o.w && o.x < it.x + it.w && o.y + o.h === it.y)
        expect(free).toBe(false)
      }
    }
  })
})
