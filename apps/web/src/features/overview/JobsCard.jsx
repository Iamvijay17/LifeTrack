import { Briefcase, CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { STATUS_LABEL } from '@lifetrack/core/jobs'
import { fmtDateTime } from '@/lib/dates'
import { relativeTime } from '@/lib/format'
import { Fact, FactGrid, Subhead, WidgetEmpty } from './parts'

/** Job switch. `snap` is jobsSnapshot(). */
export function JobsCard({ snap, tz, className }) {
  const next = snap.nextInterview
  return (
    <Card data-module="jobs" data-testid="jobs-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-mod-text" aria-hidden />
          Job switch
        </CardTitle>
        <CardLink to="/jobs">Applications</CardLink>
      </CardHeader>
      <CardContent className="space-y-4">
        {snap.total === 0 ? (
          <WidgetEmpty to="/jobs" cta="Add an application">
            Track applications and interviews to see your job search here.
          </WidgetEmpty>
        ) : (
          <>
            <FactGrid>
              <Fact label="Applications" value={snap.total} sub={snap.appliedThisWeek ? `${snap.appliedThisWeek} this week` : undefined} />
              <Fact label="In progress" value={snap.inProgress} />
              <Fact
                label="Interviews"
                value={snap.interviewsScheduled}
                sub="scheduled"
                className="col-span-2 [@container(min-width:28rem)]:col-span-1"
              />
            </FactGrid>
            {next && (
              <Link
                to={`/jobs?app=${next.app.id}`}
                className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
              >
                <CalendarClock className="h-4 w-4 shrink-0 text-mod-text" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    Next: {next.app.company}
                    {next.round_name ? ` · ${next.round_name}` : ''}
                  </span>
                  <span className="block text-xs text-muted-foreground">{fmtDateTime(next.scheduled_at, tz)}</span>
                </span>
              </Link>
            )}
            <div>
              <Subhead>Recent activity</Subhead>
              {snap.recent.length === 0 ? (
                <p className="text-xs text-muted-foreground">No status changes yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {snap.recent.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        <b className="font-medium">{r.company}</b>{' '}
                        <span className="text-muted-foreground">
                          {r.from ? `${STATUS_LABEL[r.from] ?? r.from} → ` : 'added as '}
                          {STATUS_LABEL[r.to] ?? r.to}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(r.at)}</span>
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
