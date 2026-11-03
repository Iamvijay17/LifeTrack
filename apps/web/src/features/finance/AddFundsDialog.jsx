import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input } from '@/components/ui/form'
import { moneyField } from '@/lib/validation'
import { parseMoney } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z.object({ amount: moneyField('Enter an amount greater than 0.') })

/** Adds money to a savings goal. Read-modify-write: two devices adding at the same instant could lose one increment. */
export function AddFundsDialog({ goal, onClose, money }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open: true, schema, recordKey: goal.id, valuesFor: () => ({ amount: '' }) })

  const [add, pending] = useAction(
    async (v) => {
      // use the freshest cached value so two quick additions on this device don't overwrite each other
      const fresh = store.peek('savings_goals').find((g) => g.id === goal.id) ?? goal
      await store.update('savings_goals', goal.id, { saved_paise: fresh.saved_paise + parseMoney(v.amount) })
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
