import { useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { groupInterviewsByDay, nextInterviews } from '@/domain/jobs'
import { addDays, addMonths, eachDay, fmtDay, fmtDateTime, monthEnd, monthStart, startOfWeek } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { InterviewStatusBadge } from './StatusBadge'

const INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function InterviewCalendar({ events, apps, tz, today, weekStartsOn, onOpen, onEditEvent }) {
  const [month, setMonth] = useState(monthStart(today))
  const [sel, setSel] = useState(today)
  const from = startOfWeek(month, weekStartsOn)
  const to = addDays(startOfWeek(monthEnd(month), weekStartsOn), 6)
  const byDay = useMemo(() => groupInterviewsByDay(events, tz), [events, tz])
  const heads = Array.from({ length: 7 }, (_, i) => INITIALS[(weekStartsOn + i) % 7])
  const dayEvents = byDay.get(sel) ?? []
  const upcoming = nextInterviews(events, Date.now())
  const appOf = (e) => apps.find((a) => a.id === e.application_id)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardContent>
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-medium">{fmtDay(month, 'MMMM yyyy')}</p>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            {heads.map((h, i) => (
              <span key={i}>{h}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {eachDay(from, to).map((d) => {
              const n = byDay.get(d)?.length ?? 0
              return (
                <button
                  key={d}
                  onClick={() => setSel(d)}
                  aria-label={`${fmtDay(d, 'd MMMM')}${n ? `, ${n} interview${n > 1 ? 's' : ''}` : ''}`}
                  className={cn(
                    'relative aspect-square rounded-md text-sm transition-colors hover:bg-muted',
                    d.slice(0, 7) !== month.slice(0, 7) && 'text-muted-foreground/40',
                    d === today && 'font-semibold text-secondary',
                    sel === d && 'bg-primary/20 ring-1 ring-primary',
                  )}
                >
                  {Number(d.slice(8))}
                  {n > 0 && <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />}
                </button>
              )
            })}
          </div>
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
                  className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40"
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
