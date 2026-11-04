import { Controller } from 'react-hook-form'
import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { CATEGORIES_BY_TYPE, PAYMENT_METHODS } from '@/domain/finance'
import { moneyField, requiredDay } from '@/lib/validation'
import { parseMoney, paiseToInput, CURRENCIES } from '@/lib/money'
import { useEntityForm } from '@/hooks/useEntityForm'
import { useSettings } from '@/hooks/useSettings'
import { CategoryField, categoryOptions } from './CategoryField'

export { categoryOptions }

const schema = z.object({
  type: z.enum(['expense', 'income', 'savings']),
  amount: moneyField('Enter an amount greater than 0 (max 2 decimals)'),
  category: z.string().min(1, 'Choose a category'),
  txn_date: requiredDay(),
  payment_method: z.enum(PAYMENT_METHODS),
  note: z.string().max(300),
})

export function TransactionDialog({ open, onOpenChange, txn, copyOf, transactions, today, defaultType = 'expense' }) {
  const { settings } = useSettings()
  const blank = copyOf
    ? {
        type: copyOf.type,
        amount: paiseToInput(copyOf.amount_paise),
        category: copyOf.category,
        txn_date: today,
        payment_method: copyOf.payment_method ?? 'Other',
        note: copyOf.note ?? '',
      }
    : {
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
    watch,
    setValue,
    formState: { errors },
    onSubmit,
    pending,
  } = useEntityForm({
    open,
    entity: txn,
    schema,
    blank,
    table: 'transactions',
    resetKeys: [defaultType, copyOf?.id],
    fromEntity: fromTxn,
    toRow: (v) => ({
      type: v.type,
      amount_paise: parseMoney(v.amount),
      category: v.category,
      txn_date: v.txn_date,
      payment_method: v.payment_method,
      note: v.note,
    }),
    success: txn ? 'Transaction updated' : 'Transaction added',
    onDone: () => onOpenChange(false),
  })
  const type = watch('type')
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={txn ? 'Edit transaction' : copyOf ? 'Duplicate transaction' : 'Add transaction'}
      pending={pending}
      onSubmit={onSubmit}
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
              if (!categoryOptions(v, transactions).includes(watch('category'))) setValue('category', CATEGORIES_BY_TYPE[v][0])
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
      <CategoryField control={control} setValue={setValue} type={type} transactions={transactions} error={errors.category?.message} />
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
