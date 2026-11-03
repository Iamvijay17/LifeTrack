import { useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { nonNegativeNumber } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z.object({
  name: z.string().trim().min(1, 'Name the routine').max(80),
  notes: z.string().max(1000),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Exercise name'),
        sets: nonNegativeNumber(20, 'Sets'),
        reps: nonNegativeNumber(1000, 'Reps'),
        weight_kg: nonNegativeNumber(1000, 'Weight'),
      }),
    )
    .min(1, 'Add at least one exercise'),
})
/** The first validation message in one exercise row (name, sets, reps or weight), so no invalid value fails silently. */
const firstRowError = (row) => row?.name?.message ?? row?.sets?.message ?? row?.reps?.message ?? row?.weight_kg?.message
const NEW_EXERCISE = { name: '', sets: 3, reps: 10, weight_kg: 0 }
const BLANK = { name: '', notes: '', exercises: [NEW_EXERCISE] }

/** A routine template: a named list of exercises with planned sets, reps and weight. */
export function RoutineDialog({ open, onOpenChange, routine, library }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({
    open,
    schema,
    recordKey: routine?.id,
    valuesFor: () => (routine ? { name: routine.name, notes: routine.notes ?? '', exercises: routine.exercises } : BLANK),
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'exercises' })

  const [save, pending] = useAction(
    async (v) => {
      if (routine) await store.update('routines', routine.id, v)
      else await store.insert('routines', v)
      onOpenChange(false)
    },
    { success: routine ? 'Routine updated' : 'Routine created' },
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={routine ? 'Edit routine' : 'New routine'}
      pending={pending}
      onSubmit={handleSubmit(save)}
      className="md:max-w-xl"
    >
      <Field label="Name" error={errors.name?.message}>
        <Input autoFocus placeholder="e.g. Push day, Full body A" {...register('name')} />
      </Field>
      <div className="space-y-2">
        <p className="text-[13px] font-medium">Exercises</p>
        <datalist id="lib-ex">
          {library.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>
        {fields.map((f, i) => {
          const rowError = firstRowError(errors.exercises?.[i])
          return (
            <div key={f.id}>
              <div className="grid grid-cols-[1fr_3.5rem_3.5rem_4.5rem_2rem] items-start gap-1.5">
                <Input list="lib-ex" aria-label={`Exercise ${i + 1} name`} placeholder="Exercise" {...register(`exercises.${i}.name`)} />
                <Input type="number" inputMode="numeric" aria-label="Sets" placeholder="Sets" {...register(`exercises.${i}.sets`)} />
                <Input type="number" inputMode="numeric" aria-label="Reps" placeholder="Reps" {...register(`exercises.${i}.reps`)} />
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  aria-label="Weight kg"
                  placeholder="kg"
                  {...register(`exercises.${i}.weight_kg`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove exercise"
                  onClick={() => remove(i)}
                  disabled={fields.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {rowError && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {rowError}
                </p>
              )}
            </div>
          )
        })}
        {errors.exercises?.message && <p className="text-xs text-danger">{errors.exercises.message}</p>}
        <Button type="button" variant="outline" size="sm" onClick={() => append(NEW_EXERCISE)}>
          <Plus className="h-3.5 w-3.5" />
          Add exercise
        </Button>
      </div>
      <Field label="Notes">
        <Textarea rows={2} {...register('notes')} />
      </Field>
    </FormDialog>
  )
}
