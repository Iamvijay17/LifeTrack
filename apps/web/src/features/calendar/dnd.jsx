import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SNAP_MINUTES, snapMinutes } from '@/domain/calendar'
import { HOUR_PX } from './format'

// Drag and drop for the calendar, built on pointer events so one code path serves mouse, pen and touch.
//
//   move     an item (or an unscheduled task) is dragged onto a day column, an all-day lane or a month cell
//   resize   one edge of a timed item is dragged inside its own day column
//   create   an empty stretch of a day column is dragged out to start a new item
//
// Drop targets are plain DOM elements marked  data-drop="grid|lane|cell"  data-date="yyyy-MM-dd"  (the hour grid's column, the all-day lane, a month
// cell). The engine only works out WHERE the pointer is, as a date and snapped minutes; what that means for the data is decided by `plan`, which
// the page supplies from the pure planners in @lifetrack/core/calendar. Nothing here knows about tasks, events or the database.
//
// Touch: scrolling must keep working, so a finger has to rest on an item for LONG_PRESS_MS before it picks the item up. A finger that moves first is
// a scroll, and the gesture is dropped. Resize grips are small, so they start straight away (they set touch-action: none).

const MOUSE_SLOP = 4
const TOUCH_SLOP = 10
const LONG_PRESS_MS = 350
const EDGE = 56
const MAX_SCROLL = 18
const IDLE = { active: false, spec: null, over: null, plan: null }

const Ctx = createContext({ state: IDLE, startDrag: () => {}, registerScroller: () => {}, wasDrag: () => false })
export const useDrag = () => useContext(Ctx)

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const sameOver = (a, b) =>
  a === b ||
  (!!a && !!b && a.kind === b.kind && a.date === b.date && a.startMin === b.startMin && a.endMin === b.endMin && a.minutes === b.minutes)

/** Where the pointer is, in the terms the planners understand. */
function overFor(spec, x, y) {
  if (spec.mode === 'resize' || spec.mode === 'create') {
    const el = spec.column
    if (!el?.isConnected) return null
    const minutes = clamp(((y - el.getBoundingClientRect().top) / HOUR_PX) * 60, 0, 1440)
    if (spec.mode === 'resize') return { kind: 'resize', date: spec.date, minutes }
    const lo = Math.min(spec.anchorMin, minutes)
    const hi = Math.max(spec.anchorMin, minutes)
    const startMin = clamp(Math.floor(lo / SNAP_MINUTES) * SNAP_MINUTES, 0, 1440 - SNAP_MINUTES)
    return {
      kind: 'create',
      date: spec.date,
      startMin,
      endMin: Math.min(1440, Math.max(Math.ceil(hi / SNAP_MINUTES) * SNAP_MINUTES, startMin + SNAP_MINUTES)),
    }
  }
  const el = document.elementFromPoint(x, y)?.closest('[data-drop]')
  if (!el) return null
  const { drop, date } = el.dataset
  if (drop === 'grid') {
    const minutes = ((y - el.getBoundingClientRect().top) / HOUR_PX) * 60 - (spec.grabMin ?? 0)
    return { kind: 'grid', date, startMin: clamp(snapMinutes(minutes), 0, 1439) }
  }
  if (drop === 'lane') return { kind: 'lane', date, startMin: null }
  return { kind: 'cell', date, startMin: 'keep' }
}

/**
 * @param plan (spec, over) => { preview, change } | null   what dropping here would do (null = not allowed here)
 * @param onCommit (spec, plan) => void                       the pointer was released over a valid target
 * @param onCreate ({ date, startMin, endMin }) => void       a new item was dragged out on an empty stretch
 * @param renderGhost (spec, plan) => node                    the label that follows the pointer while an item is carried
 */
export function DragProvider({ plan, onCommit, onCreate, renderGhost, children }) {
  const [state, setState] = useState(IDLE)
  const live = useRef({ x: 0, y: 0 })
  const ghost = useRef(null)
  const scroller = useRef(null)
  const session = useRef(null)
  const swallow = useRef(false)
  const latest = useRef({})
  latest.current = { plan, onCommit, onCreate }

  const registerScroller = useCallback((el) => {
    scroller.current = el
  }, [])
  const wasDrag = useCallback(() => swallow.current, [])

  const startDrag = useCallback((e, spec) => {
    if (session.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const touch = e.pointerType === 'touch'
    if (spec.mode === 'create' && touch) return // a finger on empty space is a scroll
    const id = e.pointerId
    const origin = { x: e.clientX, y: e.clientY }
    live.current = { ...origin }
    const s = (session.current = { id, spec, active: false, timer: 0, raf: 0, over: null, plan: null })
    const longPress = touch && spec.mode !== 'resize'

    const noScroll = (ev) => ev.cancelable && ev.preventDefault()
    const noMenu = (ev) => ev.preventDefault()

    const frame = () => {
      if (!s.active) return
      const { x, y } = live.current
      const sc = scroller.current
      if (sc && spec.mode !== 'create') {
        const r = sc.getBoundingClientRect()
        if (y < r.top + EDGE) sc.scrollTop -= MAX_SCROLL * clamp((r.top + EDGE - y) / EDGE, 0.15, 1)
        else if (y > r.bottom - EDGE) sc.scrollTop += MAX_SCROLL * clamp((y - (r.bottom - EDGE)) / EDGE, 0.15, 1)
      }
      const over = overFor(spec, x, y)
      if (!sameOver(over, s.over)) {
        s.over = over
        s.plan = over ? latest.current.plan(spec, over) : null
        setState({ active: true, spec, over, plan: s.plan })
      }
      if (ghost.current) ghost.current.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`
      s.raf = requestAnimationFrame(frame)
    }
    const begin = () => {
      if (s.active) return
      s.active = true
      clearTimeout(s.timer)
      document.documentElement.classList.add('lt-dragging')
      if (touch) {
        navigator.vibrate?.(10)
        window.addEventListener('touchmove', noScroll, { passive: false })
        window.addEventListener('contextmenu', noMenu)
      }
      setState({ active: true, spec, over: null, plan: null })
      s.raf = requestAnimationFrame(frame)
    }
    const cleanup = () => {
      clearTimeout(s.timer)
      cancelAnimationFrame(s.raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('touchmove', noScroll)
      window.removeEventListener('contextmenu', noMenu)
      document.documentElement.classList.remove('lt-dragging')
      session.current = null
      setState(IDLE)
    }
    const swallowClick = () => {
      swallow.current = true
      setTimeout(() => {
        swallow.current = false
      }, 80)
    }
    function onMove(ev) {
      if (ev.pointerId !== id) return
      live.current = { x: ev.clientX, y: ev.clientY }
      if (s.active) return
      const dist = Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y)
      if (longPress) {
        if (dist > TOUCH_SLOP) cleanup() // the finger moved first: the user is scrolling
      } else if (dist > (touch ? TOUCH_SLOP : MOUSE_SLOP)) begin()
    }
    function onUp(ev) {
      if (ev.pointerId !== id) return
      live.current = { x: ev.clientX, y: ev.clientY }
      if (!s.active) return cleanup()
      // Settle on exactly where the pointer was released, not the last animation frame.
      const over = overFor(spec, ev.clientX, ev.clientY)
      const planned = over ? latest.current.plan(spec, over) : null
      swallowClick()
      cleanup()
      if (spec.mode === 'create') {
        if (over) latest.current.onCreate?.(over)
      } else if (planned) latest.current.onCommit?.(spec, planned)
    }
    function onCancel(ev) {
      if (ev.pointerId === id) cleanup() // the browser took the gesture (a scroll, a system gesture)
    }
    function onKey(ev) {
      if (ev.key !== 'Escape') return
      ev.stopPropagation()
      if (s.active) swallowClick()
      cleanup()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    if (longPress) s.timer = setTimeout(begin, LONG_PRESS_MS)
  }, [])

  useEffect(
    () => () => {
      document.documentElement.classList.remove('lt-dragging')
    },
    [],
  )

  const value = useMemo(() => ({ state, startDrag, registerScroller, wasDrag }), [state, startDrag, registerScroller, wasDrag])
  const carrying = state.active && state.spec && state.spec.mode === 'move'
  return (
    <Ctx.Provider value={value}>
      {children}
      {carrying &&
        createPortal(
          <div
            ref={ghost}
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-[80]"
            style={{ transform: `translate3d(${live.current.x + 14}px, ${live.current.y + 14}px, 0)` }}
          >
            {renderGhost(state.spec, state.plan)}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  )
}
