import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { applicationFormSchema, applicationToForm, applicationToPayload, blankApplication, blankInterview, interviewFormSchema, interviewToForm, interviewToPayload } from '@lifetrack/schemas'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { JOB_STATUSES, STATUS_LABEL } from '@lifetrack/core/jobs'
import { APPLICATION_SOURCES } from '@lifetrack/constants/defaults'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'

export function ApplicationDialog({ open, onOpenChange, app, today, defaultStatus = 'interested', onSaved }) {
  const schema = applicationFormSchema
  const blank = blankApplication(defaultStatus, today)
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(app ? applicationToForm(app) : blankApplication(defaultStatus, today))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, app?.id, defaultStatus])
  const [save, pending] = useAction(async (v) => {
    const row = applicationToPayload(v)
    const saved = app ? await store.update('job_applications', app.id, row) : await store.insert('job_applications', row)
    onSaved?.(saved)
    onOpenChange(false)
  }, { success: app ? 'Application updated' : 'Application added' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={app ? 'Edit application' : 'Add job application'} pending={pending} onSubmit={handleSubmit(save)}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company" error={errors.company?.message}><Input autoFocus {...register('company')} /></Field>
        <Field label="Job title" error={errors.job_title?.message}><Input {...register('job_title')} /></Field>
        <Field label="Status"><Select {...register('status')}>{JOB_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select></Field>
        <Field label="Applied on" error={errors.applied_date?.message}><Input type="date" {...register('applied_date')} /></Field>
        <Field label="Location"><Input {...register('location')} /></Field>
        <Field label="Package (LPA)" error={errors.salary_lpa?.message}><Input inputMode="decimal" placeholder="e.g. 18" {...register('salary_lpa')} /></Field>
        <Field label="Source"><Input list="job-sources" {...register('source')} /><datalist id="job-sources">{APPLICATION_SOURCES.map((s) => <option key={s} value={s} />)}</datalist></Field>
        <Field label="Resume version"><Input placeholder="e.g. v3-react" {...register('resume_version')} /></Field>
        <Field label="Contact person"><Input {...register('contact_person')} /></Field>
        <Field label="Follow-up date" error={errors.followup_date?.message}><Input type="date" {...register('followup_date')} /></Field>
      </div>
      <Field label="Job description URL" error={errors.jd_url?.message}><Input type="url" inputMode="url" placeholder="https://" {...register('jd_url')} /></Field>
      <Field label="Notes"><Textarea {...register('notes')} /></Field>
    </FormDialog>
  )
}

export function InterviewDialog({ open, onOpenChange, event, applicationId, apps, tz, today }) {
  const schema = interviewFormSchema
  const blank = blankInterview(applicationId ?? '', today)
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(event ? interviewToForm(event, tz) : { ...blank, application_id: applicationId ?? apps[0]?.id ?? '' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, applicationId])
  const [save, pending] = useAction(async (v) => {
    const row = interviewToPayload(v, tz)
    if (event) await store.update('interview_events', event.id, row); else await store.insert('interview_events', row)
    onOpenChange(false)
  }, { success: event ? 'Interview updated' : 'Interview scheduled' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={event ? 'Edit interview' : 'Schedule interview'} pending={pending} onSubmit={handleSubmit(save)}>
      <Field label="Application" error={errors.application_id?.message}><Select {...register('application_id')} disabled={!!applicationId}><option value="">Select…</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.company} — {a.job_title}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Round" error={errors.round_name?.message}><Input {...register('round_name')} /></Field>
        <Field label="Mode"><Select {...register('mode')}><option value="video">Video</option><option value="phone">Phone</option><option value="onsite">On-site</option><option value="other">Other</option></Select></Field>
        <Field label="Date" error={errors.date?.message}><Input type="date" {...register('date')} /></Field>
        <Field label="Time (IST)" error={errors.time?.message}><Input type="time" {...register('time')} /></Field>
      </div>
      <Field label="Meeting link / address"><Input {...register('link')} /></Field>
      {event && <Field label="Status"><Select {...register('status')}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field>}
      <Field label="Notes"><Textarea {...register('notes')} /></Field>
    </FormDialog>
  )
}
