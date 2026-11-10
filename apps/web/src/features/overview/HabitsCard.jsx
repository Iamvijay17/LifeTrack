import { Flame, Repeat } from 'lucide-react'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { AnimatedValue } from '@/components/motion/primitives'
import { plural } from '@/lib/utils'
import { Subhead, WidgetEmpty } from './parts'

/** Habits and the day's routine. `snap` is habitsSnapshot(). */
export function HabitsCard({ snap, className }) {
  return (
    <Card data-module="habits" data-testid="habits-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-mod-text" aria-hidden />
          Habits &amp; routine
        </CardTitle>
        <CardLink to="/habits">Habits</CardLink>
      </CardHeader>
      <CardContent className="space-y-4">
        {snap.total === 0 ? (
          <WidgetEmpty to="/habits" cta="Create a habit">
            Habits you build will be tracked here.
          </WidgetEmpty>
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="lt-stat-value text-[1.75rem] leading-tight" data-testid="habits-done">
                  <AnimatedValue value={snap.due ? `${snap.done}/${snap.due}` : '—'} />
                </span>
                <span className="text-xs text-muted-foreground">{snap.due ? 'habits done today' : 'none due today'}</span>
              </div>
              {snap.percent != null && (
                <Progress value={snap.percent} tone={snap.percent >= 100 ? 'success' : 'primary'} className="mt-2.5" label="Habits today" />
              )}
            </div>
            {snap.routine && snap.routine.total > 0 && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">Daily routine</span>
                  <span className="tabular-nums text-muted-foreground">
                    {snap.routine.done} of {snap.routine.total} done
                  </span>
                </div>
                <Progress value={snap.routine.percent} tone={snap.routine.percent >= 100 ? 'success' : 'primary'} label="Daily routine" />
              </div>
            )}
            {snap.pending.length > 0 && (
              <div>
                <Subhead>Still to do</Subhead>
                <ul className="flex flex-wrap gap-1.5">
                  {snap.pending.slice(0, 6).map((h) => (
                    <li
                      key={h.id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-xs"
                    >
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: h.color }} />
                      <span className="truncate">{h.name}</span>
                    </li>
                  ))}
                  {snap.pending.length > 6 && <li className="px-1 py-1 text-xs text-muted-foreground">+{snap.pending.length - 6} more</li>}
                </ul>
              </div>
            )}
            <div>
              <Subhead>Active streaks</Subhead>
              {snap.streaks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Complete a habit today to start a streak.</p>
              ) : (
                <ul className="space-y-1.5">
                  {snap.streaks.slice(0, 3).map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <Flame className="lt-flame h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {plural(s.current, s.unit === 'wk' ? 'week' : 'day')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
