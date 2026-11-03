import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { MUSCLE_GROUPS } from '@/domain/defaults'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z.object({
  name: z.string().trim().min(1, 'Name the exercise').max(80),
  muscle_group: z.string(),
  equipment: z.string().max(60),
})
const BLANK = { name: '', muscle_group: 'Chest', equipment: '' }

export function ExerciseDialog({ open, onOpenChange }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: 'new', valuesFor: () => BLANK })

  const [save, pending] = useAction(
    async (v) => {
      await store.insert('exercises', v)
      onOpenChange(false)
    },
    { success: 'Exercise added' },
  )

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New exercise" pending={pending} onSubmit={handleSubmit(save)}>
      <Field label="Name" error={errors.name?.message}>
        <Input autoFocus {...register('name')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Muscle group">
          <Select {...register('muscle_group')}>
            {MUSCLE_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Equipment">
          <Input placeholder="Barbell, cable…" {...register('equipment')} />
        </Field>
      </div>
    </FormDialog>
  )
}
