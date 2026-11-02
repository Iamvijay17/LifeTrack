import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { blankLearningGoal, blankSession, blankTopic, learningGoalFormSchema, learningGoalToForm, learningGoalToPayload, sessionFormSchema, sessionFormToPayload, sessionToForm, topicFormSchema, topicToForm, topicToPayload } from '@lifetrack/schemas'
import { parseRevisionDates } from '@lifetrack/core/learning'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { TargetSelect, parseTarget } from './StudyTimer'
import { TOPIC_GROUPS } from '@lifetrack/constants/defaults'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'

// ------------------------------------------------------------- manual session
export function SessionDialog({ open, onOpenChange, session, goals, topics, today }) {
  const schema = sessionFormSchema(today)
  const blank = blankSession(today)
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(session ? sessionToForm(session) : { ...blank, session_date: today })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.id])
  const [save, pending] = useAction(async (v) => {
    const row = sessionFormToPayload(v, parseTarget(v.target, goals), !!session)
    if (session) await store.update('study_sessions', session.id, row)
    else await store.insert('study_sessions', row)
    onOpenChange(false)
  }, { success: session ? 'Session updated' : 'Session logged' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={session ? 'Edit session' : 'Log a study session'} pending={pending} onSubmit={handleSubmit(save)}>
      <Field label="Studied"><TargetSelect goals={goals} topics={topics} value={watch('target')} onChange={(v) => setValue('target', v)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.session_date?.message}><Input type="date" max={today} {...register('session_date')} /></Field>
        <Field label="Minutes" error={errors.minutes?.message}><Input type="number" min={0} inputMode="numeric" {...register('minutes')} /></Field>
      </div>
      <Field label="DSA problems solved" error={errors.problems_solved?.message}><Input type="number" min={0} inputMode="numeric" {...register('problems_solved')} /></Field>
      <Field label="Notes"><Textarea {...register('notes')} /></Field>
    </FormDialog>
  )
}

// ----------------------------------------------------------------------- goal
export function GoalDialog({ open, onOpenChange, goal, topics }) {
  const schema = learningGoalFormSchema
  const blank = blankLearningGoal()
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => { if (open) reset(goal ? learningGoalToForm(goal) : blank) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [open, goal?.id])
  const [save, pending] = useAction(async (v) => {
    const row = learningGoalToPayload(v, topics)
    if (goal) await store.update('goals', goal.id, row); else await store.insert('goals', row)
    onOpenChange(false)
  }, { success: goal ? 'Goal updated' : 'Goal created' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={goal ? 'Edit goal' : 'New learning goal'} pending={pending} onSubmit={handleSubmit(save)}>
      <Field label="Goal" error={errors.title?.message}><Input autoFocus placeholder="e.g. Finish React fundamentals" {...register('title')} /></Field>
      <Field label="Related topic (optional)"><Select {...register('topic_id')}><option value="">—</option>{[...new Set(topics.map((t) => t.group_name))].map((g) => <optgroup key={g} label={g}>{topics.filter((t) => t.group_name === g).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}</Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target hours" error={errors.target_hours?.message}><Input type="number" step="0.5" min={0} inputMode="decimal" {...register('target_hours')} /></Field>
        <Field label="Due date" error={errors.due_date?.message}><Input type="date" {...register('due_date')} /></Field>
      </div>
      {goal && <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></Select></Field>}
      <Field label="Notes"><Textarea {...register('notes')} /></Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------- topic
export function TopicDialog({ open, onOpenChange, topic, groups = TOPIC_GROUPS, today }) {
  const schema = topicFormSchema
  const blank = blankTopic(groups[0] ?? 'Frontend')
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => { if (open) reset(topic ? topicToForm(topic) : blank) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [open, topic?.id])
  const [save, pending] = useAction(async (v) => {
    const row = topicToPayload(v, parseRevisionDates(v.revision_dates))
    if (topic) await store.update('learning_topics', topic.id, row); else await store.insert('learning_topics', row)
    onOpenChange(false)
  }, { success: 'Topic saved' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={topic ? `Edit ${topic.name}` : 'New topic'} pending={pending} onSubmit={handleSubmit(save)}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={errors.group_name?.message}><Input list="topic-groups" {...register('group_name')} /><datalist id="topic-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></Field>
        <Field label="Topic" error={errors.name?.message}><Input {...register('name')} /></Field>
      </div>
      <Field label="Revision dates" hint={`YYYY-MM-DD, comma separated. e.g. ${today}`} error={errors.revision_dates?.message}><Input {...register('revision_dates')} placeholder={today} /></Field>
      <Field label="Notes"><Textarea rows={6} {...register('notes')} /></Field>
    </FormDialog>
  )
}
