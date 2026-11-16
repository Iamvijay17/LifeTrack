import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Responsive } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import './grid.css'
import { AlertTriangle, ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { Menu } from '@/components/ui/menu'
import { BREAKPOINTS, GRID, limitsFor, sizeKeyOf, widgetDef } from '@lifetrack/core/dashboardBuilder'
import { cn } from '@/lib/utils'

/** The breakpoint for a container this wide. */
export const breakpointFor = (width) => BREAKPOINTS.find((bp) => width >= GRID.breakpoints[bp]) ?? 'sm'

/** The width of an element, kept up to date. Measured on the grid's own box, so a sidebar or a split window is already accounted for. */
function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(1200)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width) || 1200)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** One failed widget shows a small notice and leaves the rest of the dashboard alone. */
class WidgetBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error) {
    console.error('Dashboard widget failed:', this.props.name, error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="lt-card flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
        <p className="text-sm font-medium">{this.props.name} could not load</p>
        <p className="text-xs text-muted-foreground">Your data is safe. Other widgets are not affected.</p>
        <button type="button" className="text-xs text-mod-text underline underline-offset-2" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    )
  }
}

/**
 * One widget's box. Outside edit mode it is just the widget. In edit mode the widget is dimmed and inert (so a stray click does nothing),
 * with a handle to drag by and a menu, and on a phone, arrows to move it up and down.
 */
const Frame = memo(function Frame({ widget, name, editing, single, menu, onMove, canUp, canDown, children, sizeText }) {
  return (
    <div className={cn('lt-widget group relative h-full', editing && 'lt-widget-edit')} data-editing={editing || undefined}>
      {widget.title && (
        <p className="lt-widget-title truncate px-1 pb-1 text-xs font-semibold tracking-tight text-foreground/90">{widget.title}</p>
      )}
      <div className={cn('h-full min-h-0', widget.title && 'h-[calc(100%-1.5rem)]')}>
        <div
          className={cn(
            'h-full min-h-0 overflow-y-auto overscroll-contain rounded-xl [&>*]:min-h-full',
            editing && 'pointer-events-none select-none opacity-60',
          )}
        >
          <WidgetBoundary name={name}>{children}</WidgetBoundary>
        </div>
      </div>
      {editing && (
        <>
          <div className="lt-widget-chrome absolute inset-x-2 -top-3 z-10 flex items-center justify-between gap-1">
            {single ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-card/95 p-0.5 shadow-card ring-1 ring-border">
                <button
                  type="button"
                  aria-label={`Move ${name} up`}
                  disabled={!canUp}
                  onClick={() => onMove(-1)}
                  className="grid h-9 w-9 place-items-center rounded text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${name} down`}
                  disabled={!canDown}
                  onClick={() => onMove(1)}
                  className="grid h-9 w-9 place-items-center rounded text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </span>
            ) : (
              <span
                role="img"
                aria-label={`Drag to move ${name}`}
                title="Drag to move"
                className="lt-drag inline-flex h-7 cursor-grab touch-none items-center gap-1 rounded-md bg-card/95 px-1.5 text-[11px] font-medium text-foreground shadow-card ring-1 ring-border active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="max-w-[10rem] truncate">{name}</span>
                {sizeText && <span className="text-muted-foreground tabular-nums">{sizeText}</span>}
              </span>
            )}
            <span className="rounded-md bg-card/95 shadow-card ring-1 ring-border">
              <Menu label={`Settings for ${name}`} items={menu} />
            </span>
          </div>
        </>
      )}
    </div>
  )
})

/**
 * The dashboard grid for one workspace.
 *  - `items`     [{ widget, node }] the widgets to draw (hidden ones and ones with nothing to show are left out by the caller)
 *  - `workspace` its layouts (one per breakpoint)
 *  - `editing`   drag, resize and the editing chrome
 *  - `menuFor`   (widget) => menu items for the widget's menu
 */
export function DashboardGrid({ workspace, items, editing, menuFor, bindFor, onLayout, onMove }) {
  const [ref, width] = useWidth()
  const bp = breakpointFor(width)
  const single = bp === 'sm'
  const shown = useMemo(() => new Set(items.map((x) => x.widget.id)), [items])
  const typeOf = useMemo(() => Object.fromEntries(workspace.widgets.map((w) => [w.id, w.type])), [workspace.widgets])

  // The grid is given each widget's limits with its position, so it stops a resize at the smallest and largest the card is built for.
  const layouts = useMemo(
    () =>
      Object.fromEntries(
        BREAKPOINTS.map((b) => [
          b,
          (workspace.layouts[b] ?? [])
            .filter((it) => shown.has(it.i))
            .map((it) => ({
              ...it,
              ...limitsFor(typeOf[it.i], GRID.cols[b]),
              isResizable: editing && b !== 'sm',
              isDraggable: editing && b !== 'sm',
            })),
        ]),
      ),
    [workspace.layouts, shown, typeOf, editing],
  )

  const handleChange = useCallback(
    (current) => {
      if (editing) onLayout(bp, current)
    },
    [editing, onLayout, bp],
  )

  // The grid reports each change twice (during the drag and when it ends); only the settled layout is kept.
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!editing) setActive(false)
  }, [editing])

  const order = useMemo(
    () =>
      (workspace.layouts.sm ?? [])
        .filter((it) => shown.has(it.i))
        .sort((a, b) => a.y - b.y)
        .map((it) => it.i),
    [workspace.layouts.sm, shown],
  )

  return (
    <div
      ref={ref}
      data-testid="widget-grid"
      data-editing={editing || undefined}
      data-bp={bp}
      className={cn('lt-grid', editing && 'lt-grid-editing', active && 'lt-grid-active')}
    >
      <Responsive
        width={width}
        layouts={layouts}
        breakpoints={GRID.breakpoints}
        cols={GRID.cols}
        rowHeight={GRID.rowHeight}
        margin={[GRID.margin, GRID.margin]}
        containerPadding={[0, 0]}
        isDraggable={editing && !single}
        isResizable={editing && !single}
        draggableHandle=".lt-drag"
        resizeHandles={['se', 'e', 's']}
        compactType="vertical"
        useCSSTransforms
        onLayoutChange={handleChange}
        onDragStart={() => setActive(true)}
        onDragStop={() => setActive(false)}
        onResizeStart={() => setActive(true)}
        onResizeStop={() => setActive(false)}
      >
        {items.map(({ widget, node }) => {
          const def = widgetDef(widget.type)
          const name = widget.title || def?.label || widget.type
          const lg = workspace.layouts.lg.find((it) => it.i === widget.id)
          const at = order.indexOf(widget.id)
          return (
            <div
              key={widget.id}
              data-widget={widget.type}
              data-widget-id={widget.id}
              data-size={sizeKeyOf(workspace, widget.id) ?? 'custom'}
              className="min-w-0"
              {...bindFor?.(widget)}
            >
              <Frame
                widget={widget}
                name={name}
                editing={editing}
                single={single}
                menu={menuFor(widget)}
                onMove={(by) => onMove(widget.id, by)}
                canUp={at > 0}
                canDown={at >= 0 && at < order.length - 1}
                sizeText={lg ? `${lg.w}×${lg.h}` : null}
              >
                {node}
              </Frame>
            </div>
          )
        })}
      </Responsive>
    </div>
  )
}
