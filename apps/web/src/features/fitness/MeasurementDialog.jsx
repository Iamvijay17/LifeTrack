import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input } from '@/components/ui/form'
import { splitMeasurements } from '@/domain/fitness'
import { optionalNumber, requiredDay } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'
import { saveHealth } from '@/services/api'

const schema = z.object({
  measured_on: requiredDay(),
  weight_kg: z.union([z.literal(''), z.coerce.number().min(20).max(500)]),
  chest_cm: optionalNumber(300, 'Chest'),
  waist_cm: optionalNumber(300, 'Waist'),
  hips_cm: optionalNumber(300, 'Hips'),
  arm_cm: optionalNumber(150, 'Arm'),
  thigh_cm: optionalNumber(200, 'Thigh'),
  body_fat_pct: optionalNumber(80, 'Body fat'),
  notes: z.string().max(500),
})

/** Body metrics: tape measurements (one row per day) and/or body weight (stored in the day's health log). */
export function MeasurementDialog({ open, onOpenChange, today }) {
  const blank = {
    measured_on: today,
    weight_kg: '',
    chest_cm: '',
    waist_cm: '',
    hips_cm: '',
    arm_cm: '',
    thigh_cm: '',
    body_fat_pct: '',
    notes: '',
  }
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: 'new', valuesFor: () => blank })

  const [save, pending] = useAction(
    async (v) => {
      const { tape, weight, empty } = splitMeasurements(v)
      if (empty) throw new Error('Enter at least one measurement.')
      if (tape) await store.upsert('body_measurements', tape, { onConflict: 'user_id,measured_on' })
      if (weight != null) await saveHealth(v.measured_on, { weight_kg: weight })
      onOpenChange(false)
    },
    { success: 'Measurements saved' },
  )

  const field = (name, label) => (
    <Field label={label} error={errors[name]?.message}>
      <Input type="number" inputMode="decimal" step="0.1" {...register(name)} />
    </Field>
  )
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Log body metrics" pending={pending} onSubmit={handleSubmit(save)}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.measured_on?.message}>
          <Input type="date" {...register('measured_on')} />
        </Field>
        {field('weight_kg', 'Weight (kg)')}
        {field('chest_cm', 'Chest (cm)')}
        {field('waist_cm', 'Waist (cm)')}
        {field('hips_cm', 'Hips (cm)')}
        {field('arm_cm', 'Arm (cm)')}
        {field('thigh_cm', 'Thigh (cm)')}
        {field('body_fat_pct', 'Body fat (%)')}
      </div>
    </FormDialog>
  )
}
