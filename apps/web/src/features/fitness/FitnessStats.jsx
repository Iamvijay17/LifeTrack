import { Check, Dumbbell, Moon, Scale, Timer, Trophy, X } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { AnimatedValue } from '@/components/motion/primitives'
import { fmtDay, weekday } from '@/lib/dates'
import { cn } from '@/lib/utils'

const LOOK = {
  done: { icon: Check, cls: 'lt-icon-tile', text: 'trained' },
  rest: { icon: Moon, cls: 'bg-sky-500/15 text-sky-400', text: 'rest day' },
  skipped: { icon: X, cls: 'bg-muted text-muted-foreground', text: 'skipped' },
  planned: { icon: Dumbbell, cls: 'border border-dashed border-mod/50 text-mod-text', text: 'planned' },
  open: { icon: null, cls: 'bg-muted/60', text: 'open' },
}

/** One tile per day of the week: trained, rested, skipped, or what's planned. */
function WeekTiles({ days, today, workouts, plan }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const rows = workouts.filter((w) => w.workout_date === d)
        const planned = plan?.[String(weekday(d))]
        const state = rows.some((w) => w.status === 'completed')
          ? 'done'
          : rows.some((w) => w.status === 'rest') || planned === 'rest'
            ? 'rest'
            : rows.some((w) => w.status === 'skipped')
              ? 'skipped'
              : planned
                ? 'planned'
                : 'open'
        const { icon: Icon, cls, text } = LOOK[state]
        return (
          <li key={d} className="flex flex-col items-center gap-1">
            <span className={cn('text-[10px] font-medium uppercase', d === today ? 'text-mod-text' : 'text-muted-foreground')}>
              {fmtDay(d, 'EEEEE')}
            </span>
            <span
              role="img"
              aria-label={`${fmtDay(d, 'EEEE')}: ${text}`}
              className={cn(
                'grid aspect-square w-full max-w-10 place-items-center rounded-lg',
                cls,
                d === today && 'ring-2 ring-mod/60 ring-offset-2 ring-offset-card',
              )}
            >
              {Icon && <Icon className="h-4 w-4" aria-hidden />}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** `stats` is weekStats(); `latestWeight` the newest health log that has a weight (or null). The week tiles appear when `week` is given. */
export function FitnessStats({ stats, latestWeight, week }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <section className="lt-hero col-span-2 flex flex-col justify-between gap-4 p-4 md:p-5 lg:row-span-2">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-40 [background:repeating-linear-gradient(115deg,transparent_0_18px,rgb(var(--mod)/0.05)_18px_20px)]"
        />
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Workouts this week</p>
            <p className="mt-1 text-[3rem] font-bold leading-none tracking-tighter">
              <AnimatedValue value={stats.count} />
            </p>
          </div>
          <p className="pb-1 text-right text-xs text-muted-foreground">
            {stats.planned ? `${stats.hit}/${stats.planned} planned days done` : 'no days planned yet'}
          </p>
        </div>
        {week && <WeekTiles {...week} />}
      </section>
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
        className="col-span-2"
      />
    </div>
  )
}
