import { useEffect } from 'react'
import { parseRevisionDates, parseStudyTarget } from '@lifetrack/core/learning'
import { blankLearningGoal, blankSession, blankTopic, learningGoalFormSchema, learningGoalToForm, learningGoalToPayload, sessionFormSchema, sessionFormToPayload, sessionToForm, topicFormSchema, topicToForm, topicToPayload } from '@lifetrack/schemas'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, DateField, SelectField } from '../../ui/controls'
import { Button, Field } from '../../ui'
import { studyTargetOptions } from './StudyTimer'

const multiline = { multiline: true, numberOfLines: 3, style: { minHeight: 80, textAlignVertical: 'top' as const, paddingTop: 12 } }

export function SessionForm({ visible, session, goals, topics, today, onClose }: { visible: boolean; session: any | null; goals: any[]; topics: any[]; today: string; onClose: () => void }) {
  const { values, errors, set, reset, validate } = useZodForm(sessionFormSchema(today), blankSession(today))
  useEffect(() => { if (visible) reset(session ? sessionToForm(session) : blankSession(today)) }, [visible, session?.id, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate() as any
    if (!v) return
    const row = sessionFormToPayload(v, parseStudyTarget(v.target, goals), !!session)
    if (session) await store.update('study_sessions', session.id, row); else await store.insert('study_sessions', row)
    onClose()
  })
  return (
    <Sheet visible={visible} title={session ? 'Edit session' : 'Log a study session'} onClose={onClose} footer={<Button title={session ? 'Save changes' : 'Log session'} onPress={save} loading={pending} />}>
      <SelectField label="Studied" value={values.target} options={studyTargetOptions(goals, topics)} onChange={(v) => set('target', v)} />
      <DateField label="Date" value={values.session_date} onChange={(v) => set('session_date', v)} error={errors.session_date} />
      <Field label="Minutes" value={String(values.minutes ?? '')} onChangeText={(t) => set('minutes', t as unknown as number)} error={errors.minutes} keyboardType="number-pad" />
      <Field label="DSA problems solved" value={String(values.problems_solved ?? '')} onChangeText={(t) => set('problems_solved', t as unknown as number)} error={errors.problems_solved} keyboardType="number-pad" />
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} {...multiline} />
    </Sheet>
  )
}

export function LearningGoalForm({ visible, goal, topics, onClose }: { visible: boolean; goal: any | null; topics: any[]; onClose: () => void }) {
  const { values, errors, set, reset, validate } = useZodForm(learningGoalFormSchema, blankLearningGoal())
  useEffect(() => { if (visible) reset(goal ? learningGoalToForm(goal) : blankLearningGoal()) }, [visible, goal?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = learningGoalToPayload(v, topics)
    if (goal) await store.update('goals', goal.id, row); else await store.insert('goals', row)
    onClose()
  })
  return (
    <Sheet visible={visible} title={goal ? 'Edit goal' : 'New learning goal'} onClose={onClose} footer={<Button title={goal ? 'Save changes' : 'Create goal'} onPress={save} loading={pending} />}>
      <Field label="Goal" value={values.title} onChangeText={(t) => set('title', t)} error={errors.title} placeholder="e.g. Finish React fundamentals" autoFocus={!goal} maxLength={120} />
      <SelectField label="Related topic (optional)" value={values.topic_id} onChange={(v) => set('topic_id', v)} options={[{ value: '', label: '—' }, ...topics.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name, group: t.group_name }))]} />
      <Field label="Target hours" value={String(values.target_hours ?? '')} onChangeText={(t) => set('target_hours', t as unknown as number)} error={errors.target_hours} keyboardType="decimal-pad" />
      <DateField label="Due date" value={values.due_date} onChange={(v) => set('due_date', v)} error={errors.due_date} clearable />
      {goal ? <ChipGroup label="Status" value={values.status} options={[{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'archived', label: 'Archived' }]} onChange={(v) => set('status', v)} /> : null}
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} {...multiline} />
    </Sheet>
  )
}

export function TopicForm({ visible, topic, groups, today, onClose }: { visible: boolean; topic: any | null; groups: string[]; today: string; onClose: () => void }) {
  const first = groups[0] ?? 'Frontend'
  const { values, errors, set, reset, validate } = useZodForm(topicFormSchema, blankTopic(first))
  useEffect(() => { if (visible) reset(topic ? topicToForm(topic) : blankTopic(first)) }, [visible, topic?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    let dates: string[]
    try { dates = parseRevisionDates(v.revision_dates) } catch (e) { throw e }
    const row = topicToPayload(v, dates)
    if (topic) await store.update('learning_topics', topic.id, row); else await store.insert('learning_topics', row)
    onClose()
  })
  return (
    <Sheet visible={visible} title={topic ? `Edit ${topic.name}` : 'New topic'} onClose={onClose} footer={<Button title="Save topic" onPress={save} loading={pending} />}>
      <Field label="Category" value={values.group_name} onChangeText={(t) => set('group_name', t)} error={errors.group_name} autoCapitalize="words" />
      <Field label="Topic" value={values.name} onChangeText={(t) => set('name', t)} error={errors.name} maxLength={80} />
      <Field label="Revision dates" value={values.revision_dates} onChangeText={(t) => set('revision_dates', t)} error={errors.revision_dates} placeholder={today} autoCapitalize="none" />
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} {...multiline} style={{ minHeight: 140, textAlignVertical: 'top', paddingTop: 12 }} />
    </Sheet>
  )
}
