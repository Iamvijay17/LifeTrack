import { forwardRef, useEffect, useMemo, useRef } from 'react'
import { Bell, X } from 'lucide-react'
import {
  ALERT_CHOICES,
  CALENDAR_CATEGORIES,
  EVENT_COLORS,
  PRIORITY_META,
  REPEAT_PRESETS,
  alertLabel,
  describeRule,
  normalizeRule,
} from '@/domain/calendar'
import { RECURRENCES } from '@/domain/recurrence'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { addDays, diffDays, fmtClock, fmtDay, minutesToTime, timeToMinutes, uid, weekday } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { createCalendarEvent, createTask, saveCalendarEvent } from '@/services/api'
import { LINK_TYPES, blankValues, ruleFromValues, schema, toPayload, valuesFromItem } from './itemForm'

const WEEKDAYS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun'],
]

function timeOptions(prefs, current) {
  const list = []
  for (let m = 0; m < 1440; m += 15) list.push([minutesToTime(m), fmtClock(m, prefs.time_format === '12h')])
  if (/^\d{2}:\d{2}$/.test(current ?? '') && !list.some(([v]) => v === current))
    list.push([current, fmtClock(timeToMinutes(current), prefs.time_format === '12h')])
  return list.sort(([a], [b]) => a.localeCompare(b))
}
/** A time chooser in 15-minute steps, shown in the user's 12- or 24-hour format. A forwardRef, so react-hook-form's register() can reach the field. */
const TimeSelect = forwardRef(function TimeSelect({ prefs, current, ...props }, ref) {
  return (
    <Select ref={ref} {...props}>
      {timeOptions(prefs, current).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  )
})

/** The part of the form that says how an item repeats and when that stops. */
function RepeatFields({ form, kind, start }) {
  const { register, watch, setValue, formState } = form
  const v = watch()
  const { errors } = formState
  const presets = kind === 'task' ? RECURRENCES : REPEAT_PRESETS
  const rule = useMemo(
    () => (v.repeat === 'none' || (kind === 'task' && v.repeat === 'custom') ? null : ruleFromValues(v, start || '2026-01-01')),
    [v, kind, start],
  )
  // Choosing a weekly custom rule starts with the start date's weekday ticked, so it is valid until the user changes it.
  useEffect(() => {
    if (v.repeat === 'custom' && v.r_freq === 'weekly' && v.r_weekdays.length === 0 && start)
      setValue('r_weekdays', [weekday(start)], { shouldDirty: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the rule type changes
  }, [v.repeat, v.r_freq])
  const toggleDay = (d) =>
    setValue('r_weekdays', v.r_weekdays.includes(d) ? v.r_weekdays.filter((x) => x !== d) : [...v.r_weekdays, d], {
      shouldDirty: true,
      shouldValidate: true,
    })
  return (
    <div className="space-y-3">
      <Field label="Repeat">
        <Select {...register('repeat')}>
          {presets.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      {v.repeat === 'custom' && kind === 'event' && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3" data-testid="custom-repeat">
          <div className="grid grid-cols-[auto_5rem_1fr] items-center gap-2">
            <span className="text-sm">Every</span>
            <Field error={errors.r_interval?.message}>
              <Input type="number" inputMode="numeric" min={1} max={99} aria-label="Repeat every" {...register('r_interval')} />
            </Field>
            <Select aria-label="Repeat unit" {...register('r_freq')}>
              <option value="daily">{Number(v.r_interval) === 1 ? 'day' : 'days'}</option>
              <option value="weekly">{Number(v.r_interval) === 1 ? 'week' : 'weeks'}</option>
              <option value="monthly">{Number(v.r_interval) === 1 ? 'month' : 'months'}</option>
              <option value="yearly">{Number(v.r_interval) === 1 ? 'year' : 'years'}</option>
            </Select>
          </div>
          {v.r_freq === 'weekly' && (
            <div>
              <div role="group" aria-label="Repeat on" className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(([d, label]) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={v.r_weekdays.includes(d)}
                    onClick={() => toggleDay(d)}
                    className={cn(
                      'lt-press h-9 min-w-11 rounded-full border px-3 text-xs font-medium transition-colors',
                      v.r_weekdays.includes(d) ? 'border-mod bg-mod text-white' : 'border-border hover:bg-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {errors.r_weekdays && (
                <p role="alert" className="mt-1.5 text-xs text-danger">
                  {errors.r_weekdays.message}
                </p>
              )}
            </div>
          )}
          {v.r_freq === 'monthly' && start && (
            <Field label="On">
              <Select {...register('r_monthly')}>
                <option value="date">{`Day ${Number(start.slice(8))} of the month`}</option>
                <option value="weekday">
                  {describeRule({ freq: 'monthly', monthlyBy: 'weekday' }, start).replace('Every month on', 'The')}
                </option>
              </Select>
            </Field>
          )}
        </div>
      )}
      {v.repeat !== 'none' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ends">
            <Select {...register('ends')}>
              <option value="never">Never</option>
              <option value="on">On a date</option>
              {kind === 'event' && <option value="after">After a number of times</option>}
            </Select>
          </Field>
          {v.ends === 'on' && (
            <Field label="Last day" error={errors.ends_on?.message}>
              <Input type="date" {...register('ends_on')} />
            </Field>
          )}
          {v.ends === 'after' && kind === 'event' && (
            <Field label="Times" error={errors.ends_after?.message}>
              <Input type="number" inputMode="numeric" min={1} max={999} {...register('ends_after')} />
            </Field>
          )}
        </div>
      )}
      {rule && (
        <p className="text-xs text-muted-foreground" data-testid="repeat-summary">
          {describeRule(rule, start || '2026-01-01', (d) => fmtDay(d, 'd MMM yyyy'))}
        </p>
      )}
    </div>
  )
}

function AlertsField({ value, onChange, error }) {
  const free = ALERT_CHOICES.filter((c) => !value.includes(c.value))
  return (
    <Field label="Alerts" error={error} hint="They arrive in your notifications while LifeTrack is open on any of your devices.">
      <div className="space-y-2">
        {value.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {value.map((m) => (
              <li key={m} className="flex items-center gap-1 rounded-full border border-border bg-muted/40 py-1 pl-2.5 pr-1 text-xs">
                <Bell className="h-3 w-3 text-muted-foreground" aria-hidden />
                {alertLabel(m)}
                <button
                  type="button"
                  aria-label={`Remove alert: ${alertLabel(m)}`}
                  onClick={() => onChange(value.filter((x) => x !== m))}
                  className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {free.length > 0 && value.length < 5 && (
          <Select
            aria-label="Add an alert"
            value=""
            onChange={(e) => e.target.value !== '' && onChange([...value, Number(e.target.value)])}
          >
            <option value="">{value.length ? 'Add another alert…' : 'Add an alert…'}</option>
            {free.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        )}
      </div>
    </Field>
  )
}

function ColorField({ value, auto, onChange }) {
  return (
    <Field label="Colour">
      <div role="group" aria-label="Colour" className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!value}
          onClick={() => onChange('')}
          className={cn(
            'lt-press flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium',
            !value ? 'border-mod bg-mod/10' : 'border-border hover:bg-muted',
          )}
        >
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: auto }} />
          Match category
        </button>
        {EVENT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${c}`}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={cn(
              'lt-press relative h-6 w-6 rounded-full transition-shadow before:absolute before:-inset-1.5 before:content-[""]',
              value === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
            )}
            style={{ background: c }}
          />
        ))}
      </div>
    </Field>
  )
}

/** Choose a record this event is about. The goal, topic, application or routine stays where it is; the event just points at it. */
function LinkFields({ form }) {
  const { register, watch, setValue, formState } = form
  const { data } = useTables('goals', 'learning_topics', 'job_applications', 'routines')
  const type = watch('link_type')
  const options = {
    goal: data.goals.filter((g) => g.status === 'active').map((g) => [g.id, g.title]),
    topic: data.learning_topics.filter((t) => !t.archived).map((t) => [t.id, `${t.group_name} · ${t.name}`]),
    application: data.job_applications
      .filter((a) => !['rejected', 'withdrawn'].includes(a.status))
      .map((a) => [a.id, `${a.company} · ${a.job_title}`]),
    routine: data.routines.filter((r) => !r.archived_at).map((r) => [r.id, r.name]),
  }[type]
  const typeReg = register('link_type')
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Linked to">
        <Select
          {...typeReg}
          onChange={(e) => {
            typeReg.onChange(e)
            setValue('link_id', '')
          }}
        >
          {LINK_TYPES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </Field>
      {type && (
        <Field label="Which one" error={formState.errors.link_id?.message}>
          <Select {...register('link_id')} aria-label="Which one">
            <option value="">{options?.length ? 'Choose…' : 'Nothing to link yet'}</option>
            {(options ?? []).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  )
}

/**
 * Create or edit an event or a task.
 * `state` is { item } to edit something already on the calendar, or { kind, at } to start a new one (`at` = what was clicked: { date, startMin, endMin, allDay }).
 * Tasks are saved to `tasks` (the same rows the Planner shows) and events to `calendar_events`.
 */
export function ItemDialog({ open, onOpenChange, state, prefs, today, askScope, onDelete }) {
  const item = state?.item ?? null
  const editing = !!item
  const recordKey = item ? item.key : `new|${state?.kind}|${JSON.stringify(state?.at ?? {})}`
  const newId = useMemo(() => uid(), [open, recordKey]) // eslint-disable-line react-hooks/exhaustive-deps -- a fresh id each time the form opens, kept for retries
  const form = useDialogForm({
    open,
    schema,
    recordKey,
    valuesFor: () => (item ? valuesFromItem(item) : blankValues({ kind: state?.kind ?? 'event', at: state?.at, prefs, today })),
  })
  const { register, handleSubmit, watch, setValue, getValues, formState } = form
  const { errors } = formState
  const v = watch()
  const kind = v.kind
  const timed = kind === 'event' ? !v.all_day : v.timed

  // Keep the length when the start moves: changing the start date or time carries the end with it.
  const length = useRef(60)
  useEffect(() => {
    const s = Date.parse(`${v.start_date || '2000-01-01'}T${v.start_time || '00:00'}:00Z`)
    const e = Date.parse(`${v.end_date || v.start_date || '2000-01-01'}T${v.end_time || '00:00'}:00Z`)
    if (Number.isFinite(s) && Number.isFinite(e) && e >= s) length.current = Math.round((e - s) / 60000)
  }, [v.start_date, v.start_time, v.end_date, v.end_time])
  const shiftEnd = () => {
    const { start_date, start_time, all_day, end_date } = getValues()
    if (!start_date) return
    if (all_day) {
      const span = Math.max(0, diffDays(end_date || start_date, v.start_date || start_date))
      setValue('end_date', addDays(start_date, span), { shouldDirty: true, shouldValidate: true })
      return
    }
    const s = Date.parse(`${start_date}T${start_time || '00:00'}:00Z`)
    const end = new Date(s + length.current * 60000).toISOString()
    setValue('end_date', end.slice(0, 10), { shouldDirty: true, shouldValidate: true })
    setValue('end_time', end.slice(11, 16), { shouldDirty: true, shouldValidate: true })
  }
  const sd = register('start_date')
  const st = register('start_time')

  const [save, pending] = useAction(
    async (values) => {
      const { kind: k, values: row } = toPayload(values, { tz: prefs.timezone })
      if (!editing) {
        if (k === 'task') await createTask(row)
        else await createCalendarEvent({ ...row, id: newId })
      } else if (k === 'task') {
        await store.update('tasks', item.id, row)
      } else {
        let scope = 'all'
        if (item.row.rrule) {
          const before = JSON.stringify(normalizeRule(item.row.rrule, item.occurrenceDate))
          const changed = before !== JSON.stringify(normalizeRule(row.rrule, item.occurrenceDate))
          scope = await askScope('edit', { title: item.title, disableThis: changed })
          if (!scope) return undefined // cancelled: leave the form open
        }
        await saveCalendarEvent(item.row, row, { scope, occurrenceDate: item.occurrenceDate })
      }
      onOpenChange(false)
      return true
    },
    { success: editing ? 'Saved' : kind === 'task' ? 'Task added' : 'Event added' },
  )

  const title = editing ? (kind === 'task' ? 'Edit task' : 'Edit event') : kind === 'task' ? 'New task' : 'New event'
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={editing && item.recurring ? 'This repeats. You will choose how far a change reaches when you save.' : undefined}
      pending={pending}
      onSubmit={handleSubmit(save)}
      submitLabel={editing ? 'Save changes' : kind === 'task' ? 'Add task' : 'Add event'}
      className="md:max-w-xl"
      extraFooter={
        editing ? (
          <Button variant="ghost" className="mr-auto text-danger hover:bg-danger/10" onClick={() => onDelete(item)} disabled={pending}>
            Delete
          </Button>
        ) : null
      }
    >
      {!editing && (
        <Segmented
          className="w-full"
          value={kind}
          onChange={(k) => {
            setValue('kind', k, { shouldDirty: true })
            if (k === 'task' && v.repeat === 'custom') setValue('repeat', 'none')
          }}
          options={[
            { value: 'event', label: 'Event' },
            { value: 'task', label: 'Task' },
          ]}
        />
      )}
      <Field label="Title" error={errors.title?.message}>
        <Input autoFocus placeholder={kind === 'task' ? 'What needs to get done?' : 'Add a title'} {...register('title')} />
      </Field>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
        <span className="text-sm font-medium">{kind === 'event' ? 'All day' : 'Set a time'}</span>
        {kind === 'event' ? (
          <Switch
            checked={v.all_day}
            label="All day"
            onChange={(on) => setValue('all_day', on, { shouldDirty: true, shouldValidate: true })}
          />
        ) : (
          <Switch
            checked={v.timed}
            label="Set a time"
            onChange={(on) => setValue('timed', on, { shouldDirty: true, shouldValidate: true })}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === 'event' ? 'Starts' : 'Date'} error={errors.start_date?.message}>
          <Input
            type="date"
            {...sd}
            onChange={(e) => {
              sd.onChange(e)
              shiftEnd()
            }}
          />
        </Field>
        {timed ? (
          <Field label={kind === 'event' ? 'Start time' : 'From'} error={errors.start_time?.message}>
            <TimeSelect
              prefs={prefs}
              current={v.start_time}
              {...st}
              onChange={(e) => {
                st.onChange(e)
                shiftEnd()
              }}
            />
          </Field>
        ) : (
          kind === 'event' && <div />
        )}
        {kind === 'event' && (
          <Field label="Ends" error={errors.end_date?.message}>
            <Input type="date" {...register('end_date')} />
          </Field>
        )}
        {timed && (
          <Field label={kind === 'event' ? 'End time' : 'To'} error={errors.end_time?.message}>
            <TimeSelect prefs={prefs} current={v.end_time} {...register('end_time')} />
          </Field>
        )}
      </div>

      <RepeatFields form={form} kind={kind} start={v.start_date} />
      <AlertsField
        value={v.alerts}
        error={errors.alerts?.message}
        onChange={(next) => setValue('alerts', next, { shouldDirty: true, shouldValidate: true })}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select {...register('category')}>
            {CALENDAR_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select {...register('priority')}>
            {Object.entries(PRIORITY_META).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {v.category === 'custom' && kind === 'event' && (
        <Field label="Category name" error={errors.category_label?.message}>
          <Input placeholder="e.g. Reading club" {...register('category_label')} />
        </Field>
      )}
      <ColorField
        value={v.color}
        auto={CALENDAR_CATEGORIES.find((c) => c.key === v.category)?.color}
        onChange={(c) => setValue('color', c, { shouldDirty: true })}
      />
      <Field label="Location" error={errors.location?.message}>
        <Input placeholder="Add a place or a link" {...register('location')} />
      </Field>
      {kind === 'event' && open && <LinkFields form={form} />}
      <Field label={kind === 'task' ? 'Notes' : 'Description'} error={errors.description?.message}>
        <Textarea {...register('description')} />
      </Field>
      {kind === 'event' && (
        <p className="text-xs text-muted-foreground">
          Times are in {prefs.timezone}. {errors.alerts ? '' : 'Change your timezone in Settings.'}
        </p>
      )}
    </FormDialog>
  )
}
