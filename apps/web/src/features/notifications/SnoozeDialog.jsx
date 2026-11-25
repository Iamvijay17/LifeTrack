import { useEffect, useState } from 'react'
import { addDays, localDayMinutes, zonedToMs } from '@lifetrack/utils'
import { validateSnooze } from '@lifetrack/core/notifications'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input } from '@/components/ui/form'
import { toAppError } from '@/services/errors'
import { formatWhen } from './notificationFormat'
import { useNotificationSettings } from './useNotificationSettings'

/**
 * Pick a date and time in the future. Used to snooze a notification until then and to move a reminder to then.
 * `onConfirm(ms)` may be async; if it throws, the message is shown here and the dialog stays open.
 */
export function SnoozeDialog({ open, onOpenChange, title, description, confirmLabel = 'Snooze', initial, onConfirm }) {
  const { tz, settings } = useNotificationSettings()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  // Depend on the values, not on the `initial` object: the page that renders this makes a new one on every tick of its clock, and each new object
  // would put the date and time back to where they started while you are choosing.
  const initialDate = initial?.date
  const initialTime = initial?.time
  useEffect(() => {
    if (!open) return
    // Start from the reminder's own time when moving one; otherwise tomorrow at the morning nudge time.
    setDate(initialDate ?? addDays(localDayMinutes(Date.now(), tz).date, 1))
    setTime(initialTime ?? settings.morning)
    setError('')
    setPending(false)
  }, [open, initialDate, initialTime, tz, settings.morning])

  const ms = date && /^\d{2}:\d{2}$/.test(time) ? zonedToMs(date, time, tz) : Number.NaN
  const problem = validateSnooze(ms, Date.now())

  const submit = async (e) => {
    e.preventDefault()
    if (problem) return setError(problem)
    setPending(true)
    try {
      await onConfirm(ms, { date, time })
      onOpenChange(false)
    } catch (err) {
      setError(toAppError(err).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      pending={pending}
      onSubmit={submit}
      submitLabel={confirmLabel}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input
            type="date"
            value={date}
            min={localDayMinutes(Date.now(), tz).date}
            clearable={false}
            onChange={(e) => {
              setDate(e.target.value)
              setError('')
            }}
          />
        </Field>
        <Field label="Time">
          <Input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value)
              setError('')
            }}
          />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="animate-slide-down text-xs text-danger">
          {error}
        </p>
      ) : (
        !problem && (
          <p className="text-xs text-muted-foreground">
            {confirmLabel === 'Snooze' ? 'It comes back' : 'It will go off'} {formatWhen(ms, tz)}.
          </p>
        )
      )}
    </FormDialog>
  )
}
