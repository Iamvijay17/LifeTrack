import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { HABIT_COLORS, WEEKDAY_OPTIONS } from '@lifetrack/constants/defaults'
import { habitFormSchema, blankHabit, habitToForm } from '@lifetrack/schemas'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { cn } from '@/lib/utils'

const COLORS = HABIT_COLORS
const DAYS = WEEKDAY_OPTIONS
const schema = habitFormSchema

export function HabitDialog({ open, onOpenChange, habit, today }) {
  const blank = blankHabit(today, COLORS[0])
  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => { if (open) reset(habit ? habitToForm(habit) : { ...blank, start_date: today }) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [open, habit?.id])
  const frequency = watch('frequency')
  const [save, pending] = useAction(async (v) => {
    if (habit) await store.update('habits', habit.id, v) // logs are untouched: history is preserved
    else await store.insert('habits', v)
    onOpenChange(false)
  }, { success: habit ? 'Habit updated' : 'Habit created' })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={habit ? 'Edit habit' : 'New habit'} description={habit ? 'Past check-ins are kept exactly as logged.' : undefined} pending={pending} onSubmit={handleSubmit(save)}>
      <Field label="Name" error={errors.name?.message}><Input autoFocus placeholder="e.g. Read 20 pages" {...register('name')} /></Field>
      <Field label="Description (optional)"><Input {...register('description')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repeats"><Select {...register('frequency')}><option value="daily">Every day</option><option value="custom">Specific days</option><option value="weekly">X times a week</option></Select></Field>
        <Field label="Start date" error={errors.start_date?.message}><Input type="date" {...register('start_date')} /></Field>
      </div>
      {frequency === 'custom' && (
        <Controller control={control} name="days_of_week" render={({ field }) => (
          <Field label="Days" error={errors.days_of_week?.message}>
            <div className="flex flex-wrap gap-1.5">{DAYS.map(([l, v]) => { const on = field.value.includes(v); return (
              <button key={v} type="button" aria-pressed={on} onClick={() => field.onChange(on ? field.value.filter((x) => x !== v) : [...field.value, v])}
                className={cn('h-9 w-12 rounded-md border border-border text-[13px]', on ? 'border-primary bg-primary/15 text-secondary' : 'text-muted-foreground')}>{l}</button>) })}</div>
          </Field>)} />
      )}
      {frequency === 'weekly' && <Field label="Times per week" error={errors.weekly_target?.message}><Input type="number" min={1} max={7} inputMode="numeric" {...register('weekly_target')} /></Field>}
      <Controller control={control} name="color" render={({ field }) => (
        <Field label="Colour"><div className="flex gap-2">{COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={field.value === c} onClick={() => field.onChange(c)} style={{ background: c }}
            className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-card', field.value === c && 'ring-2 ring-foreground')} />))}</div></Field>)} />
    </FormDialog>
  )
}
