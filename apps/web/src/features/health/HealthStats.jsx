import { Droplets, Footprints, Moon, Scale, Zap } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { Card } from '@/components/ui/card'
import { AnimatedValue, ProgressRing, ease, m } from '@/components/motion/primitives'
import { percentOfGoal } from '@/domain/health'
import { fmtDuration } from '@/lib/dates'
import { plural } from '@/lib/format'

// Fixed spots rather than random ones, so the sky is the same every time and never reflows.
const STARS = [
  [6, 12, 2, 0],
  [14, 42, 1.5, 0.8],
  [29, 8, 2.5, 1.6],
  [36, 30, 1.5, 0.4],
  [46, 14, 2, 2.1],
  [55, 36, 1.5, 1.1],
  [62, 7, 2.5, 0.2],
  [70, 26, 2, 1.9],
  [79, 46, 1.5, 0.6],
  [93, 38, 2, 1.3],
]

/** Last night's rest, under a night sky. The one card that stays dark in the light theme, because the night does. */
function SleepCard({ sleep, sleepGoal, week }) {
  const nights = week ?? []
  const tallest = Math.max(sleepGoal / 60, ...nights.map((n) => n.sleep ?? 0), 1)
  const goalHeight = `${(sleepGoal / 60 / tallest) * 100}%`
  return (
    <section className="relative isolate col-span-2 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0B1026] via-[#11163A] to-[#1E1B4B] p-5 text-white shadow-card lg:row-span-2">
      <div aria-hidden className="absolute inset-0 -z-10">
        {STARS.map(([x, y, size, delay]) => (
          <span
            key={`${x}-${y}`}
            className="lt-twinkle absolute rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDelay: `${delay}s` }}
          />
        ))}
        <span className="lt-float absolute right-6 top-5 block h-14 w-14 rounded-full bg-[radial-gradient(circle_at_35%_35%,#FEF9C3,#FDE68A_55%,#FBBF24)] shadow-[0_0_44px_6px_rgb(253_230_138/0.28)]">
          <span className="absolute -right-1 -top-1 block h-11 w-11 rounded-full bg-[#141943]" />
        </span>
      </div>
      <div className="flex items-center gap-2 text-sky-200">
        <Moon className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium">Avg sleep (7 days)</span>
      </div>
      <div className="lt-stat-value mt-2 text-[2.5rem] leading-none">
        {sleep.minutes == null ? '—' : <AnimatedValue value={fmtDuration(sleep.minutes)} />}
      </div>
      <p className="mt-1.5 text-xs text-slate-300">
        {sleep.nights ? `goal ${fmtDuration(sleepGoal)} · ${plural(sleep.nights, 'night')} logged` : 'No sleep logged'}
      </p>
      {nights.length > 0 && (
        <div className="mt-5" aria-hidden>
          <div className="relative h-16">
            <span className="absolute inset-x-0 border-t border-dashed border-sky-200/40" style={{ bottom: goalHeight }} />
            <div className="absolute inset-0 flex items-end gap-1.5">
              {nights.map((n, i) => (
                <m.span
                  key={n.d}
                  className="block flex-1 origin-bottom rounded-t-md bg-gradient-to-b from-sky-300 to-indigo-400"
                  style={{ height: `${((n.sleep ?? 0) / tallest) * 100}%`, minHeight: n.sleep ? 4 : 0 }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: ease.out }}
                />
              ))}
            </div>
          </div>
          <div className="mt-1 flex gap-1.5">
            {nights.map((n) => (
              <span key={n.d} className="flex-1 text-center text-[10px] text-slate-400">
                {n.label[0]}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** A glass that really fills: the water level rises to today's share of the goal, with a slow wave on its surface. */
function WaterCard({ water, goal }) {
  const percent = Math.min(100, percentOfGoal(water, goal) ?? 0)
  return (
    <Card className="relative isolate overflow-hidden">
      <div
        role="progressbar"
        aria-label="Water today"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="absolute inset-0 -z-10"
      >
        <m.div
          className="absolute inset-0"
          initial={{ y: '100%' }}
          animate={{ y: `${100 - percent}%` }}
          transition={{ duration: 1.1, ease: ease.out }}
        >
          <svg
            viewBox="0 0 400 20"
            preserveAspectRatio="none"
            className="lt-wave absolute -top-3 left-0 h-3 w-[200%] text-sky-400/25"
            aria-hidden
          >
            <path fill="currentColor" d="M0 10 Q 50 0 100 10 T 200 10 T 300 10 T 400 10 V 20 H 0 Z" />
          </svg>
          <div className="h-full bg-sky-400/25" />
        </m.div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="text-xs font-medium">Water today</span>
          <span className="lt-icon-soft h-7 w-7 rounded-md">
            <Droplets className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
        <div className="lt-stat-value mt-1.5 text-[1.625rem] leading-tight">
          <AnimatedValue value={`${water} ml`} />
        </div>
        {goal ? <div className="mt-0.5 text-xs text-muted-foreground">{`goal ${goal} ml`}</div> : null}
      </div>
    </Card>
  )
}

/** `sleep` = averageSleep(); `weight` = weightSeries(); `todayLog` = today's health log or undefined; `week` = healthWeek(); `energy` = averageEnergy(). */
export function HealthStats({ sleep, weight, todayLog, cardioSteps = 0, settings, sleepGoal, week, energy }) {
  const water = todayLog?.water_ml ?? 0
  const steps = (todayLog?.steps ?? 0) + cardioSteps
  const change = weight.change
  const stepsPercent = percentOfGoal(steps, settings.steps_goal)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SleepCard sleep={sleep} sleepGoal={sleepGoal} week={week} />
      <WaterCard water={water} goal={settings.water_goal_ml} />
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Footprints className="h-3.5 w-3.5" aria-hidden />
            Steps today
          </span>
          <div className="lt-stat-value mt-1.5 text-[1.625rem] leading-tight">
            <AnimatedValue value={steps.toLocaleString('en-IN')} />
          </div>
          {settings.steps_goal ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{`goal ${settings.steps_goal.toLocaleString('en-IN')}${cardioSteps > 0 ? ` · incl. ~${cardioSteps.toLocaleString('en-IN')} from cardio` : ''}`}</div>
          ) : null}
        </div>
        {stepsPercent != null && <ProgressRing value={Math.min(100, stepsPercent)} size={48} stroke={6} className="max-sm:hidden" />}
      </Card>
      <StatCard
        icon={Scale}
        label="Latest weight"
        value={weight.latest ? `${weight.latest.weight_kg} kg` : '—'}
        sub={change == null ? undefined : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg since first log`}
        className={energy == null ? 'col-span-2' : undefined}
      />
      {energy != null && <StatCard icon={Zap} label="Energy" value={`${energy} / 5`} sub="last 14 logged days" />}
    </div>
  )
}
