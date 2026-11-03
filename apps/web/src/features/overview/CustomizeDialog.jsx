import { Dialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/form'
import { WIDGETS, isWidgetOn } from './widgets'

/** Turn dashboard widgets on or off. The choice is saved to the account, so it applies on every device. */
export function CustomizeDialog({ open, onOpenChange, prefs, onToggle }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Customize dashboard"
      description="Choose which widgets to show. Saved to your account, so it applies on every device."
    >
      <ul className="space-y-1">
        {WIDGETS.map((w) => (
          <li key={w.key} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/40">
            <span className="text-sm">{w.label}</span>
            <Switch checked={isWidgetOn(prefs, w.key)} onChange={(v) => onToggle(w.key, v)} label={w.label} />
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
