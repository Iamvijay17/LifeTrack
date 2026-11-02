import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { TargetSelect, parseTarget } from './StudyTimer'
import { TOPIC_GROUPS } from '@/domain/defaults'
import { isValidDay } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'

const day = z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date')

// ------------------------------------------------------------- manual session
export function SessionDialog({ open, onOpenChange, session, goals, topics, today }) {
  const schema = z
    .object({
      target: z.string(),
      session_date: z
        .string()
        .refine(isValidDay, 'Pick a date')
        .refine((v) => v <= today, "You can't log study time in the future"),
      minutes: z.coerce.number({ invalid_type_error: 'Enter minutes' }).min(0).max(1440, 'Max 24h per entry'),
      problems_solved: z.coerce.number().int().min(0),
      notes: z.string().max(1000),
    })
    .refine((v) => v.minutes > 0 || v.problems_solved > 0, { path: ['minutes'], message: 'Enter minutes studied or problems solved' })
  const blank = { target: '', session_date: today, minutes: '', problems_solved: 0, notes: '' }
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(
      session
        ? {
            target: session.goal_id ? `g:${session.goal_id}` : session.topic_id ? `t:${session.topic_id}` : '',
            session_date: session.session_date,
            minutes: Math.round((session.duration_seconds ?? 0) / 60),
            problems_solved: session.problems_solved,
            notes: session.notes ?? '',
          }
        : { ...blank, session_date: today },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.id])
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
        delete row.source
        await store.update('study_sessions', session.id, row)
      } else await store.insert('study_sessions', { ...row, started_at: new Date().toISOString(), ended_at: new Date().toISOString() })
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

// ----------------------------------------------------------------------- goal
export function GoalDialog({ open, onOpenChange, goal, topics }) {
  const schema = z.object({
    title: z.string().trim().min(1, 'Name the goal').max(120),
    topic_id: z.string(),
    target_hours: z.coerce.number({ invalid_type_error: 'Enter hours' }).min(0).max(5000),
    due_date: day,
    status: z.enum(['active', 'completed', 'archived']),
    notes: z.string().max(1000),
  })
  const blank = { title: '', topic_id: '', target_hours: 20, due_date: '', status: 'active', notes: '' }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(
    () => {
      if (open)
        reset(
          goal
            ? {
                title: goal.title,
                topic_id: goal.topic_id ?? '',
                target_hours: goal.target_minutes / 60,
                due_date: goal.due_date ?? '',
                status: goal.status,
                notes: goal.notes ?? '',
              }
            : blank,
        )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, goal?.id],
  )
  const [save, pending] = useAction(
    async (v) => {
      const topic = topics.find((t) => t.id === v.topic_id)
      const row = {
        title: v.title,
        topic_id: v.topic_id || null,
        category: topic?.group_name ?? 'Learning',
        target_minutes: Math.round(v.target_hours * 60),
        due_date: v.due_date || null,
        status: v.status,
        notes: v.notes,
      }
      if (goal) await store.update('goals', goal.id, row)
      else await store.insert('goals', row)
      onOpenChange(false)
    },
    { success: goal ? 'Goal updated' : 'Goal created' },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? 'Edit goal' : 'New learning goal'}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <Field label="Goal" error={errors.title?.message}>
        <Input autoFocus placeholder="e.g. Finish React fundamentals" {...register('title')} />
      </Field>
      <Field label="Related topic (optional)">
        <Select {...register('topic_id')}>
          <option value="">—</option>
          {[...new Set(topics.map((t) => t.group_name))].map((g) => (
            <optgroup key={g} label={g}>
              {topics
                .filter((t) => t.group_name === g)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target hours" error={errors.target_hours?.message}>
          <Input type="number" step="0.5" min={0} inputMode="decimal" {...register('target_hours')} />
        </Field>
        <Field label="Due date" error={errors.due_date?.message}>
          <Input type="date" {...register('due_date')} />
        </Field>
      </div>
      {goal && (
        <Field label="Status">
          <Select {...register('status')}>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      )}
      <Field label="Notes">
        <Textarea {...register('notes')} />
      </Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------- topic
export function TopicDialog({ open, onOpenChange, topic, groups = TOPIC_GROUPS, today }) {
  const schema = z.object({
    group_name: z.string().trim().min(1, 'Pick a category'),
    name: z.string().trim().min(1, 'Name the topic').max(80),
    notes: z.string().max(5000),
    revision_dates: z.string(),
  })
  const blank = { group_name: groups[0] ?? 'Frontend', name: '', notes: '', revision_dates: '' }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(
    () => {
      if (open)
        reset(
          topic
            ? {
                group_name: topic.group_name,
                name: topic.name,
                notes: topic.notes ?? '',
                revision_dates: (topic.revision_dates ?? []).join(', '),
              }
            : blank,
        )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, topic?.id],
  )
  const [save, pending] = useAction(
    async (v) => {
      const dates = v.revision_dates.split(/[\s,]+/).filter(Boolean)
      const bad = dates.find((d) => !isValidDay(d))
      if (bad) throw new Error(`"${bad}" isn't a valid date. Use YYYY-MM-DD, separated by commas.`)
      const row = { group_name: v.group_name, name: v.name, notes: v.notes, revision_dates: [...new Set(dates)].sort() }
      if (topic) await store.update('learning_topics', topic.id, row)
      else await store.insert('learning_topics', row)
      onOpenChange(false)
    },
    { success: 'Topic saved' },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={topic ? `Edit ${topic.name}` : 'New topic'}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={errors.group_name?.message}>
          <Input list="topic-groups" {...register('group_name')} />
          <datalist id="topic-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field label="Topic" error={errors.name?.message}>
          <Input {...register('name')} />
        </Field>
      </div>
      <Field label="Revision dates" hint={`YYYY-MM-DD, comma separated. e.g. ${today}`} error={errors.revision_dates?.message}>
        <Input {...register('revision_dates')} placeholder={today} />
      </Field>
      <Field label="Notes">
        <Textarea rows={6} {...register('notes')} />
      </Field>
    </FormDialog>
  )
}
