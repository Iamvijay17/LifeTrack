import { Archive, CircleCheckBig, Flame, ListChecks, Pencil, Plus, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { SEPARATOR } from '@/components/context-menu/items'
import { bulkDelete, count } from '@/components/context-menu/helpers'
import { pctText } from '@/lib/format'
import { setHabitStatus } from '@/services/api'
import * as store from '@/hooks/store'

const SERVER = ['id', 'created_at', 'updated_at', 'user_id']

/** Checks the habit in (or clears it) for `date`; Undo puts back whatever was there. */
async function checkIn(habit, log, date, next) {
  const was = log?.status ?? null
  await setHabitStatus(habit.id, date, next)
  return { message: next === 'done' ? `${habit.name} done` : 'Check-in cleared', undo: () => setHabitStatus(habit.id, date, was) }
}

/** One habit (`s` is a buildHabitStats() row). `d`: { date, onEdit, select } */
export function habitItems(s, d) {
  const { habit } = s
  const log = s.logs.find((l) => l.log_date === d.date)
  const done = log?.status === 'done'
  const archived = !!habit.archived_at
  return [
    {
      label: done ? 'Mark incomplete' : 'Mark complete',
      icon: done ? Undo2 : CircleCheckBig,
      hidden: archived,
      onSelect: () => checkIn(habit, log, d.date, done ? null : 'done'),
    },
    {
      label: 'View streak',
      icon: Flame,
      onSelect: () =>
        void toast(habit.name, {
          description: `Current streak ${s.current}${s.unit} · longest ${s.longest}${s.unit} · ${pctText(s.rate30)} over the last 30 days`,
          duration: 6000,
        }),
    },
    { label: 'Edit habit', icon: Pencil, onSelect: () => d.onEdit(habit) },
    SEPARATOR,
    {
      label: 'Reset progress',
      icon: RotateCw,
      disabled: s.logs.length === 0,
      disabledReason: 'No check-ins yet',
      confirm: {
        title: `Reset ${habit.name}?`,
        description: `All ${count(s.logs.length, 'check-in')} are deleted and the streak starts again. The habit itself stays.`,
        confirmLabel: 'Reset progress',
      },
      onSelect: async () => {
        const saved = s.logs
        await store.removeMany(
          'habit_logs',
          saved.map((l) => l.id),
        )
        return {
          message: 'Progress reset',
          undo: () =>
            store.insert(
              'habit_logs',
              saved.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !SERVER.includes(k)))),
            ),
        }
      },
    },
    {
      label: archived ? 'Restore' : 'Archive',
      icon: archived ? RotateCcw : Archive,
      onSelect: async () => {
        const was = habit.archived_at
        await store.update('habits', habit.id, { archived_at: archived ? null : new Date().toISOString() })
        return {
          message: archived ? 'Habit restored' : 'Habit archived',
          undo: () => store.update('habits', habit.id, { archived_at: was }),
        }
      },
    },
    { label: 'Select', icon: ListChecks, onSelect: () => d.select?.(habit.id) },
    SEPARATOR,
    {
      label: 'Delete habit',
      icon: Trash2,
      danger: true,
      confirm: {
        title: `Delete "${habit.name}"?`,
        description: 'This permanently deletes the habit and its whole history. Archive it instead to keep the history.',
        confirmLabel: 'Delete',
      },
      onSelect: async () => {
        await store.remove('habits', habit.id)
        return { message: 'Habit deleted' }
      },
    },
  ]
}

/** Several selected habits, for the day being viewed. */
export function habitBulkItems(rows, { date }) {
  const live = rows.filter((s) => !s.habit.archived_at)
  const set = async (next) => {
    const before = live.map((s) => [s, s.logs.find((l) => l.log_date === date)?.status ?? null])
    for (const s of live) await setHabitStatus(s.habit.id, date, next)
    return {
      message: next === 'done' ? `${count(live.length, 'habit')} done` : 'Check-ins cleared',
      undo: async () => {
        for (const [s, was] of before) await setHabitStatus(s.habit.id, date, was)
      },
    }
  }
  return [
    { label: `Complete ${count(live.length, 'habit')}`, icon: CircleCheckBig, hidden: live.length === 0, onSelect: () => set('done') },
    { label: 'Clear check-ins', icon: Undo2, hidden: live.length === 0, onSelect: () => set(null) },
    SEPARATOR,
    bulkDelete(
      'habits',
      rows.map((s) => s.habit.id),
      'habit',
    ),
  ]
}

export const habitsPageItems = ({ newHabit }) => [{ label: 'New habit', icon: Plus, onSelect: newHabit }]
