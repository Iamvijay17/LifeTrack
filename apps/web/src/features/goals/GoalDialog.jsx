import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { GOAL_CATEGORIES, PERIODS } from '@/domain/goals'
import { optionalDay } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z
  .object({
    title: z.string().trim().min(1, 'Name the goal').max(120, 'Keep it under 120 characters'),
    notes: z.string().max(2000),
    category: z.string().min(1),
    period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    start_date: optionalDay,
    due_date: optionalDay,
    target_hours: z.coerce.number({ error: 'Enter hours' }).min(0).max(5000),
    manual_progress: z.coerce.number({ error: 'Enter 0–100' }).int().min(0).max(100),
  })
  .refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, {
    path: ['due_date'],
    message: 'Target date must be on or after the start date',
  })

export function GoalDialog({ open, onOpenChange, goal, defaultPeriod = 'monthly', today }) {
  const blank = {
    title: '',
    notes: '',
    category: 'Personal',
    period: defaultPeriod,
    start_date: today ?? '',
    due_date: '',
    target_hours: 0,
    manual_progress: 0,
  }
  const fromGoal = (g) => ({
    title: g.title,
    notes: g.notes ?? '',
    category: g.category,
    period: g.period,
    start_date: g.start_date ?? '',
    due_date: g.due_date ?? '',
    target_hours: (g.target_minutes ?? 0) / 60,
    manual_progress: g.manual_progress ?? 0,
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({
    open,
    schema,
    recordKey: `${goal?.id ?? 'new'}|${defaultPeriod}`,
    valuesFor: () => (goal ? fromGoal(goal) : { ...blank, period: defaultPeriod }),
  })
  const [save, pending] = useAction(
    async (v) => {
      const row = {
        title: v.title.trim(),
        notes: v.notes,
        category: v.category,
        period: v.period,
        start_date: v.start_date || null,
        due_date: v.due_date || null,
        target_minutes: Math.round(v.target_hours * 60),
        manual_progress: v.manual_progress,
      }
      if (goal) await store.update('goals', goal.id, row)
      else await store.insert('goals', row)
      onOpenChange(false)
    },
    { success: goal ? 'Goal updated' : 'Goal created' },
  )
  const cats = [...new Set([...GOAL_CATEGORIES, goal?.category])].filter(Boolean)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? 'Edit goal' : 'New goal'}
      pending={pending}
      onSubmit={handleSubmit(save)}
      submitLabel={goal ? 'Save changes' : 'Create goal'}
    >
      <Field label="Goal" error={errors.title?.message}>
        <Input autoFocus placeholder="What do you want to achieve?" {...register('title')} />
      </Field>
      <Field label="Description" error={errors.notes?.message}>
        <Textarea {...register('notes')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select {...register('period')}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select {...register('category')}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Start date" error={errors.start_date?.message}>
          <Input type="date" {...register('start_date')} />
        </Field>
        <Field label="Target date" error={errors.due_date?.message}>
          <Input type="date" {...register('due_date')} />
        </Field>
        <Field label="Study target (hours)" hint="Optional — progress follows logged study time" error={errors.target_hours?.message}>
          <Input type="number" min={0} step="0.5" inputMode="decimal" {...register('target_hours')} />
        </Field>
        <Field label="Manual progress (%)" hint="Used when there are no milestones or study target" error={errors.manual_progress?.message}>
          <Input type="number" min={0} max={100} inputMode="numeric" {...register('manual_progress')} />
        </Field>
      </div>
    </FormDialog>
  )
}
