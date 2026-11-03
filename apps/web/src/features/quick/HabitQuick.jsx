import { Check } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { useHabits } from '@/features/habits/useHabits'
import { useToday } from '@/hooks/useToday'
import { useSettings } from '@/hooks/useSettings'
import { useAction } from '@/hooks/useAction'
import { setHabitStatus } from '@/services/api'
import { cn } from '@/lib/utils'

/** Quick add → "Complete habit": today's due habits as tap-to-check rows. */
export function HabitQuick({ onClose }) {
  const today = useToday()
  const { settings } = useSettings()
  const { stats } = useHabits(today, settings.week_starts_on)
  const [toggle, pending] = useAction((id, done) => setHabitStatus(id, today, done ? null : 'done'))
  const list = stats.filter((s) => !s.habit.archived_at && (s.due || s.today))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Complete habits" description="Tap to check in for today.">
      {list.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No habits due today. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => {
            const done = s.today?.status === 'done'
            return (
              <li key={s.habit.id}>
                <button
                  disabled={pending}
                  onClick={() => toggle(s.habit.id, done)}
                  aria-pressed={done}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left',
                    done && 'bg-success/10',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-6 w-6 place-items-center rounded-full border-2',
                      done ? 'border-success bg-success text-white' : 'border-muted-foreground/50',
                    )}
                  >
                    {done && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className={cn('flex-1 text-sm', done && 'text-muted-foreground line-through')}>{s.habit.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
