import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** The ring: percent of planned activities done today, or "—" when nothing is planned. */
export function Ring({ percent }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-32 w-32 shrink-0 -rotate-90"
      role="img"
      aria-label={percent == null ? 'No plan today' : `${percent}% complete`}
    >
      <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="rgb(var(--muted))" strokeWidth="9" />
      {percent != null && (
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="var(--c-primary)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      )}
      <text
        x="60"
        y="60"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 origin-center fill-foreground text-[26px] font-semibold"
        style={{ transformOrigin: '60px 60px' }}
      >
        {percent == null ? '—' : `${percent}%`}
      </text>
    </svg>
  )
}

/** Today's progress: the ring plus a bar per planned activity. `progress` is dailyProgress(). */
export function ProgressCard({ progress, className }) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Ring percent={progress.percent} />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <p className="text-sm font-medium">Today's progress</p>
            <p className="text-xs text-muted-foreground">
              {progress.total
                ? `${Number(progress.done.toFixed(1))} of ${progress.total} planned activities`
                : 'Nothing planned yet — add a task or habit to start.'}
            </p>
          </div>
          {progress.items.map((i) => (
            <div key={i.key} className="grid grid-cols-[4.5rem_1fr_6rem] items-center gap-3 text-xs">
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
