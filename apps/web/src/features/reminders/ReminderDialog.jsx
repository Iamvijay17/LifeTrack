import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { blankReminder, reminderFormSchema, reminderToForm, reminderToPayload } from '@lifetrack/schemas'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { REMINDER_KINDS, REPEATS } from '@lifetrack/core/reminders'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { fireDueReminders } from '@/services/api'
import { timeStrInTz, todayStr } from '@/lib/dates'

const schema = reminderFormSchema

export function ReminderDialog({ open, onOpenChange, reminder, today }) {
  const { settings } = useSettings()
  const blank = blankReminder(today)
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => { if (open) reset(reminder ? reminderToForm(reminder) : { ...blank, remind_date: today }) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [open, reminder?.id])
  const [save, pending] = useAction(async (v) => {
    // Editing re-arms the reminder: clear "already fired" and make it active again.
    const row = reminderToPayload(v)
    if (reminder) await store.update('reminders', reminder.id, row); else await store.insert('reminders', row)
    onOpenChange(false)
    // a reminder that is already due should notify right away, not on the next minute tick
    await fireDueReminders(todayStr(settings.timezone), timeStrInTz(new Date(), settings.timezone), settings.notification_prefs).catch(() => {})
  }, { success: reminder ? 'Reminder updated' : 'Reminder set' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={reminder ? 'Edit reminder' : 'New reminder'} pending={pending} onSubmit={handleSubmit(save)} submitLabel={reminder ? 'Save changes' : 'Set reminder'}>
      <Field label="Remind me to" error={errors.title?.message}><Input autoFocus placeholder="e.g. Pay electricity bill" {...register('title')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><Select {...register('kind')}>{REMINDER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
        <Field label="Repeat"><Select {...register('repeat')}>{REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
        <Field label="Date" error={errors.remind_date?.message}><Input type="date" {...register('remind_date')} /></Field>
        <Field label="Time" error={errors.remind_time?.message}><Input type="time" {...register('remind_time')} /></Field>
      </div>
    </FormDialog>
  )
}
