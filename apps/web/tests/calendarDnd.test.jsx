import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DragProvider, useDrag } from '@/features/calendar/dnd'
import { HOUR_PX } from '@/features/calendar/format'

// The drag engine is tested with its real pointer-event handling and a mocked layout: jsdom has no geometry, so the day column sits at a known
// place (top 100, 56px per hour) and elementFromPoint answers from a table. What is checked is what the engine reports: the date and snapped
// minutes under the pointer, when a gesture starts, and when it must not.

const COLUMN_TOP = 100
const rect = (top) => ({
  top,
  left: 0,
  right: 100,
  bottom: top + HOUR_PX * 24,
  width: 100,
  height: HOUR_PX * 24,
  x: 0,
  y: top,
  toJSON() {},
})

let over, commit, create, planSpy
const item = { key: 'task:t1', id: 't1', title: 'Write', color: '#8B5CF6' }

function Harness({ spec, children }) {
  const { startDrag, state, wasDrag } = useDrag()
  return (
    <div>
      <button data-testid="probe" onClick={() => (window.__swallowed = wasDrag())} />
      <button data-testid="src" onPointerDown={(e) => startDrag(e, spec)}>
        src
      </button>
      <div data-drop="grid" data-date="2026-11-12" data-testid="col" />
      <div data-drop="lane" data-date="2026-11-12" data-testid="lane" />
      <div data-drop="cell" data-date="2026-11-20" data-testid="cell" />
      <output data-testid="state">{state.active ? JSON.stringify(state.over) : 'idle'}</output>
      {children}
    </div>
  )
}
const mount = (spec = { mode: 'move', item, grabMin: 0 }) =>
  render(
    <DragProvider plan={planSpy} onCommit={commit} onCreate={create} renderGhost={() => <span>ghost</span>}>
      <Harness spec={spec} />
    </DragProvider>,
  )
const ptr = (type, el, x, y, o = {}) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  Object.assign(e, { pointerId: o.id ?? 1, pointerType: o.type ?? 'mouse' })
  return act(() => void el.dispatchEvent(e))
}
/** Lets one animation frame run (the engine recomputes what is under the pointer once per frame). */
const frame = async () => act(() => void vi.advanceTimersByTime(20))

beforeEach(() => {
  over = null
  commit = vi.fn()
  create = vi.fn()
  planSpy = vi.fn((spec, o) => (o ? { preview: { date: o.date }, change: { at: o } } : null))
  document.elementFromPoint = () => over
  Element.prototype.getBoundingClientRect = function () {
    return this.dataset?.drop === 'grid' ? rect(COLUMN_TOP) : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
})
afterEach(() => {
  vi.useRealTimers()
  document.documentElement.classList.remove('lt-dragging')
})

describe('move (mouse)', () => {
  it('a plain click never starts a drag', async () => {
    mount()
    const src = screen.getByTestId('src')
    ptr('pointerdown', src, 10, 10)
    ptr('pointermove', window, 12, 11) // under the 4px slop
    ptr('pointerup', window, 12, 11)
    expect(commit).not.toHaveBeenCalled()
    expect(document.documentElement).not.toHaveClass('lt-dragging')
  })

  it('dropping on the hour grid reports the date and snaps the time to 15 minutes', async () => {
    mount()
    const src = screen.getByTestId('src')
    over = screen.getByTestId('col')
    ptr('pointerdown', src, 10, 10)
    ptr('pointermove', window, 60, COLUMN_TOP + HOUR_PX * 9 + 20) // 9:00 + 20px ≈ 9:21
    await frame()
    expect(document.documentElement).toHaveClass('lt-dragging')
    expect(screen.getByTestId('state')).toHaveTextContent('"startMin":555') // 9:21 snaps to the nearest quarter hour
    ptr('pointerup', window, 60, COLUMN_TOP + HOUR_PX * 9 + 20)
    expect(commit).toHaveBeenCalledTimes(1)
    const [spec, planned] = commit.mock.calls[0]
    expect(spec.item.key).toBe('task:t1')
    expect(planned.change.at).toMatchObject({ kind: 'grid', date: '2026-11-12', startMin: 555 }) // 9:21 snaps to 9:15
    expect(document.documentElement).not.toHaveClass('lt-dragging')
  })

  it('the grab point is kept: grabbing a block 30 minutes down puts its TOP 30 minutes above the pointer', async () => {
    mount({ mode: 'move', item, grabMin: 30 })
    over = screen.getByTestId('col')
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    ptr('pointermove', window, 20, 20)
    ptr('pointerup', window, 20, COLUMN_TOP + HOUR_PX * 10) // pointer at 10:00
    expect(commit.mock.calls[0][1].change.at.startMin).toBe(570) // 9:30
  })

  it('the all-day lane and month cells report their own kinds', async () => {
    mount()
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    over = screen.getByTestId('lane')
    ptr('pointermove', window, 40, 40)
    await frame()
    expect(screen.getByTestId('state')).toHaveTextContent('"kind":"lane"')
    over = screen.getByTestId('cell')
    ptr('pointermove', window, 80, 80)
    await frame()
    ptr('pointerup', window, 80, 80)
    expect(commit.mock.calls[0][1].change.at).toMatchObject({ kind: 'cell', date: '2026-11-20', startMin: 'keep' })
  })

  it('releasing over nothing, or over a place the planner refuses, commits nothing', async () => {
    mount()
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    over = null
    ptr('pointermove', window, 40, 40)
    ptr('pointerup', window, 40, 40)
    expect(commit).not.toHaveBeenCalled()
    planSpy.mockReturnValue(null)
    over = screen.getByTestId('col')
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    ptr('pointermove', window, 40, 40)
    ptr('pointerup', window, 40, 40)
    expect(commit).not.toHaveBeenCalled()
  })

  it('Escape cancels the drag', async () => {
    mount()
    over = screen.getByTestId('col')
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    ptr('pointermove', window, 40, 40)
    await frame()
    fireEvent.keyDown(window, { key: 'Escape' })
    ptr('pointerup', window, 40, 40)
    expect(commit).not.toHaveBeenCalled()
    expect(document.documentElement).not.toHaveClass('lt-dragging')
    expect(screen.getByTestId('state')).toHaveTextContent('idle')
  })

  it('a pointercancel (the browser took the gesture) cancels without committing', async () => {
    mount()
    over = screen.getByTestId('col')
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    ptr('pointermove', window, 40, 40)
    ptr('pointercancel', window, 40, 40)
    expect(commit).not.toHaveBeenCalled()
  })

  it('the click that follows a drop is swallowed, so dropping never also opens the item; a later click is normal', async () => {
    mount()
    over = screen.getByTestId('col')
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    ptr('pointermove', window, 40, 40)
    ptr('pointerup', window, 40, 40)
    fireEvent.click(screen.getByTestId('probe'))
    expect(window.__swallowed).toBe(true)
    act(() => void vi.advanceTimersByTime(120))
    fireEvent.click(screen.getByTestId('probe'))
    expect(window.__swallowed).toBe(false)
  })

  it('only the left mouse button drags', () => {
    mount()
    const e = new MouseEvent('pointerdown', { bubbles: true, button: 2, clientX: 1, clientY: 1 })
    Object.assign(e, { pointerId: 1, pointerType: 'mouse' })
    act(() => void screen.getByTestId('src').dispatchEvent(e))
    ptr('pointermove', window, 50, 50)
    expect(document.documentElement).not.toHaveClass('lt-dragging')
  })
})

describe('move (touch)', () => {
  it('a finger that moves before the long press is a scroll: no drag', async () => {
    mount()
    over = screen.getByTestId('col')
    ptr('pointerdown', screen.getByTestId('src'), 10, 10, { type: 'touch' })
    ptr('pointermove', window, 10, 40, { type: 'touch' }) // scrolling
    act(() => void vi.advanceTimersByTime(600))
    ptr('pointermove', window, 10, 90, { type: 'touch' })
    ptr('pointerup', window, 10, 90, { type: 'touch' })
    expect(commit).not.toHaveBeenCalled()
    expect(document.documentElement).not.toHaveClass('lt-dragging')
  })

  it('pressing and holding picks the item up, and moving then drags it', async () => {
    mount()
    over = screen.getByTestId('col')
    ptr('pointerdown', screen.getByTestId('src'), 10, 10, { type: 'touch' })
    expect(document.documentElement).not.toHaveClass('lt-dragging') // not yet
    act(() => void vi.advanceTimersByTime(400))
    expect(document.documentElement).toHaveClass('lt-dragging')
    ptr('pointermove', window, 30, COLUMN_TOP + HOUR_PX * 14, { type: 'touch' })
    ptr('pointerup', window, 30, COLUMN_TOP + HOUR_PX * 14, { type: 'touch' })
    expect(commit.mock.calls[0][1].change.at).toMatchObject({ date: '2026-11-12', startMin: 840 })
  })

  it('lifting the finger before the long press is just a tap', async () => {
    mount()
    ptr('pointerdown', screen.getByTestId('src'), 10, 10, { type: 'touch' })
    ptr('pointerup', window, 10, 10, { type: 'touch' })
    act(() => void vi.advanceTimersByTime(600))
    expect(document.documentElement).not.toHaveClass('lt-dragging')
    expect(commit).not.toHaveBeenCalled()
  })

  it('while a touch drag is active the page cannot scroll under the finger', async () => {
    mount()
    over = screen.getByTestId('col')
    ptr('pointerdown', screen.getByTestId('src'), 10, 10, { type: 'touch' })
    act(() => void vi.advanceTimersByTime(400))
    const move = new Event('touchmove', { bubbles: true, cancelable: true })
    act(() => void window.dispatchEvent(move))
    expect(move.defaultPrevented).toBe(true)
    ptr('pointerup', window, 10, 10, { type: 'touch' })
    const after = new Event('touchmove', { bubbles: true, cancelable: true })
    act(() => void window.dispatchEvent(after))
    expect(after.defaultPrevented).toBe(false) // scrolling is back once it ends
  })
})

describe('resize', () => {
  it("reports the minutes under the pointer inside the item's own column, whatever else is under it", async () => {
    const col = document.createElement('div')
    col.dataset.drop = 'grid'
    document.body.appendChild(col)
    mount({ mode: 'resize', item, edge: 'end', date: '2026-11-12', column: col })
    over = screen.getByTestId('cell') // the pointer wandered over something else: ignored for a resize
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    ptr('pointermove', window, 10, 12)
    ptr('pointermove', window, 10, COLUMN_TOP + HOUR_PX * 11.5)
    ptr('pointerup', window, 10, COLUMN_TOP + HOUR_PX * 11.5)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0][1].change.at).toMatchObject({ kind: 'resize', date: '2026-11-12', minutes: 690 })
    col.remove()
  })

  it('never reports below the top or past the bottom of the day', async () => {
    const col = document.createElement('div')
    col.dataset.drop = 'grid'
    document.body.appendChild(col)
    mount({ mode: 'resize', item, edge: 'end', date: '2026-11-12', column: col })
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    ptr('pointermove', window, 10, 30)
    ptr('pointerup', window, 10, COLUMN_TOP + HOUR_PX * 40)
    expect(commit.mock.calls[0][1].change.at.minutes).toBe(1440)
    col.remove()
  })
})

describe('create (drag out an empty stretch)', () => {
  it('reports the dragged range, snapped, in either direction', async () => {
    const col = document.createElement('div')
    col.dataset.drop = 'grid'
    document.body.appendChild(col)
    mount({ mode: 'create', date: '2026-11-12', column: col, anchorMin: 10 * 60 + 5 })
    ptr('pointerdown', screen.getByTestId('src'), 10, 10)
    ptr('pointermove', window, 10, 30)
    ptr('pointerup', window, 10, COLUMN_TOP + HOUR_PX * 11.2) // to ≈ 11:12
    expect(create).toHaveBeenCalledWith({ kind: 'create', date: '2026-11-12', startMin: 600, endMin: 675 })
    create.mockClear()
    mount({ mode: 'create', date: '2026-11-12', column: col, anchorMin: 12 * 60 })
    ptr('pointerdown', screen.getAllByTestId('src')[1], 10, 10)
    ptr('pointermove', window, 10, 30)
    ptr('pointerup', window, 10, COLUMN_TOP + HOUR_PX * 11) // dragged upwards to 11:00
    expect(create).toHaveBeenCalledWith({ kind: 'create', date: '2026-11-12', startMin: 660, endMin: 720 })
    col.remove()
  })

  it('a finger never starts one (that is a scroll)', async () => {
    const col = document.createElement('div')
    col.dataset.drop = 'grid'
    document.body.appendChild(col)
    mount({ mode: 'create', date: '2026-11-12', column: col, anchorMin: 600 })
    ptr('pointerdown', screen.getByTestId('src'), 10, 10, { type: 'touch' })
    act(() => void vi.advanceTimersByTime(600))
    ptr('pointermove', window, 10, 200, { type: 'touch' })
    ptr('pointerup', window, 10, 200, { type: 'touch' })
    expect(create).not.toHaveBeenCalled()
    col.remove()
  })
})
