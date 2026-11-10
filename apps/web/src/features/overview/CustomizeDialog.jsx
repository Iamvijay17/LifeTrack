import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react'
import { Reorder, useDragControls } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/form'
import { spring } from '@/components/motion/primitives'
import { COMMAND_WIDGETS, WIDGET_SIZES, commandOrder, isCustomized, moveWidget, widgetSize } from '@lifetrack/core/commandCenter'
import { isWidgetOn } from '@lifetrack/core/dashboard'
import { cn } from '@/lib/utils'

const BY_KEY = Object.fromEntries(COMMAND_WIDGETS.map((w) => [w.key, w]))
const SHORT = { sm: 'S', md: 'M', lg: 'L', full: 'Full' }

function SizePicker({ widget, value, onChange }) {
  if (widget.sizes.length < 2) return <span className="text-xs text-muted-foreground">Always full width</span>
  return (
    <div
      role="radiogroup"
      aria-label={`${widget.label} size`}
      className="inline-flex rounded-md border border-border bg-surface-2/70 p-0.5"
    >
      {WIDGET_SIZES.filter((s) => widget.sizes.includes(s.key)).map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={value === s.key}
          aria-label={`${widget.label}: ${s.label}`}
          title={s.label}
          onClick={() => onChange(s.key)}
          className={cn(
            'min-h-8 min-w-9 rounded-[5px] px-2 text-xs font-medium transition-colors md:min-h-7',
            value === s.key ? 'bg-mod text-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {SHORT[s.key]}
        </button>
      ))}
    </div>
  )
}

function Row({ id, prefs, index, count, onToggle, onResize, onMove, onDrop }) {
  const controls = useDragControls()
  const widget = BY_KEY[id]
  const on = isWidgetOn(prefs, id)
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      transition={spring.snappy}
      whileDrag={{ scale: 1.02, boxShadow: 'var(--shadow-overlay)' }}
      className="rounded-lg border border-border bg-card p-2.5"
      data-widget={id}
    >
      <div className="flex items-center gap-2">
        <span
          onPointerDown={(e) => controls.start(e)}
          className="-m-1 flex min-h-9 min-w-9 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted/60 active:cursor-grabbing"
          title="Drag to reorder"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className={cn('min-w-0 flex-1 truncate text-sm', !on && 'text-muted-foreground')}>{widget.label}</span>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => onMove(id, -1)}
            disabled={index === 0}
            aria-label={`Move ${widget.label} up`}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent md:h-8 md:w-8"
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMove(id, 1)}
            disabled={index === count - 1}
            aria-label={`Move ${widget.label} down`}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent md:h-8 md:w-8"
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <Switch checked={on} onChange={(v) => onToggle(id, v)} label={widget.label} />
      </div>
      {on && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-xs text-muted-foreground">
          <span>Size</span>
          <SizePicker widget={widget} value={widgetSize(prefs, id)} onChange={(size) => onResize?.(id, size)} />
        </div>
      )}
    </Reorder.Item>
  )
}

/**
 * Choose which widgets to show, how wide each is, and their order. Everything saves to the account (see useDashboardLayout), so it applies on
 * every device. Dragging only saves on drop; the arrows are for keyboards and touch screens.
 */
export function CustomizeDialog({ open, onOpenChange, prefs, onToggle, onReorder, onResize, onReset }) {
  const order = commandOrder(prefs)
  const [dragging, setDragging] = useState(null)
  const shown = dragging ?? order
  const dragged = useRef(null) // the order while a drag is under way; only written to the account on drop
  const customized = isCustomized(prefs)
  const swap = (next) => {
    dragged.current = next
    setDragging(next)
  }
  const drop = () => {
    if (dragged.current) onReorder?.(dragged.current)
    dragged.current = null
    setDragging(null)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Customize dashboard"
      description="Show, hide, resize and rearrange widgets. Saved to your account, so it applies on every device. Sizes apply on laptop screens and wider; phones and tablets show one column."
      className="md:max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onReset?.()} disabled={!customized}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Restore default layout
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </>
      }
    >
      <Reorder.Group axis="y" values={shown} onReorder={swap} className="space-y-2">
        {shown.map((key, i) => (
          <Row
            key={key}
            id={key}
            prefs={prefs}
            index={i}
            count={shown.length}
            onToggle={onToggle}
            onResize={onResize}
            onMove={(k, by) => onReorder?.(moveWidget(order, k, by))}
            onDrop={drop}
          />
        ))}
      </Reorder.Group>
    </Dialog>
  )
}
