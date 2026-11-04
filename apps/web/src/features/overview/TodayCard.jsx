import { Link } from 'react-router-dom'
import { Bell, Briefcase, CalendarCheck, Check, Circle, Dumbbell, GraduationCap, Repeat, Send, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { nextTimed } from '@lifetrack/core/agenda'
import { signFor } from '@lifetrack/core/finance'
import { cn } from '@/lib/utils'

const ICONS = {
  task: Circle,
  habit: Repeat,
  workout: Dumbbell,
  interview: Briefcase,
  reminder: Bell,
  revision: GraduationCap,
  followup: Send,
  bill: Wallet,
}
const LINKS = (i) =>
  ({
    task: '/planner',
    habit: '/habits',
    workout: '/fitness',
    interview: `/jobs?app=${i.refId}`,
    reminder: '/notifications',
    revision: '/learning',
    followup: `/jobs?app=${i.refId}`,
    bill: '/finance',
  })[i.kind]

function Row({ item, money, onToggle, isNext }) {
  const Icon = ICONS[item.kind]
  const completable = item.kind === 'task' || item.kind === 'habit'
  return (
    <li className={cn('flex min-h-11 items-center gap-1 rounded-md md:min-h-0', isNext && 'bg-primary/10')}>
      {completable ? (
        <button
          onClick={() => onToggle(item)}
          aria-label={`${item.done ? 'Mark not done' : 'Complete'} ${item.title}`}
          aria-pressed={item.done}
          className="grid h-11 w-9 shrink-0 place-items-center text-muted-foreground md:h-8"
        >
          {item.done ? <Check className="h-5 w-5 text-success" aria-hidden /> : <Circle className="h-5 w-5" aria-hidden />}
        </button>
      ) : (
        <span className="grid h-11 w-9 shrink-0 place-items-center text-muted-foreground md:h-8">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      )}
      <Link to={LINKS(item)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-sm">
        <span className={cn('min-w-0 flex-1 truncate', item.done && 'text-muted-foreground line-through')}>{item.title}</span>
        {item.amount_paise != null && (
          <span className="shrink-0 text-xs tabular-nums">
            {signFor(item.txnType)}
            {money(item.amount_paise)}
          </span>
        )}
        {item.time && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.time}</span>}
      </Link>
    </li>
  )
}

/** One ordered list of the whole day. `agenda` is todayAgenda(); finished items sink below. */
export function TodayCard({ agenda, nowTime, money, onToggle, className }) {
  const next = nextTimed(agenda, nowTime)
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4" aria-hidden />
          Today
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {agenda.doneCount} of {agenda.total} done
        </span>
      </CardHeader>
      <CardContent className="p-2 pt-2">
        {agenda.total === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nothing planned for today. Add a task or check in a habit to start.
          </p>
        ) : (
          <>
            {agenda.timed.length > 0 && (
              <ul aria-label="Scheduled today">
                {agenda.timed.map((i) => (
                  <Row key={i.id} item={i} money={money} onToggle={onToggle} isNext={next?.id === i.id} />
                ))}
              </ul>
            )}
            {agenda.anytime.length > 0 && (
              <>
                {agenda.timed.length > 0 && <p className="px-2 pb-0.5 pt-2 text-xs font-medium text-muted-foreground">Anytime</p>}
                <ul aria-label="Anytime today">
                  {agenda.anytime.map((i) => (
                    <Row key={i.id} item={i} money={money} onToggle={onToggle} />
                  ))}
                </ul>
              </>
            )}
            {agenda.done.length > 0 && (
              <>
                <p className="px-2 pb-0.5 pt-2 text-xs font-medium text-muted-foreground">Done</p>
                <ul aria-label="Done today">
                  {agenda.done.map((i) => (
                    <Row key={i.id} item={i} money={money} onToggle={onToggle} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
