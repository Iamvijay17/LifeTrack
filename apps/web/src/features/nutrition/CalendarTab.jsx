import { useEffect, useMemo, useState } from 'react'
import { CalendarX, Plus } from 'lucide-react'
import { MonthCalendar } from '@/components/shared/MonthCalendar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { calendarTotals, dayMeals, dayTotals, firstLogDate, missingDays } from '@/domain/nutrition'
import { addDays, fmtDay, monthEnd, monthStart } from '@/lib/dates'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MealSection } from './MealSection'

/** Browse any date: calories per day on a month grid, days with nothing logged flagged, and the selected day's meals open to review and edit. */
export function CalendarTab({ n, today, weekStartsOn, selected, onSelect, actions }) {
  const [month, setMonth] = useState(monthStart(selected))
  useEffect(() => setMonth(monthStart(selected)), [selected])
  const from = monthStart(month)
  const to = monthEnd(month)
  const totalsByDay = useMemo(() => calendarTotals(n.logs, from, to), [n.logs, from, to])
  const missing = useMemo(() => missingDays(n.logs, from, to, today), [n.logs, from, to, today])
  const missingSet = useMemo(() => new Set(missing), [missing])
  const meals = useMemo(() => dayMeals(n.logs, selected), [n.logs, selected])
  const totals = useMemo(() => dayTotals(n.logs, selected), [n.logs, selected])
  const loggedCount = Object.keys(totalsByDay).length
  const goal = n.goals.kcal
  const future = selected > today

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2 lg:self-start">
        <CardHeader>
          <CardTitle>Food calendar</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onSelect(today)}>
            Today
          </Button>
        </CardHeader>
        <CardContent>
          <MonthCalendar
            month={month}
            onMonth={setMonth}
            selected={selected}
            onSelect={onSelect}
            today={today}
            weekStartsOn={weekStartsOn}
            labelFor={(d) =>
              totalsByDay[d] ? `${Math.round(totalsByDay[d].kcal)} kilocalories` : missingSet.has(d) ? 'no food logged' : ''
            }
            markFor={(d) => {
              const t = totalsByDay[d]
              if (t) {
                const over = goal > 0 && t.kcal > goal
                const fill = goal > 0 ? Math.min(100, (t.kcal / goal) * 100) : 100
                return (
                  <span aria-hidden className="absolute inset-x-2 bottom-1 h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn('block h-full rounded-full', over ? 'bg-danger/80' : 'bg-mod')}
                      style={{ width: `${Math.max(fill, 18)}%` }}
                    />
                  </span>
                )
              }
              return missingSet.has(d) ? (
                <span aria-hidden className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-warning/80" />
              ) : null
            }}
          />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full bg-mod" /> logged (fills toward your goal)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-warning/80" /> nothing logged
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {firstLogDate(n.logs) == null
              ? 'Log a meal and your days will fill in here.'
              : `${plural(loggedCount, 'day')} logged this month${missing.length ? `, ${plural(missing.length, 'day')} with nothing logged` : ''}.`}
          </p>
          {missing.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Days with nothing logged">
              {missing.slice(-12).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onSelect(d)}
                  className="lt-press inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
                >
                  <CalendarX className="h-3 w-3" aria-hidden />
                  {fmtDay(d, 'd MMM')}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader className="flex-wrap">
            <div className="min-w-0">
              <CardTitle>{selected === today ? 'Today' : fmtDay(selected, 'EEEE, d MMMM yyyy')}</CardTitle>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {Math.round(totals.kcal)} kcal{goal ? ` of ${goal}` : ''} · P {Math.round(totals.protein_g)} · C{' '}
                {Math.round(totals.carbs_g)} · F {Math.round(totals.fat_g)} · Fibre {Math.round(totals.fiber_g)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {missingSet.has(selected) && <Badge tone="warning">Nothing logged</Badge>}
              {future && <Badge>Upcoming</Badge>}
              <Button size="sm" onClick={() => actions.openAdd({ date: selected })}>
                <Plus className="h-4 w-4" aria-hidden />
                Add food
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3">
            {meals.map((meal) => (
              <MealSection
                key={meal.id}
                meal={meal}
                onAdd={(id) => actions.openAdd({ date: selected, meal: id })}
                onEdit={actions.openEdit}
                onDuplicate={(e) => actions.openDuplicate(e, selected)}
                onDelete={actions.deleteEntry}
              />
            ))}
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onSelect(addDays(selected, -1))}>
            Previous day
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSelect(addDays(selected, 1))}>
            Next day
          </Button>
        </div>
      </div>
    </div>
  )
}
