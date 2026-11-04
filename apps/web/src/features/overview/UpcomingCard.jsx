import { Link } from 'react-router-dom'
import { Bell, Briefcase, CalendarClock, CheckSquare, Flag, Repeat, Send, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { signFor } from '@lifetrack/core/finance'
import { dueLabel } from '@lifetrack/core/upcoming'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

const ICONS = {
  overdue: CheckSquare,
  task: CheckSquare,
  interview: Briefcase,
  followup: Send,
  goal: Target,
  milestone: Flag,
  reminder: Bell,
  recurring: Repeat,
}

const linkFor = (item) =>
  ({
    overdue: '/planner',
    task: `/planner?date=${item.date}`,
    interview: `/jobs?app=${item.refId}`,
    followup: `/jobs?app=${item.refId}`,
    goal: '/goals',
    milestone: '/goals',
    reminder: '/notifications',
    recurring: '/finance',
  })[item.kind]

/** Deadlines across every module for the next week. `upcoming` is upcomingItems(). */
export function UpcomingCard({ upcoming, today, money, className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" aria-hidden />
          Upcoming
        </CardTitle>
        <span className="text-xs text-muted-foreground">next 7 days</span>
      </CardHeader>
      <CardContent className="p-2 pt-2">
        {upcoming.items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nothing due. Interviews, deadlines and reminders will show up here.
          </p>
        ) : (
          <ul>
            {upcoming.items.map((item) => {
              const Icon = ICONS[item.kind]
              return (
                <li key={item.id}>
                  <Link
                    to={linkFor(item)}
                    className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40 md:min-h-0"
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', item.overdue ? 'text-danger' : 'text-muted-foreground')} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.amount_paise != null && (
                      <span className="shrink-0 text-xs tabular-nums">
                        {signFor(item.txnType)}
                        {money(item.amount_paise)}
                      </span>
                    )}
                    <span className={cn('shrink-0 text-xs', item.overdue ? 'text-danger' : 'text-muted-foreground')}>
                      {dueLabel(item, today, (d) => fmtDay(d, 'd MMM'))}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {upcoming.more > 0 && <p className="px-2 pt-1 text-xs text-muted-foreground">and {upcoming.more} more</p>}
      </CardContent>
    </Card>
  )
}
