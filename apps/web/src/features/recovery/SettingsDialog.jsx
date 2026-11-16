import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Select, Switch } from '@/components/ui/form'
import { TimePicker } from '@/components/ui/pickers'
import { useAction } from '@/hooks/useAction'
import { recoveryConfig } from '@/domain/recovery'
import { minutesToTime } from '@/lib/dates'

const HORIZONS = [3, 5, 7, 10, 14, 21, 30]
const CAPACITY = [4, 5, 6, 7, 8, 9, 10, 12]

/** Working hours, how much a day can hold and how far ahead to look. Stored in the calendar settings (no new column). */
export function SettingsDialog({ open, onOpenChange, prefs, update }) {
  const [v, setV] = useState(null)
  useEffect(() => {
    if (!open) return
    const c = recoveryConfig(prefs)
    setV({
      start: minutesToTime(c.workStart),
      end: minutesToTime(c.workEnd),
      capacity: c.capacityMinutes / 60,
      horizon: c.horizonDays,
      weekends: c.skipWeekends,
    })
  }, [open, prefs])
  const [save, pending] = useAction(
    async () => {
      await update({
        recovery_work_start: v.start,
        recovery_work_end: v.end,
        recovery_capacity_hours: Number(v.capacity),
        recovery_horizon_days: Number(v.horizon),
        recovery_skip_weekends: v.weekends,
      })
      onOpenChange(false)
    },
    { success: 'Recovery settings saved' },
  )
  if (!v) return null
  const bad = v.end <= v.start
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Recovery settings"
      description="Suggestions only use time inside your working hours."
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending} disabled={bad}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Day starts">
          <TimePicker value={v.start} onChange={(e) => setV({ ...v, start: e.target.value.slice(0, 5) })} aria-label="Day starts" />
        </Field>
        <Field label="Day ends" error={bad ? 'Must be after the start.' : undefined}>
          <TimePicker value={v.end} onChange={(e) => setV({ ...v, end: e.target.value.slice(0, 5) })} aria-label="Day ends" />
        </Field>
        <Field label="A full day is" hint="Above this a day counts as overloaded.">
          <Select value={String(v.capacity)} onChange={(e) => setV({ ...v, capacity: e.target.value })} aria-label="A full day is">
            {CAPACITY.map((h) => (
              <option key={h} value={h}>
                {h} hours
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Look ahead" hint="How far to search for free time.">
          <Select value={String(v.horizon)} onChange={(e) => setV({ ...v, horizon: e.target.value })} aria-label="Look ahead">
            {HORIZONS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <div className="flex items-center gap-3 text-sm">
            <Switch checked={v.weekends} onChange={(c) => setV({ ...v, weekends: c })} label="Keep weekends free" />
            <span>Keep weekends free</span>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
