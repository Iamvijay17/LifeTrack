import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Bell, Check, Coffee, Pause, Play, Plus, Square, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { dueLabel } from '@lifetrack/core/upcoming'
import { fmtClock, MODE_LABEL } from '@/domain/focus'
import { createTask, recordFocus, setHabitStatus, setTaskStatus } from '@/services/api'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { CheckButton } from '@/components/shared/CheckButton'

export function Panel({ title, icon: Icon, aside, children, className }) {
  return (
    <section aria-label={title} className={cn('lt-card p-3', className)}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          {Icon && <Icon className="h-3.5 w-3.5 text-mod-text" aria-hidden />}
          {title}
        </h2>
        {aside && <span className="text-xs tabular-nums text-muted-foreground">{aside}</span>}
      </header>
      {children}
    </section>
  )
}

/** One line to type a task into. Enter adds it for today. Uses the same createTask as every other way of adding one. */
export function QuickAddWidget({ today }) {
  const [title, setTitle] = useState('')
  const input = useRef(null)
  const [add, pending] = useAction(
    async (t) => {
      await createTask({ title: t, due_date: today })
      setTitle('')
      input.current?.focus()
    },
    { success: 'Task added for today' },
  )
  const submit = (e) => {
    e.preventDefault()
    const t = title.trim()
    if (t) add(t.slice(0, 200))
  }
  return (
    <form onSubmit={submit} className="lt-card flex items-center gap-2 p-2" aria-label="Quick add a task">
      <input
        ref={input}
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task for today…"
        aria-label="New task"
        className="h-10 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-mod"
      />
      <Button type="submit" size="icon" aria-label="Add task" disabled={pending || !title.trim()}>
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  )
}

export function TasksWidget({ snap, today }) {
  const [complete] = useAction((t) => setTaskStatus(t, 'done', today))
  const t = snap.tasks
  return (
    <Panel title="Today's tasks" aside={t.total ? `${t.done}/${t.total}` : undefined}>
      <Progress value={(t.pct ?? 0) * 100} label="Tasks done today" />
      {t.open.length === 0 ? (
        <p className="pt-3 text-center text-xs text-muted-foreground">
          {t.total ? 'All done for today. 🎉' : 'Nothing planned for today.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {t.open.map((task) => (
            <li key={task.id} className="flex items-center gap-2">
              <CheckButton done={false} onToggle={() => complete(task)} label={`Complete ${task.title}`} />
              <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
              {task.due_date < today && <span className="shrink-0 text-[11px] text-warning">Overdue</span>}
            </li>
          ))}
        </ul>
      )}
      {t.more > 0 && <p className="pt-1 text-center text-[11px] text-muted-foreground">+{t.more} more in the app</p>}
    </Panel>
  )
}

export function HabitsWidget({ snap, today }) {
  const [toggle] = useAction((id, done) => setHabitStatus(id, today, done ? null : 'done'))
  const h = snap.habits
  return (
    <Panel title="Today's habits" aside={h.total ? `${h.done}/${h.total}` : undefined}>
      {h.list.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">No habits due today.</p>
      ) : (
        <ul className="space-y-0.5">
          {h.list.map((x) => (
            <li key={x.id} className="flex items-center gap-2">
              <CheckButton
                done={x.done}
                cue="habitCheck"
                color={x.color}
                onToggle={() => toggle(x.id, x.done)}
                label={`${x.done ? 'Undo' : 'Complete'} ${x.name}`}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  x.done && 'text-muted-foreground line-through decoration-muted-foreground/40',
                )}
              >
                {x.name}
              </span>
              {x.streak > 0 && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {x.streak}
                  {x.unit}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const QUICK = [15, 25, 50]

/**
 * A small focus timer. It is the SAME timer as the Focus page: one saved state per account on this device, so starting here shows there, and it
 * keeps running when this window is closed (it counts to an end time, not by ticking). A block that ends is saved by whichever window finishes it first.
 */
export function TimerWidget({ timer, today }) {
  const [minutes, setMinutes] = useState(25)
  const active = timer.timer
  const [stop] = useAction(
    async () => {
      const t = timer.timer
      const spent = timer.stop()
      if (t.mode !== 'focus') return
      const saved = await recordFocus({
        plannedMinutes: t.plannedMinutes,
        actualSeconds: spent,
        completed: false,
        taskId: t.taskId,
        topicId: t.topicId,
        label: t.label,
        date: today,
      })
      if (!saved) toast('Stopped. Under a minute, so nothing was recorded.')
    },
    { success: 'Stopped and saved' },
  )
  const ModeIcon = active?.mode === 'focus' || !active ? Timer : Coffee
  return (
    <Panel title="Focus timer" icon={ModeIcon} aside={active ? MODE_LABEL[active.mode] : undefined}>
      {active ? (
        <div className="flex items-center justify-between gap-3">
          <p role="timer" aria-label="Time left" className="text-3xl font-semibold tabular-nums tracking-tight">
            {fmtClock(timer.left)}
          </p>
          <div className="flex gap-1.5">
            {timer.running ? (
              <Button variant="outline" size="icon" data-sound="timerPause" aria-label="Pause" onClick={timer.pause}>
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" data-sound="timerStart" aria-label="Resume" onClick={timer.resume}>
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="icon" data-sound="timerStop" aria-label="Stop" onClick={stop}>
              <Square className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Length in minutes">
            {QUICK.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={minutes === m}
                onClick={() => setMinutes(m)}
                className={cn(
                  'h-9 min-w-11 rounded-md border px-2 text-sm tabular-nums',
                  minutes === m ? 'border-mod bg-mod/10 text-mod-text' : 'border-border text-muted-foreground',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <Button
            data-sound="timerStart"
            onClick={() => timer.start({ mode: 'focus', plannedMinutes: minutes, taskId: null, topicId: null, label: '' })}
          >
            <Play className="h-4 w-4" aria-hidden />
            Start
          </Button>
        </div>
      )}
    </Panel>
  )
}

export function UpcomingWidget({ snap, today }) {
  const u = snap.upcoming
  const fmt = (d) => fmtDay(d, 'EEE d MMM')
  return (
    <Panel title="Upcoming reminders" icon={Bell}>
      {u.items.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">Nothing coming up this week.</p>
      ) : (
        <ul className="space-y-1.5">
          {u.items.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{i.title}</span>
              <span className={cn('shrink-0 text-xs tabular-nums', i.overdue ? 'text-warning' : 'text-muted-foreground')}>
                {dueLabel(i, today, fmt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!u.remindersOnly && u.items.length > 0 && (
        <p className="pt-2 text-[11px] text-muted-foreground">No reminders set, so these are your next deadlines.</p>
      )}
    </Panel>
  )
}

/** The slim view: today at a glance in one row, with the timer's time when one is running. */
export function CollapsedBar({ snap, timer }) {
  const t = snap.tasks
  const h = snap.habits
  return (
    <div className="lt-card flex items-center justify-between gap-3 px-3 py-2 text-sm" aria-label="Today at a glance">
      <span className="flex items-center gap-1.5">
        <Check className="h-3.5 w-3.5 text-mod-text" aria-hidden />
        Tasks{' '}
        <b className="tabular-nums">
          {t.done}/{t.total}
        </b>
      </span>
      <span>
        Habits{' '}
        <b className="tabular-nums">
          {h.done}/{h.total}
        </b>
      </span>
      {timer.timer && (
        <span role="timer" aria-label="Time left" className="font-semibold tabular-nums">
          {fmtClock(timer.left)}
        </span>
      )}
    </div>
  )
}
