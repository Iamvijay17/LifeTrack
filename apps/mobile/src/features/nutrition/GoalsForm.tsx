import { useEffect } from 'react'
import { View } from 'react-native'
import { nutritionGoalsFormSchema, nutritionGoalsToForm, nutritionGoalsToPayload } from '@lifetrack/schemas'
import { api } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../hooks/useSettings'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { Button, Field, Txt } from '../../ui'

const FIELDS: [keyof ReturnType<typeof nutritionGoalsToForm>, string][] = [['calorie_goal', 'Calories (kcal)'], ['protein_goal_g', 'Protein (g)'], ['carbs_goal_g', 'Carbs (g)'], ['fat_goal_g', 'Fat (g)'], ['fiber_goal_g', 'Fibre (g)'], ['water_goal_ml', 'Water (ml)']]

/** Daily targets. Every field is optional; empty means "no goal". The app never suggests a number. */
export function GoalsForm({ visible, settingsRow, onClose }: { visible: boolean; settingsRow: any | null; onClose: () => void }) {
  const { settings } = useSettings()
  const { values, errors, set, reset, validate } = useZodForm(nutritionGoalsFormSchema, nutritionGoalsToForm(null, null))
  useEffect(() => { if (visible) reset(nutritionGoalsToForm(settingsRow, settings.water_goal_ml)) }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const { settings: goals, waterGoalMl } = nutritionGoalsToPayload(v)
    await api.saveNutritionGoals(goals, waterGoalMl)
    onClose()
  })
  return (
    <Sheet visible={visible} title="Daily targets" onClose={onClose} footer={<Button title="Save targets" onPress={save} loading={pending} />}>
      <Txt muted>Set what suits you and change it any time. Leave a field empty for no target.</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {FIELDS.map(([key, label]) => <View key={key} style={{ flexBasis: '45%', flexGrow: 1 }}><Field label={label} value={values[key]} onChangeText={(t) => set(key, t)} error={errors[key]} keyboardType="number-pad" /></View>)}
      </View>
      <Txt variant="small" muted>LifeTrack doesn't recommend calorie or nutrient amounts. Use the figures from your own plan or a qualified professional. The water goal is shared with Sleep &amp; Health.</Txt>
    </Sheet>
  )
}
