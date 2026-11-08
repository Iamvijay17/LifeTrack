import { Link } from 'react-router-dom'
import { CalendarCheck, Check, HeartPulse, Repeat, Target, Wallet, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/misc'
import { AnimatePresence, Stagger, StaggerItem, m, spring } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

const ROUTES = { goal: '/goals', habit: '/habits', health: '/health' }
const QUICK_KIND = { task: 'task', money: 'expense' }
const LOOK = {
  task: { icon: CalendarCheck, module: 'planner' },
  habit: { icon: Repeat, module: 'habits' },
  goal: { icon: Target, module: 'goals' },
  money: { icon: Wallet, module: 'finance' },
  health: { icon: HeartPulse, module: 'health' },
}

function Step({ step }) {
  const { icon: Icon } = LOOK[step.key]
  return (
    <>
      <span
        className={cn(
          'relative h-9 w-9 rounded-[0.6rem]',
          step.done ? 'lt-icon-soft' : 'lt-icon-tile transition-transform duration-200 ease-spring group-hover:scale-110',
        )}
      >
        <AnimatePresence initial={false} mode="wait">
          {step.done ? (
            <m.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
              <Check className="h-4 w-4" aria-hidden />
            </m.span>
          ) : (
            <Icon key="todo" className="h-4 w-4" aria-hidden />
          )}
        </AnimatePresence>
      </span>
      <span className={cn('min-w-0 text-[13px] font-medium', step.done && 'text-muted-foreground line-through')}>
        {step.done && <span className="sr-only">Done: </span>}
        {step.label}
      </span>
    </>
  )
}

/** First steps for a new account, ticked off by real data. `guide` is gettingStartedSteps(); gone once complete or dismissed. */
export function GettingStartedCard({ guide, onQuick, onDismiss, className }) {
  const card = 'group flex h-full w-full items-center gap-3 rounded-lg border border-border bg-card/70 p-3 text-left'
  return (
    <section data-testid="getting-started" className={cn('lt-hero p-4 md:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Get started with LifeTrack</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            A few first steps and your dashboard comes to life. {guide.done} of {guide.total} done.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss the getting started guide" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Progress value={(guide.done / guide.total) * 100} label="Getting started progress" className="mt-3" />
      <Stagger as="ul" gap={0.06} delay={0.1} className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {guide.steps.map((s) => (
          <StaggerItem as="li" key={s.key} data-module={LOOK[s.key].module}>
            {s.done ? (
              <div className={card}>
                <Step step={s} />
              </div>
            ) : ROUTES[s.key] ? (
              <Link to={ROUTES[s.key]} className={cn(card, 'lt-lift')}>
                <Step step={s} />
              </Link>
            ) : (
              <button type="button" onClick={() => onQuick(QUICK_KIND[s.key])} className={cn(card, 'lt-lift')}>
                <Step step={s} />
              </button>
            )}
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}
