import { useEffect } from 'react'
import { View } from 'react-native'
import { FOOD_CATEGORIES } from '@lifetrack/constants/foods'
import { MEALS } from '@lifetrack/core/nutrition'
import { foodLogFormSchema, foodLogFormToPayload, foodLogFormTotals, type FoodLogForm } from '@lifetrack/schemas'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, DateField, SelectField, TimeField } from '../../ui/controls'
import { Button, Field, Txt } from '../../ui'

/** Add, edit or duplicate a food entry. Nutrition is typed per serving; the total for the quantity is shown live and is what is stored. */
export function EntryForm({ visible, entry, values: start, title, categories, onClose }: { visible: boolean; entry: any | null; values: FoodLogForm; title: string; categories: string[]; onClose: () => void }) {
  const { values, errors, set, reset, validate } = useZodForm(foodLogFormSchema, start)
  useEffect(() => { if (visible) reset(start) }, [visible, entry?.id, start]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = foodLogFormToPayload(v)
    if (entry) await store.update('food_logs', entry.id, row)
    else await store.insert('food_logs', row)
    onClose()
  })
  const totals = foodLogFormTotals(values)
  const cats = [...new Set([...categories, values.category].filter(Boolean))]
  const num = (key: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g', label: string) => (
    <View style={{ flexBasis: '30%', flexGrow: 1 }}><Field label={label} value={values[key]} onChangeText={(t) => set(key, t)} error={errors[key]} keyboardType="decimal-pad" /></View>
  )
  return (
    <Sheet visible={visible} title={title} onClose={onClose} footer={<Button title={entry ? 'Save changes' : 'Add entry'} onPress={save} loading={pending} />}>
      <Field label="Food" value={values.name} onChangeText={(t) => set('name', t)} error={errors.name} maxLength={120} autoFocus={!entry && !start.name} />
      <ChipGroup label="Meal" value={values.meal_type} options={MEALS.map((m) => ({ value: m.id as FoodLogForm['meal_type'], label: m.label }))} onChange={(v) => set('meal_type', v)} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><DateField label="Date" value={values.log_date} onChange={(v) => set('log_date', v)} error={errors.log_date} /></View>
        <View style={{ flex: 1 }}><TimeField label="Time" value={values.log_time} onChange={(v) => set('log_time', v)} error={errors.log_time} clearable /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 2 }}><Field label="Quantity" value={values.quantity} onChangeText={(t) => set('quantity', t)} error={errors.quantity} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 3 }}><Field label="One serving is" value={values.serving_label} onChangeText={(t) => set('serving_label', t)} error={errors.serving_label} maxLength={60} /></View>
      </View>
      <Txt variant="small" muted>Nutrition in ONE serving</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {num('kcal', 'Calories')}{num('protein_g', 'Protein g')}{num('carbs_g', 'Carbs g')}{num('fat_g', 'Fat g')}{num('fiber_g', 'Fibre g')}
      </View>
      <View accessibilityLiveRegion="polite"><Txt>{Math.round(totals.kcal)} kcal in total · P {totals.protein_g} · C {totals.carbs_g} · F {totals.fat_g} · Fibre {totals.fiber_g}</Txt></View>
      <SelectField label="Category" value={values.category} options={cats.map((c) => ({ value: c, label: c }))} onChange={(v) => set('category', v)} error={errors.category} />
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} error={errors.notes} multiline numberOfLines={2} maxLength={300} style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 12 }} />
    </Sheet>
  )
}
export { FOOD_CATEGORIES }
