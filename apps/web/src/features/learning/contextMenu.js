import { CopyPlus, Pencil, Trash2, Target, Plus, NotebookPen, BookMarked } from 'lucide-react'
import { SEPARATOR } from '@/components/context-menu/items'
import { duplicateRow } from '@/components/context-menu/helpers'
import { sessionName } from '@/domain/learning'
import { fmtDay, fmtDuration } from '@/lib/dates'
import * as store from '@/hooks/store'

/** A logged study session. */
export function sessionItems(s, { goals, topics, onEdit }) {
  return [
    { label: 'Edit session', icon: Pencil, onSelect: () => onEdit(s) },
    {
      label: 'Duplicate',
      icon: CopyPlus,
      onSelect: () => duplicateRow('study_sessions', s, {}, 'Session duplicated'),
    },
    SEPARATOR,
    {
      label: 'Delete session',
      icon: Trash2,
      danger: true,
      confirm: {
        title: 'Delete this session?',
        description: `${fmtDuration(s.duration_seconds / 60)} of study time (${sessionName(s, goals, topics)}, ${fmtDay(s.session_date)}) will be removed.`,
        confirmLabel: 'Delete',
      },
      onSelect: async () => {
        await store.remove('study_sessions', s.id)
        return { message: 'Session deleted' }
      },
    },
  ]
}

/** Empty space on Career & Learning. */
export function learningPageItems({ tab, newGoal, logSession, newTopic }) {
  return [
    { label: 'New goal', icon: Target, onSelect: newGoal },
    { label: 'Log study session', icon: NotebookPen, onSelect: logSession },
    { label: 'Add topic', icon: tab === 'topics' ? Plus : BookMarked, onSelect: newTopic },
  ]
}
