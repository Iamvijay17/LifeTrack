import { useMemo, useState } from 'react'
import { MonthCalendar } from '@/components/shared/MonthCalendar'
import { Card, CardContent } from '@/components/ui/card'
import { monthStart, fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

const STATUS_TEXT = { completed: 'Workout', rest: 'Rest day', skipped: 'Skipped' }
const DOT = { completed: 'bg-success', rest: 'bg-mod', skipped: 'bg-muted-foreground' }

/** The month at a glance: which days you trained, rested or skipped. */
export function WorkoutCalendar({ workouts, today, weekStartsOn }) {
  const [month, setMonth] = useState(monthStart(today))
  const [sel, setSel] = useState(today)
  const byDay = useMemo(() => {
    const map = new Map()
    for (const w of workouts) map.set(w.workout_date, [...(map.get(w.workout_date) ?? []), w])
    return map
  }, [workouts])
  const statusOf = (d) => {
    const rows = byDay.get(d)
    if (!rows) return null
    return rows.some((w) => w.status === 'completed') ? 'completed' : rows[0].status
  }
  const selected = byDay.get(sel) ?? []
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <MonthCalendar
            month={month}
            onMonth={setMonth}
            selected={sel}
            onSelect={setSel}
            today={today}
            weekStartsOn={weekStartsOn}
            labelFor={(d) => STATUS_TEXT[statusOf(d)] ?? ''}
            markFor={(d) => {
              const s = statusOf(d)
              return s ? <span className={cn('absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full', DOT[s])} /> : null
            }}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{fmtDay(sel, 'EEEE, d MMM')}</p>
          {selected.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {selected.map((w) => (
                <li key={w.id}>
                  {w.name}
                  {w.duration_minutes ? <span className="text-muted-foreground"> · {w.duration_minutes} min</span> : null}
                </li>
              ))}
            </ul>
          )}
          <ul aria-hidden className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground">
            {Object.entries(DOT).map(([k, cls]) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', cls)} />
                {STATUS_TEXT[k]}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
