import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ linkNodes: vi.fn(), reverseLink: vi.fn(), peek: vi.fn(() => []), update: vi.fn(), remove: vi.fn() }))
vi.mock('@/services/api', () => ({ linkNodes: mocks.linkNodes, reverseLink: mocks.reverseLink }))
vi.mock('@/hooks/store', () => ({ peek: mocks.peek, update: mocks.update, remove: mocks.remove, insert: vi.fn() }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { buildMap, filterMap, nodeKey } from '@/domain/lifeMap'
import { MapCanvas } from '@/features/lifemap/MapCanvas'
import { Inspector } from '@/features/lifemap/Inspector'
import { MapToolbar } from '@/features/lifemap/MapToolbar'
import { pickOption } from './pickers'

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const goal = { id: U(1), title: 'Learn React', category: 'Career', status: 'active', manual_progress: 40, target_minutes: 0 }
const habit = { id: U(2), name: 'Study daily', color: '#8B5CF6', archived_at: null }
const task = { id: U(3), title: 'Finish module', category: 'Learning', status: 'done', due_date: null }
const GK = nodeKey('goal', U(1))
const HK = nodeKey('habit', U(2))
const TK = nodeKey('task', U(3))
const links = [
  { id: U(90), from_key: TK, to_key: HK, label: '' },
  { id: U(91), from_key: HK, to_key: GK, label: 'daily' },
]
const build = () => buildMap({ goals: [goal], habits: [habit], tasks: [task], links, habitStats: [] }, { today: '2026-11-16' })

const view = { k: 1, x: 20, y: 20 }
function canvas(over = {}) {
  const map = over.map ?? build()
  const vis = over.vis ?? filterMap(map, {})
  const props = {
    map,
    vis,
    selected: null,
    onSelect: vi.fn(),
    onMove: vi.fn(),
    onLink: vi.fn(),
    view,
    setView: vi.fn(),
    zoomAt: vi.fn(),
    onSize: vi.fn(),
    hint: true,
    ...over,
  }
  return { ...render(<MapCanvas {...props} />), props, map }
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.peek.mockReturnValue([])
  mocks.linkNodes.mockResolvedValue({})
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  }
})

describe('MapCanvas', () => {
  it('draws every item as a labelled, keyboard-focusable control with its state in words', () => {
    canvas()
    const g = screen.getByRole('button', { name: /^Goal: Learn React\. 40%\. Career/ })
    expect(g).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('button', { name: /^Task: Finish module\. Done\. Learning\. Complete/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Habit: Study daily/ })).toBeInTheDocument()
  })

  it('Enter selects an item and Escape clears the selection', () => {
    const { props } = canvas()
    const node = screen.getByRole('button', { name: /^Goal: Learn React/ })
    fireEvent.keyDown(node, { key: 'Enter' })
    expect(props.onSelect).toHaveBeenCalledWith({ type: 'node', key: GK })
    fireEvent.keyDown(node, { key: 'Escape' })
    expect(props.onSelect).toHaveBeenLastCalledWith(null)
  })

  it('arrow keys nudge an item and save the new position once, after a pause', () => {
    vi.useFakeTimers()
    const { props, map } = canvas()
    const node = screen.getByRole('button', { name: /^Goal: Learn React/ })
    const n = map.byKey.get(GK)
    fireEvent.keyDown(node, { key: 'ArrowRight' })
    fireEvent.keyDown(node, { key: 'ArrowRight', shiftKey: true })
    expect(props.onMove).not.toHaveBeenCalled()
    vi.advanceTimersByTime(600)
    expect(props.onMove).toHaveBeenCalledTimes(1)
    expect(props.onMove).toHaveBeenCalledWith(GK, n.x + 50, n.y)
    vi.useRealTimers()
  })

  it('a burst of nudges is one save after the last key, and moving to another item saves the first', () => {
    vi.useFakeTimers()
    const { props, map } = canvas()
    const goalNode = screen.getByRole('button', { name: /^Goal: Learn React/ })
    const n = map.byKey.get(GK)
    fireEvent.keyDown(goalNode, { key: 'ArrowDown' })
    vi.advanceTimersByTime(300)
    fireEvent.keyDown(goalNode, { key: 'ArrowDown' })
    vi.advanceTimersByTime(300) // past the first key's pause: its timer was replaced, so nothing is saved mid-burst
    expect(props.onMove).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(props.onMove).toHaveBeenCalledTimes(1)
    expect(props.onMove).toHaveBeenCalledWith(GK, n.x, n.y + 20)
    const h = map.byKey.get(HK)
    fireEvent.keyDown(goalNode, { key: 'ArrowLeft' })
    fireEvent.keyDown(screen.getByRole('button', { name: /^Habit: Study daily/ }), { key: 'ArrowRight' })
    expect(props.onMove).toHaveBeenLastCalledWith(GK, n.x - 10, n.y) // the goal's move is kept, not dropped
    vi.advanceTimersByTime(600)
    expect(props.onMove).toHaveBeenLastCalledWith(HK, h.x + 10, h.y)
    expect(props.onMove).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('draws a line for each connection, green once what feeds it is done, and says so in its title', () => {
    const { container } = canvas()
    const titles = [...container.querySelectorAll('[data-edge] title')].map((t) => t.textContent)
    expect(titles).toContain('Finish module contributes to Study daily (done)')
    expect(titles).toContain('Study daily contributes to Learn React (pending)')
  })

  it('shows the connect hint only while nothing is connected', () => {
    const none = buildMap({ goals: [goal], habits: [habit] }, { today: '2026-11-16' })
    const a = canvas({ map: none, vis: filterMap(none, {}) })
    expect(screen.getByText(/Drag from the dot/)).toBeInTheDocument()
    a.unmount()
    canvas()
    expect(screen.queryByText(/Drag from the dot/)).not.toBeInTheDocument()
  })

  it('leaves out items the filters hide', () => {
    const map = build()
    canvas({ map, vis: filterMap(map, { kinds: new Set(['goal']) }) })
    expect(screen.getByRole('button', { name: /^Goal:/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Habit:/ })).not.toBeInTheDocument()
  })
})

describe('Inspector', () => {
  const open = (selected, map = build()) => {
    const props = { map, selected, onSelect: vi.fn(), onClose: vi.fn(), onFocus: vi.fn(), onCenter: vi.fn(), onEdit: vi.fn() }
    render(
      <MemoryRouter>
        <Inspector {...props} />
      </MemoryRouter>,
    )
    return props
  }
  it('shows progress, what feeds the item and what it feeds', () => {
    open({ type: 'node', key: HK })
    expect(screen.getByRole('heading', { name: 'Study daily' })).toBeInTheDocument()
    expect(screen.getByText('Fed by (1)')).toBeInTheDocument()
    expect(screen.getByText('Feeds into (1)')).toBeInTheDocument()
    expect(screen.getByText(/1 of 1 things feeding it is done/)).toBeInTheDocument()
  })
  it('selects a neighbour from the list', async () => {
    const props = open({ type: 'node', key: HK })
    await userEvent.click(screen.getByRole('button', { name: /^Learn React/ }))
    expect(props.onSelect).toHaveBeenCalledWith({ type: 'node', key: GK })
  })
  it('connects from the panel, offering only valid partners (no loops, no repeats)', async () => {
    open({ type: 'node', key: GK })
    const optionsOf = async () => {
      await userEvent.click(screen.getByRole('combobox', { name: 'Item to connect' }))
      const list = await screen.findByRole('listbox')
      const names = within(list)
        .queryAllByRole('option')
        .map((o) => o.textContent)
      await userEvent.keyboard('{Escape}')
      return names
    }
    // everything else already feeds the goal, directly or not, so going forward from it would make a loop or repeat a link
    expect(await optionsOf()).toEqual(['Choose an item…'])
    await userEvent.click(screen.getByRole('radio', { name: 'Is fed by…' }))
    expect(await optionsOf()).toEqual(['Choose an item…', 'Finish module']) // the habit is already connected; the task could also feed it directly
  })
  it('links a free item when one is available', async () => {
    const extra = { id: U(4), name: 'Read news', color: '#fff', archived_at: null }
    const map = buildMap({ goals: [goal], habits: [habit, extra], tasks: [task], links }, { today: '2026-11-16' })
    open({ type: 'node', key: nodeKey('habit', U(4)) }, map)
    await pickOption(userEvent.setup(), screen.getByRole('combobox', { name: 'Item to connect' }), GK)
    await userEvent.type(screen.getByLabelText('Label (optional)'), 'weekly')
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(mocks.linkNodes).toHaveBeenCalledWith(map, nodeKey('habit', U(4)), GK, 'weekly')
  })
  it('explains that a milestone link is not removable and offers reverse/remove for drawn links', () => {
    const m = buildMap(
      { goals: [goal], milestones: [{ id: U(10), goal_id: U(1), title: 'Ship', done: false }], habits: [habit], links },
      { today: '2026-11-16' },
    )
    const implicit = m.edges.find((e) => e.source === 'implicit')
    const a = render(
      <MemoryRouter>
        <Inspector
          map={m}
          selected={{ type: 'edge', key: implicit.key }}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onFocus={vi.fn()}
          onCenter={vi.fn()}
          onEdit={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/comes from the milestone itself/)).toBeInTheDocument()
    a.unmount()
    mocks.peek.mockReturnValue(links)
    const drawn = m.edges.find((e) => e.id === U(91))
    render(
      <MemoryRouter>
        <Inspector
          map={m}
          selected={{ type: 'edge', key: drawn.key }}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onFocus={vi.fn()}
          onCenter={vi.fn()}
          onEdit={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Reverse' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
  it('only projects and areas can be edited or deleted from here', () => {
    const m = buildMap(
      { customNodes: [{ id: U(30), kind: 'project', title: 'Site', status: 'active', category: 'Career' }] },
      { today: '2026-11-16' },
    )
    open({ type: 'node', key: nodeKey('project', U(30)) }, m)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete from map/ })).toBeInTheDocument()
  })
})

describe('MapToolbar', () => {
  const setup = (f = { query: '', category: '', hideDone: false, kinds: null, tasks: 'linked', focus: null }) => {
    const map = build()
    const setF = vi.fn()
    const onPick = vi.fn()
    const counts = { goal: 1, habit: 1, task: 1 }
    render(
      <MapToolbar
        map={map}
        vis={filterMap(map, f)}
        f={f}
        setF={setF}
        onPick={onPick}
        onAdd={vi.fn()}
        onFit={vi.fn()}
        onZoom={vi.fn()}
        onTidy={vi.fn()}
        counts={counts}
      />,
    )
    return { setF, onPick, map }
  }
  it('lists search results and jumps to the chosen item', async () => {
    const { onPick } = setup({ query: 'react', category: '', hideDone: false, kinds: null, tasks: 'linked', focus: null })
    await userEvent.click(screen.getByRole('combobox', { name: 'Search the map' }))
    await userEvent.click(within(await screen.findByRole('listbox')).getByRole('button', { name: /Learn React/ }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ key: GK }))
  })
  it('says so when nothing matches', async () => {
    setup({ query: 'zzz', category: '', hideDone: false, kinds: null, tasks: 'linked', focus: null })
    await userEvent.click(screen.getByRole('combobox', { name: 'Search the map' }))
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument()
  })
  it('type buttons toggle visibility and report their state', async () => {
    const { setF } = setup()
    const goalBtn = screen.getByRole('button', { name: /Goal/ })
    expect(goalBtn).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(goalBtn)
    const next = setF.mock.calls[0][0]({ kinds: null })
    expect([...next.kinds]).not.toContain('goal')
  })
})
