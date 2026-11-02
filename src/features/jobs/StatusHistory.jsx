import { ArrowRight } from 'lucide-react'
import { fmtDay, dateStrInTz } from '@/lib/dates'
import { StatusBadge } from './StatusBadge'

/** Immutable status history of one application (written by a database trigger), oldest first. */
export function StatusHistory({ history, tz }) {
  return (
    <ol className="space-y-1.5 border-l border-border pl-4">
      {history.map((h) => (
        <li key={h.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
          <span className="flex flex-wrap items-center gap-1.5">
            {h.from_status ? (
              <>
                <StatusBadge status={h.from_status} />
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Created as</span>
            )}
            <StatusBadge status={h.to_status} />
          </span>
          <span className="text-xs text-muted-foreground">{fmtDay(dateStrInTz(h.changed_at, tz), 'd MMM yyyy')}</span>
        </li>
      ))}
      {history.length === 0 && <li className="text-sm text-muted-foreground">History is recorded automatically from now on.</li>}
    </ol>
  )
}
