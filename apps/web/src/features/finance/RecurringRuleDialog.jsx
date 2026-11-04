import { Controller } from 'react-hook-form'
import { blankRecurringRule, recurringRuleFormSchema, recurringRuleToForm, recurringRuleToPayload } from '@lifetrack/schemas'
import { FREQUENCIES } from '@lifetrack/core/recurring'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { CATEGORIES_BY_TYPE, PAYMENT_METHODS } from '@/domain/finance'
import { CURRENCIES } from '@/lib/money'
import { useEntityForm } from '@/hooks/useEntityForm'
import { useSettings } from '@/hooks/useSettings'
import { CategoryField, categoryOptions } from './CategoryField'

const TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'savings', label: 'Savings' },
]

export function RecurringRuleDialog({ open, onOpenChange, rule, transactions, today }) {
  const { settings } = useSettings()
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
    entity: rule,
    schema: recurringRuleFormSchema,
    blank: blankRecurringRule(CATEGORIES_BY_TYPE.expense[0], today),
    table: 'recurring_rules',
    fromEntity: recurringRuleToForm,
    toRow: (v) => recurringRuleToPayload(v, rule),
    success: rule ? 'Recurring rule updated' : 'Recurring rule added',
    onDone: () => onOpenChange(false),
  })
  const type = watch('type')
  const startsInPast = !rule && watch('next_date') < today
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? 'Edit recurring rule' : 'New recurring rule'}
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
            options={TYPES}
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
        <Field label="Repeats">
          <Select {...register('frequency')}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={rule ? 'Next date' : 'First date'} error={errors.next_date?.message}>
          <Input type="date" {...register('next_date')} />
        </Field>
        <Field label="End date (optional)" error={errors.end_date?.message}>
          <Input type="date" {...register('end_date')} />
        </Field>
      </div>
      {startsInPast && <p className="text-xs text-muted-foreground">Every charge from this date up to today is added when you save.</p>}
      <CategoryField control={control} setValue={setValue} type={type} transactions={transactions} error={errors.category?.message} />
      <Field label="Payment method">
        <Select {...register('payment_method')}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </Field>
      <Field label="Note" error={errors.note?.message}>
        <Input placeholder="e.g. Rent" {...register('note')} />
      </Field>
    </FormDialog>
  )
}
