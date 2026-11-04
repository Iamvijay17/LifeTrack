import { z } from 'zod'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { DEFAULT_WEIGHTS, SCORE_CATEGORIES, normalizeWeights, weightShares } from '@/domain/score'
import { useAction } from '@/hooks/useAction'
import { useRecordForm } from '@/hooks/useRecordForm'
import { useSettings } from '@/hooks/useSettings'

const range = (label) =>
  z.coerce
    .number({ error: `${label}: enter a weight between 0 and 100.` })
    .min(0, `${label}: enter a weight between 0 and 100.`)
    .max(100, `${label}: enter a weight between 0 and 100.`)
const schema = z
  .object(Object.fromEntries(SCORE_CATEGORIES.map((c) => [c.key, range(c.label)])))
  .refine((w) => Object.values(w).some((x) => x > 0), {
    path: [SCORE_CATEGORIES[0].key],
    message: 'At least one weight must be above zero.',
  })

const toForm = (weights) => Object.fromEntries(SCORE_CATEGORIES.map((c) => [c.key, String(weights[c.key])]))

/** How much each category counts towards the daily score. Categories with nothing logged that day are skipped and the rest re-balanced. */
export function ScoreWeightsCard() {
  const { settings, row, save } = useSettings()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useRecordForm({
    schema,
    recordKey: 'score-weights',
    version: row?.updated_at,
    valuesFor: () => toForm(normalizeWeights(settings.score_weights)),
  })
  const shares = weightShares(watch())

  const [submit, pending] = useAction(
    async (v) => {
      await save({ score_weights: Object.fromEntries(SCORE_CATEGORIES.map((c) => [c.key, v[c.key]])) })
      reset(toForm(v))
    },
    { success: 'Score weights saved' },
  )

  return (
    <SettingsSection
      title="Daily score weights"
      desc="Categories with nothing planned or logged that day are skipped and the remaining weights are re-balanced, so rest days are never penalised."
    >
      <form noValidate className="space-y-4" onSubmit={handleSubmit(submit)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SCORE_CATEGORIES.map((c) => (
            <Field key={c.key} label={c.label} hint={`${shares[c.key]}% of the total`} error={errors[c.key]?.message}>
              <Input type="number" min={0} max={100} inputMode="numeric" {...register(c.key)} />
            </Field>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={pending} disabled={!isDirty}>
            Save weights
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => reset(toForm(DEFAULT_WEIGHTS), { keepDefaultValues: true })}
          >
            Reset to default
          </Button>
        </div>
      </form>
    </SettingsSection>
  )
}
