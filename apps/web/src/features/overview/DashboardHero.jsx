import { Flame, SlidersHorizontal } from 'lucide-react'
import { AnimatedValue, ease, m } from '@/components/motion/primitives'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useNow'
import { timeStrInTz } from '@/lib/dates'
import { plural } from '@/lib/utils'

/** The clock ticks here and nowhere else, so a second passing re-renders only these few characters. */
function LiveClock({ tz }) {
  const now = useNow(1000)
  const [h, min] = timeStrInTz(new Date(now), tz).split(':')
  return (
    <time aria-label={`Current time ${h}:${min}`} className="font-semibold tabular-nums tracking-display">
      {h}
      <span className="lt-colon" aria-hidden>
        :
      </span>
      {min}
    </time>
  )
}

const Chip = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs font-medium text-foreground/90">
    {children}
  </span>
)

/** The top of the day: who, when and how it's going. The `h1` of the page lives here. */
export function DashboardHero({ greeting, date, tz, agenda, streak, weekAvg, onCustomize }) {
  const { doneCount, total } = agenda
  return (
    <m.section
      data-reveal
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: ease.out }}
      className="lt-hero mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-5 md:mb-5 md:p-7"
    >
      <div className="min-w-0">
        <p className="lt-eyebrow">{date}</p>
        <h1 className="text-gradient mt-2 text-[1.75rem] font-semibold leading-tight tracking-display md:text-[2.25rem]">{greeting}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {total > 0 && (
            <Chip>
              <AnimatedValue value={`${doneCount}/${total}`} /> done today
            </Chip>
          )}
          <Chip>
            <Flame className={streak > 0 ? 'lt-flame h-3.5 w-3.5 text-warning' : 'h-3.5 w-3.5 text-muted-foreground'} aria-hidden />
            {streak > 0 ? `${plural(streak, 'day')} streak` : 'Start a streak today'}
          </Chip>
          {weekAvg != null && <Chip>Week average {weekAvg}</Chip>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-[2rem] leading-none text-foreground/90 md:text-[2.5rem]">
          <LiveClock tz={tz} />
        </div>
        <Button variant="outline" size="sm" onClick={onCustomize}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Customize
        </Button>
      </div>
    </m.section>
  )
}
