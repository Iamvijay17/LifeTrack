import { Controller } from 'react-hook-form'
import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { requiredDay } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'
import { cn } from '@/lib/utils'

const COLORS = ['#8B5CF6', '#22C55E', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6']
const DAYS = [
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
  ['Sun', 0],
]
const schema = z
  .object({
    name: z.string().trim().min(1, 'Name your habit').max(80),
    description: z.string().max(300),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    frequency: z.enum(['daily', 'weekly', 'custom']),
    days_of_week: z.array(z.number()),
    weekly_target: z.coerce.number().int().min(1, 'At least 1').max(7, 'At most 7'),
    start_date: requiredDay('Pick a start date'),
  })
  .refine((v) => v.frequency !== 'custom' || v.days_of_week.length > 0, { path: ['days_of_week'], message: 'Pick at least one day' })

export function HabitDialog({ open, onOpenChange, habit, today }) {
  const blank = { name: '', description: '', color: COLORS[0], frequency: 'daily', days_of_week: [], weekly_target: 3, start_date: today }
  const fromHabit = (h) => ({
    name: h.name,
    description: h.description ?? '',
    color: h.color,
    frequency: h.frequency,
    days_of_week: h.days_of_week ?? [],
    weekly_target: h.weekly_target,
    start_date: h.start_date,
  })
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: habit?.id, valuesFor: () => (habit ? fromHabit(habit) : blank) })
  const frequency = watch('frequency')
  const [save, pending] = useAction(
    async (v) => {
      if (habit)
        await store.update('habits', habit.id, v) // logs are untouched: history is preserved
      else await store.insert('habits', v)
      onOpenChange(false)
    },
    { success: habit ? 'Habit updated' : 'Habit created' },
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={habit ? 'Edit habit' : 'New habit'}
      description={habit ? 'Past check-ins are kept exactly as logged.' : undefined}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <Field label="Name" error={errors.name?.message}>
        <Input autoFocus placeholder="e.g. Read 20 pages" {...register('name')} />
      </Field>
      <Field label="Description (optional)">
        <Input {...register('description')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repeats">
          <Select {...register('frequency')}>
            <option value="daily">Every day</option>
            <option value="custom">Specific days</option>
            <option value="weekly">X times a week</option>
          </Select>
        </Field>
        <Field label="Start date" error={errors.start_date?.message}>
          <Input type="date" {...register('start_date')} />
        </Field>
      </div>
      {frequency === 'custom' && (
        <Controller
          control={control}
          name="days_of_week"
          render={({ field }) => (
            <Field label="Days" error={errors.days_of_week?.message}>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(([l, v]) => {
                  const on = field.value.includes(v)
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      onClick={() => field.onChange(on ? field.value.filter((x) => x !== v) : [...field.value, v])}
                      className={cn(
                        'h-9 w-12 rounded-md border border-border text-[13px]',
                        on ? 'border-mod bg-mod/15 text-mod-text' : 'text-muted-foreground',
                      )}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}
        />
      )}
      {frequency === 'weekly' && (
        <Field label="Times per week" error={errors.weekly_target?.message}>
          <Input type="number" min={1} max={7} inputMode="numeric" {...register('weekly_target')} />
        </Field>
      )}
      <Controller
        control={control}
        name="color"
        render={({ field }) => (
          <Field label="Colour">
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={field.value === c}
                  onClick={() => field.onChange(c)}
                  style={{ background: c }}
                  className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-card', field.value === c && 'ring-2 ring-foreground')}
                />
              ))}
            </div>
          </Field>
        )}
      />
    </FormDialog>
  )
}
