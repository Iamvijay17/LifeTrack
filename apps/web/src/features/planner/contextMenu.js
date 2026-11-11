import {
  CalendarClock,
  CalendarPlus,
  Copy,
  CopyPlus,
  Flag,
  FolderInput,
  ListChecks,
  Pencil,
  RotateCcw,
  SquareCheckBig,
  TextCursorInput,
  Trash2,
} from 'lucide-react'
import { SEPARATOR } from '@/components/context-menu/items'
import { bulkDelete, changeField, changeFields, copyDetails, count, duplicateRow } from '@/components/context-menu/helpers'
import { TASK_CATEGORIES } from '@/domain/defaults'
import { addDays, fmtDay } from '@/lib/dates'
import { setTaskStatus } from '@/services/api'
import * as store from '@/hooks/store'

const PRIORITIES = ['high', 'medium', 'low']
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const finished = (t) => t.status === 'done' || t.status === 'cancelled' || t.status === 'skipped'

/** Complete or reopen. A repeating task spawns its next occurrence when completed, which Undo cannot take back, so only plain tasks offer it. */
async function setStatus(task, status, today) {
  const was = task.status
  await setTaskStatus(task, status, today)
  const message = status === 'done' ? 'Task completed' : 'Task reopened'
  if (status === 'done' && task.recurrence !== 'none') return { message }
  return { message, undo: () => setTaskStatus({ ...task, status }, was, today) }
}

const priorityItems = (current, apply) =>
  PRIORITIES.map((p) => ({ label: cap(p), radio: true, checked: current === p, onSelect: () => apply({ priority: p }, `Priority: ${p}`) }))

const categoryItems = (current, apply) =>
  TASK_CATEGORIES.map((c) => ({ label: c, radio: true, checked: current === c, onSelect: () => apply({ category: c }, `Moved to ${c}`) }))

const dueItems = (today, apply, pick) => {
  const day = (iso, label, name) => ({
    label,
    keywords: [name],
    onSelect: () => apply({ due_date: iso }, `Due ${fmtDay(iso, 'EEE d MMM')}`),
  })
  return [
    day(today, 'Today', 'today'),
    day(addDays(today, 1), 'Tomorrow', 'tomorrow'),
    day(addDays(today, 7), 'In a week', 'next week'),
    pick && { label: 'Pick a date…', onSelect: pick },
    SEPARATOR,
    { label: 'No due date', onSelect: () => apply({ due_date: null }, 'Due date removed') },
  ]
}

/** One task. `ctx`: { today, onEdit, ask, select } */
export function taskItems(task, { today, onEdit, ask, select }) {
  const done = task.status === 'done'
  const apply = (patch, message) => changeField('tasks', task, patch, message)
  return [
    {
      label: finished(task) ? 'Mark incomplete' : 'Mark complete',
      icon: finished(task) ? RotateCcw : SquareCheckBig,
      onSelect: () => setStatus(task, finished(task) ? 'pending' : 'done', today),
    },
    { label: 'Edit task', icon: Pencil, onSelect: () => onEdit(task) },
    SEPARATOR,
    { label: 'Priority', icon: Flag, hidden: done, items: () => priorityItems(task.priority, apply) },
    { label: 'Due date', icon: CalendarClock, items: () => dueItems(today, apply, () => onEdit(task)) },
    { label: 'Move to category', icon: FolderInput, items: () => categoryItems(task.category, apply) },
    SEPARATOR,
    {
      label: 'Duplicate',
      icon: CopyPlus,
      onSelect: () =>
        duplicateRow(
          'tasks',
          task,
          {
            title: `${task.title} (copy)`,
            status: 'pending',
            started_at: null,
            completed_at: null,
            recurrence: 'none',
            recurrence_until: null,
            series_id: null,
          },
          'Task duplicated',
        ),
    },
    {
      label: 'Rename',
      icon: TextCursorInput,
      onSelect: async () => {
        const title = await ask({ title: 'Rename task', label: 'Title', value: task.title, maxLength: 200 })
        if (title && title !== task.title) return changeField('tasks', task, { title }, 'Task renamed')
      },
    },
    {
      label: 'Copy task',
      icon: Copy,
      onSelect: () =>
        copyDetails(task.title, [
          ['Category', task.category],
          ['Priority', task.priority],
          ['Status', task.status],
          ['Due', task.due_date],
          ['Notes', task.notes],
        ]),
    },
    { label: 'Select', icon: ListChecks, onSelect: () => select?.(task.id) },
    SEPARATOR,
    {
      label: 'Delete task',
      icon: Trash2,
      danger: true,
      confirm: {
        title: 'Delete this task?',
        description: task.recurrence !== 'none' ? 'Only this occurrence is deleted.' : task.title,
        confirmLabel: 'Delete',
      },
      onSelect: async () => {
        await store.remove('tasks', task.id)
        return { message: 'Task deleted' }
      },
    },
  ]
}

/** Several selected tasks. */
export function taskBulkItems(tasks, { today }) {
  const n = tasks.length
  const open = tasks.filter((t) => !finished(t))
  const apply = (patch, message) => changeFields('tasks', tasks, patch, `${message} · ${count(n, 'task')}`)
  return [
    {
      label: `Complete ${count(open.length, 'task')}`,
      icon: SquareCheckBig,
      hidden: open.length === 0,
      onSelect: async () => {
        for (const t of open) await setTaskStatus(t, 'done', today)
        return { message: `${count(open.length, 'task')} completed` }
      },
    },
    { label: 'Priority', icon: Flag, items: () => priorityItems(null, apply) },
    { label: 'Due date', icon: CalendarClock, items: () => dueItems(today, apply) },
    { label: 'Move to category', icon: FolderInput, items: () => categoryItems(null, apply) },
    SEPARATOR,
    bulkDelete(
      'tasks',
      tasks.map((t) => t.id),
      'task',
    ),
  ]
}

/** Empty space on the planner. */
export function taskPageItems({ day, onAdd }) {
  return [{ label: `New task for ${fmtDay(day, 'EEE d MMM')}`, icon: CalendarPlus, onSelect: onAdd }]
}
