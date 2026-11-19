import { useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'

/** The sets (reps × weight) of one exercise inside the workout form. */
export function WorkoutSets({ control, register, getValues, index, errors }) {
  const { fields, append, remove } = useFieldArray({ control, name: `exercises.${index}.sets` })
  return (
    <div className="space-y-1.5">
      {fields.map((f, s) => (
        <div key={f.id} className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-1.5">
          <span className="text-center text-xs text-muted-foreground">{s + 1}</span>
          <Input
            type="number"
            inputMode="numeric"
            aria-label={`Set ${s + 1} reps`}
            placeholder="reps"
            {...register(`exercises.${index}.sets.${s}.reps`)}
          />
          <Input
            type="number"
            inputMode="decimal"
            step="0.5"
            aria-label={`Set ${s + 1} weight`}
            placeholder="kg"
            {...register(`exercises.${index}.sets.${s}.weight`)}
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove set" onClick={() => remove(s)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {errors?.exercises?.[index]?.sets && <p className="text-xs text-danger">Check reps and weight (numbers, 0 or more)</p>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          // A new set starts as a copy of the previous one, as typed now (`fields` only holds the values each row started with).
          const last = getValues(`exercises.${index}.sets`)?.at(-1)
          append({ reps: last?.reps ?? 10, weight: last?.weight ?? 0 })
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Set
      </Button>
    </div>
  )
}
