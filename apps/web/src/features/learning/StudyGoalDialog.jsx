import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { topicGroups } from '@/domain/learning'
import { optionalDay } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z.object({
  title: z.string().trim().min(1, 'Name the goal').max(120),
  topic_id: z.string(),
  target_hours: z.coerce.number({ error: 'Enter hours' }).min(0).max(5000),
  due_date: optionalDay,
  status: z.enum(['active', 'completed', 'archived']),
  notes: z.string().max(1000),
})
const blank = { title: '', topic_id: '', target_hours: 20, due_date: '', status: 'active', notes: '' }
const fromGoal = (g) => ({
  title: g.title,
  topic_id: g.topic_id ?? '',
  target_hours: g.target_minutes / 60,
  due_date: g.due_date ?? '',
  status: g.status,
  notes: g.notes ?? '',
})

/** A study-time goal (hours against an optional topic). The broader Goals module lives in features/goals. */
export function StudyGoalDialog({ open, onOpenChange, goal, topics }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: goal?.id, valuesFor: () => (goal ? fromGoal(goal) : blank) })

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
          {topicGroups(topics).map((g) => (
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
