import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input } from '@/components/ui/form'
import { nutritionGoalsFormSchema, nutritionGoalsToForm, nutritionGoalsToPayload } from '@lifetrack/schemas'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import { useSettings } from '@/hooks/useSettings'
import { saveNutritionGoals } from '@/services/api'

const FIELDS = [
  ['calorie_goal', 'Calories (kcal)', 'e.g. 2000'],
  ['protein_goal_g', 'Protein (g)', ''],
  ['carbs_goal_g', 'Carbs (g)', ''],
  ['fat_goal_g', 'Fat (g)', ''],
  ['fiber_goal_g', 'Fibre (g)', ''],
  ['water_goal_ml', 'Water (ml)', 'e.g. 3000'],
]

/** Daily targets. Every field is optional: an empty one means "no goal", and LifeTrack never suggests a number. */
export function GoalsDialog({ open, onOpenChange, settingsRow }) {
  const { settings } = useSettings()
  const form = useDialogForm({
    open,
    schema: nutritionGoalsFormSchema,
    recordKey: `${settingsRow?.id}|${settingsRow?.updated_at}|${settings.water_goal_ml}`,
    valuesFor: () => nutritionGoalsToForm(settingsRow, settings.water_goal_ml),
  })
  const {
    register,
    formState: { errors },
  } = form
  const [save, pending] = useAction(
    async (v) => {
      const { settings: goals, waterGoalMl } = nutritionGoalsToPayload(v)
      await saveNutritionGoals(goals, waterGoalMl)
      onOpenChange(false)
    },
    { success: 'Daily targets saved' },
  )
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Daily targets"
      description="Set what suits you; change it any time. Leave a field empty for no target."
      pending={pending}
      onSubmit={form.handleSubmit(save)}
    >
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(([key, label, placeholder]) => (
          <Field key={key} label={label} error={errors[key]?.message} className={key === 'calorie_goal' ? 'col-span-2' : undefined}>
            <Input inputMode="numeric" placeholder={placeholder} {...register(key)} />
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        LifeTrack doesn&apos;t recommend calorie or nutrient amounts. Use the figures from your own plan or a qualified professional. The
        water goal is shared with Sleep &amp; Health.
      </p>
    </FormDialog>
  )
}
