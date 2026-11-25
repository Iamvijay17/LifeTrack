import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { NODE_H, NODE_W } from '@/domain/lifeMap'
import { sound } from '@/lib/interaction/SoundManager'
import { cn } from '@/lib/utils'
import { KIND_STYLE, badgePath, kindColor } from './kinds'
import { MAX_K, MIN_K } from './useViewport'

const SHORT = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const edgePath = (a, b) => {
  const x1 = a.x + NODE_W
  const y1 = a.y + NODE_H / 2
  const x2 = b.x
  const y2 = b.y + NODE_H / 2
  const dx = Math.max(48, Math.abs(x2 - x1) / 2)
  return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 }
}

/** One node. Memoised: dragging one node must not redraw the other few hundred. */
const Node = memo(function Node({ n, x, y, selected, dim, related, matched, zoom, linking }) {
  const style = KIND_STYLE[n.kind]
  const color = kindColor(n)
  const Icon = style.icon
  const path = badgePath(style.shape)
  const done = n.status === 'done'
  const detailed = zoom >= 0.5
  const label = `${style.label}: ${n.title}. ${n.detail}${n.category ? `. ${n.category}` : ''}${done ? '. Complete' : ''}`
  return (
    <g
      data-node={n.key}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      transform={`translate(${x},${y})`}
      className={cn('group/node cursor-grab outline-none active:cursor-grabbing', (dim || !related) && 'opacity-30')}
      style={{ transition: 'opacity 150ms' }}
    >
      <title>{`${n.title} — ${n.detail}`}</title>
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={12}
        className={cn(
          'fill-card stroke-border transition-[stroke] group-hover/node:stroke-muted-foreground group-focus-visible/node:stroke-mod',
          done && 'stroke-success/60',
        )}
        strokeWidth={1.25}
        strokeDasharray={n.status === 'paused' ? '4 3' : undefined}
      />
      {(selected || matched || linking) && (
        <rect
          x={-3}
          y={-3}
          width={NODE_W + 6}
          height={NODE_H + 6}
          rx={15}
          fill="none"
          className={linking ? 'stroke-success' : 'stroke-mod'}
          strokeWidth={selected || linking ? 2.5 : 1.75}
          strokeDasharray={matched && !selected && !linking ? '5 3' : undefined}
        />
      )}
      <g transform="translate(10,14)">
        {path ? (
          <path d={path} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        ) : (
          <circle
            cx={14}
            cy={14}
            r={12.5}
            fill={color}
            fillOpacity={style.shape === 'ring' ? 0.06 : 0.18}
            stroke={color}
            strokeWidth={style.shape === 'ring' ? 2.5 : 1.5}
          />
        )}
        <Icon x={7.5} y={7.5} width={13} height={13} color={color} strokeWidth={2.2} aria-hidden />
      </g>
      <text x={46} y={detailed ? 24 : 33} className="fill-foreground text-[12px] font-medium" style={{ pointerEvents: 'none' }}>
        {SHORT(n.title, 21)}
      </text>
      {detailed && (
        <>
          <text x={46} y={38} className="fill-muted-foreground text-[10px]" style={{ pointerEvents: 'none' }}>
            {SHORT(n.detail, 26)}
          </text>
          <rect x={46} y={46} width={NODE_W - 62} height={3} rx={1.5} className="fill-muted" />
          <rect
            x={46}
            y={46}
            width={Math.max(0, (NODE_W - 62) * n.progress)}
            height={3}
            rx={1.5}
            fill={done ? 'rgb(var(--success))' : color}
          />
        </>
      )}
      {done && (
        <g transform={`translate(${NODE_W - 20},6)`}>
          <circle cx={7} cy={7} r={7} className="fill-success" />
          <Check x={3} y={3} width={8} height={8} color="white" strokeWidth={3.5} aria-hidden />
        </g>
      )}
      {/* The connector: drag from here onto another item. Visible on hover, focus and selection. */}
      <circle
        data-handle={n.key}
        cx={NODE_W}
        cy={NODE_H / 2}
        r={7}
        className={cn(
          'cursor-crosshair fill-card stroke-mod transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100 group-focus-visible/node:opacity-100',
        )}
        strokeWidth={2}
      />
      <circle cx={0} cy={NODE_H / 2} r={3} className="fill-border" style={{ pointerEvents: 'none' }} />
    </g>
  )
})

/**
 * The canvas: an SVG that pans, zooms and drags. Positions are in "world" space and the viewport is one transform, so panning never touches the
 * nodes. Everything works with mouse, touch (one finger pans or drags, two zoom) and keyboard (Tab to a node, Enter selects, arrows move it).
 */
export function MapCanvas({ map, vis, selected, onSelect, onMove, onLink, view, setView, zoomAt, onSize, hint }) {
  const svg = useRef(null)
  const [drag, setDrag] = useState(null) // { key, x, y } while a node is being dragged
  const [line, setLine] = useState(null) // { from, x, y, over } while drawing a link
  const gesture = useRef(null)
  const pointers = useRef(new Map())
  const pending = useRef(null)
  const viewRef = useRef(view)
  viewRef.current = view

  // Report the canvas size (for "fit"), and keep it current when the window or a side panel changes it.
  useLayoutEffect(() => {
    const el = svg.current
    if (!el) return
    const report = () => onSize({ w: el.clientWidth, h: el.clientHeight })
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onSize])

  // Scroll zooms (pinch on a trackpad arrives as ctrl+wheel); shift+scroll pans sideways. Needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.shiftKey) return setView((v) => ({ ...v, x: v.x - (e.deltaY || e.deltaX) }))
      const step = e.ctrlKey ? 0.01 : 0.0015
      zoomAt(Math.exp(-e.deltaY * step), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, setView])

  const v = view ?? { k: 1, x: 0, y: 0 }
  const world = (cx, cy) => {
    const r = svg.current.getBoundingClientRect()
    const cur = viewRef.current ?? { k: 1, x: 0, y: 0 }
    return { x: (cx - r.left - cur.x) / cur.k, y: (cy - r.top - cur.y) / cur.k }
  }
  const nodeAt = (cx, cy) => document.elementFromPoint(cx, cy)?.closest?.('[data-node]')?.getAttribute('data-node') ?? null

  const down = (e) => {
    if (e.button > 0) return
    const t = e.target
    const el = svg.current
    el.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) }
      setDrag(null)
      setLine(null)
      return
    }
    const handle = t.closest?.('[data-handle]')?.getAttribute('data-handle')
    const key = t.closest?.('[data-node]')?.getAttribute('data-node')
    const edge = t.closest?.('[data-edge]')?.getAttribute('data-edge')
    const cur = viewRef.current ?? { k: 1, x: 0, y: 0 }
    if (handle) gesture.current = { type: 'link', from: handle }
    else if (key) {
      const n = map.byKey.get(key)
      gesture.current = { type: 'node', key, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false }
    } else if (edge) gesture.current = { type: 'edge', key: edge, sx: e.clientX, sy: e.clientY, moved: false }
    else gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: cur.x, vy: cur.y, moved: false }
  }

  const move = (e) => {
    const g = gesture.current
    if (!g) return
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const cur = viewRef.current ?? { k: 1, x: 0, y: 0 }
    if (g.type === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const r = svg.current.getBoundingClientRect()
      zoomAt(dist / g.dist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top)
      g.dist = dist
    } else if (g.type === 'pan') {
      const dx = e.clientX - g.sx
      const dy = e.clientY - g.sy
      if (Math.hypot(dx, dy) > 3) g.moved = true
      if (g.moved) setView({ ...cur, x: g.vx + dx, y: g.vy + dy })
    } else if (g.type === 'node') {
      const dx = e.clientX - g.sx
      const dy = e.clientY - g.sy
      if (!g.moved && Math.hypot(dx, dy) > 4) g.moved = true
      if (g.moved) setDrag({ key: g.key, x: g.ox + dx / cur.k, y: g.oy + dy / cur.k })
    } else if (g.type === 'link') {
      const w = world(e.clientX, e.clientY)
      const over = nodeAt(e.clientX, e.clientY)
      setLine({ from: g.from, x: w.x, y: w.y, over: over && over !== g.from ? over : null })
    } else if (g.type === 'edge' && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 4) g.moved = true
  }

  const up = (e) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    svg.current?.releasePointerCapture?.(e.pointerId)
    if (!g) return
    if (g.type === 'pinch') {
      if (pointers.current.size < 2) gesture.current = null
      return
    }
    gesture.current = null
    if (g.type === 'node') {
      if (g.moved && drag) onMove(g.key, drag.x, drag.y)
      else {
        sound.play('select')
        onSelect({ type: 'node', key: g.key })
      }
      setDrag(null)
    } else if (g.type === 'link') {
      const target = nodeAt(e.clientX, e.clientY)
      setLine(null)
      if (target && target !== g.from) onLink(g.from, target)
    } else if (g.type === 'edge') {
      if (!g.moved) onSelect({ type: 'edge', key: g.key })
    } else if (g.type === 'pan' && !g.moved) onSelect(null)
  }

  // Keyboard: Enter/Space selects, arrows nudge the selected node (Shift = bigger steps), Escape clears.
  const onKeyDown = (e) => {
    const key = e.target.closest?.('[data-node]')?.getAttribute('data-node')
    if (e.key === 'Escape') return onSelect(null)
    if (!key) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect({ type: 'node', key })
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const n = map.byKey.get(key)
      const step = e.shiftKey ? 40 : 10
      // One save per burst of nudges: the previous burst's timer is cancelled before it is replaced (a node nudged just before is saved now).
      const prev = pending.current
      clearTimeout(prev?.timer)
      if (prev && prev.key !== key) onMove(prev.key, prev.x, prev.y)
      const from = prev?.key === key ? prev : n
      const to = {
        x: from.x + ({ ArrowLeft: -step, ArrowRight: step }[e.key] ?? 0),
        y: from.y + ({ ArrowUp: -step, ArrowDown: step }[e.key] ?? 0),
      }
      pending.current = { key, ...to }
      setDrag({ key, ...to })
      pending.current.timer = setTimeout(() => {
        const p = pending.current
        pending.current = null
        setDrag(null)
        if (p) onMove(p.key, p.x, p.y)
      }, 450)
    }
  }

  const at = (n) => (drag?.key === n.key ? { x: drag.x, y: drag.y } : n)
  const selNode = selected?.type === 'node' ? selected.key : null
  const near = selNode ? new Set([selNode, ...(map.into.get(selNode) ?? []), ...(map.out.get(selNode) ?? [])]) : null
  const sel = selected?.type === 'edge' ? selected.key : null
  const nodes = map.nodes.filter((n) => vis.visible.has(n.key))
  const hasAnyLink = vis.edges.length > 0

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-surface-2/40">
      <svg
        ref={svg}
        role="application"
        aria-label="Life map. Tab to move between items, Enter to select, arrow keys to move the selected item."
        className="h-full w-full touch-none select-none outline-none [background-image:radial-gradient(rgb(var(--border)/0.9)_1px,transparent_1px)] [background-size:24px_24px]"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={onKeyDown}
      >
        <defs>
          {[
            ['done', 'rgb(var(--success))'],
            ['pending', 'rgb(var(--muted-foreground) / 0.7)'],
            ['sel', 'rgb(var(--mod))'],
          ].map(([id, fill]) => (
            <marker key={id} id={`lm-arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,1 L9,5 L0,9 z" fill={fill} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${v.x},${v.y}) scale(${v.k})`}>
          <g>
            {vis.edges.map((e) => {
              const a = map.byKey.get(e.from)
              const b = map.byKey.get(e.to)
              const p = edgePath(at(a), at(b))
              const isSel = sel === e.key
              const touches = !near || e.from === selNode || e.to === selNode
              const color = e.state === 'done' ? 'rgb(var(--success))' : 'rgb(var(--muted-foreground))'
              return (
                <g
                  key={e.key}
                  data-edge={e.key}
                  className="cursor-pointer"
                  style={{ opacity: touches ? 1 : 0.15, transition: 'opacity 150ms' }}
                >
                  <title>{`${a.title} contributes to ${b.title} (${e.state === 'done' ? 'done' : 'pending'})`}</title>
                  <path d={p.d} fill="none" stroke="transparent" strokeWidth={16} />
                  <path
                    d={p.d}
                    fill="none"
                    stroke={isSel ? 'rgb(var(--mod))' : color}
                    strokeWidth={isSel ? 3 : e.state === 'done' ? 2.25 : 1.5}
                    strokeOpacity={e.state === 'done' || isSel ? 1 : 0.55}
                    strokeDasharray={e.state === 'done' ? undefined : e.source === 'implicit' ? '2 5' : '7 5'}
                    markerEnd={`url(#lm-arrow-${isSel ? 'sel' : e.state})`}
                  />
                  {e.label && v.k >= 0.5 && (
                    <g transform={`translate(${p.mx},${p.my})`} style={{ pointerEvents: 'none' }}>
                      <rect
                        x={-4 - e.label.length * 3}
                        y={-9}
                        width={8 + e.label.length * 6}
                        height={18}
                        rx={9}
                        className="fill-card stroke-border"
                      />
                      <text textAnchor="middle" y={4} className="fill-muted-foreground text-[10px]">
                        {e.label}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>
          <g>
            {nodes.map((n) => {
              const p = at(n)
              return (
                <Node
                  key={n.key}
                  n={n}
                  x={p.x}
                  y={p.y}
                  selected={selNode === n.key}
                  dim={vis.dim(n.key)}
                  matched={vis.matches.has(n.key)}
                  related={!near || near.has(n.key)}
                  linking={line?.over === n.key}
                  zoom={v.k}
                />
              )
            })}
          </g>
          {line &&
            (() => {
              const a = at(map.byKey.get(line.from))
              const to = line.over ? at(map.byKey.get(line.over)) : null
              const x2 = to ? to.x : line.x
              const y2 = to ? to.y + NODE_H / 2 : line.y
              const x1 = a.x + NODE_W
              const y1 = a.y + NODE_H / 2
              const dx = Math.max(48, Math.abs(x2 - x1) / 2)
              return (
                <path
                  d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={line.over ? 'rgb(var(--success))' : 'rgb(var(--mod))'}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  markerEnd="url(#lm-arrow-sel)"
                  style={{ pointerEvents: 'none' }}
                />
              )
            })()}
        </g>
      </svg>
      {hint && !hasAnyLink && nodes.length > 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[90%] rounded-full border border-border bg-card/90 px-3.5 py-1.5 text-center text-xs text-muted-foreground shadow-raised backdrop-blur">
          Drag from the dot on an item&apos;s right edge onto another item to connect them.
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {selNode ? `Selected ${map.byKey.get(selNode)?.title}` : ''}
      </p>
    </div>
  )
}

export const ZOOM_LIMITS = { MIN_K, MAX_K }
