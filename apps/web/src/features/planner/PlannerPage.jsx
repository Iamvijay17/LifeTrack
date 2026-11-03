import { useMemo, useState } from 'react'
import { CalendarCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTables } from '@/hooks/store'
import { useToday } from '@/hooks/useToday'
import { TaskDialog } from '@/features/planner/TaskDialog'
import { TaskSection } from '@/features/planner/TaskList'
import { groupTasksForDay } from '@/domain/tasks'

export default function PlannerPage() {
  const today = useToday()
  const [date, setDate] = useState(null)
  const day = date ?? today
  const [dialog, setDialog] = useState({ open: false, task: null })
  const { data, loading, error, refetch } = useTables('tasks')

  const g = useMemo(() => groupTasksForDay(data.tasks, day, today), [data.tasks, day, today])

  const edit = (task) => setDialog({ open: true, task })
  return (
    <>
      <PageHeader
        title="Daily Planner"
        description="Plan the day, finish what matters."
        actions={
          <Button onClick={() => setDialog({ open: true, task: null })}>
            <Plus className="h-4 w-4" />
            New task
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Looking for your journal? It lives in Notes &amp; Journal.</p>
        <DateNav date={day} onChange={setDate} today={today} />
      </div>
      <DataGate loading={loading} error={error} onRetry={refetch} cards={0}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-5">
              {g.count === 0 && g.overdue.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="Nothing planned for this day"
                  description="Add tasks to build a plan. Daily progress is calculated from what you plan and finish."
                  action={
                    <Button size="sm" onClick={() => setDialog({ open: true, task: null })}>
                      Add a task
                    </Button>
                  }
                />
              ) : (
                <>
                  <TaskSection
                    title="Top priorities"
                    tasks={g.priorities}
                    today={today}
                    onEdit={edit}
                    hint="Your three most important open tasks, ranked by priority."
                  />
                  <TaskSection title="Pending" tasks={g.pending} today={today} onEdit={edit} />
                  <TaskSection title="Completed" tasks={g.done} today={today} onEdit={edit} />
                  <TaskSection title="Skipped / cancelled" tasks={g.off} today={today} onEdit={edit} />
                </>
              )}
            </CardContent>
          </Card>
          <div className="space-y-4">
            {g.overdue.length > 0 && (
              <Card>
                <CardContent>
                  <TaskSection title="Overdue" tasks={g.overdue} today={today} onEdit={edit} showDue />
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent>
                <TaskSection title="No due date" tasks={g.someday} today={today} onEdit={edit} empty="Tasks without a date show up here." />
              </CardContent>
            </Card>
          </div>
        </div>
      </DataGate>
      <TaskDialog open={dialog.open} task={dialog.task} defaultDate={day} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </>
  )
}
