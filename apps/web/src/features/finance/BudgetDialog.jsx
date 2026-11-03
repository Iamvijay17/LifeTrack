import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input } from '@/components/ui/form'
import { moneyField } from '@/lib/validation'
import { parseMoney, paiseToInput } from '@/lib/money'
import { fmtDay } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'
import { CONFLICT_KEYS } from '@lifetrack/constants/schema'

const schema = z.object({ amount: moneyField('Enter a valid amount, e.g. 25000', { min: 0 }) })

/** Sets the expense budget for one month (overrides the default from Settings for that month only). */
export function BudgetDialog({ open, onOpenChange, month, currentPaise }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: month, valuesFor: () => ({ amount: paiseToInput(currentPaise || 0) }) })

  const [save, pending] = useAction(
    async (v) => {
      await store.upsert('budgets', { month, category: '', amount_paise: parseMoney(v.amount) }, { onConflict: CONFLICT_KEYS.budgets })
      onOpenChange(false)
    },
    { success: 'Budget saved' },
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Budget for ${fmtDay(month, 'MMMM yyyy')}`}
      description="Overrides your default monthly budget for this month only."
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <Field label="Monthly expense budget" error={errors.amount?.message}>
        <Input autoFocus inputMode="decimal" placeholder="e.g. 30000" {...register('amount')} />
      </Field>
    </FormDialog>
  )
}
