import {
  Bell,
  CalendarClock,
  CalendarPlus,
  CircleCheckBig,
  Copy,
  CopyPlus,
  ExternalLink,
  ListTodo,
  Pencil,
  RotateCcw,
  Trash2,
  Eye,
  CalendarDays,
  RefreshCw,
} from 'lucide-react'
import { ALERT_CHOICES, planMove } from '@lifetrack/core/calendar'
import { SEPARATOR } from '@/components/context-menu/items'
import { copyDetails, previous } from '@/components/context-menu/helpers'
import { addDays, fmtDay } from '@/lib/dates'
import { applyCalendarChange, createCalendarEvent, saveCalendarEvent } from '@/services/api'
import * as store from '@/hooks/store'
import { HOUR_PX } from './format'

const DAYS = (today) => [
  { label: 'Today', date: today },
  { label: 'Tomorrow', date: addDays(today, 1) },
  { label: 'In a week', date: addDays(today, 7) },
]

/** Where in the calendar a right-click landed: the item under it, or the day (and time) of the empty space. */
export function calendarHit(target, point, shown) {
  if (!(target instanceof Element)) return {}
  const el = target.closest('[data-cal-item]')
  if (el) return { item: shown.find((i) => i.key === el.dataset.calItem) }
  const cell = target.closest('[data-drop][data-date]')
  if (!cell) return {}
  const date = cell.dataset.date
  if (cell.dataset.drop === 'grid') {
    const minutes = ((point.y - cell.getBoundingClientRect().top) / HOUR_PX) * 60
    const startMin = Math.max(0, Math.min(Math.floor(minutes / 30) * 30, 1440 - 15))
    return { slot: { date, startMin } }
  }
  return { slot: { date, allDay: cell.dataset.drop === 'lane' ? true : undefined } }
}

/**
 * One calendar item. `d`: { today, ctx: {tz, defaultDuration}, edit, open, remove, toggleDone, commit, navigate }.
 * Changing the date goes through the same plan the drag-and-drop uses (planMove), so a menu move and a drag do exactly the same write.
 */
export function calendarItemItems(item, d) {
  const { kind } = item
  const editable = item.editable
  const reminderTable = kind === 'task' ? 'tasks' : kind === 'event' ? 'calendar_events' : null

  const moveTo = async (date) => {
    const planned = planMove(item, { date, startMin: 'keep' }, d.ctx)
    if (!planned) return undefined
    const { change } = planned
    const isEvent = change.table === 'calendar_events'
    const before = isEvent ? null : previous(item.row, change.patch)
    const eventBefore = isEvent && !item.row.rrule ? previous(item.row, { starts_at: 1, ends_at: 1, all_day: 1 }) : null
    if (!(await d.commit(item, planned))) return undefined
    const message = `Moved to ${fmtDay(date, 'EEE d MMM')}`
    if (before) return { message, undo: () => applyCalendarChange({ table: change.table, id: change.id, patch: before }) }
    // A single event goes back through the same save; a repeating one is not offered Undo (which occurrences moved is the person's call).
    if (eventBefore)
      return {
        message,
        undo: () =>
          saveCalendarEvent(store.peek('calendar_events').find((e) => e.id === item.id) ?? item.row, eventBefore, { scope: 'all' }),
      }
    return { message }
  }

  const setAlerts = async (minutes) => {
    const was = item.alertMinutes ?? []
    const write = (list) =>
      kind === 'task'
        ? store.update('tasks', item.id, { alert_minutes: list })
        : saveCalendarEvent(item.row, { alert_minutes: list }, { scope: 'all' })
    await write(minutes)
    return { message: minutes.length ? 'Reminder set' : 'Reminders cleared', undo: () => write(was) }
  }

  const duplicate = async () => {
    if (kind === 'task') {
      const { id, created_at, updated_at, user_id, ...rest } = item.row
      ;(void id, created_at, updated_at, user_id)
      const copy = await store.insert('tasks', {
        ...rest,
        title: `${item.title} (copy)`,
        status: 'pending',
        started_at: null,
        completed_at: null,
        recurrence: 'none',
        recurrence_until: null,
        series_id: null,
      })
      return { message: 'Task duplicated', undo: () => store.remove('tasks', copy.id) }
    }
    const { id, created_at, updated_at, user_id, ...rest } = item.row
    ;(void id, created_at, updated_at, user_id)
    const copy = await createCalendarEvent({ ...rest, title: `${item.title} (copy)` })
    return { message: 'Event duplicated', undo: () => store.remove('calendar_events', copy.id) }
  }

  return [
    { label: 'View details', icon: Eye, onSelect: () => d.open(item) },
    item.href && { label: kind === 'interview' ? 'Open in Job Switch' : 'Open', icon: ExternalLink, onSelect: () => d.navigate(item.href) },
    item.completable && {
      label: item.done ? 'Mark incomplete' : 'Mark complete',
      icon: item.done ? RotateCcw : CircleCheckBig,
      onSelect: () => d.toggleDone(item),
    },
    editable && { label: kind === 'task' ? 'Edit task' : 'Edit event', icon: Pencil, onSelect: () => d.edit(item) },
    SEPARATOR,
    item.movable && {
      label: 'Change date',
      icon: CalendarClock,
      items: () => [
        ...DAYS(d.today).map((x) => ({ label: x.label, onSelect: () => moveTo(x.date) })),
        { label: 'Pick a date…', onSelect: () => d.edit(item) },
      ],
    },
    reminderTable && {
      label: 'Set reminder',
      icon: Bell,
      items: () => [
        ...ALERT_CHOICES.map((c) => ({
          label: c.label,
          checked: (item.alertMinutes ?? []).includes(c.value),
          onSelect: () => {
            const has = (item.alertMinutes ?? []).includes(c.value)
            const next = has
              ? item.alertMinutes.filter((m) => m !== c.value)
              : [...(item.alertMinutes ?? []), c.value].sort((a, b) => a - b)
            return setAlerts(next)
          },
        })),
        SEPARATOR,
        { label: 'No reminders', hidden: !(item.alertMinutes ?? []).length, onSelect: () => setAlerts([]) },
      ],
    },
    reminderTable && { label: 'Duplicate', icon: CopyPlus, onSelect: duplicate },
    {
      label: 'Copy details',
      icon: Copy,
      onSelect: () =>
        copyDetails(item.title, [
          ['Date', fmtDay(item.date, 'EEE d MMM yyyy')],
          ['Location', item.location],
          ['Notes', item.description],
        ]),
    },
    item.deletable && SEPARATOR,
    item.deletable && {
      label: kind === 'task' ? 'Delete task' : 'Delete event',
      icon: Trash2,
      danger: true,
      onSelect: () => d.remove(item),
    }, // asks (and for a repeating event, how far) itself
  ]
}

/** Empty space on the grid, a month cell, or the all-day lane. */
export function calendarSlotItems(slot, d) {
  const where = fmtDay(slot.date, 'EEE d MMM')
  return [
    {
      label: `New event · ${where}`,
      icon: CalendarPlus,
      shortcut: 'N',
      onSelect: () => d.create({ ...slot, allDay: slot.allDay ?? false }, 'event'),
    },
    {
      label: `New task · ${where}`,
      icon: ListTodo,
      shortcut: '⇧N',
      onSelect: () => d.create({ ...slot, allDay: slot.allDay ?? false }, 'task'),
    },
    SEPARATOR,
    { label: 'Open this day', icon: CalendarDays, hidden: d.view === 'day', onSelect: () => d.openDay(slot.date) },
  ]
}

/** The calendar's own empty-area menu (toolbar and gutters). */
export function calendarPageItems(d) {
  return [
    { label: 'New event', icon: CalendarPlus, shortcut: 'N', onSelect: () => d.create({ date: d.date, allDay: false }, 'event') },
    { label: 'New task', icon: ListTodo, shortcut: '⇧N', onSelect: () => d.create({ date: d.date, allDay: false }, 'task') },
    SEPARATOR,
    { label: 'Go to today', icon: CalendarDays, shortcut: 'T', onSelect: d.toToday },
    { label: 'Refresh', icon: RefreshCw, onSelect: d.refresh, success: 'Calendar refreshed' },
  ]
}
