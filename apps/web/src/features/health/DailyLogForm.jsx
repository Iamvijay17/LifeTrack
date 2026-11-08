import { z } from 'zod'
import { Trash2 } from 'lucide-react'
import { DateNav } from '@/components/shared/DateNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/form'
import { formToLog, logToForm } from '@/domain/health'
import { sleepMinutes } from '@/domain/sleep'
import { numberInRange, optionalTime } from '@/lib/validation'
import { fmtDay, fmtDuration } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { useRecordForm } from '@/hooks/useRecordForm'
import { saveHealth } from '@/services/api'
import { cn } from '@/lib/utils'

const schema = z
  .object({
    bedtime: optionalTime,
    wake_time: optionalTime,
    water_ml: numberInRange(0, 20000, 'Water'),
    steps: numberInRange(0, 200000, 'Steps'),
    energy_level: z.string(),
    weight_kg: numberInRange(20, 500, 'Weight'),
    notes: z.string().max(1000),
  })
  .superRefine((v, ctx) => {
    if (!!v.bedtime !== !!v.wake_time)
      ctx.addIssue({ code: 'custom', path: [v.bedtime ? 'wake_time' : 'bedtime'], message: 'Enter both bedtime and wake-up time' })
    if (v.bedtime && v.wake_time && sleepMinutes(v.bedtime, v.wake_time) == null)
      ctx.addIssue({ code: 'custom', path: ['wake_time'], message: 'Bedtime and wake-up time can’t be identical' })
  })

/**
 * One day's health log. Keeps your unsaved text when the log changes elsewhere (another device, or the water dialog):
 * only fields you have not touched are refreshed.
 */
export function DailyLogForm({ day, today, log, onDayChange }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useRecordForm({ schema, recordKey: day, version: `${log?.id}|${log?.updated_at}`, valuesFor: () => logToForm(log) })

  const energy = watch('energy_level')
  const liveSleep = sleepMinutes(watch('bedtime'), watch('wake_time'))

  const [save, saving] = useAction(
    async (v) => {
      await saveHealth(day, formToLog(v))
      reset(v) // what was just saved is the new baseline
    },
    { success: 'Health log saved' },
  )
  const removeLog = useConfirmedDelete('health_logs', 'Log deleted')

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Daily log</CardTitle>
        <DateNav date={day} onChange={onDayChange} today={today} />
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(save)} noValidate className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bedtime" error={errors.bedtime?.message}>
              <Input type="time" {...register('bedtime')} />
            </Field>
            <Field label="Wake-up" error={errors.wake_time?.message}>
              <Input type="time" {...register('wake_time')} />
            </Field>
          </div>
          {liveSleep != null && (
            <p className="animate-slide-down rounded-md bg-mod/10 px-3 py-1.5 text-sm" data-testid="sleep-duration">
              Sleep: <b>{fmtDuration(liveSleep)}</b>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Water (ml)" error={errors.water_ml?.message}>
              <Input type="number" inputMode="numeric" min={0} {...register('water_ml')} />
            </Field>
            <Field label="Steps" error={errors.steps?.message}>
              <Input type="number" inputMode="numeric" min={0} {...register('steps')} />
            </Field>
          </div>
          <div className="space-y-1.5">
            <p className="flex justify-between text-[13px] font-medium text-foreground/90">
              Energy level
              <span className="text-xs font-normal text-muted-foreground">1 low · 5 high</span>
            </p>
            <div role="group" aria-label="Energy level" className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={energy === String(n)}
                  aria-label={`Energy ${n} of 5`}
                  onClick={() => setValue('energy_level', energy === String(n) ? '' : String(n), { shouldDirty: true })}
                  className={cn(
                    'lt-press h-11 flex-1 rounded-md border text-sm font-medium tabular-nums transition-colors duration-150 md:h-9',
                    energy === String(n) ? 'border-mod bg-mod/15 text-mod-text' : 'border-border text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Field label="Weight (kg)" error={errors.weight_kg?.message}>
            <Input type="number" inputMode="decimal" step="0.1" {...register('weight_kg')} />
          </Field>
          <Field label="Notes">
            <Textarea rows={2} {...register('notes')} />
          </Field>
          <div className="flex justify-between gap-2">
            {log ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => removeLog(log.id, { title: `Delete the log for ${fmtDay(day, 'd MMM')}?` })}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" loading={saving} disabled={!isDirty && !!log}>
              {log ? 'Update log' : 'Save log'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
