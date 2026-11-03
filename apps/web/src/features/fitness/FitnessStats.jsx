import { Dumbbell, Scale, Timer, Trophy } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { fmtDay } from '@/lib/dates'

/** `stats` is weekStats(); `latestWeight` the newest health log that has a weight (or null). */
export function FitnessStats({ stats, latestWeight }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={Dumbbell}
        label="Workouts this week"
        value={stats.count}
        sub={stats.planned ? `${stats.hit}/${stats.planned} planned days done` : 'no days planned yet'}
        progress={stats.planned ? (stats.hit / stats.planned) * 100 : null}
        tone="success"
      />
      <StatCard
        icon={Timer}
        label="Training time"
        value={`${stats.minutes} min`}
        sub={stats.cardio ? `${stats.cardio} min cardio` : 'this week'}
      />
      <StatCard icon={Trophy} label="Volume" value={`${Math.round(stats.vol).toLocaleString('en-IN')} kg`} sub="reps × weight, this week" />
      <StatCard
        icon={Scale}
        label="Body weight"
        value={latestWeight ? `${latestWeight.weight_kg} kg` : '—'}
        sub={latestWeight ? `as of ${fmtDay(latestWeight.log_date, 'd MMM')}` : 'not logged yet'}
      />
    </div>
  )
}
