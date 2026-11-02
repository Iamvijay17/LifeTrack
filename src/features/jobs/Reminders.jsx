import { Bell } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { fmtDay, fmtDateTime } from '@/lib/dates'

/** Follow-ups that are due and interviews in the next 7 days. Renders nothing when there is nothing to remind. */
export function Reminders({ followups, upcoming, tz, onOpen }) {
  if (!followups.length && !upcoming.length) return null
  return (
    <Card className="border-warning/30">
      <CardContent className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Bell className="h-4 w-4 text-warning" />
          Reminders
        </p>
        <ul className="space-y-1 text-sm">
          {followups.map((a) => (
            <li key={a.id}>
              <button className="text-left hover:underline" onClick={() => onOpen(a)}>
                Follow up with <b>{a.company}</b> <span className="text-muted-foreground">({fmtDay(a.followup_date, 'd MMM')})</span>
              </button>
            </li>
          ))}
          {upcoming.map((e) => (
            <li key={e.id}>
              <button className="text-left hover:underline" onClick={() => onOpen(e.app)}>
                Interview: <b>{e.app?.company}</b> · {e.round_name}{' '}
                <span className="text-muted-foreground">({fmtDateTime(e.scheduled_at, tz)})</span>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
