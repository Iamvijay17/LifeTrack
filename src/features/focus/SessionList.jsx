import { Timer, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { newestFirst, sessionTitle } from '@/domain/focus'
import { timeStrInTz } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function SessionList({ sessions, tasks, topics, tz, onDelete }) {
  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>Today's sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState
            icon={Timer}
            title="No focus sessions yet today"
            description="Start a 25-minute block — short, distraction-free work adds up."
          />
        ) : (
          <ul className="divide-y divide-border">
            {newestFirst(sessions).map((s) => {
              const { what, note } = sessionTitle(s, tasks, topics)
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn('h-2 w-2 rounded-full', s.completed ? 'bg-success' : 'bg-warning')}
                    aria-label={s.completed ? 'completed' : 'stopped early'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {what}
                      {note ? ` — ${note}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {timeStrInTz(s.started_at, tz)} · {Math.round(s.actual_seconds / 60)} of {s.planned_minutes} min
                      {s.completed ? '' : ' (stopped early)'}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete session" onClick={() => onDelete(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
