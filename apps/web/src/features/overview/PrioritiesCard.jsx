import { PartyPopper, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { CheckButton } from '@/components/shared/CheckButton'
import { AnimatePresence, ease, m } from '@/components/motion/primitives'

/** The top three open tasks for today; ticking one completes it. */
export function PrioritiesCard({ priorities, hasTasksToday, openTasks, doneTasks, onComplete, onAddTask, className }) {
  return (
    <Card data-module="planner" className={className}>
      <CardHeader>
        <CardTitle>Top priorities</CardTitle>
        <CardLink to="/planner">Planner</CardLink>
      </CardHeader>
      <p className="px-4 pt-0.5 text-xs text-muted-foreground md:px-5">
        {openTasks} pending · {doneTasks} completed today
      </p>
      <CardContent className="space-y-1.5">
        {priorities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-5 text-center text-sm text-muted-foreground">
            {hasTasksToday && (
              <span className="lt-float lt-icon-soft h-10 w-10">
                <PartyPopper className="h-5 w-5" aria-hidden />
              </span>
            )}
            {hasTasksToday ? 'All priorities done' : 'No tasks for today.'}
            <Button size="sm" variant="outline" className="mt-1" onClick={onAddTask}>
              <Plus className="h-4 w-4" />
              Add task
            </Button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {priorities.map((t, i) => (
                <m.li
                  key={t.id}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 16, transition: { duration: 0.14 } }}
                  transition={{ duration: 0.22, ease: ease.out }}
                  className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/50 pr-3"
                >
                  <CheckButton done={false} onToggle={() => onComplete(t)} label={`Complete ${t.title}`} />
                  <span className="line-clamp-2 min-w-0 flex-1 break-words py-2 text-sm">{t.title}</span>
                  <span aria-hidden className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground/70">
                    {i + 1}
                  </span>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
