import { Droplets, Footprints, Moon, Scale } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { percentOfGoal } from '@/domain/health'
import { fmtDuration } from '@/lib/dates'
import { plural } from '@/lib/format'

/** `sleep` = averageSleep(); `weight` = weightSeries(); `todayLog` = today's health log or undefined. */
export function HealthStats({ sleep, weight, todayLog, settings, sleepGoal }) {
  const water = todayLog?.water_ml ?? 0
  const steps = todayLog?.steps ?? 0
  const change = weight.change
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={Moon}
        label="Avg sleep (7 days)"
        value={sleep.minutes == null ? '—' : fmtDuration(sleep.minutes)}
        sub={sleep.nights ? `goal ${fmtDuration(sleepGoal)} · ${plural(sleep.nights, 'night')} logged` : 'No sleep logged'}
        progress={sleep.minutes == null ? null : Math.min(100, (sleep.minutes / sleepGoal) * 100)}
        tone={sleep.minutes >= sleepGoal ? 'success' : 'primary'}
      />
      <StatCard
        icon={Droplets}
        label="Water today"
        value={`${water} ml`}
        sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml} ml` : undefined}
        progress={percentOfGoal(water, settings.water_goal_ml)}
        tone="success"
      />
      <StatCard
        icon={Footprints}
        label="Steps today"
        value={steps.toLocaleString('en-IN')}
        sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}` : undefined}
        progress={percentOfGoal(steps, settings.steps_goal)}
      />
      <StatCard
        icon={Scale}
        label="Latest weight"
        value={weight.latest ? `${weight.latest.weight_kg} kg` : '—'}
        sub={change == null ? undefined : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg since first log`}
      />
    </div>
  )
}
