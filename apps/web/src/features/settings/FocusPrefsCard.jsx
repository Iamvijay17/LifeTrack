import { z } from 'zod'
import { Timer } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { useRecordForm } from '@/hooks/useRecordForm'
import { useSettings } from '@/hooks/useSettings'

const whole = (min, max, message) => z.coerce.number({ error: message }).int(message).min(min, message).max(max, message)
const schema = z.object({
  short_break: whole(1, 60, 'Short break: 1–60 minutes.'),
  long_break: whole(1, 120, 'Long break: 1–120 minutes.'),
  long_every: whole(2, 10, 'Long break every: 2–10 sessions.'),
})
const toForm = (f) => ({ short_break: String(f.short_break), long_break: String(f.long_break), long_every: String(f.long_every) })

/** Break lengths for the Pomodoro timer. */
export function FocusPrefsCard() {
  const { settings, row, save } = useSettings()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useRecordForm({ schema, recordKey: 'focus-prefs', version: row?.updated_at, valuesFor: () => toForm(settings.focus_prefs) })

  const [submit, pending] = useAction(
    async (v) => {
      await save({ focus_prefs: v })
      reset(toForm(v))
    },
    { success: 'Focus settings saved' },
  )

  return (
    <SettingsSection icon={Timer} title="Focus mode" desc="Break lengths for the Pomodoro timer.">
      <form noValidate className="space-y-4" onSubmit={handleSubmit(submit)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Short break (min)" error={errors.short_break?.message}>
            <Input type="number" inputMode="numeric" {...register('short_break')} />
          </Field>
          <Field label="Long break (min)" error={errors.long_break?.message}>
            <Input type="number" inputMode="numeric" {...register('long_break')} />
          </Field>
          <Field label="Long break every (sessions)" error={errors.long_every?.message}>
            <Input type="number" inputMode="numeric" {...register('long_every')} />
          </Field>
        </div>
        <Button type="submit" loading={pending} disabled={!isDirty}>
          Save
        </Button>
      </form>
    </SettingsSection>
  )
}
