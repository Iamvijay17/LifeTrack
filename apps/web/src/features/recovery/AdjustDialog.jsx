import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/form'
import { DatePicker, TimePicker } from '@/components/ui/pickers'
import { checkPlacement } from '@/domain/recovery'
import { minutesToTime, timeToMinutes } from '@/lib/dates'
import { hm, whenLong } from './format'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]

/**
 * Pick the date, start and length by hand. It checks the choice against everything on the calendar as you type, so a clash is shown before you can
 * save. `accepted` = the other changes about to be applied together, so two of them cannot be set on top of each other.
 */
export function AdjustDialog({ open, onOpenChange, suggestion, initial, source, ctx, accepted, onSave }) {
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [dur, setDur] = useState(60)
  useEffect(() => {
    if (!open || !initial) return
    setDate(initial.date)
    setStart(initial.start)
    setDur(Math.max(15, timeToMinutes(initial.end) - timeToMinutes(initial.start)))
  }, [open, initial])

  const placement = useMemo(() => {
    const s = timeToMinutes(start)
    return { date, start, end: s == null ? '' : minutesToTime(Math.min(1440, s + dur)) }
  }, [date, start, dur])
  const result = useMemo(
    () => (open && suggestion && date ? checkPlacement(source, ctx, { taskId: suggestion.taskId, ...placement }, { accepted }) : null),
    [open, suggestion, date, placement, source, ctx, accepted],
  )
  const options = [...new Set([...DURATIONS, dur])].sort((a, b) => a - b)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Choose a time"
      description={suggestion ? `Move “${suggestion.title}” to a time that works for you.` : undefined}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!result?.ok} onClick={() => onSave(placement)}>
            Use this time
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Day">
          <DatePicker
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            clearable={false}
            min={ctx.today}
            aria-label="Day"
          />
        </Field>
        <Field label="Starts">
          <TimePicker value={start} onChange={(e) => e.target.value && setStart(e.target.value.slice(0, 5))} aria-label="Start time" />
        </Field>
        <Field label="Length" className="sm:col-span-2">
          <Select value={String(dur)} onChange={(e) => setDur(Number(e.target.value))} aria-label="Length">
            {options.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} minutes` : d % 60 === 0 ? `${d / 60} hour${d === 60 ? '' : 's'}` : `${Math.floor(d / 60)} h ${d % 60} min`}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 min-h-[3.5rem] rounded-lg border border-border bg-muted/30 p-3 text-sm" aria-live="polite">
        {result?.errors.length ? (
          result.errors.map((e) => (
            <p key={e.code} role="alert" className="flex items-start gap-2 text-danger">
              <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {e.message}
            </p>
          ))
        ) : result ? (
          <>
            <p className="flex items-center gap-2 text-success">
              <Check className="h-4 w-4" aria-hidden /> Free: {whenLong(date, ctx.today)}, {hm(placement.start, ctx.prefs)} –{' '}
              {hm(placement.end, ctx.prefs)}
            </p>
            {result.warnings.map((w) => (
              <p key={w.code} className="mt-1 flex items-start gap-2 text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {w.message}
              </p>
            ))}
          </>
        ) : null}
      </div>
    </Dialog>
  )
}
