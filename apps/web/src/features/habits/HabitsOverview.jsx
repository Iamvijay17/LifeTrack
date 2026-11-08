import { useMemo } from 'react'
import { Flame, Percent, Trophy } from 'lucide-react'
import { AnimatedValue, ProgressRing } from '@/components/motion/primitives'
import { StatCard } from '@/components/shared/StatCard'
import { WeekStrip } from '@/components/shared/WeekStrip'
import { heatmapCounts } from '@/domain/habits'
import { addDays, eachDay, startOfWeek } from '@/lib/dates'
import { pctText } from '@/lib/format'

/** A completion ring for the day being viewed, the week at a glance (tap a day to open it), and the streak numbers. */
export function HabitsOverview({ active, day, today, weekStartsOn, doneOnDay, bestCurrent, longest, avg30, onSelect }) {
  const start = startOfWeek(day, weekStartsOn)
  const end = addDays(start, 6)
  const week = useMemo(() => {
    const counts = heatmapCounts(active, start, end)
    return eachDay(start, end).map((date) => {
      const c = counts.get(date)
      return { date, ratio: c?.planned ? c.done / c.planned : 0, note: c?.planned ? `${c.done} of ${c.planned} done` : undefined }
    })
  }, [active, start, end])
  const percent = active.length ? (doneOnDay / active.length) * 100 : 0
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <section className="lt-hero col-span-2 flex flex-col gap-4 p-4 sm:flex-row sm:items-center md:p-5 lg:row-span-2">
        <ProgressRing value={percent} size={124} stroke={12} label={`${Math.round(percent)}% of habits done`} className="mx-auto sm:mx-0">
          <div>
            <span className="lt-stat-value block text-[1.75rem] leading-none">
              <AnimatedValue value={`${doneOnDay}/${active.length}`} />
            </span>
            <span className="mt-1 block text-[11px] text-muted-foreground">{day === today ? 'Done today' : 'Done that day'}</span>
          </div>
        </ProgressRing>
        <WeekStrip days={week} selected={day} today={today} onSelect={onSelect} label="This week's habits" className="min-w-0 flex-1" />
      </section>
      <StatCard icon={Flame} label="Best current streak" value={bestCurrent} sub="days / weeks" />
      <StatCard icon={Trophy} label="Longest streak" value={longest} sub="across all habits" />
      <StatCard
        icon={Percent}
        label="30-day completion"
        value={pctText(avg30)}
        sub="average of habits"
        progress={avg30 == null ? null : avg30 * 100}
        className="col-span-2"
      />
    </div>
  )
}
