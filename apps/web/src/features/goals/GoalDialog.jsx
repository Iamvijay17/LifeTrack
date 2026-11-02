import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { blankGoal, goalFormSchema, goalToForm, goalToPayload } from '@lifetrack/schemas'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { GOAL_CATEGORIES, PERIODS } from '@lifetrack/core/goals'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'

export function GoalDialog({ open, onOpenChange, goal, defaultPeriod = 'monthly', today }) {
  const blank = blankGoal(today ?? '', defaultPeriod)
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(goalFormSchema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(goal ? goalToForm(goal) : { ...blank, period: defaultPeriod })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal?.id, defaultPeriod])
  const [save, pending] = useAction(async (v) => {
    const row = goalToPayload(v)
    if (goal) await store.update('goals', goal.id, row); else await store.insert('goals', row)
    onOpenChange(false)
  }, { success: goal ? 'Goal updated' : 'Goal created' })
  const cats = [...new Set([...GOAL_CATEGORIES, goal?.category])].filter(Boolean)
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={goal ? 'Edit goal' : 'New goal'} pending={pending} onSubmit={handleSubmit(save)} submitLabel={goal ? 'Save changes' : 'Create goal'}>
      <Field label="Goal" error={errors.title?.message}><Input autoFocus placeholder="What do you want to achieve?" {...register('title')} /></Field>
      <Field label="Description" error={errors.notes?.message}><Textarea {...register('notes')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><Select {...register('period')}>{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        <Field label="Category"><Select {...register('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Start date" error={errors.start_date?.message}><Input type="date" {...register('start_date')} /></Field>
        <Field label="Target date" error={errors.due_date?.message}><Input type="date" {...register('due_date')} /></Field>
        <Field label="Study target (hours)" hint="Optional — progress follows logged study time" error={errors.target_hours?.message}><Input type="number" min={0} step="0.5" inputMode="decimal" {...register('target_hours')} /></Field>
        <Field label="Manual progress (%)" hint="Used when there are no milestones or study target" error={errors.manual_progress?.message}><Input type="number" min={0} max={100} inputMode="numeric" {...register('manual_progress')} /></Field>
      </div>
    </FormDialog>
  )
}
