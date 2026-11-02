import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { blankTransaction, transactionFormSchema, transactionToForm, transactionToPayload } from '@lifetrack/schemas'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { CATEGORIES_BY_TYPE, PAYMENT_METHODS } from '@lifetrack/core/finance'
import { CURRENCIES } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import { useSettings } from '@/hooks/useSettings'
import * as store from '@/hooks/store'

const schema = transactionFormSchema

export function TransactionDialog({ open, onOpenChange, txn, today, defaultType = 'expense' }) {
  const { settings } = useSettings()
  const blank = blankTransaction(defaultType, CATEGORIES_BY_TYPE[defaultType][0], today)
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => { if (open) reset(txn ? transactionToForm(txn) : { ...blank, txn_date: today }) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [open, txn?.id, defaultType])
  const type = watch('type')
  const [save, pending] = useAction(async (v) => {
    const row = transactionToPayload(v)
    if (txn) await store.update('transactions', txn.id, row); else await store.insert('transactions', row)
    onOpenChange(false)
  }, { success: txn ? 'Transaction updated' : 'Transaction added' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={txn ? 'Edit transaction' : 'Add transaction'} pending={pending} onSubmit={handleSubmit(save)}>
      <Controller control={control} name="type" render={({ field }) => (
        <Segmented className="w-full [&>button]:flex-1" value={field.value} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'savings', label: 'Savings' }]}
          onChange={(v) => { field.onChange(v); if (!CATEGORIES_BY_TYPE[v].includes(watch('category'))) setValue('category', CATEGORIES_BY_TYPE[v][0]) }} />)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount (${CURRENCIES[settings.currency]?.symbol ?? '₹'})`} error={errors.amount?.message}><Input autoFocus inputMode="decimal" placeholder="0.00" {...register('amount')} /></Field>
        <Field label="Date" error={errors.txn_date?.message}><Input type="date" {...register('txn_date')} /></Field>
      </div>
      <Field label="Category" error={errors.category?.message}>
        <Select {...register('category')}>{[...new Set([...CATEGORIES_BY_TYPE[type], watch('category')])].filter(Boolean).map((c) => <option key={c}>{c}</option>)}</Select>
      </Field>
      <Field label="Payment method"><Select {...register('payment_method')}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
      <Field label="Note"><Input placeholder="Optional" {...register('note')} /></Field>
    </FormDialog>
  )
}
