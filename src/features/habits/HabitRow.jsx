import { useRef } from 'react'
import { Archive, Check, Flame, Moon, Pencil, RotateCcw, SkipForward, Trash2, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import * as store from '@/hooks/store'
import { setHabitStatus } from '@/services/api'
import { isScheduled } from '@/domain/streaks'
import { scheduleLabel } from '@/domain/habits'
import { pctText } from '@/lib/format'
import { cn } from '@/lib/utils'

const DOUBLE_TAP_MS = 600

/** One habit for `date`: check-in button, streak, 30-day rate and the actions menu. `s` is a buildHabitStats() row. */
export function HabitRow({ s, date, onEdit }) {
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

  const lastTap = useRef(0)
  const tap = () => {
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) return // ignore accidental double taps
    lastTap.current = now
    setStatus(done ? null : 'done')
  }

  return (
    <li className={cn('flex items-center gap-3 rounded-lg border border-border bg-card p-3', habit.archived_at && 'opacity-60')}>
      <button
        type="button"
        disabled={pending || !!habit.archived_at}
        onClick={tap}
        aria-pressed={done}
        aria-label={`${done ? 'Undo' : 'Complete'} ${habit.name}`}
        style={done ? { background: habit.color, borderColor: habit.color } : { borderColor: habit.color }}
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90',
          done ? 'text-white' : 'text-transparent hover:text-muted-foreground',
        )}
      >
        <Check className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', off && 'text-muted-foreground')}>{habit.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{scheduleLabel(habit)}</span>
          <span className="flex items-center gap-1">
            <Flame className={cn('h-3 w-3', s.current > 0 && 'text-warning')} />
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
    </li>
  )
}
