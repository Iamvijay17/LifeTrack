import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { notePreview } from '@/domain/notes'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** One note in the grid. Pure presentation: every action is a callback from the page. */
export function NoteCard({ note: n, goalName, taskName, onOpen, onEdit, onTogglePin, onDelete, onTag }) {
  return (
    <Card interactive className={cn(n.pinned && 'border-mod/40 bg-gradient-to-b from-mod/[0.06] to-transparent')}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <button onClick={() => onOpen(n)} className="min-h-8 min-w-0 flex-1 rounded text-left">
            <h2 className="truncate text-sm font-semibold">
              {n.pinned && <Pin className="mr-1 inline h-3 w-3 animate-pop-in text-mod-text" role="img" aria-label="Pinned" />}
              {n.title || 'Untitled'}
            </h2>
          </button>
          <Menu
            label={`Actions for ${n.title || 'note'}`}
            items={[
              { label: 'Edit', icon: Pencil, onClick: () => onEdit(n) },
              { label: n.pinned ? 'Unpin' : 'Pin', icon: n.pinned ? PinOff : Pin, onClick: () => onTogglePin(n) },
              { label: 'Delete', icon: Trash2, danger: true, onClick: () => onDelete(n) },
            ]}
          />
        </div>
        <button onClick={() => onOpen(n)} className="block w-full text-left">
          <p className="line-clamp-4 whitespace-pre-line text-[13px] text-muted-foreground">{notePreview(n.body) || ' '}</p>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{n.category}</Badge>
          {(n.tags ?? []).map((t) => (
            <button key={t} onClick={() => onTag(t)} className="lt-press">
              <Badge>#{t}</Badge>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {fmtDay(n.updated_at.slice(0, 10), 'd MMM yyyy')}
          {goalName ? ` · Goal: ${goalName}` : ''}
          {taskName ? ` · Task: ${taskName}` : ''}
        </p>
      </CardContent>
    </Card>
  )
}
