import { Link } from 'react-router-dom'
import { Circle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** The top three open tasks for today; tapping one completes it. */
export function PrioritiesCard({ priorities, hasTasksToday, openTasks, doneTasks, onComplete, onAddTask }) {
  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>Top priorities</CardTitle>
        <span className="text-xs text-muted-foreground">
          {openTasks} pending · {doneTasks} completed today
        </span>
        <Link to="/planner" className="text-xs text-secondary underline underline-offset-2">
          Planner
        </Link>
      </CardHeader>
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
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/40"
            >
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm">{t.title}</span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}
