import { Link } from 'react-router-dom'
import { Bell, Briefcase, CalendarCheck, Circle, Dumbbell, GraduationCap, Repeat, Send, Sparkles, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckButton } from '@/components/shared/CheckButton'
import { LayoutGroup, m, spring } from '@/components/motion/primitives'
import { Progress } from '@/components/ui/misc'
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
const MODULE = {
  task: 'planner',
  habit: 'habits',
  workout: 'fitness',
  interview: 'jobs',
  reminder: 'notifications',
  revision: 'learning',
  followup: 'jobs',
  bill: 'finance',
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
    <m.li
      layout="position"
      layoutId={`today-${item.id}`}
      transition={spring.snappy}
      data-module={MODULE[item.kind]}
      className={cn('relative flex min-h-11 items-center gap-1 rounded-md md:min-h-9', isNext && 'bg-mod/10 ring-1 ring-inset ring-mod/25')}
    >
      {completable ? (
        <CheckButton
          done={item.done}
          onToggle={() => onToggle(item)}
          label={`${item.done ? 'Mark not done' : 'Complete'} ${item.title}`}
          className="w-9 md:w-9"
        />
      ) : (
        <span className="grid h-11 w-9 shrink-0 place-items-center md:h-8">
          <span className="lt-icon-soft h-6 w-6 rounded-[6px]">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        </span>
      )}
      <Link to={LINKS(item)} className="group flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-sm">
        <span
          className={cn(
            'min-w-0 flex-1 truncate transition-colors group-hover:text-mod-text',
            item.done && 'text-muted-foreground line-through',
          )}
        >
          {item.title}
        </span>
        {item.amount_paise != null && (
          <span className="shrink-0 text-xs tabular-nums">
            {signFor(item.txnType)}
            {money(item.amount_paise)}
          </span>
        )}
        {item.time && (
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {item.time}
          </span>
        )}
      </Link>
    </m.li>
  )
}

const Heading = ({ children }) => <p className="lt-eyebrow px-2 pb-1 pt-3 text-[10px]">{children}</p>

/** One ordered list of the whole day. `agenda` is todayAgenda(); finished items glide down into Done. */
export function TodayCard({ agenda, nowTime, money, onToggle, className }) {
  const next = nextTimed(agenda, nowTime)
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-mod-text" aria-hidden />
          Today
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {agenda.doneCount} of {agenda.total} done
        </span>
      </CardHeader>
      {agenda.total > 0 && (
        <div className="px-4 pt-3 md:px-5">
          <Progress value={(agenda.doneCount / agenda.total) * 100} label="Today's agenda done" />
        </div>
      )}
      <CardContent className="flex-1 p-2 pt-1 md:p-3 md:pt-1">
        {agenda.total === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-2 py-6 text-center text-sm text-muted-foreground">
            <span className="lt-float lt-icon-soft h-10 w-10">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            Nothing planned for today. Add a task or check in a habit to start.
          </div>
        ) : (
          <LayoutGroup id="today">
            {agenda.timed.length > 0 && (
              <>
                <Heading>Scheduled</Heading>
                <ul aria-label="Scheduled today" className="space-y-0.5">
                  {agenda.timed.map((i) => (
                    <Row key={i.id} item={i} money={money} onToggle={onToggle} isNext={next?.id === i.id} />
                  ))}
                </ul>
              </>
            )}
            {agenda.anytime.length > 0 && (
              <>
                {agenda.timed.length > 0 && <Heading>Anytime</Heading>}
                <ul aria-label="Anytime today" className="mt-1 space-y-0.5">
                  {agenda.anytime.map((i) => (
                    <Row key={i.id} item={i} money={money} onToggle={onToggle} />
                  ))}
                </ul>
              </>
            )}
            {agenda.done.length > 0 && (
              <>
                <Heading>Done</Heading>
                <ul aria-label="Done today" className="space-y-0.5">
                  {agenda.done.map((i) => (
                    <Row key={i.id} item={i} money={money} onToggle={onToggle} />
                  ))}
                </ul>
              </>
            )}
          </LayoutGroup>
        )}
      </CardContent>
    </Card>
  )
}
