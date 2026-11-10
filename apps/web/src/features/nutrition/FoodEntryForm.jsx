import { Controller } from 'react-hook-form'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { FOOD_CATEGORIES } from '@lifetrack/constants/foods'
import { foodLogFormSchema, foodLogFormToPayload, foodLogFormTotals } from '@lifetrack/schemas'
import { MEALS, MEAL_LABEL } from '@/domain/nutrition'
import { useDialogForm } from '@/hooks/useDialogForm'
import { useAction } from '@/hooks/useAction'
import { saveRow } from '@/services/api'
import { logEntry } from './logEntry'

const NUTRIENT_FIELDS = [
  ['kcal', 'Calories (kcal)'],
  ['protein_g', 'Protein (g)'],
  ['carbs_g', 'Carbs (g)'],
  ['fat_g', 'Fat (g)'],
  ['fiber_g', 'Fibre (g)'],
]

/**
 * The full entry form: add (from a picked food, a duplicate or from scratch) or edit. Nutrition is typed PER SERVING; the total for the
 * quantity is shown live and is what gets stored. `entry` = the stored row when editing, `values` = the form's starting values.
 */
export function FoodEntryForm({ open, onOpenChange, entry, values, categories = FOOD_CATEGORIES, title, onDone }) {
  const form = useDialogForm({
    open,
    schema: foodLogFormSchema,
    recordKey: entry?.id ?? title ?? 'new',
    valuesFor: () => values,
  })
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = form
  const [save, pending] = useAction(
    async (v) => {
      const payload = foodLogFormToPayload(v)
      if (entry) await saveRow('food_logs', entry, payload)
      else await logEntry(payload)
      onDone?.(payload)
      onOpenChange(false)
    },
    { success: entry ? 'Entry updated' : undefined },
  )
  const live = watch()
  const totals = foodLogFormTotals(live)
  const cats = [...new Set([...categories, live.category].filter(Boolean))]
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? (entry ? 'Edit food entry' : 'Add food entry')}
      pending={pending}
      onSubmit={form.handleSubmit(save)}
      submitLabel={entry ? 'Save changes' : `Add to ${MEAL_LABEL[live.meal_type] ?? 'meal'}`}
      className="md:max-w-xl"
    >
      <Field label="Food" error={errors.name?.message}>
        <Input autoFocus={!entry && !values.name} maxLength={120} placeholder="e.g. Idli with sambar" {...register('name')} />
      </Field>
      <Controller
        control={control}
        name="meal_type"
        render={({ field }) => (
          <Segmented
            className="w-full [&>button]:flex-1"
            value={field.value}
            onChange={field.onChange}
            options={MEALS.map((m) => ({ value: m.id, label: m.id === 'snack' ? 'Snacks' : m.label }))}
          />
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.log_date?.message}>
          <Input type="date" {...register('log_date')} />
        </Field>
        <Field label="Time (optional)" error={errors.log_time?.message}>
          <Input type="time" {...register('log_time')} />
        </Field>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <Field label="Quantity" error={errors.quantity?.message} className="col-span-2">
          <Input inputMode="decimal" {...register('quantity')} />
        </Field>
        <Field label="One serving is" error={errors.serving_label?.message} className="col-span-3">
          <Input maxLength={60} placeholder="1 katori (150 g)" {...register('serving_label')} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium">Nutrition in ONE serving</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {NUTRIENT_FIELDS.map(([key, label]) => (
            <Field key={key} label={label} error={errors[key]?.message}>
              <Input inputMode="decimal" {...register(key)} />
            </Field>
          ))}
        </div>
      </fieldset>
      <div className="rounded-xl border border-border bg-mod/5 px-3 py-2.5 text-sm" aria-live="polite" data-testid="entry-totals">
        <b className="tabular-nums">{Math.round(totals.kcal)} kcal</b> in total
        <span className="ml-2 text-xs tabular-nums text-muted-foreground">
          P {totals.protein_g} g · C {totals.carbs_g} g · F {totals.fat_g} g · Fibre {totals.fiber_g} g
        </span>
      </div>
      <Field label="Category" error={errors.category?.message}>
        <Select {...register('category')}>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        <Textarea rows={2} maxLength={300} {...register('notes')} />
      </Field>
    </FormDialog>
  )
}
