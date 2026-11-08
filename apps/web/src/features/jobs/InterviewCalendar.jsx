import { useMemo, useState } from 'react'
import { Calendar } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { MonthCalendar } from '@/components/shared/MonthCalendar'
import { groupInterviewsByDay, nextInterviews } from '@/domain/jobs'
import { fmtDay, fmtDateTime, monthStart } from '@/lib/dates'
import { InterviewStatusBadge } from './StatusBadge'

export function InterviewCalendar({ events, apps, tz, today, weekStartsOn, onOpen, onEditEvent }) {
  const [month, setMonth] = useState(monthStart(today))
  const [sel, setSel] = useState(today)
  const byDay = useMemo(() => groupInterviewsByDay(events, tz), [events, tz])
  const dayEvents = byDay.get(sel) ?? []
  const upcoming = nextInterviews(events, Date.now())
  const appOf = (e) => apps.find((a) => a.id === e.application_id)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardContent>
          <MonthCalendar
            month={month}
            onMonth={setMonth}
            selected={sel}
            onSelect={setSel}
            today={today}
            weekStartsOn={weekStartsOn}
            labelFor={(d) => {
              const n = byDay.get(d)?.length ?? 0
              return n ? `${n} interview${n > 1 ? 's' : ''}` : ''
            }}
            markFor={(d) =>
              byDay.get(d)?.length ? <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-mod" /> : null
            }
          />
        </CardContent>
      </Card>
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">{fmtDay(sel, 'EEEE, d MMM')}</p>
            {dayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interviews.</p>
            ) : (
              dayEvents.map((e) => (
                <button
                  key={e.id}
                  className="lt-lift flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm"
                  onClick={() => onEditEvent(e)}
                >
                  <span>
                    <b>{appOf(e)?.company}</b> · {e.round_name}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(e.scheduled_at, tz)} · {e.mode}
                    </span>
                  </span>
                  <InterviewStatusBadge status={e.status} />
                </button>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4" />
              Upcoming
            </p>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
            ) : (
              upcoming.map((e) => (
                <button key={e.id} className="block w-full text-left text-sm hover:underline" onClick={() => appOf(e) && onOpen(appOf(e))}>
                  {appOf(e)?.company} · {e.round_name}
                  <span className="block text-xs text-muted-foreground">{fmtDateTime(e.scheduled_at, tz)}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
