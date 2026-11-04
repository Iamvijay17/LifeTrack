import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { DAY_NAMES } from '@/domain/fitness'
import { fmtDay, weekday } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** One row per day of the week: choose a routine, rest, or leave it flexible, and see what actually happened. */
export function WeeklyPlan({ weekDays, today, plan, routines, workouts, completed, planning, onPlan }) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle>Weekly plan</CardTitle>
        <span className="hidden text-xs text-muted-foreground sm:inline">Choose a routine, rest, or leave flexible</span>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {weekDays.map((d) => {
          const dow = String(weekday(d))
          const done = completed.some((x) => x.workout_date === d)
          const off = workouts.find((x) => x.workout_date === d && x.status !== 'completed')
          return (
            <div
              key={d}
              className={cn(
                'flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors',
                d === today && 'bg-mod/10 ring-1 ring-inset ring-mod/25',
              )}
            >
              <div className="w-16 shrink-0 sm:w-24">
                <p className="text-sm font-medium">
                  {DAY_NAMES[dow].slice(0, 3)}
                  {d === today && <span className="ml-1.5 hidden text-[10px] text-mod-text sm:inline">TODAY</span>}
                </p>
                <p className="text-xs text-muted-foreground">{fmtDay(d, 'd MMM')}</p>
              </div>
              <div className="min-w-0 flex-1">
                <Select
                  aria-label={`Plan for ${DAY_NAMES[dow]}`}
                  disabled={planning}
                  value={plan[dow] ?? ''}
                  onChange={(e) => onPlan(dow, e.target.value)}
                >
                  <option value="">Flexible / unplanned</option>
                  <option value="rest">Rest day</option>
                  {routines.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-14 shrink-0 text-right sm:w-20">
                {done ? <Badge tone="success">Done</Badge> : off ? <Badge>{off.status === 'rest' ? 'Rest' : 'Skipped'}</Badge> : null}
              </div>
            </div>
          )
        })}
        {routines.length === 0 && (
          <p className="px-2 pt-2 text-xs text-muted-foreground">Create a routine in the Routines tab to assign it to days.</p>
        )}
      </CardContent>
    </Card>
  )
}
