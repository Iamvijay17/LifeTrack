import { GraduationCap } from 'lucide-react'
import { Badge, Progress } from '@/components/ui/misc'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { fmtDuration } from '@/lib/dates'
import { Fact, FactGrid, Subhead, WidgetEmpty, hoursText } from './parts'

/** Career & learning. `snap` is learningSnapshot(). */
export function LearningCard({ snap, className }) {
  return (
    <Card data-module="learning" data-testid="learning-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-mod-text" aria-hidden />
          Career &amp; learning
        </CardTitle>
        <CardLink to="/learning">Learning</CardLink>
      </CardHeader>
      <CardContent className="space-y-4">
        {!snap.hasData ? (
          <WidgetEmpty to="/learning" cta="Start a study session">
            Log a study session or set a learning goal to see your progress here.
          </WidgetEmpty>
        ) : (
          <>
            <FactGrid>
              <Fact label="Total learning" value={hoursText(snap.totalMinutes)} sub="all time" />
              <Fact label="This week" value={fmtDuration(snap.weekMinutes)} />
              <Fact label="Goals in progress" value={snap.courses.length} className="col-span-2 [@container(min-width:28rem)]:col-span-1" />
            </FactGrid>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium">Today's study</span>
                <span className="tabular-nums text-muted-foreground">
                  {snap.running
                    ? 'timer running'
                    : snap.targetMinutes > 0
                      ? `${fmtDuration(snap.todayMinutes)} of ${fmtDuration(snap.targetMinutes)}`
                      : `${fmtDuration(snap.todayMinutes)} · no target set`}
                </span>
              </div>
              {snap.todayPercent != null && (
                <Progress value={snap.todayPercent} tone={snap.todayPercent >= 100 ? 'success' : 'primary'} label="Today's study" />
              )}
            </div>
            {snap.courses.length > 0 && (
              <div>
                <Subhead>Courses &amp; goals in progress</Subhead>
                <ul className="space-y-2">
                  {snap.courses.slice(0, 3).map((c) => (
                    <li key={c.id} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">{c.title}</span>
                        <span className="tabular-nums text-muted-foreground">{c.percent == null ? 'no target' : `${c.percent}%`}</span>
                      </div>
                      {c.percent != null && <Progress value={c.percent} className="mt-1" label={c.title} />}
                    </li>
                  ))}
                </ul>
                {snap.courses.length > 3 && <p className="mt-1 text-xs text-muted-foreground">and {snap.courses.length - 3} more</p>}
              </div>
            )}
            {snap.skills.length > 0 && (
              <div>
                <Subhead>Skills you practised this month</Subhead>
                <ul className="flex flex-wrap gap-1.5">
                  {snap.skills.slice(0, 8).map((s) => (
                    <li key={s.id}>
                      <Badge tone="primary" title={`${fmtDuration(s.minutes)} in the last 30 days`}>
                        {s.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
