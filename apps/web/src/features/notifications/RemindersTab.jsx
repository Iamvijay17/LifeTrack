import { BellOff, CalendarClock, Pencil, Trash2 } from 'lucide-react'
import { priorityLabel } from '@lifetrack/core/notifications'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { isReminderOverdue, kindLabel, repeatLabel } from '@/domain/reminders'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { PRIORITY_STYLE } from './notificationTheme'

/** `reminders` is sortReminders(): active first, then by date and time. `today` and `nowTime` ('HH:MM') are in the person's timezone. */
export function RemindersTab({ reminders, today, nowTime, onCreate, onEdit, onReschedule, onToggle }) {
  const removeReminder = useConfirmedDelete('reminders', 'Reminder deleted')
  if (reminders.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="No reminders"
        description="Remind yourself about tasks, study, workouts, habits, bills — anything."
        action={<Button onClick={onCreate}>New reminder</Button>}
      />
    )
  }
  return (
    <Card>
      <ul className="divide-y divide-border/70">
        {reminders.map((r) => {
          const overdue = isReminderOverdue(r, today, nowTime)
          const p = r.priority ?? 'normal'
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 md:px-5">
              <Switch checked={r.active} onChange={() => onToggle(r)} label={`${r.active ? 'Disable' : 'Enable'} ${r.title}`} />
              <div className={cn('min-w-0 flex-1', !r.active && 'opacity-60')}>
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge tone="primary">{kindLabel(r.kind)}</Badge>
                  {PRIORITY_STYLE[p]?.show && <Badge tone={PRIORITY_STYLE[p].tone}>{priorityLabel(p)}</Badge>}
                  {overdue && <Badge tone="warning">Overdue</Badge>}
                  <span>
                    {fmtDay(r.remind_date, 'EEE, d MMM yyyy')} · {r.remind_time.slice(0, 5)}
                    {r.repeat !== 'none' && ` · ${repeatLabel(r.repeat).toLowerCase()}`}
                    {!r.active && ' · done'}
                  </span>
                </p>
                {r.body && <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{r.body}</p>}
              </div>
              <Menu
                label={`Actions for ${r.title}`}
                items={[
                  { label: 'Edit', icon: Pencil, onClick: () => onEdit(r) },
                  { label: 'Reschedule…', icon: CalendarClock, onClick: () => onReschedule(r) },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    danger: true,
                    onClick: () => removeReminder(r.id, { title: 'Delete this reminder?', description: r.title }),
                  },
                ]}
              />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
