import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Archive, Flame, Moon, Pencil, RotateCcw, SkipForward, Trash2, Undo2 } from 'lucide-react'
import { CheckButton } from '@/components/shared/CheckButton'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import * as store from '@/hooks/store'
import { setHabitStatus } from '@/services/api'
import { isScheduled } from '@/domain/streaks'
import { scheduleLabel } from '@/domain/habits'
import { addDays, eachDay, fmtDay } from '@/lib/dates'
import { celebrate } from '@/lib/celebrate'
import { pctText } from '@/lib/format'
import { cn } from '@/lib/utils'

const DOUBLE_TAP_MS = 600
const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365, 500, 1000]

/** The last seven days ending at `date`: filled where it was done, faint where it was skipped or rested. */
function RecentDots({ logs, date, color }) {
  const days = eachDay(addDays(date, -6), date)
  return (
    <div aria-hidden className="flex items-center gap-1">
      {days.map((d) => {
        const status = logs.find((l) => l.log_date === d)?.status
        return (
          <span
            key={d}
            title={fmtDay(d, 'EEE d MMM')}
            className={cn('h-1.5 w-1.5 rounded-full', !status && 'bg-muted')}
            style={status === 'done' ? { background: color } : status ? { background: color, opacity: 0.3 } : undefined}
          />
        )
      })}
    </div>
  )
}

/** One habit for `date`: check-in button, streak, 30-day rate and the actions menu. `s` is a buildHabitStats() row. */
export function HabitRow({ s, date, onEdit, ctxProps }) {
  const { habit } = s
  const log = s.logs.find((l) => l.log_date === date)
  const done = log?.status === 'done'
  const off = log && !done
  const scheduled = habit.frequency === 'weekly' || isScheduled(habit, date)

  const [setStatus, pending] = useAction((st) => setHabitStatus(habit.id, date, st))
  const [archive] = useAction(
    () => store.update('habits', habit.id, { archived_at: habit.archived_at ? null : new Date().toISOString() }),
    {
      success: habit.archived_at ? 'Habit restored' : 'Habit archived',
    },
  )
  const removeHabit = useConfirmedDelete('habits', 'Habit deleted')

  // A streak reaching a milestone gets its moment, once, as it happens.
  const { current: streak, unit } = s
  const lastStreak = useRef(streak)
  useEffect(() => {
    if (streak > lastStreak.current && STREAK_MILESTONES.includes(streak)) {
      toast.success(`${streak}${unit} streak on ${habit.name}`, { description: 'Keep it going.' })
      celebrate({ count: 60 })
    }
    lastStreak.current = streak
  }, [streak, unit, habit.name])

  const lastTap = useRef(0)
  const tap = () => {
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) return // ignore accidental double taps
    lastTap.current = now
    setStatus(done ? null : 'done')
  }

  return (
    <div {...ctxProps} className={cn('lt-card lt-lift flex items-center gap-3 p-3', habit.archived_at && 'opacity-60')}>
      <CheckButton
        size="lg"
        done={done}
        color={habit.color}
        disabled={pending || !!habit.archived_at}
        onToggle={tap}
        label={`${done ? 'Undo' : 'Complete'} ${habit.name}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('truncate text-sm font-medium', off && 'text-muted-foreground')}>{habit.name}</p>
          <RecentDots logs={s.logs} date={date} color={habit.color} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{scheduleLabel(habit)}</span>
          <span className={cn('flex items-center gap-1 tabular-nums', s.current > 0 && 'font-medium text-foreground/90')}>
            <Flame className={cn('h-3 w-3', s.current > 0 && 'lt-flame text-warning')} aria-hidden />
            {s.current}
            {s.unit}
          </span>
          <span>{pctText(s.rate30)} (30d)</span>
          {off && <Badge>{log.status === 'rest' ? 'Rest day' : 'Skipped'}</Badge>}
          {!scheduled && !log && <Badge>Not scheduled</Badge>}
          {habit.archived_at && <Badge>Archived</Badge>}
        </div>
      </div>
      <Menu
        label={`Actions for ${habit.name}`}
        items={[
          { label: 'Skip this day', icon: SkipForward, hidden: !!habit.archived_at, onClick: () => setStatus('skipped') },
          { label: 'Rest day', icon: Moon, hidden: !!habit.archived_at, onClick: () => setStatus('rest') },
          { label: 'Clear check-in', icon: Undo2, hidden: !log, onClick: () => setStatus(null) },
          { label: 'Edit', icon: Pencil, onClick: () => onEdit(habit) },
          { label: habit.archived_at ? 'Restore' : 'Archive', icon: habit.archived_at ? RotateCcw : Archive, onClick: archive },
          {
            label: 'Delete',
            icon: Trash2,
            danger: true,
            onClick: () =>
              removeHabit(habit.id, {
                title: `Delete "${habit.name}"?`,
                description: 'This permanently deletes the habit and its whole history. Archive it instead to keep the history.',
              }),
          },
        ]}
      />
    </div>
  )
}
