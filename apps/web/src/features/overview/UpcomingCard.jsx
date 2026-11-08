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
const MODULE = {
  overdue: 'planner',
  task: 'planner',
  interview: 'jobs',
  followup: 'jobs',
  goal: 'goals',
  milestone: 'goals',
  reminder: 'notifications',
  recurring: 'finance',
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

/** Deadlines across every module for the next week, on a timeline rail. `upcoming` is upcomingItems(). */
export function UpcomingCard({ upcoming, today, money, className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-mod-text" aria-hidden />
          Upcoming
        </CardTitle>
        <span className="text-xs text-muted-foreground">next 7 days</span>
      </CardHeader>
      <CardContent className="p-2 pt-3 md:p-3">
        {upcoming.items.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            Nothing due. Interviews, deadlines and reminders will show up here.
          </p>
        ) : (
          <ul className="relative before:absolute before:bottom-5 before:left-[1.45rem] before:top-5 before:w-px before:bg-border">
            {upcoming.items.map((item) => {
              const Icon = ICONS[item.kind]
              return (
                <li key={item.id}>
                  <Link
                    to={linkFor(item)}
                    data-module={MODULE[item.kind]}
                    className="group relative flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/40 md:min-h-9"
                  >
                    <span
                      className={cn(
                        'lt-icon-soft relative h-6 w-6 rounded-full ring-4 ring-card transition-transform duration-150 group-hover:scale-110',
                        item.overdue && '!bg-danger/15 !text-danger',
                      )}
                    >
                      <Icon className="h-3 w-3" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.amount_paise != null && (
                      <span className="shrink-0 text-xs tabular-nums">
                        {signFor(item.txnType)}
                        {money(item.amount_paise)}
                      </span>
                    )}
                    <span className={cn('shrink-0 text-xs', item.overdue ? 'font-medium text-danger' : 'text-muted-foreground')}>
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
