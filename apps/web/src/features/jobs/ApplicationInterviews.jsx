import { Pencil, X } from 'lucide-react'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { fmtDateTime } from '@/lib/dates'
import { InterviewStatusBadge } from './StatusBadge'

/** Interviews scheduled for one application (`events`, soonest first). */
export function ApplicationInterviews({ events, tz, onEdit }) {
  const removeEvent = useConfirmedDelete('interview_events', 'Interview removed')
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No interviews scheduled.</p>
  return (
    <ul className="space-y-1.5">
      {events.map((e) => (
        <li key={e.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{e.round_name}</p>
            <p className="text-xs text-muted-foreground">
              {fmtDateTime(e.scheduled_at, tz)} · {e.mode}
            </p>
          </div>
          <InterviewStatusBadge status={e.status} />
          <button aria-label="Edit interview" className="text-muted-foreground hover:text-foreground" onClick={() => onEdit(e)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label="Remove interview"
            className="text-muted-foreground hover:text-danger"
            onClick={() => removeEvent(e.id, { title: 'Remove this interview?' })}
          >
            <X className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}
