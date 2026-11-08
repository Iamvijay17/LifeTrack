import { GripVertical } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/form'
import { Reorder } from 'motion/react'
import { spring } from '@/components/motion/primitives'
import { widgetOrder } from '@lifetrack/core/dashboard'
import { WIDGETS, isWidgetOn } from './widgets'

const LABEL = Object.fromEntries(WIDGETS.map((w) => [w.key, w.label]))

/** Turn dashboard widgets on or off and drag them into your own order. Saved to the account, so it applies on every device. */
export function CustomizeDialog({ open, onOpenChange, prefs, onToggle, onReorder }) {
  const order = widgetOrder(prefs)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Customize dashboard"
      description="Choose which widgets to show and drag to arrange them. Saved to your account, so it applies on every device."
    >
      <Reorder.Group axis="y" values={order} onReorder={(next) => onReorder?.(next)} className="space-y-1">
        {order.map((key) => (
          <Reorder.Item
            key={key}
            value={key}
            transition={spring.snappy}
            whileDrag={{ scale: 1.02, boxShadow: 'var(--shadow-overlay)' }}
            className="flex cursor-grab touch-pan-x items-center gap-2 rounded-md bg-card px-2 py-2 transition-colors hover:bg-muted/40 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">{LABEL[key]}</span>
            <Switch checked={isWidgetOn(prefs, key)} onChange={(v) => onToggle(key, v)} label={LABEL[key]} />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </Dialog>
  )
}
