import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input } from '@/components/ui/form'
import { moneyField, optionalDay } from '@/lib/validation'
import { parseMoney, paiseToInput } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z.object({
  name: z.string().trim().min(1, 'Name the goal').max(80, 'Keep it under 80 characters'),
  target: moneyField('Enter a valid target amount (more than 0)'),
  saved: z
    .string()
    .trim()
    .refine((v) => v === '' || parseMoney(v) !== null, 'Enter a valid amount'),
  target_date: optionalDay,
})
const blank = { name: '', target: '', saved: '', target_date: '' }
const fromGoal = (g) => ({
  name: g.name,
  target: paiseToInput(g.target_paise),
  saved: paiseToInput(g.saved_paise),
  target_date: g.target_date ?? '',
})

export function SavingsGoalDialog({ open, onOpenChange, goal }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: goal?.id, valuesFor: () => (goal ? fromGoal(goal) : blank) })

  const [save, pending] = useAction(
    async (v) => {
      const row = {
        name: v.name.trim(),
        target_paise: parseMoney(v.target),
        saved_paise: v.saved ? parseMoney(v.saved) : 0,
        target_date: v.target_date || null,
      }
      if (goal) await store.update('savings_goals', goal.id, row)
      else await store.insert('savings_goals', row)
      onOpenChange(false)
    },
    { success: goal ? 'Savings goal updated' : 'Savings goal created' },
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? 'Edit savings goal' : 'New savings goal'}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <Field label="What are you saving for?" error={errors.name?.message}>
        <Input autoFocus placeholder="e.g. Emergency fund" {...register('name')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target amount" error={errors.target?.message}>
          <Input inputMode="decimal" {...register('target')} />
        </Field>
        <Field label="Saved so far" error={errors.saved?.message}>
          <Input inputMode="decimal" placeholder="0" {...register('saved')} />
        </Field>
      </div>
      <Field label="Target date (optional)" error={errors.target_date?.message}>
        <Input type="date" {...register('target_date')} />
      </Field>
    </FormDialog>
  )
}
