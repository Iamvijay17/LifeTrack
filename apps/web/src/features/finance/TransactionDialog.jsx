import { useState } from 'react'
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

const schema = z.object({
  type: z.enum(['expense', 'income', 'savings']),
  amount: moneyField('Enter an amount greater than 0 (max 2 decimals)'),
  category: z.string().min(1, 'Choose a category'),
  txn_date: requiredDay(),
  payment_method: z.enum(PAYMENT_METHODS),
  note: z.string().max(300),
})

const ADD_NEW = '__add_new__'
// Categories the user typed in are remembered per transaction type, in this browser only.
const loadCustom = (type) => {
  try {
    return JSON.parse(localStorage.getItem(`lt_cats_${type}`) ?? '[]')
  } catch {
    return []
  }
}
const saveCustom = (type, list) => {
  try {
    localStorage.setItem(`lt_cats_${type}`, JSON.stringify(list))
  } catch {
    // storage unavailable (private mode): the category still works for this transaction
  }
}

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
    resetKeys: [defaultType],
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
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')
  const [, bump] = useState(0) // re-read the remembered categories after saving a new one
  const commitCustom = () => {
    const name = custom.trim().slice(0, 40)
    if (name) {
      const list = loadCustom(type)
      if (!list.includes(name) && !CATEGORIES_BY_TYPE[type].includes(name)) saveCustom(type, [...list, name])
      setValue('category', name, { shouldValidate: true })
    }
    setAdding(false)
    setCustom('')
    bump((n) => n + 1)
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={txn ? 'Edit transaction' : 'Add transaction'}
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
            {adding ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  maxLength={40}
                  placeholder="New category name"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitCustom()
                    }
                  }}
                />
                <button type="button" className="rounded-md border px-3 text-sm" onClick={commitCustom}>
                  Add
                </button>
              </div>
            ) : (
              <Select
                value={field.value}
                onChange={(e) => (e.target.value === ADD_NEW ? setAdding(true) : field.onChange(e.target.value))}
                onBlur={field.onBlur}
                ref={field.ref}
              >
                {[...new Set([...CATEGORIES_BY_TYPE[type], ...loadCustom(type), field.value])].filter(Boolean).map((c) => (
                  <option key={c}>{c}</option>
                ))}
                <option value={ADD_NEW}>+ Add new category…</option>
              </Select>
            )}
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
