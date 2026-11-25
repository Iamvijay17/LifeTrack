import { Archive, CheckCircle2, Copy, CopyPlus, Gauge, NotebookPen, Pencil, RotateCcw, TextCursorInput, Trash2 } from 'lucide-react'
import { SEPARATOR } from '@/components/context-menu/items'
import { changeField, copyDetails, duplicateRow } from '@/components/context-menu/helpers'
import { fmtDay } from '@/lib/dates'
import { setGoalStatus } from '@/services/api'
import * as store from '@/hooks/store'
import { toast } from 'sonner'

const setStatus = async (goal, status, message) => {
  const was = goal.status
  await setGoalStatus(goal, status)
  return { message, undo: () => setGoalStatus({ ...goal, status }, was) }
}

/**
 * One goal (a Goals & Milestones card or a Career & Learning study goal). `d`: { onEdit, onAddSession?, progressText?, ask, deleteNote }.
 * Completing, reopening and archiving go through setGoalStatus, the same call as the card's own menu.
 */
export function goalItems(goal, d) {
  return [
    { label: 'Edit goal', icon: Pencil, onSelect: () => d.onEdit(goal) },
    {
      label: 'Mark complete',
      icon: CheckCircle2,
      hidden: goal.status === 'completed',
      onSelect: () => setStatus(goal, 'completed', 'Goal completed'),
    },
    { label: 'Reopen', icon: RotateCcw, hidden: goal.status === 'active', onSelect: () => setStatus(goal, 'active', 'Goal reopened') },
    { label: 'Add study session', icon: NotebookPen, hidden: !d.onAddSession, onSelect: () => d.onAddSession(goal) },
    {
      label: 'View progress',
      icon: Gauge,
      hidden: !d.progressText,
      onSelect: () => void toast(goal.title, { description: d.progressText, duration: 6000 }),
    },
    SEPARATOR,
    {
      label: 'Rename',
      icon: TextCursorInput,
      onSelect: async () => {
        const title = await d.ask({ title: 'Rename goal', label: 'Title', value: goal.title, maxLength: 160 })
        if (title && title !== goal.title) return changeField('goals', goal, { title }, 'Goal renamed')
      },
    },
    {
      label: 'Duplicate',
      icon: CopyPlus,
      onSelect: () =>
        duplicateRow('goals', goal, { title: `${goal.title} (copy)`, status: 'active', completed_at: null }, 'Goal duplicated'),
    },
    {
      label: 'Copy goal',
      icon: Copy,
      onSelect: () =>
        copyDetails(goal.title, [
          ['Category', goal.category],
          ['Status', goal.status],
          ['Due', goal.due_date && fmtDay(goal.due_date, 'd MMM yyyy')],
          ['Progress', d.progressText],
        ]),
    },
    { label: 'Archive', icon: Archive, hidden: goal.status === 'archived', onSelect: () => setStatus(goal, 'archived', 'Goal archived') },
    SEPARATOR,
    {
      label: 'Delete goal',
      icon: Trash2,
      danger: true,
      confirm: {
        title: 'Delete this goal?',
        description: d.deleteNote ?? 'Its milestones are deleted too. Notes and study sessions stay.',
        confirmLabel: 'Delete',
      },
      onSelect: async () => {
        await store.remove('goals', goal.id)
        return { message: 'Goal deleted' }
      },
    },
  ]
}
