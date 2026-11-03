import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { JOB_STATUSES, STATUS_LABEL } from '@/domain/jobs'
import { APPLICATION_SOURCES } from '@/domain/defaults'
import { optionalDay } from '@/lib/validation'
import { lpaToPaise, paiseToLpa, parseMoney } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z.object({
  company: z.string().trim().min(1, 'Company is required').max(120),
  job_title: z.string().trim().min(1, 'Job title is required').max(120),
  jd_url: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://'),
  location: z.string().max(120),
  salary_lpa: z.string().refine((v) => v.trim() === '' || parseMoney(v) !== null, 'Enter a number like 12 or 18.5'),
  applied_date: optionalDay,
  source: z.string().max(60),
  status: z.enum(JOB_STATUSES),
  contact_person: z.string().max(120),
  followup_date: optionalDay,
  resume_version: z.string().max(80),
  notes: z.string().max(4000),
})

const BLANK = {
  company: '',
  job_title: '',
  jd_url: '',
  location: '',
  salary_lpa: '',
  applied_date: '',
  source: '',
  status: 'interested',
  contact_person: '',
  followup_date: '',
  resume_version: '',
  notes: '',
}
const fromApplication = (a) => ({
  ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, a[k] ?? ''])),
  salary_lpa: a.salary_paise != null ? String(paiseToLpa(a.salary_paise)) : '',
})

/** Add or edit a job application. Moving a card to "applied" pre-fills today as the applied date. */
export function ApplicationDialog({ open, onOpenChange, app, today, defaultStatus = 'interested' }) {
  const blank = { ...BLANK, status: defaultStatus, applied_date: defaultStatus === 'applied' ? today : '' }
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({
    open,
    schema,
    recordKey: `${app?.id ?? 'new'}|${defaultStatus}`,
    valuesFor: () => (app ? fromApplication(app) : blank),
  })

  const [save, pending] = useAction(
    async (v) => {
      const { salary_lpa, ...rest } = v
      const row = {
        ...rest,
        applied_date: v.applied_date || null,
        followup_date: v.followup_date || null,
        salary_paise: salary_lpa.trim() ? lpaToPaise(salary_lpa) : null,
      }
      if (app) await store.update('job_applications', app.id, row)
      else await store.insert('job_applications', row)
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
