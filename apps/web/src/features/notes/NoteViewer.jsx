import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/misc'
import { Markdown } from '@/lib/markdown'
import { fmtDay } from '@/lib/dates'

/** Read-only view of a note (rendered Markdown) with edit / delete actions. */
export function NoteViewer({ note, goalName, taskName, onClose, onEdit, onDelete }) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={note.title || 'Untitled'}
      description={`${note.category} · updated ${fmtDay(note.updated_at.slice(0, 10), 'd MMM yyyy')}`}
      className="md:max-w-2xl"
      footer={
        <>
          <Button variant="ghost" className="text-danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </>
      }
    >
      <Markdown source={note.body} />
      {(note.tags?.length > 0 || goalName || taskName) && (
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {(note.tags ?? []).map((t) => (
            <Badge key={t}>#{t}</Badge>
          ))}
          {goalName && <Badge tone="success">Goal: {goalName}</Badge>}
          {taskName && <Badge tone="warning">Task: {taskName}</Badge>}
        </div>
      )}
    </Dialog>
  )
}
