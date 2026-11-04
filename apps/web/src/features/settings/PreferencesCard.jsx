import { z } from 'zod'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { useRecordForm } from '@/hooks/useRecordForm'
import { useSettings } from '@/hooks/useSettings'
import { TIMEZONES, todayStr } from '@/lib/dates'
import { CURRENCIES, parseMoney, paiseToInput } from '@/lib/money'
import { MAX_SLEEP_GOAL_MINUTES, MIN_SLEEP_GOAL_MINUTES, sleepGoalOf } from '@lifetrack/core/sleep'

const validTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
const schema = z.object({
  timezone: z.string().refine(validTimezone, 'Unknown timezone'),
  currency: z.enum(['INR', 'USD', 'EUR']),
  week_starts_on: z.coerce.number().refine((n) => n === 0 || n === 1),
  daily_study_target_minutes: z.coerce.number({ error: 'Enter minutes' }).int().min(0).max(1440, 'Max 1440'),
  monthly_budget: z.string().refine((v) => v.trim() === '' || parseMoney(v) !== null, 'Enter an amount like 30000'),
  water_goal_ml: z.coerce.number().int().min(0).max(20000),
  steps_goal: z.coerce.number().int().min(0).max(200000),
  sleep_goal_hours: z.coerce
    .number({ error: 'Enter hours' })
    .min(MIN_SLEEP_GOAL_MINUTES / 60, 'At least 4 hours')
    .max(MAX_SLEEP_GOAL_MINUTES / 60, 'At most 12 hours'),
})

export const settingsToForm = (s) => ({
  timezone: s.timezone,
  currency: s.currency,
  week_starts_on: String(s.week_starts_on),
  daily_study_target_minutes: s.daily_study_target_minutes,
  monthly_budget: s.monthly_budget_paise ? paiseToInput(s.monthly_budget_paise) : '',
  water_goal_ml: s.water_goal_ml,
  steps_goal: s.steps_goal,
  sleep_goal_hours: sleepGoalOf(s) / 60,
})

/** Timezone, currency, week start and daily targets. Edits are never overwritten by changes saved elsewhere in Settings. */
export function PreferencesCard() {
  const { settings, row, save } = useSettings()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useRecordForm({ schema, recordKey: 'preferences', version: row?.updated_at, valuesFor: () => settingsToForm(settings) })

  const [submit, pending] = useAction(
    async (v) => {
      const { monthly_budget, sleep_goal_hours, ...rest } = v
      await save({
        ...rest,
        monthly_budget_paise: monthly_budget.trim() ? parseMoney(monthly_budget) : 0,
        habit_prefs: { ...settings.habit_prefs, sleep_goal_minutes: Math.round(sleep_goal_hours * 60) },
      })
      reset(v)
    },
    { success: 'Preferences saved' },
  )
  const timezones = TIMEZONES.includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES]

  return (
    <SettingsSection title="Preferences" desc="All dates and daily totals use this timezone on every device.">
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Timezone" error={errors.timezone?.message} hint={`Today there: ${todayStr(settings.timezone)}`}>
            <Select {...register('timezone')}>
              {timezones.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" error={errors.currency?.message}>
            <Select {...register('currency')}>
              {Object.keys(CURRENCIES).map((c) => (
                <option key={c} value={c}>
                  {c} ({CURRENCIES[c].symbol})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Week starts on" hint="Used for weekly habits and weekly stats.">
            <Select {...register('week_starts_on')}>
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </Select>
          </Field>
          <Field
            label="Daily study target (minutes)"
            error={errors.daily_study_target_minutes?.message}
            hint="0 removes it from daily progress."
          >
            <Input type="number" inputMode="numeric" {...register('daily_study_target_minutes')} />
          </Field>
          <Field label="Default monthly expense budget" error={errors.monthly_budget?.message}>
            <Input inputMode="decimal" placeholder="e.g. 30000" {...register('monthly_budget')} />
          </Field>
          <Field label="Water goal (ml)" error={errors.water_goal_ml?.message}>
            <Input type="number" inputMode="numeric" {...register('water_goal_ml')} />
          </Field>
          <Field label="Daily steps goal" error={errors.steps_goal?.message}>
            <Input type="number" inputMode="numeric" {...register('steps_goal')} />
          </Field>
          <Field label="Sleep goal (hours)" error={errors.sleep_goal_hours?.message} hint="Used for your daily score and health charts.">
            <Input type="number" inputMode="decimal" step="0.5" {...register('sleep_goal_hours')} />
          </Field>
        </div>
        <Button type="submit" loading={pending} disabled={!isDirty}>
          Save preferences
        </Button>
      </form>
    </SettingsSection>
  )
}
