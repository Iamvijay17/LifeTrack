import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Textarea } from '@/components/ui/form'
import { parseTarget, targetValue } from '@/domain/learning'
import { requiredDay } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'
import { TargetSelect } from './TargetSelect'

/** Log or edit a manual study session. */
export function SessionDialog({ open, onOpenChange, session, goals, topics, today }) {
  const schema = z
    .object({
      target: z.string(),
      session_date: requiredDay().refine((v) => v <= today, "You can't log study time in the future"),
      minutes: z.coerce.number({ invalid_type_error: 'Enter minutes' }).min(0).max(1440, 'Max 24h per entry'),
      problems_solved: z.coerce.number().int().min(0),
      notes: z.string().max(1000),
    })
    .refine((v) => v.minutes > 0 || v.problems_solved > 0, { path: ['minutes'], message: 'Enter minutes studied or problems solved' })

  const blank = { target: '', session_date: today, minutes: '', problems_solved: 0, notes: '' }
  const fromSession = (s) => ({
    target: targetValue(s),
    session_date: s.session_date,
    minutes: Math.round((s.duration_seconds ?? 0) / 60),
    problems_solved: s.problems_solved,
    notes: s.notes ?? '',
  })
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: session?.id, valuesFor: () => (session ? fromSession(session) : blank) })

  const [save, pending] = useAction(
    async (v) => {
      const row = {
        ...parseTarget(v.target, goals),
        session_date: v.session_date,
        duration_seconds: Math.round(v.minutes * 60),
        problems_solved: v.problems_solved,
        notes: v.notes,
        status: 'completed',
        source: 'manual',
      }
      if (session) {
        delete row.source // an edited timer session stays a timer session
        await store.update('study_sessions', session.id, row)
      } else {
        const now = new Date().toISOString()
        await store.insert('study_sessions', { ...row, started_at: now, ended_at: now })
      }
      onOpenChange(false)
    },
    { success: session ? 'Session updated' : 'Session logged' },
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={session ? 'Edit session' : 'Log a study session'}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <Field label="Studied">
        <TargetSelect goals={goals} topics={topics} value={watch('target')} onChange={(v) => setValue('target', v)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.session_date?.message}>
          <Input type="date" max={today} {...register('session_date')} />
        </Field>
        <Field label="Minutes" error={errors.minutes?.message}>
          <Input type="number" min={0} inputMode="numeric" {...register('minutes')} />
        </Field>
      </div>
      <Field label="DSA problems solved" error={errors.problems_solved?.message}>
        <Input type="number" min={0} inputMode="numeric" {...register('problems_solved')} />
      </Field>
      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>
    </FormDialog>
  )
}
