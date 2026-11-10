import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FOOD_CATEGORIES } from '@lifetrack/constants/foods'
import { blankCustomFood, customFoodFormSchema, customFoodToForm, customFoodToPayload } from '@lifetrack/schemas'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import { saveFoodCopy, saveRow } from '@/services/api'
import { findDuplicateFood } from '@/domain/nutrition'

const NUTRIENT_FIELDS = [
  ['kcal', 'Calories (kcal)'],
  ['protein_g', 'Protein (g)'],
  ['carbs_g', 'Carbs (g)'],
  ['fat_g', 'Fat (g)'],
  ['fiber_g', 'Fibre (g)'],
]

/**
 * Create your own food, or edit one. `food` is a catalogue food (see buildCatalog) or null for a new one.
 * Editing a built-in starter food saves YOUR copy (the starter list itself never changes), and the copy replaces it in search.
 */
export function CustomFoodDialog({ open, onOpenChange, food, catalog = [], categories = FOOD_CATEGORIES, onSaved }) {
  const form = useDialogForm({
    open,
    schema: customFoodFormSchema,
    recordKey: food?.ref ?? 'new',
    valuesFor: () => (food ? customFoodToForm({ ...food, aliases: food.own_aliases, source: food.numbers_from }) : blankCustomFood()),
  })
  const {
    register,
    watch,
    setError,
    formState: { errors },
  } = form
  const [save, pending] = useAction(
    async (v) => {
      const values = customFoodToPayload(v)

      let row
      if (!food) row = await saveRow('foods', null, values)
      else if (food.source === 'starter') row = await saveFoodCopy(food.base_key, { ...values, variants: food.variants })
      else row = await saveRow('foods', { id: food.id }, values)
      onSaved?.(row)
      onOpenChange(false)
    },
    { success: food ? 'Food saved' : 'Custom food created' },
  )
  // One dish, one entry: a name (or other name) that a food in the list already has is refused, with a pointer to it.
  const submit = (v) => {
    const values = customFoodToPayload(v)
    const same = findDuplicateFood(catalog, values.name, { exceptRef: food?.ref, aliases: values.aliases })
    if (same) {
      setError('name', { message: `"${same.name}" is already in your food list. Search for it, or edit it to change its numbers.` })
      return
    }
    return save(v)
  }
  const cats = [...new Set([...categories, watch('category')].filter(Boolean))]
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={!food ? 'Create a food' : food.source === 'starter' ? `Edit ${food.name}` : 'Edit food'}
      description={
        food?.source === 'starter'
          ? 'This saves your own copy; the original estimate stays available to reset to.'
          : 'Nutrition is for ONE serving.'
      }
      pending={pending}
      onSubmit={form.handleSubmit(submit)}
      className="md:max-w-xl"
    >
      <Field label="Name" error={errors.name?.message}>
        <Input autoFocus maxLength={80} placeholder="e.g. Mom's sambar" {...register('name')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={errors.category?.message}>
          <Select {...register('category')}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Weight of one serving (g, optional)" error={errors.serving_g?.message}>
          <Input inputMode="decimal" {...register('serving_g')} />
        </Field>
      </div>
      <Field label="One serving is" error={errors.serving_label?.message}>
        <Input maxLength={60} placeholder="1 katori (150 g)" {...register('serving_label')} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {NUTRIENT_FIELDS.map(([key, label]) => (
          <Field key={key} label={label} error={errors[key]?.message}>
            <Input inputMode="decimal" {...register(key)} />
          </Field>
        ))}
      </div>
      <Field
        label="Other serving sizes (optional)"
        error={errors.servings?.message}
        hint="One per line, as: name = how many servings. Example: 2 idlis = 2"
      >
        <Textarea rows={3} maxLength={1000} placeholder={'2 idlis = 2\n1 plate = 3'} {...register('servings')} />
      </Field>
      <Field
        label="Other names (optional)"
        error={errors.aliases?.message}
        hint="Separate with commas. Add a Tamil name or another spelling so search finds it, e.g. இட்லி, idly"
      >
        <Input maxLength={800} placeholder="e.g. பொங்கல், khara pongal" {...register('aliases')} />
      </Field>
      <Field label="Where are these numbers from? (optional)" error={errors.source?.message}>
        <Input maxLength={80} placeholder="e.g. packet label, my recipe, restaurant menu" {...register('source')} />
      </Field>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        <Textarea rows={2} maxLength={300} {...register('notes')} />
      </Field>
    </FormDialog>
  )
}
