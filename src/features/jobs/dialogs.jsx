import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { JOB_STATUSES, STATUS_LABEL } from '@/domain/jobs'
import { APPLICATION_SOURCES } from '@/domain/defaults'
import { isValidDay, zonedToIso, dateStrInTz, timeStrInTz } from '@/lib/dates'
import { lpaToPaise, paiseToLpa, parseMoney } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'

const day = z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date')

export function ApplicationDialog({ open, onOpenChange, app, today, defaultStatus = 'interested', onSaved }) {
  const schema = z.object({
    company: z.string().trim().min(1, 'Company is required').max(120),
    job_title: z.string().trim().min(1, 'Job title is required').max(120),
    jd_url: z
      .string()
      .trim()
      .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://'),
    location: z.string().max(120),
    salary_lpa: z.string().refine((v) => v.trim() === '' || parseMoney(v) !== null, 'Enter a number like 12 or 18.5'),
    applied_date: day,
    source: z.string().max(60),
    status: z.enum(JOB_STATUSES),
    contact_person: z.string().max(120),
    followup_date: day,
    resume_version: z.string().max(80),
    notes: z.string().max(4000),
  })
  const blank = {
    company: '',
    job_title: '',
    jd_url: '',
    location: '',
    salary_lpa: '',
    applied_date: '',
    source: '',
    status: defaultStatus,
    contact_person: '',
    followup_date: '',
    resume_version: '',
    notes: '',
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(
      app
        ? {
            ...blank,
            ...Object.fromEntries(Object.keys(blank).map((k) => [k, app[k] ?? ''])),
            salary_lpa: app.salary_paise != null ? String(paiseToLpa(app.salary_paise)) : '',
          }
        : { ...blank, status: defaultStatus, applied_date: defaultStatus === 'applied' ? today : '' },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, app?.id, defaultStatus])
  const [save, pending] = useAction(
    async (v) => {
      const { salary_lpa, ...rest } = v
      const row = {
        ...rest,
        applied_date: v.applied_date || null,
        followup_date: v.followup_date || null,
        salary_paise: salary_lpa.trim() ? lpaToPaise(salary_lpa) : null,
      }
      const saved = app ? await store.update('job_applications', app.id, row) : await store.insert('job_applications', row)
      onSaved?.(saved)
      onOpenChange(false)
    },
    { success: app ? 'Application updated' : 'Application added' },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={app ? 'Edit application' : 'Add job application'}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company" error={errors.company?.message}>
          <Input autoFocus {...register('company')} />
        </Field>
        <Field label="Job title" error={errors.job_title?.message}>
          <Input {...register('job_title')} />
        </Field>
        <Field label="Status">
          <Select {...register('status')}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Applied on" error={errors.applied_date?.message}>
          <Input type="date" {...register('applied_date')} />
        </Field>
        <Field label="Location">
          <Input {...register('location')} />
        </Field>
        <Field label="Package (LPA)" error={errors.salary_lpa?.message}>
          <Input inputMode="decimal" placeholder="e.g. 18" {...register('salary_lpa')} />
        </Field>
        <Field label="Source">
          <Input list="job-sources" {...register('source')} />
          <datalist id="job-sources">
            {APPLICATION_SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Resume version">
          <Input placeholder="e.g. v3-react" {...register('resume_version')} />
        </Field>
        <Field label="Contact person">
          <Input {...register('contact_person')} />
        </Field>
        <Field label="Follow-up date" error={errors.followup_date?.message}>
          <Input type="date" {...register('followup_date')} />
        </Field>
      </div>
      <Field label="Job description URL" error={errors.jd_url?.message}>
        <Input type="url" inputMode="url" placeholder="https://" {...register('jd_url')} />
      </Field>
      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>
    </FormDialog>
  )
}

export function InterviewDialog({ open, onOpenChange, event, applicationId, apps, tz, today }) {
  const schema = z.object({
    application_id: z.string().min(1, 'Choose an application'),
    round_name: z.string().trim().min(1, 'Name the round').max(80),
    date: z.string().refine(isValidDay, 'Pick a date'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
    mode: z.enum(['video', 'phone', 'onsite', 'other']),
    link: z.string().max(500),
    status: z.enum(['scheduled', 'completed', 'cancelled']),
    notes: z.string().max(2000),
  })
  const blank = {
    application_id: applicationId ?? '',
    round_name: 'Technical round',
    date: today,
    time: '11:00',
    mode: 'video',
    link: '',
    status: 'scheduled',
    notes: '',
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(
      event
        ? {
            application_id: event.application_id,
            round_name: event.round_name,
            date: dateStrInTz(event.scheduled_at, tz),
            time: timeStrInTz(event.scheduled_at, tz),
            mode: event.mode,
            link: event.link ?? '',
            status: event.status,
            notes: event.notes ?? '',
          }
        : { ...blank, application_id: applicationId ?? apps[0]?.id ?? '' },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, applicationId])
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
        <Field label="Time (IST)" error={errors.time?.message}>
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
