import { CalendarClock, CheckCircle2, ClipboardList, Gauge, TriangleAlert } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { scoreTone } from '@lifetrack/core/dashboard'
import { cn } from '@/lib/utils'

const changeText = (c) =>
  c == null
    ? 'average of the last 7 days'
    : c === 0
      ? 'same as the week before'
      : `${Math.abs(c)} ${c > 0 ? 'up' : 'down'} on the week before`

/**
 * The day in five numbers, under the greeting. `kpis`: { score, change, percent, tasks: { total, done, pending }, overdue, events }.
 * A figure with nothing behind it shows a dash instead of a zero (no plan yet is not 0% complete).
 */
export function KpiStrip({ kpis }) {
  const { tasks } = kpis
  return (
    <section aria-label="Key numbers" data-testid="kpi-strip" className="mb-4 grid grid-cols-2 gap-3 md:mb-5 lg:grid-cols-5">
      <StatCard
        icon={Gauge}
        label="Life Score"
        value={kpis.score ?? '—'}
        sub={kpis.score == null ? 'nothing recorded yet' : changeText(kpis.change)}
        progress={kpis.score}
        tone={scoreTone(kpis.score)}
        className="col-span-2 lg:col-span-1"
      />
      <StatCard
        icon={CheckCircle2}
        label="Today's completion"
        value={kpis.percent == null ? '—' : `${kpis.percent}%`}
        sub={kpis.percent == null ? 'nothing planned yet' : 'of planned activities'}
        progress={kpis.percent}
      />
      <StatCard
        icon={ClipboardList}
        module="planner"
        label="Tasks today"
        value={tasks.total ? `${tasks.done}/${tasks.total}` : '—'}
        sub={tasks.total ? `${tasks.pending} pending` : 'no tasks due'}
        to="/planner"
      />
      <StatCard
        icon={TriangleAlert}
        module="planner"
        label="Overdue"
        value={kpis.overdue}
        sub={kpis.overdue ? 'open past their due date' : 'all caught up'}
        to="/planner"
        className={cn(kpis.overdue > 0 && '!border-danger/50')}
      />
      <StatCard icon={CalendarClock} module="goals" label="Upcoming" value={kpis.events} sub="events · next 7 days" />
    </section>
  )
}
