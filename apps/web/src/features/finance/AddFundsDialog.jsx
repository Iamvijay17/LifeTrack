import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input } from '@/components/ui/form'
import { moneyField } from '@/lib/validation'
import { parseMoney } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import { addSavingsFunds } from '@/services/api'

const schema = z.object({ amount: moneyField('Enter an amount greater than 0.') })

/** Adds money to a savings goal inside the database (add_savings), so two devices adding at the same instant never lose an increment. */
export function AddFundsDialog({ goal, onClose, money }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open: true, schema, recordKey: goal.id, valuesFor: () => ({ amount: '' }) })

  const [add, pending] = useAction(
    async (v) => {
      await addSavingsFunds(goal, parseMoney(v.amount))
      onClose()
    },
    { success: 'Added to savings goal' },
  )

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Add to “${goal.name}”`}
      description={`${money(goal.saved_paise)} of ${money(goal.target_paise)} saved`}
      pending={pending}
      submitLabel="Add"
      onSubmit={handleSubmit(add)}
    >
      <Field label="Amount" error={errors.amount?.message}>
        <Input autoFocus inputMode="decimal" placeholder="0.00" {...register('amount')} />
      </Field>
    </FormDialog>
  )
}
