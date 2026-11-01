import { CheckCircle2, Circle, Clock, Pencil, Play, Repeat, SkipForward, Trash2, XCircle, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { fmtDay } from '@/lib/dates'
import { setTaskStatus } from '@/services/api'
import * as store from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/shared/Confirm'

const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' }

export function TaskRow({ task, today, onEdit, showDue }) {
  const confirm = useConfirm()
  const [setStatus, pending] = useAction((s) => setTaskStatus(task, s, today))
  const [del] = useAction(() => store.remove('tasks', task.id), { success: 'Task deleted' })
  const done = task.status === 'done'
  const inactive = task.status === 'cancelled' || task.status === 'skipped'
  const overdue = !done && !inactive && task.due_date && task.due_date < today
  return (
    <li className={cn('group flex items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/30', pending && 'opacity-60')}>
      <button type="button" disabled={pending} onClick={() => setStatus(done ? 'pending' : 'done')} aria-label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
        className={cn('shrink-0 rounded-full', done ? 'text-success' : 'text-muted-foreground hover:text-foreground')}>
        {done ? <CheckCircle2 className="h-5 w-5" /> : inactive ? <XCircle className="h-5 w-5" /> : task.status === 'in_progress' ? <Clock className="h-5 w-5 text-warning" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', (done || inactive) && 'text-muted-foreground line-through')}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{task.category}</Badge>
          {task.priority !== 'medium' && <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>}
          {task.status === 'in_progress' && <Badge tone="warning">In progress</Badge>}
          {task.status === 'skipped' && <Badge>Skipped</Badge>}
          {task.status === 'cancelled' && <Badge>Cancelled</Badge>}
          {task.recurrence !== 'none' && <Badge><Repeat className="h-3 w-3" />{task.recurrence}</Badge>}
          {(showDue || overdue) && task.due_date && <Badge tone={overdue ? 'danger' : 'neutral'}>{overdue ? 'Overdue · ' : ''}{fmtDay(task.due_date, 'd MMM')}</Badge>}
        </div>
      </div>
      <Menu label={`Actions for ${task.title}`} items={[
        { label: 'Start', icon: Play, hidden: done || inactive || task.status === 'in_progress', onClick: () => setStatus('in_progress') },
        { label: 'Skip', icon: SkipForward, hidden: done || inactive, onClick: () => setStatus('skipped') },
        { label: 'Cancel task', icon: XCircle, hidden: done || inactive, onClick: () => setStatus('cancelled') },
        { label: 'Reopen', icon: RotateCcw, hidden: !(done || inactive), onClick: () => setStatus('pending') },
        { label: 'Edit', icon: Pencil, onClick: () => onEdit(task) },
        { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: 'Delete this task?', description: task.recurrence !== 'none' ? 'Only this occurrence is deleted.' : task.title })) del() } },
      ]} />
    </li>
  )
}

export function TaskSection({ title, tasks, today, onEdit, showDue, hint, empty }) {
  if (!tasks.length && !empty) return null
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}<span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{tasks.length}</span></h3>
      {hint && <p className="mb-1 text-xs text-muted-foreground">{hint}</p>}
      {tasks.length ? <ul>{tasks.map((t) => <TaskRow key={t.id} task={t} today={today} onEdit={onEdit} showDue={showDue} />)}</ul> : <p className="px-2 py-3 text-sm text-muted-foreground">{empty}</p>}
    </section>
  )
}

const RANK = { high: 0, medium: 1, low: 2 }
export const byPriority = (a, b) => RANK[a.priority] - RANK[b.priority] || a.created_at.localeCompare(b.created_at)
export const isOpen = (t) => t.status === 'pending' || t.status === 'in_progress'
