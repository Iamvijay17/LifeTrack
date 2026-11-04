import { Clock, Pencil, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Menu } from '@/components/ui/menu'
import { useShowMore } from '@/hooks/useShowMore'
import { ShowMore } from '@/components/shared/ShowMore'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { sessionName } from '@/domain/learning'
import { fmtDay, fmtDuration } from '@/lib/dates'

/** `history` is completed sessions, newest first. */
export function SessionsTab({ history, goals, topics, onCreate, onEdit }) {
  const removeSession = useConfirmedDelete('study_sessions', 'Session deleted')
  const page = useShowMore(history)
  if (history.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No completed sessions yet"
        description="Use the timer or log a session manually. Running timers don't count until you save them."
        action={
          onCreate && (
            <Button size="sm" onClick={onCreate}>
              Log a session
            </Button>
          )
        }
      />
    )
  }
  return (
    <Card>
      <ul className="divide-y divide-border">
        {page.visible.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{sessionName(s, goals, topics)}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDay(s.session_date)} · {s.source === 'timer' ? 'Timer' : 'Manual'}
                {s.problems_solved > 0 && ` · ${s.problems_solved} problems`}
              </p>
              {s.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.notes}</p>}
            </div>
            <span className="text-sm font-medium tabular-nums">{fmtDuration(s.duration_seconds / 60)}</span>
            <Menu
              label="Session actions"
              items={[
                { label: 'Edit', icon: Pencil, onClick: () => onEdit(s) },
                {
                  label: 'Delete',
                  icon: Trash2,
                  danger: true,
                  onClick: () =>
                    removeSession(s.id, {
                      title: 'Delete this session?',
                      description: `${fmtDuration(s.duration_seconds / 60)} of study time will be removed.`,
                    }),
                },
              ]}
            />
          </li>
        ))}
      </ul>
      <ShowMore more={page.more} onClick={page.showMore} />
    </Card>
  )
}
