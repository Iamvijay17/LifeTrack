import { Circle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'

/** The top three open tasks for today; tapping one completes it. */
export function PrioritiesCard({ priorities, hasTasksToday, openTasks, doneTasks, onComplete, onAddTask, className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Top priorities</CardTitle>
        <CardLink to="/planner">Planner</CardLink>
      </CardHeader>
      <p className="px-4 pt-0.5 text-xs text-muted-foreground">
        {openTasks} pending · {doneTasks} completed today
      </p>
      <CardContent className="space-y-1">
        {priorities.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {hasTasksToday ? 'All priorities done 🎉' : 'No tasks for today.'}
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={onAddTask}>
                <Plus className="h-4 w-4" />
                Add task
              </Button>
            </div>
          </div>
        ) : (
          priorities.map((t) => (
            <button
              key={t.id}
              onClick={() => onComplete(t)}
              aria-label={`Complete ${t.title}`}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/40 md:min-h-0"
            >
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="line-clamp-2 min-w-0 break-words text-sm">{t.title}</span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}
