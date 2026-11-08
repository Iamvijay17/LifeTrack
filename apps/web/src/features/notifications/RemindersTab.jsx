import { BellOff, Pencil, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { kindLabel, repeatLabel } from '@/domain/reminders'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** `reminders` is sortReminders(): active first, then by date and time. */
export function RemindersTab({ reminders, onCreate, onEdit, onToggle }) {
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
        {reminders.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 md:px-5">
            <Switch checked={r.active} onChange={() => onToggle(r)} label={`${r.active ? 'Disable' : 'Enable'} ${r.title}`} />
            <div className={cn('min-w-0 flex-1', !r.active && 'opacity-60')}>
              <p className="truncate text-sm font-medium">{r.title}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge tone="primary">{kindLabel(r.kind)}</Badge>
                {fmtDay(r.remind_date, 'EEE, d MMM yyyy')} · {r.remind_time.slice(0, 5)}
                {r.repeat !== 'none' && ` · ${repeatLabel(r.repeat).toLowerCase()}`}
                {!r.active && ' · done'}
              </p>
            </div>
            <Menu
              label={`Actions for ${r.title}`}
              items={[
                { label: 'Edit', icon: Pencil, onClick: () => onEdit(r) },
                {
                  label: 'Delete',
                  icon: Trash2,
                  danger: true,
                  onClick: () => removeReminder(r.id, { title: 'Delete this reminder?', description: r.title }),
                },
              ]}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}
