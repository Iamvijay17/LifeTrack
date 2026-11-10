import { useEffect } from 'react'
import { View } from 'react-native'
import { FOOD_CATEGORIES } from '@lifetrack/constants/foods'
import { blankCustomFood, customFoodFormSchema, customFoodToForm, customFoodToPayload } from '@lifetrack/schemas'
import { api, store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { SelectField } from '../../ui/controls'
import { Button, Field, Txt } from '../../ui'

/** Create your own food or edit one. Editing a built-in starter food saves YOUR copy (the starter list never changes). */
export function FoodForm({ visible, food, categories, onClose }: { visible: boolean; food: any | null; categories: string[]; onClose: () => void }) {
  const { values, errors, set, reset, validate } = useZodForm(customFoodFormSchema, blankCustomFood())
  useEffect(() => { if (visible) reset(food ? customFoodToForm(food) : blankCustomFood()) }, [visible, food?.ref]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = customFoodToPayload(v)
    if (!food) await store.insert('foods', row)
    else if (food.source === 'starter') await api.saveFoodCopy(food.base_key, { ...row, variants: food.variants })
    else await store.update('foods', food.id, row)
    onClose()
  })
  const cats = [...new Set([...(categories.length ? categories : FOOD_CATEGORIES), values.category].filter(Boolean))]
  const num = (key: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g', label: string) => <View style={{ flexBasis: '30%', flexGrow: 1 }}><Field label={label} value={values[key]} onChangeText={(t) => set(key, t)} error={errors[key]} keyboardType="decimal-pad" /></View>
  return (
    <Sheet visible={visible} title={!food ? 'Create a food' : food.source === 'starter' ? `Edit ${food.name}` : 'Edit food'} onClose={onClose} footer={<Button title="Save food" onPress={save} loading={pending} />}>
      {food?.source === 'starter' ? <Txt variant="small" muted>This saves your own copy; the original estimate stays available to reset to.</Txt> : null}
      <Field label="Name" value={values.name} onChangeText={(t) => set('name', t)} error={errors.name} maxLength={80} autoFocus={!food} />
      <SelectField label="Category" value={values.category} options={cats.map((c) => ({ value: c, label: c }))} onChange={(v) => set('category', v)} error={errors.category} />
      <Field label="One serving is" value={values.serving_label} onChangeText={(t) => set('serving_label', t)} error={errors.serving_label} maxLength={60} placeholder="1 katori (150 g)" />
      <Field label="Weight of one serving (g, optional)" value={values.serving_g} onChangeText={(t) => set('serving_g', t)} error={errors.serving_g} keyboardType="decimal-pad" />
      <Txt variant="small" muted>Nutrition in ONE serving</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{num('kcal', 'Calories')}{num('protein_g', 'Protein g')}{num('carbs_g', 'Carbs g')}{num('fat_g', 'Fat g')}{num('fiber_g', 'Fibre g')}</View>
      <Field label="Other serving sizes (optional)" value={values.servings} onChangeText={(t) => set('servings', t)} error={errors.servings} multiline numberOfLines={3} placeholder={'2 idlis = 2\n1 plate = 3'} style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 12 }} />
      <Txt variant="small" muted>One per line, as name = how many servings.</Txt>
      <Field label="Notes (optional)" value={values.notes} onChangeText={(t) => set('notes', t)} error={errors.notes} maxLength={300} />
    </Sheet>
  )
}
