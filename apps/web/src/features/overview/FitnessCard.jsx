import { Dumbbell, Flame, Footprints } from 'lucide-react'
import { Badge, Progress } from '@/components/ui/misc'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { fmtDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Fact, FactGrid, Subhead } from './parts'

const STATE_TEXT = { Planned: 'Workout planned', 'Not planned': 'Nothing planned', Skipped: 'Skipped today' }
const STATE_TONE = { Done: 'success', Planned: 'primary', Skipped: 'warning', 'Rest day': 'neutral', 'Not planned': 'neutral' }

/** Gym & fitness. `snap` is fitnessSnapshot(). Steps and calories only appear once they have been logged. */
export function FitnessCard({ snap, className }) {
  const planned = snap.planned > 0
  return (
    <Card data-module="fitness" data-testid="fitness-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-mod-text" aria-hidden />
          Gym &amp; fitness
        </CardTitle>
        <CardLink to="/fitness">Fitness</CardLink>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Today's workout</p>
            <p className="text-base font-semibold tracking-display">{snap.todayName ?? STATE_TEXT[snap.today] ?? snap.today}</p>
          </div>
          {snap.todayName && <Badge tone={STATE_TONE[snap.today] ?? 'neutral'}>{snap.today}</Badge>}
        </div>
        <FactGrid>
          <Fact
            label="This week"
            value={`${snap.weekCount} workout${snap.weekCount === 1 ? '' : 's'}`}
            sub={snap.weekMinutes ? fmtDuration(snap.weekMinutes) : undefined}
          />
          <Fact
            label="Steps"
            value={snap.steps == null ? null : snap.steps.toLocaleString('en-IN')}
            sub={snap.stepsGoal ? `goal ${snap.stepsGoal.toLocaleString('en-IN')}` : undefined}
          />
          <Fact
            label="Calories eaten"
            value={snap.calories == null ? null : `${snap.calories.toLocaleString('en-IN')} kcal`}
            className="col-span-2 [@container(min-width:28rem)]:col-span-1"
          />
        </FactGrid>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">Weekly goal</span>
            <span className="tabular-nums text-muted-foreground">
              {planned ? `${snap.plannedDone} of ${snap.planned} planned workouts` : 'no weekly plan set'}
            </span>
          </div>
          {planned ? (
            <Progress value={snap.goalPercent} tone={snap.goalPercent >= 100 ? 'success' : 'primary'} label="Weekly workout goal" />
          ) : (
            <p className="text-xs text-muted-foreground">Plan your week in Fitness to track a goal.</p>
          )}
        </div>
        <div>
          <Subhead>This week</Subhead>
          <ol className="grid grid-cols-7 gap-1.5" aria-label="Workouts this week">
            {snap.week.map((d) => (
              <li key={d.d} className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground">
                <span
                  title={d.done ? 'Workout done' : d.planned ? 'Planned' : 'No workout'}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border',
                    d.done ? 'border-transparent bg-mod text-white' : d.planned ? 'border-mod/50 text-mod-text' : 'border-border',
                  )}
                >
                  {d.done ? (
                    <Flame className="h-3.5 w-3.5" aria-label="done" />
                  ) : d.planned ? (
                    <Footprints className="h-3 w-3" aria-label="planned" />
                  ) : null}
                </span>
                {d.label}
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  )
}
