import { CalendarCheck, Clock, Pencil, Play, Repeat, SkipForward, Trash2, XCircle, RotateCcw } from 'lucide-react'
import { CheckButton } from '@/components/shared/CheckButton'
import { m, spring } from '@/components/motion/primitives'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { fmtDay } from '@/lib/dates'
import { setTaskStatus } from '@/services/api'
import * as store from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/shared/Confirm'

const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' }
const PRIORITY_MARK = { high: 'bg-danger', medium: 'bg-warning', low: 'bg-muted-foreground/40' }

export function TaskRow({ task, today, onEdit, showDue, rowProps }) {
  const confirm = useConfirm()
  const [setStatus, pending] = useAction((s) => setTaskStatus(task, s, today))
  const [del] = useAction(() => store.remove('tasks', task.id), { success: 'Task deleted' })
  const [moveToToday] = useAction(() => store.update('tasks', task.id, { due_date: today }), { success: 'Moved to today' })
  const done = task.status === 'done'
  const inactive = task.status === 'cancelled' || task.status === 'skipped'
  const overdue = !done && !inactive && task.due_date && task.due_date < today
  return (
    // The same `layoutId` everywhere, so a task glides from Pending into Completed instead of vanishing and reappearing.
    <m.li
      layout="position"
      layoutId={`task-${task.id}`}
      transition={spring.snappy}
      {...rowProps}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors duration-150 hover:border-border hover:bg-muted/30',
        pending && 'opacity-60',
      )}
    >
      {inactive || task.status === 'in_progress' ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setStatus('done')}
          aria-label={`Complete "${task.title}"`}
          className="lt-press -my-2 -ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground md:m-0 md:h-8 md:w-8"
        >
          {inactive ? <XCircle className="h-5 w-5" /> : <Clock className="h-5 w-5 text-warning" />}
        </button>
      ) : (
        <CheckButton
          done={done}
          disabled={pending}
          onToggle={() => setStatus(done ? 'pending' : 'done')}
          label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
          className="-my-2 -ml-2 md:m-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('line-clamp-2 break-words text-sm transition-colors', (done || inactive) && 'text-muted-foreground line-through')}>
          {!done && !inactive && (
            <span aria-hidden className={cn('mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full', PRIORITY_MARK[task.priority])} />
          )}
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{task.category}</Badge>
          {task.priority !== 'medium' && <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>}
          {task.status === 'in_progress' && <Badge tone="warning">In progress</Badge>}
          {task.status === 'skipped' && <Badge>Skipped</Badge>}
          {task.status === 'cancelled' && <Badge>Cancelled</Badge>}
          {task.recurrence !== 'none' && (
            <Badge>
              <Repeat className="h-3 w-3" />
              {task.recurrence}
            </Badge>
          )}
          {(showDue || overdue) && task.due_date && (
            <Badge tone={overdue ? 'danger' : 'neutral'}>
              {overdue ? 'Overdue · ' : ''}
              {fmtDay(task.due_date, 'd MMM')}
            </Badge>
          )}
        </div>
      </div>
      <Menu
        label={`Actions for ${task.title}`}
        items={[
          { label: 'Move to today', icon: CalendarCheck, hidden: !overdue, onClick: () => moveToToday() },
          {
            label: 'Start',
            icon: Play,
            hidden: done || inactive || task.status === 'in_progress',
            onClick: () => setStatus('in_progress'),
          },
          { label: 'Skip', icon: SkipForward, hidden: done || inactive, onClick: () => setStatus('skipped') },
          { label: 'Cancel task', icon: XCircle, hidden: done || inactive, onClick: () => setStatus('cancelled') },
          { label: 'Reopen', icon: RotateCcw, hidden: !(done || inactive), onClick: () => setStatus('pending') },
          { label: 'Edit', icon: Pencil, onClick: () => onEdit(task) },
          {
            label: 'Delete',
            icon: Trash2,
            danger: true,
            onClick: async () => {
              if (
                await confirm({
                  title: 'Delete this task?',
                  description: task.recurrence !== 'none' ? 'Only this occurrence is deleted.' : task.title,
                })
              )
                del()
            },
          },
        ]}
      />
    </m.li>
  )
}

export function TaskSection({ title, tasks, today, onEdit, showDue, hint, empty, rowProps }) {
  if (!tasks.length && !empty) return null
  return (
    <section>
      <h2 className="lt-eyebrow mb-1.5 flex items-center gap-2">
        {title}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums tracking-normal">{tasks.length}</span>
      </h2>
      {hint && <p className="mb-1 text-xs text-muted-foreground">{hint}</p>}
      {tasks.length ? (
        <ul>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} onEdit={onEdit} showDue={showDue} rowProps={rowProps?.(t)} />
          ))}
        </ul>
      ) : (
        <p className="px-2 py-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}
