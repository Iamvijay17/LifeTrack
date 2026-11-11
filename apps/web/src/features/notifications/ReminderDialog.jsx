import { z } from 'zod'
import { useWatch } from 'react-hook-form'
import { zonedToMs } from '@lifetrack/utils'
import { PRIORITIES } from '@lifetrack/core/notifications'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { REMINDER_KINDS, REPEATS } from '@/domain/reminders'
import { requiredDay } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { fireDueReminders } from '@/services/api'
import { timeStrInTz, todayStr } from '@/lib/dates'

const schema = z.object({
  kind: z.enum(['task', 'study', 'workout', 'habit', 'bill', 'custom']),
  title: z.string().trim().min(1, 'What should we remind you about?').max(160, 'Keep it under 160 characters'),
  remind_date: requiredDay(),
  remind_time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
  repeat: z.enum(REPEATS.map((r) => r.value)),
  priority: z.enum(PRIORITIES.map((p) => p.value)),
  body: z.string().trim().max(500, 'Keep the note under 500 characters'),
})

export function ReminderDialog({ open, onOpenChange, reminder, today }) {
  const { settings } = useSettings()
  const tz = settings.timezone
  const blank = { kind: 'custom', title: '', remind_date: today, remind_time: '09:00', repeat: 'none', priority: 'normal', body: '' }
  const fromReminder = (r) => ({
    kind: r.kind,
    title: r.title,
    remind_date: r.remind_date,
    remind_time: r.remind_time.slice(0, 5),
    repeat: r.repeat,
    priority: r.priority ?? 'normal',
    body: r.body ?? '',
  })
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: reminder?.id, valuesFor: () => (reminder ? fromReminder(reminder) : blank) })
  const [date, time] = useWatch({ control, name: ['remind_date', 'remind_time'] })
  // A time that has already gone is allowed (it notifies at once), but say so rather than let it look like a mistake later.
  const passed = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && /^\d{2}:\d{2}$/.test(time ?? '') && zonedToMs(date, time, tz) < Date.now()
  const [save, pending] = useAction(
    async (v) => {
      // Editing re-arms the reminder: clear "already fired" and make it active again.
      const row = { ...v, title: v.title.trim(), body: v.body.trim(), active: true, last_fired_on: null }
      if (reminder) await store.update('reminders', reminder.id, row)
      else await store.insert('reminders', row)
      onOpenChange(false)
      // a reminder that is already due should notify right away, not on the next minute tick
      await fireDueReminders(todayStr(tz), timeStrInTz(new Date(), tz), settings.notification_prefs, { tz }).catch(() => {})
    },
    { success: reminder ? 'Reminder updated' : 'Reminder set' },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={reminder ? 'Edit reminder' : 'New reminder'}
      pending={pending}
      onSubmit={handleSubmit(save)}
      submitLabel={reminder ? 'Save changes' : 'Set reminder'}
    >
      <Field label="Remind me to" error={errors.title?.message}>
        <Input autoFocus placeholder="e.g. Pay electricity bill" {...register('title')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select {...register('kind')}>
            {REMINDER_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" hint="Urgent breaks through quiet hours">
          <Select {...register('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" error={errors.remind_date?.message}>
          <Input type="date" {...register('remind_date')} />
        </Field>
        <Field label="Time" error={errors.remind_time?.message}>
          <Input type="time" {...register('remind_time')} />
        </Field>
        <Field label="Repeat" className="col-span-2">
          <Select {...register('repeat')}>
            {REPEATS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {passed && <p className="text-xs text-warning">That time has already passed, so you’ll be notified right away.</p>}
      <Field label="Note (optional)" error={errors.body?.message}>
        <Textarea rows={2} maxLength={500} placeholder="Anything you want to see with the reminder" {...register('body')} />
      </Field>
    </FormDialog>
  )
}
