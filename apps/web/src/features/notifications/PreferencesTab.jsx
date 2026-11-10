import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/form'
import { REMINDER_KINDS, isKindEnabled } from '@/domain/reminders'

/** One switch per reminder kind; an off kind creates no notifications on any device. */
export function PreferencesTab({ prefs, onChange }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-2">
        <p className="px-3 pb-1 pt-2 text-sm text-muted-foreground">
          Choose which kinds of reminders create notifications. Turning a type off silences it everywhere.
        </p>
        {REMINDER_KINDS.map((k) => (
          <div key={k.value} className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-muted/40">
            <span className="text-sm">{k.label} reminders</span>
            <Switch checked={isKindEnabled(prefs, k.value)} onChange={(v) => onChange(k.value, v)} label={`${k.label} reminders`} />
          </div>
        ))}
        <div className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-muted/40">
          <span className="text-sm">Calendar event and task alerts</span>
          <Switch checked={isKindEnabled(prefs, 'event')} onChange={(v) => onChange('event', v)} label="Calendar event and task alerts" />
        </div>
      </CardContent>
    </Card>
  )
}
