import { BookOpen, Briefcase, Check, Droplets, Dumbbell, Footprints, Moon, Wallet } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { percentOfGoal } from '@/domain/health'
import { fmtDuration } from '@/lib/dates'

/** Eight small cards for today. `h` is todayHeadlines(); `money(paise)` formats in the user's currency. */
export function TodayStats({ h, settings, money }) {
  const study = settings.daily_study_target_minutes
  const water = h.health?.water_ml ?? 0
  const steps = h.health?.steps ?? 0
  const slept = h.health?.sleep_minutes
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <StatCard
        icon={BookOpen}
        label="Learning today"
        value={fmtDuration(h.studyMinutes)}
        sub={h.studyRunning ? '⏱ timer running' : study ? `target ${fmtDuration(study)}` : undefined}
        progress={study ? Math.min(100, (h.studyMinutes / study) * 100) : null}
        tone="success"
      />
      <StatCard icon={Dumbbell} label="Gym" value={h.gym} sub={h.workoutName} />
      <StatCard
        icon={Moon}
        label="Sleep"
        value={slept != null ? fmtDuration(slept) : '—'}
        sub={slept != null ? 'last night' : 'not logged'}
      />
      <StatCard
        icon={Droplets}
        label="Water"
        value={`${water} ml`}
        sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml}` : undefined}
        progress={percentOfGoal(water, settings.water_goal_ml)}
      />
      <StatCard
        icon={Footprints}
        label="Steps"
        value={steps.toLocaleString('en-IN')}
        sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}` : undefined}
        progress={percentOfGoal(steps, settings.steps_goal)}
      />
      <StatCard icon={Briefcase} label="Applications" value={h.appliedThisWeek} sub="this week" />
      <StatCard icon={Wallet} label="Spent today" value={money(h.spentToday)} />
      <StatCard
        icon={Check}
        label="Habits"
        value={`${h.habitsDone}/${h.habitsDue}`}
        sub={h.habitsDue ? undefined : 'none due today'}
        progress={h.habitsDue ? (h.habitsDone / h.habitsDue) * 100 : null}
        tone="success"
      />
    </div>
  )
}
