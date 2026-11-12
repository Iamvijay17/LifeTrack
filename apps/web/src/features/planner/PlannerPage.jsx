import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarCheck, Plus } from 'lucide-react'
import { SelectionBar, useContextMenu, usePageContextMenu, useSelection } from '@/components/context-menu'
import { usePrompt } from '@/components/shared/Prompt'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { WeekStrip } from '@/components/shared/WeekStrip'
import { AnimatedValue, LayoutGroup } from '@/components/motion/primitives'
import { useTables } from '@/hooks/store'
import { useToday } from '@/hooks/useToday'
import { useSettings } from '@/hooks/useSettings'
import { addDays, eachDay, startOfWeek } from '@/lib/dates'
import { plural } from '@/lib/utils'
import { TaskDialog } from '@/features/planner/TaskDialog'
import { TaskSection } from '@/features/planner/TaskList'
import { groupTasksForDay } from '@/domain/tasks'
import { taskBulkItems, taskItems, taskPageItems } from './contextMenu'

export default function PlannerPage() {
  const today = useToday()
  const { settings } = useSettings()
  const [date, setDate] = useState(null)
  const day = date ?? today
  const [params, setParams] = useSearchParams()
  // Deep link from global search: /planner?date=yyyy-MM-dd
  useEffect(() => {
    const target = params.get('date')
    if (!target) return
    setDate(target)
    setParams({}, { replace: true })
  }, [params, setParams])
  const [dialog, setDialog] = useState({ open: false, task: null })
  const { data, loading, error, refetch } = useTables('tasks')

  const g = useMemo(() => groupTasksForDay(data.tasks, day, today), [data.tasks, day, today])

  // The week around the day being viewed. Each day's bar shows how much of that day's plan got done.
  const week = useMemo(() => {
    const start = startOfWeek(day, settings.week_starts_on)
    return eachDay(start, addDays(start, 6)).map((d) => {
      const planned = data.tasks.filter((t) => t.due_date === d && !['cancelled', 'skipped'].includes(t.status))
      const done = planned.filter((t) => t.status === 'done').length
      return {
        date: d,
        ratio: planned.length ? done / planned.length : 0,
        note: planned.length ? `${done} of ${plural(planned.length, 'task')} done` : undefined,
      }
    })
  }, [data.tasks, day, settings.week_starts_on])
  const dayDone = g.done.length
  const dayPlanned = g.count - g.off.length - g.someday.length

  const edit = (task) => setDialog({ open: true, task })
  const menu = useContextMenu()
  const ask = usePrompt()
  const sel = useSelection(useMemo(() => data.tasks.map((t) => t.id), [data.tasks]))
  const byId = (ids) => ids.map((id) => data.tasks.find((t) => t.id === id)).filter(Boolean)
  const bulk = (ids) => taskBulkItems(byId(ids), { today })
  // What a right-click on a task row (or a long-press) offers, and the selection look and ctrl/shift-click behaviour of a row.
  const rowProps = (task) => ({
    ...sel.itemProps(task.id),
    ...menu.bind(
      () => {
        const ids = sel.targets(task.id)
        return ids.length > 1 ? bulk(ids) : taskItems(task, { today, onEdit: edit, ask, select: sel.add })
      },
      { label: `Actions for ${task.title}` },
    ),
  })
  usePageContextMenu(() => taskPageItems({ day, onAdd: () => setDialog({ open: true, task: null }) }))
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
      <section className="lt-hero mb-4 grid grid-cols-1 items-center gap-x-6 gap-y-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:p-4">
        <WeekStrip days={week} selected={day} today={today} onSelect={setDate} label="This week's plan" />
        <div className="flex flex-col items-stretch gap-2 md:w-64">
          <DateNav date={day} onChange={setDate} today={today} />
          {dayPlanned > 0 && (
            <div className="px-1">
              <p className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span>Day progress</span>
                <span className="tabular-nums">
                  <AnimatedValue value={dayDone} /> of {dayPlanned}
                </span>
              </p>
              <Progress value={(dayDone / dayPlanned) * 100} label="Day progress" />
            </div>
          )}
        </div>
      </section>
      <DataGate loading={loading} error={error} onRetry={refetch} cards={0}>
        <LayoutGroup id="planner">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="order-2 lg:order-none lg:col-span-2">
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
                      rowProps={rowProps}
                      hint="Your three most important open tasks, ranked by priority."
                    />
                    <TaskSection title="Pending" tasks={g.pending} today={today} onEdit={edit} rowProps={rowProps} />
                    <TaskSection title="Completed" tasks={g.done} today={today} onEdit={edit} rowProps={rowProps} />
                    <TaskSection title="Skipped / cancelled" tasks={g.off} today={today} onEdit={edit} rowProps={rowProps} />
                  </>
                )}
              </CardContent>
            </Card>
            {/* `contents` lets these cards reorder with the main one on a phone, where overdue work comes first; on desktop they form a side column. */}
            <div className="contents lg:block lg:space-y-4">
              {g.overdue.length > 0 && (
                <Card className="order-1">
                  <CardContent>
                    <TaskSection title="Overdue" tasks={g.overdue} today={today} onEdit={edit} rowProps={rowProps} showDue />
                  </CardContent>
                </Card>
              )}
              <Card className="order-3">
                <CardContent>
                  <TaskSection
                    title="No due date"
                    tasks={g.someday}
                    today={today}
                    onEdit={edit}
                    rowProps={rowProps}
                    empty="Tasks without a date show up here."
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </LayoutGroup>
      </DataGate>
      <SelectionBar selection={sel} noun="task" build={() => bulk([...sel.selected])} />
      <TaskDialog open={dialog.open} task={dialog.task} defaultDate={day} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </>
  )
}
