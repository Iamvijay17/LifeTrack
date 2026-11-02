import { Controller } from 'react-hook-form'
import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { CATEGORIES_BY_TYPE, PAYMENT_METHODS } from '@/domain/finance'
import { moneyField, requiredDay } from '@/lib/validation'
import { parseMoney, paiseToInput, CURRENCIES } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import { useSettings } from '@/hooks/useSettings'
import * as store from '@/hooks/store'

const schema = z.object({
  type: z.enum(['expense', 'income', 'savings']),
  amount: moneyField('Enter an amount greater than 0 (max 2 decimals)'),
  category: z.string().min(1, 'Choose a category'),
  txn_date: requiredDay(),
  payment_method: z.enum(PAYMENT_METHODS),
  note: z.string().max(300),
})

export function TransactionDialog({ open, onOpenChange, txn, today, defaultType = 'expense' }) {
  const { settings } = useSettings()
  const blank = {
    type: defaultType,
    amount: '',
    category: CATEGORIES_BY_TYPE[defaultType][0],
    txn_date: today,
    payment_method: 'UPI',
    note: '',
  }
  const fromTxn = (t) => ({
    type: t.type,
    amount: paiseToInput(t.amount_paise),
    category: t.category,
    txn_date: t.txn_date,
    payment_method: t.payment_method ?? 'Other',
    note: t.note ?? '',
  })
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: `${txn?.id ?? 'new'}|${defaultType}`, valuesFor: () => (txn ? fromTxn(txn) : blank) })
  const type = watch('type')
  const [save, pending] = useAction(
    async (v) => {
      const row = {
        type: v.type,
        amount_paise: parseMoney(v.amount),
        category: v.category,
        txn_date: v.txn_date,
        payment_method: v.payment_method,
        note: v.note,
      }
      if (txn) await store.update('transactions', txn.id, row)
      else await store.insert('transactions', row)
      onOpenChange(false)
    },
    { success: txn ? 'Transaction updated' : 'Transaction added' },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={txn ? 'Edit transaction' : 'Add transaction'}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Segmented
            className="w-full [&>button]:flex-1"
            value={field.value}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'savings', label: 'Savings' },
            ]}
            onChange={(v) => {
              field.onChange(v)
              if (!CATEGORIES_BY_TYPE[v].includes(watch('category'))) setValue('category', CATEGORIES_BY_TYPE[v][0])
            }}
          />
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount (${CURRENCIES[settings.currency]?.symbol ?? '₹'})`} error={errors.amount?.message}>
          <Input autoFocus inputMode="decimal" placeholder="0.00" {...register('amount')} />
        </Field>
        <Field label="Date" error={errors.txn_date?.message}>
          <Input type="date" {...register('txn_date')} />
        </Field>
      </div>
      {/* Controlled (not register()): when the type changes the option list changes, and an uncontrolled <select> would
          display a different category than the one stored in the form. */}
      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <Field label="Category" error={errors.category?.message}>
            <Select value={field.value} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} ref={field.ref}>
              {[...new Set([...CATEGORIES_BY_TYPE[type], field.value])].filter(Boolean).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        )}
      />
      <Field label="Payment method">
        <Select {...register('payment_method')}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </Field>
      <Field label="Note">
        <Input placeholder="Optional" {...register('note')} />
      </Field>
    </FormDialog>
  )
}
