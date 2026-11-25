import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { AnimatedValue, ProgressRing } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

/** The ring: percent of planned activities done today, or "—" when nothing is planned. */
export function Ring({ percent }) {
  return (
    <ProgressRing value={percent} size={132} stroke={12} label={percent == null ? 'No plan today' : `${percent}% complete`}>
      <span className="text-[1.75rem] font-semibold tracking-display">
        {percent == null ? '—' : <AnimatedValue value={`${percent}%`} />}
      </span>
    </ProgressRing>
  )
}

// Each kind of activity keeps its module's colour, so the bars read at a glance.
const MODULE = { tasks: 'planner', habits: 'habits', study: 'learning', workout: 'fitness', water: 'health', steps: 'health' }

/** Today's progress: the ring plus a bar per planned activity. `progress` is dailyProgress(). */
export function ProgressCard({ progress, className }) {
  return (
    <Card className={cn('flex', className)}>
      <CardContent className="flex w-full flex-col items-center gap-5 sm:flex-row">
        <Ring percent={progress.percent} />
        <div className="w-full min-w-0 flex-1 space-y-2.5">
          <div>
            <p className="text-sm font-semibold tracking-tight">Today's progress</p>
            <p className="text-xs text-muted-foreground">
              {progress.total
                ? `${Number(progress.done.toFixed(1))} of ${progress.total} planned activities`
                : 'Nothing planned yet — add a task or habit to start.'}
            </p>
          </div>
          {progress.items.map((i) => (
            <div
              key={i.key}
              title={i.note}
              data-module={MODULE[i.key]}
              className="grid grid-cols-[3.75rem_1fr_5.75rem] items-center gap-3 text-xs"
            >
              <span className="text-muted-foreground">{i.label}</span>
              <Progress value={(i.done / i.total) * 100} tone={i.done >= i.total ? 'success' : 'primary'} label={i.label} />
              <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{i.detail ?? `${i.done}/${i.total}`}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
