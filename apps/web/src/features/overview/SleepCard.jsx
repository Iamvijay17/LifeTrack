import { Moon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { AnimatedValue } from '@/components/motion/primitives'
import { fmtDay, fmtDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Fact, FactGrid, Subhead, WidgetEmpty } from './parts'

const when = (snap) =>
  snap.daysAgo === 0 ? 'last night' : snap.daysAgo === 1 ? 'the night before' : `${fmtDay(snap.lastDate, 'EEE d MMM')}`

/** Sleep & health. `snap` is sleepSnapshot(). A night that was not logged is a gap, never a short night. */
export function SleepCard({ snap, className }) {
  const max = Math.max(snap.goal, ...snap.week.map((w) => w.minutes ?? 0))
  const c = snap.consistency
  return (
    <Card data-module="health" data-testid="sleep-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="h-4 w-4 text-mod-text" aria-hidden />
          Sleep &amp; health
        </CardTitle>
        <CardLink to="/health">Health</CardLink>
      </CardHeader>
      <CardContent className="space-y-4">
        {snap.lastMinutes == null ? (
          <WidgetEmpty to="/health" cta="Log last night's sleep">
            No sleep recorded yet.
          </WidgetEmpty>
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="lt-stat-value text-[1.75rem] leading-tight" data-testid="sleep-last">
                  <AnimatedValue value={fmtDuration(snap.lastMinutes)} />
                </span>
                <span className="text-xs text-muted-foreground">{when(snap)}</span>
              </div>
              <Progress
                value={snap.goalPercent}
                tone={snap.goalPercent >= 100 ? 'success' : 'primary'}
                className="mt-2.5"
                label="Sleep goal"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {snap.goalPercent}% of your {fmtDuration(snap.goal)} goal
              </p>
            </div>
            <div>
              <Subhead>Last 7 days</Subhead>
              <ol className="grid h-20 grid-cols-7 items-end gap-1.5" aria-label="Sleep over the last seven days">
                {snap.week.map((w) => (
                  <li key={w.d} className="flex h-full flex-col items-center justify-end gap-1 text-[11px] text-muted-foreground">
                    <span
                      title={w.minutes == null ? `${w.label}: not logged` : `${w.label}: ${fmtDuration(w.minutes)}`}
                      className={cn(
                        'w-full max-w-6 rounded-t-[4px]',
                        w.minutes == null ? 'h-1 bg-muted' : w.minutes >= snap.goal ? 'bg-success/80' : 'bg-mod/70',
                      )}
                      style={w.minutes == null ? undefined : { height: `${Math.max(8, (w.minutes / max) * 100)}%` }}
                    />
                    {w.label.slice(0, 1)}
                  </li>
                ))}
              </ol>
            </div>
            <FactGrid>
              <Fact
                label="Average"
                value={snap.avgMinutes == null ? null : fmtDuration(snap.avgMinutes)}
                sub={`${snap.nightsLogged} of 7 nights logged`}
              />
              <Fact
                label="Met goal"
                value={snap.nightsLogged ? `${snap.nightsMetGoal} of ${snap.nightsLogged}` : null}
                sub="logged nights"
              />
              <Fact
                label="Consistency"
                value={c.label}
                sub={c.label ? `bedtime ±${c.spreadMinutes} min` : `${c.nights}/3 timed nights`}
                className="col-span-2 [@container(min-width:28rem)]:col-span-1"
              />
            </FactGrid>
          </>
        )}
      </CardContent>
    </Card>
  )
}
