import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { requiredDay } from '@/lib/validation'
import { zonedToIso, dateStrInTz, timeStrInTz } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z.object({
  application_id: z.string().min(1, 'Choose an application'),
  round_name: z.string().trim().min(1, 'Name the round').max(80),
  date: requiredDay(),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
  mode: z.enum(['video', 'phone', 'onsite', 'other']),
  link: z.string().max(500),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
  notes: z.string().max(2000),
})

/** Schedule or edit an interview. Date and time are entered in the user's timezone `tz` and stored as an instant. */
export function InterviewDialog({ open, onOpenChange, event, applicationId, apps, tz, today }) {
  const blank = {
    application_id: applicationId ?? apps[0]?.id ?? '',
    round_name: 'Technical round',
    date: today,
    time: '11:00',
    mode: 'video',
    link: '',
    status: 'scheduled',
    notes: '',
  }
  const fromEvent = (e) => ({
    application_id: e.application_id,
    round_name: e.round_name,
    date: dateStrInTz(e.scheduled_at, tz),
    time: timeStrInTz(e.scheduled_at, tz),
    mode: e.mode,
    link: e.link ?? '',
    status: e.status,
    notes: e.notes ?? '',
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({
    open,
    schema,
    recordKey: `${event?.id ?? 'new'}|${applicationId ?? ''}`,
    valuesFor: () => (event ? fromEvent(event) : blank),
  })

  const [save, pending] = useAction(
    async (v) => {
      const { date, time, ...rest } = v
      const row = { ...rest, scheduled_at: zonedToIso(date, time, tz) }
      if (event) await store.update('interview_events', event.id, row)
      else await store.insert('interview_events', row)
      onOpenChange(false)
    },
    { success: event ? 'Interview updated' : 'Interview scheduled' },
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={event ? 'Edit interview' : 'Schedule interview'}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <Field label="Application" error={errors.application_id?.message}>
        <Select {...register('application_id')} disabled={!!applicationId}>
          <option value="">Select…</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.company} — {a.job_title}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Round" error={errors.round_name?.message}>
          <Input {...register('round_name')} />
        </Field>
        <Field label="Mode">
          <Select {...register('mode')}>
            <option value="video">Video</option>
            <option value="phone">Phone</option>
            <option value="onsite">On-site</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Date" error={errors.date?.message}>
          <Input type="date" {...register('date')} />
        </Field>
        <Field label={`Time (${tz})`} error={errors.time?.message}>
          <Input type="time" {...register('time')} />
        </Field>
      </div>
      <Field label="Meeting link / address">
        <Input {...register('link')} />
      </Field>
      {event && (
        <Field label="Status">
          <Select {...register('status')}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
      )}
      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>
    </FormDialog>
  )
}
