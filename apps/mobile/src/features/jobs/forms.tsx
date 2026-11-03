import { useEffect } from 'react'
import { JOB_STATUSES, STATUS_LABEL } from '@lifetrack/core/jobs'
import { APPLICATION_SOURCES } from '@lifetrack/constants/defaults'
import { applicationFormSchema, applicationToForm, applicationToPayload, blankApplication, blankInterview, interviewFormSchema, interviewToForm, interviewToPayload } from '@lifetrack/schemas'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, DateField, SelectField, TimeField } from '../../ui/controls'
import { Button, Field } from '../../ui'
import { View } from 'react-native'

const multiline = { multiline: true, numberOfLines: 3, style: { minHeight: 80, textAlignVertical: 'top' as const, paddingTop: 12 } }

export function ApplicationForm({ visible, app, defaultStatus, today, onClose }: { visible: boolean; app: any | null; defaultStatus: string; today: string; onClose: () => void }) {
  const initial = () => blankApplication(defaultStatus as any, today)
  const { values, errors, set, reset, validate } = useZodForm(applicationFormSchema, initial())
  useEffect(() => { if (visible) reset(app ? applicationToForm(app) : initial()) }, [visible, app?.id, defaultStatus]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = applicationToPayload(v)
    if (app) await store.update('job_applications', app.id, row); else await store.insert('job_applications', row)
    onClose()
  })
  return (
    <Sheet visible={visible} title={app ? 'Edit application' : 'Add job application'} onClose={onClose} footer={<Button title={app ? 'Save changes' : 'Add application'} onPress={save} loading={pending} />}>
      <Field label="Company" value={values.company} onChangeText={(t) => set('company', t)} error={errors.company} autoFocus={!app} maxLength={120} />
      <Field label="Job title" value={values.job_title} onChangeText={(t) => set('job_title', t)} error={errors.job_title} maxLength={120} />
      <SelectField label="Status" value={values.status} onChange={(v) => set('status', v as typeof values.status)} options={JOB_STATUSES.map((s: string) => ({ value: s, label: STATUS_LABEL[s as keyof typeof STATUS_LABEL] }))} />
      <DateField label="Applied on" value={values.applied_date} onChange={(v) => set('applied_date', v)} error={errors.applied_date} clearable />
      <Field label="Location" value={values.location} onChangeText={(t) => set('location', t)} maxLength={120} />
      <Field label="Package (LPA)" value={values.salary_lpa} onChangeText={(t) => set('salary_lpa', t)} error={errors.salary_lpa} keyboardType="decimal-pad" placeholder="e.g. 18" />
      <ChipGroup label="Source" value={values.source} options={[{ value: '', label: 'None' }, ...(APPLICATION_SOURCES as string[]).map((s) => ({ value: s, label: s }))]} onChange={(v) => set('source', v)} />
      <Field label="Resume version" value={values.resume_version} onChangeText={(t) => set('resume_version', t)} placeholder="e.g. v3-react" maxLength={80} />
      <Field label="Contact person" value={values.contact_person} onChangeText={(t) => set('contact_person', t)} maxLength={120} />
      <DateField label="Follow-up date" value={values.followup_date} onChange={(v) => set('followup_date', v)} error={errors.followup_date} clearable />
      <Field label="Job description URL" value={values.jd_url} onChangeText={(t) => set('jd_url', t)} error={errors.jd_url} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" />
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} {...multiline} />
    </Sheet>
  )
}

export function InterviewForm({ visible, event, applicationId, apps, tz, today, onClose }: { visible: boolean; event: any | null; applicationId: string | null; apps: any[]; tz: string; today: string; onClose: () => void }) {
  const initial = () => blankInterview(applicationId ?? apps[0]?.id ?? '', today)
  const { values, errors, set, reset, validate } = useZodForm(interviewFormSchema, initial())
  useEffect(() => { if (visible) reset(event ? interviewToForm(event, tz) : initial()) }, [visible, event?.id, applicationId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = interviewToPayload(v, tz)
    if (event) await store.update('interview_events', event.id, row); else await store.insert('interview_events', row)
    onClose()
  })
  return (
    <Sheet visible={visible} title={event ? 'Edit interview' : 'Schedule interview'} onClose={onClose} footer={<Button title={event ? 'Save changes' : 'Schedule'} onPress={save} loading={pending} />}>
      {applicationId ? null : <SelectField label="Application" value={values.application_id} onChange={(v) => set('application_id', v)} options={apps.map((a) => ({ value: a.id, label: `${a.company} — ${a.job_title}` }))} placeholder="Select…" error={errors.application_id} />}
      <Field label="Round" value={values.round_name} onChangeText={(t) => set('round_name', t)} error={errors.round_name} maxLength={80} />
      <ChipGroup label="Mode" value={values.mode} options={[{ value: 'video', label: 'Video' }, { value: 'phone', label: 'Phone' }, { value: 'onsite', label: 'On-site' }, { value: 'other', label: 'Other' }]} onChange={(v) => set('mode', v)} />
      <DateField label="Date" value={values.date} onChange={(v) => set('date', v)} error={errors.date} />
      <View style={{ flexDirection: 'row' }}><TimeField label={`Time (${tz})`} value={values.time} onChange={(v) => set('time', v)} error={errors.time} /></View>
      <Field label="Meeting link / address" value={values.link} onChangeText={(t) => set('link', t)} autoCapitalize="none" maxLength={500} />
      {event ? <ChipGroup label="Status" value={values.status} options={[{ value: 'scheduled', label: 'Scheduled' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]} onChange={(v) => set('status', v)} /> : null}
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} {...multiline} />
    </Sheet>
  )
}
