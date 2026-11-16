import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, Wand2 } from 'lucide-react'
import { NODE_H, NODE_W, addEdge, connectProblem, removeEdge, removeNode, updateNode } from '@lifetrack/core/automation'
import { cn } from '@/lib/utils'
import { NodeCard } from './NodeCard'

const MIN_Z = 0.3
const MAX_Z = 1.6
const GRID = 8
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const snap = (v) => Math.round(v / GRID) * GRID

function curve(x1, y1, x2, y2) {
  const dx = Math.max(48, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

/**
 * The workflow canvas: pan (drag the background, or scroll), zoom (Ctrl/Cmd + scroll, or the buttons), drag nodes, draw connections from a node's
 * round handle. Everything is also reachable without a pointer: Tab between steps, arrow keys move one, Delete removes it, and the side panel
 * has a "Runs next" list that connects steps with checkboxes.
 */
export const Canvas = forwardRef(function Canvas(
  { graph, selection, issues, onSelect, onTransient, onCommit, onCheckpoint, onAutoLayout, onNotice, onDropNode },
  ref,
) {
  const box = useRef(null)
  const [view, setView] = useState({ x: 32, y: 32, z: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const graphRef = useRef(graph)
  graphRef.current = graph
  const [link, setLink] = useState(null)
  const touched = useRef(false) // once the person has panned or zoomed, the view is theirs: it is no longer re-fitted when the size changes

  const world = useCallback((cx, cy) => {
    const r = box.current.getBoundingClientRect()
    const v = viewRef.current
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }
  }, [])

  const fit = useCallback(() => {
    const g = graphRef.current
    const r = box.current?.getBoundingClientRect()
    if (!r || !g.nodes.length) return setView({ x: 32, y: 32, z: 1 })
    const minX = Math.min(...g.nodes.map((n) => n.x))
    const maxX = Math.max(...g.nodes.map((n) => n.x + NODE_W))
    const minY = Math.min(...g.nodes.map((n) => n.y))
    const maxY = Math.max(...g.nodes.map((n) => n.y + NODE_H))
    const z = clamp(Math.min((r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY)), MIN_Z, 1)
    setView({ z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z })
  }, [])
  const zoomBy = useCallback((factor, cx, cy) => {
    touched.current = true
    const r = box.current.getBoundingClientRect()
    const px = cx ?? r.width / 2
    const py = cy ?? r.height / 2
    setView((v) => {
      const z = clamp(v.z * factor, MIN_Z, MAX_Z)
      return { z, x: px - (px - v.x) * (z / v.z), y: py - (py - v.y) * (z / v.z) }
    })
  }, [])
  useImperativeHandle(ref, () => ({
    fit,
    /** A free spot near the middle of what is on screen, in canvas coordinates. */
    center() {
      const r = box.current.getBoundingClientRect()
      const p = world(r.left + r.width / 2, r.top + r.height / 2)
      return { x: snap(p.x - NODE_W / 2), y: snap(p.y - NODE_H / 2) }
    },
  }))
  // Fit on open, and again while the layout settles or the window is resized, until the person takes the view over.
  useEffect(() => {
    fit()
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit()
    })
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [fit])

  // Scrolling pans; Ctrl/Cmd + scroll (and a trackpad pinch) zooms around the pointer. Needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = box.current
    const onWheel = (e) => {
      e.preventDefault()
      touched.current = true
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top)
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  const track = (move, up) => {
    const m = (e) => move(e)
    const u = (e) => {
      window.removeEventListener('pointermove', m)
      window.removeEventListener('pointerup', u)
      window.removeEventListener('pointercancel', u)
      up(e)
    }
    window.addEventListener('pointermove', m)
    window.addEventListener('pointerup', u)
    window.addEventListener('pointercancel', u)
  }

  const onBackgroundDown = (e) => {
    if (e.button !== 0 || e.target.closest('[data-node-id],button,[data-edge]')) return
    const o = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y }
    let moved = false
    track(
      (ev) => {
        const dx = ev.clientX - o.x
        const dy = ev.clientY - o.y
        if (!moved && Math.hypot(dx, dy) < 3) return
        moved = true
        touched.current = true
        setView((v) => ({ ...v, x: o.vx + dx, y: o.vy + dy }))
      },
      () => {
        if (!moved) onSelect(null)
      },
    )
    box.current?.focus({ preventScroll: true })
  }

  const onNodeDown = (e, node) => {
    if (e.button !== 0 || e.target.closest('[data-handle-out]')) return
    onSelect({ kind: 'node', id: node.id })
    const base = graphRef.current
    const o = { x: e.clientX, y: e.clientY }
    let moved = false
    track(
      (ev) => {
        const dx = (ev.clientX - o.x) / viewRef.current.z
        const dy = (ev.clientY - o.y) / viewRef.current.z
        if (!moved && Math.hypot(dx, dy) < 3) return
        moved = true
        onTransient(updateNode(base, node.id, { x: snap(node.x + dx), y: snap(node.y + dy) }))
      },
      () => {
        if (moved) onCheckpoint(base)
      },
    )
  }

  const onHandleDown = (e, node) => {
    e.stopPropagation()
    e.preventDefault()
    const start = world(e.clientX, e.clientY)
    setLink({ from: node.id, x: start.x, y: start.y })
    track(
      (ev) => setLink({ from: node.id, ...world(ev.clientX, ev.clientY) }),
      (ev) => {
        setLink(null)
        const to = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-node-id]')?.getAttribute('data-node-id')
        if (!to || to === node.id) return
        const problem = connectProblem(graphRef.current, node.id, to)
        if (problem) onNotice(problem)
        else onCommit(addEdge(graphRef.current, node.id, to))
      },
    )
  }

  const removeSelection = () => {
    if (!selection) return
    onCommit(selection.kind === 'edge' ? removeEdge(graph, selection.id) : removeNode(graph, selection.id))
    onSelect(null)
  }
  const onNodeKey = (e, node) => {
    const step = e.shiftKey ? GRID * 4 : GRID
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (move) {
      e.preventDefault()
      e.stopPropagation()
      onCommit(updateNode(graph, node.id, { x: node.x + move[0], y: node.y + move[1] }))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onCommit(removeNode(graph, node.id))
      onSelect(null)
    }
  }
  const onKeyDown = (e) => {
    if (e.target !== box.current) return
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
      e.preventDefault()
      removeSelection()
    } else if (e.key === '+' || e.key === '=') zoomBy(1.15)
    else if (e.key === '-') zoomBy(1 / 1.15)
    else if (e.key === '0') fit()
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const out = (n) => ({ x: n.x + NODE_W + 1, y: n.y + NODE_H / 2 })
  const inn = (n) => ({ x: n.x - 1, y: n.y + NODE_H / 2 })

  return (
    <div
      ref={box}
      tabIndex={0}
      role="application"
      aria-label="Workflow canvas. Tab between steps; arrow keys move the focused step; Delete removes it; plus and minus zoom."
      onPointerDown={onBackgroundDown}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-lt-node')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-lt-node')
        if (!raw) return
        e.preventDefault()
        const p = world(e.clientX, e.clientY)
        onDropNode(JSON.parse(raw), { x: snap(p.x - NODE_W / 2), y: snap(p.y - NODE_H / 2) })
      }}
      className="relative h-full min-h-[22rem] w-full touch-none overflow-hidden rounded-xl border border-border bg-surface-2/60 outline-none focus-visible:ring-2 focus-visible:ring-mod"
      style={{
        backgroundImage: 'radial-gradient(rgb(var(--muted-foreground) / 0.22) 1px, transparent 1px)',
        backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
          {graph.edges.map((e) => {
            const a = byId.get(e.from)
            const b = byId.get(e.to)
            if (!a || !b) return null
            const p = out(a)
            const q = inn(b)
            const on = selection?.kind === 'edge' && selection.id === e.id
            const d = curve(p.x, p.y, q.x, q.y)
            return (
              <g key={e.id} data-edge={e.id}>
                <path
                  d={d}
                  fill="none"
                  strokeWidth="2"
                  className={cn('lt-edge-flow transition-colors', on ? 'stroke-mod' : 'stroke-muted-foreground/60')}
                />
                <path
                  d={d}
                  fill="none"
                  strokeWidth="16"
                  stroke="transparent"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation()
                    onSelect({ kind: 'edge', id: e.id })
                  }}
                />
              </g>
            )
          })}
          {link && byId.get(link.from) && (
            <path
              d={curve(out(byId.get(link.from)).x, out(byId.get(link.from)).y, link.x, link.y)}
              fill="none"
              strokeWidth="2"
              strokeDasharray="5 5"
              className="stroke-mod"
            />
          )}
        </svg>
        {selection?.kind === 'edge' &&
          (() => {
            const e = graph.edges.find((x) => x.id === selection.id)
            const a = e && byId.get(e.from)
            const b = e && byId.get(e.to)
            if (!a || !b) return null
            const p = out(a)
            const q = inn(b)
            return (
              <button
                type="button"
                aria-label="Remove this connection"
                onClick={removeSelection}
                style={{ left: (p.x + q.x) / 2 - 12, top: (p.y + q.y) / 2 - 12 }}
                className="absolute grid h-6 w-6 place-items-center rounded-full border border-danger/50 bg-card text-danger shadow-card hover:bg-danger/10"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
            )
          })()}
        {graph.nodes.map((n) => (
          <NodeCard
            key={n.id}
            node={n}
            selected={selection?.kind === 'node' && selection.id === n.id}
            issue={issues.get(n.id)}
            onPointerDown={onNodeDown}
            onHandleDown={onHandleDown}
            onKeyDown={onNodeKey}
            onSelect={(node) => onSelect({ kind: 'node', id: node.id })}
          />
        ))}
      </div>

      <div
        className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-border bg-card/90 p-1 shadow-card backdrop-blur"
        role="toolbar"
        aria-label="Canvas controls"
      >
        {[
          { label: 'Zoom out', icon: Minus, run: () => zoomBy(1 / 1.2) },
          { label: 'Zoom in', icon: Plus, run: () => zoomBy(1.2) },
          { label: 'Fit to screen', icon: Maximize2, run: fit },
          {
            label: 'Tidy up the layout',
            icon: Wand2,
            run: () => {
              onAutoLayout()
              requestAnimationFrame(fit)
            },
          },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.label}
            title={b.label}
            onClick={b.run}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <b.icon className="h-4 w-4" aria-hidden />
          </button>
        ))}
        <span className="px-1.5 text-[11px] tabular-nums text-muted-foreground" aria-live="off">
          {Math.round(view.z * 100)}%
        </span>
      </div>
    </div>
  )
})
