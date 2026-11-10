import { z } from 'zod'
import { Bell } from 'lucide-react'
import { ALERT_CHOICES } from '@/domain/calendar'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Select, Switch } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import { useBrowserNotifications } from './useCalendarAlerts'

const schema = z.object({
  time_format: z.enum(['12h', '24h']),
  week_starts_on: z.coerce.number().refine((n) => n === 0 || n === 1),
  default_view: z.enum(['', 'day', 'week', 'month', 'agenda']),
  default_duration: z.coerce.number().int().min(15).max(480),
  default_alert: z.string(),
  show_weekends: z.boolean(),
})
const DURATIONS = [15, 30, 45, 60, 90, 120, 180]

/** Time format, week start, default view, default length and alert, weekends, and whether to also use browser notifications. */
export function SettingsDialog({ open, onOpenChange, prefs, update }) {
  const form = useDialogForm({
    open,
    schema,
    recordKey: 'calendar-settings',
    valuesFor: () => ({
      time_format: prefs.time_format,
      week_starts_on: String(prefs.week_starts_on),
      default_view: prefs.default_view ?? '',
      default_duration: String(prefs.default_duration),
      default_alert: prefs.default_alert == null ? '' : String(prefs.default_alert),
      show_weekends: prefs.show_weekends,
    }),
  })
  const { register, handleSubmit, watch, setValue, formState } = form
  const v = watch()
  const browser = useBrowserNotifications()
  const [save, pending] = useAction(
    async (values) => {
      await update({
        time_format: values.time_format,
        week_starts_on: values.week_starts_on,
        default_view: values.default_view || null,
        default_duration: values.default_duration,
        default_alert: values.default_alert === '' ? null : Number(values.default_alert),
        show_weekends: values.show_weekends,
      })
      onOpenChange(false)
    },
    { success: 'Calendar settings saved' },
  )
  const turnOn = async () => {
    const result = await browser.request()
    if (result === 'granted') await update({ browser_notifications: true })
  }
  const on = prefs.browser_notifications && browser.permission === 'granted'
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Calendar settings"
      pending={pending}
      onSubmit={handleSubmit(save)}
      submitLabel="Save settings"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Time format">
          <Select {...register('time_format')}>
            <option value="12h">12-hour (9:30 AM)</option>
            <option value="24h">24-hour (09:30)</option>
          </Select>
        </Field>
        <Field label="Week starts on" hint="Also used by the rest of LifeTrack.">
          <Select {...register('week_starts_on')}>
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </Select>
        </Field>
        <Field label="Opens on">
          <Select {...register('default_view')}>
            <option value="">Week on a computer, Day on a phone</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="agenda">Agenda</option>
          </Select>
        </Field>
        <Field label="New items last">
          <Select {...register('default_duration')}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} minutes` : d % 60 === 0 ? `${d / 60} hour${d === 60 ? '' : 's'}` : `${Math.floor(d / 60)} h ${d % 60} min`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Default alert" hint="Added to every new event and task.">
          <Select {...register('default_alert')}>
            <option value="">None</option>
            {ALERT_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
        <span className="text-sm font-medium">Show Saturday and Sunday</span>
        <Switch
          checked={v.show_weekends}
          label="Show Saturday and Sunday"
          onChange={(on) => setValue('show_weekends', on, { shouldDirty: true })}
        />
      </div>
      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />
          Browser notifications
        </div>
        <p className="text-xs text-muted-foreground" data-testid="browser-notify-status">
          {!browser.supported
            ? 'This browser does not support notifications. Alerts still appear in your notification bell.'
            : browser.permission === 'denied'
              ? 'Notifications are blocked for this site. Allow them in your browser’s site settings to turn this on. Alerts still appear in your notification bell.'
              : on
                ? 'On. You will also get a system notification when an alert fires while LifeTrack is open.'
                : 'Off. Alerts appear in your notification bell. Turn this on to also get a system notification.'}
        </p>
        {browser.supported &&
          browser.permission !== 'denied' &&
          (on ? (
            <Button variant="outline" size="sm" onClick={() => update({ browser_notifications: false })}>
              Turn off
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={turnOn}>
              Turn on browser notifications
            </Button>
          ))}
      </div>
      {formState.errors.root && <p role="alert">{formState.errors.root.message}</p>}
    </FormDialog>
  )
}
