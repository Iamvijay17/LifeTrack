import { CalendarPlus, Clock } from 'lucide-react'
import { snoozeOptions } from '@lifetrack/core/notifications'
import { Menu } from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { formatWhen } from './notificationFormat'
import { useNotificationSettings } from './useNotificationSettings'

/**
 * The snooze button: quick choices (each showing when it lands) and "Pick date & time…". The choices are worked out when the menu is built, in the
 * person's timezone, so "This evening" and "Tomorrow morning" mean their evening and morning.
 */
export function SnoozeMenu({ title, onSnooze, onPick, label = true, className }) {
  const { settings, tz } = useNotificationSettings()
  const now = Date.now()
  // The labels are worked out when the menu is drawn, but the time that is saved is worked out when you choose, so "1 hour" is an hour from the click.
  const chosen = (id) => snoozeOptions(Date.now(), tz, settings).find((o) => o.id === id)?.at
  const items = [
    ...snoozeOptions(now, tz, settings).map((o) => ({
      label: `${o.label} · ${formatWhen(o.at, tz, now)}`,
      icon: Clock,
      onClick: () => onSnooze(chosen(o.id) ?? o.at),
    })),
    { label: 'Pick date & time…', icon: CalendarPlus, onClick: onPick },
  ]
  return (
    <Menu
      label={`Snooze ${title}`}
      align="right"
      items={items}
      className={className}
      trigger={
        <span
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium',
            label ? 'h-8 rounded-md px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground' : 'grid h-8 w-8 place-items-center',
          )}
        >
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {label && 'Snooze'}
        </span>
      }
    />
  )
}
