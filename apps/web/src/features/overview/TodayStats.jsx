import { BookOpen, Briefcase, Check, Droplets, Dumbbell, Footprints, Moon, Wallet } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { SparkBars, SparkDots } from '@/components/shared/chartParts'
import { percentOfGoal } from '@/domain/health'
import { fmtDuration } from '@/lib/dates'

const spark = (values) => (values?.some((v) => v) ? <SparkBars values={values} highlight={values.length - 1} className="h-6" /> : null)

/**
 * Eight small tiles for today, each in its module's colour and linking to it. `h` is todayHeadlines(); `money(paise)` formats in the user's currency.
 * `trends` optionally holds the last seven days of each metric ({ study, sleep, water, steps, spend, workouts }) for the tile's small chart.
 */
export function TodayStats({ h, settings, money, activeApplications, trends = {} }) {
  const study = settings.daily_study_target_minutes
  const water = h.health?.water_ml ?? 0
  const steps = h.health?.steps ?? 0
  const slept = h.health?.sleep_minutes
  return (
    <section aria-label="Today at a glance" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <StatCard
        icon={BookOpen}
        module="learning"
        label="Learning today"
        value={fmtDuration(h.studyMinutes)}
        sub={h.studyRunning ? 'timer running' : study ? `target ${fmtDuration(study)}` : undefined}
        progress={study ? Math.min(100, (h.studyMinutes / study) * 100) : null}
        to="/learning"
      />
      <StatCard
        icon={Dumbbell}
        module="fitness"
        label="Gym"
        value={h.gym}
        sub={h.workoutName}
        chart={trends.workouts ? <SparkDots values={trends.workouts} className="py-1" /> : null}
        to="/fitness"
      />
      <StatCard
        icon={Moon}
        module="health"
        label="Sleep"
        value={slept != null ? fmtDuration(slept) : '—'}
        sub={slept != null ? 'last night' : 'not logged'}
        chart={spark(trends.sleep)}
        to="/health"
      />
      <StatCard
        icon={Droplets}
        module="health"
        label="Water"
        value={`${water} ml`}
        sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml}` : undefined}
        progress={percentOfGoal(water, settings.water_goal_ml)}
        to="/health"
      />
      <StatCard
        icon={Footprints}
        module="health"
        label="Steps"
        value={steps.toLocaleString('en-IN')}
        sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}` : undefined}
        progress={percentOfGoal(steps, settings.steps_goal)}
        to="/health"
      />
      <StatCard
        icon={Briefcase}
        module="jobs"
        label="Applications"
        value={h.appliedThisWeek}
        sub={`this week · ${activeApplications} active`}
        to="/jobs"
      />
      <StatCard icon={Wallet} module="finance" label="Spent today" value={money(h.spentToday)} chart={spark(trends.spend)} to="/finance" />
      <StatCard
        icon={Check}
        module="habits"
        label="Habits"
        value={`${h.habitsDone}/${h.habitsDue}`}
        sub={h.habitsDue ? undefined : 'none due today'}
        progress={h.habitsDue ? (h.habitsDone / h.habitsDue) * 100 : null}
        to="/habits"
      />
    </section>
  )
}
