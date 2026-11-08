import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Dumbbell, HeartPulse, Repeat, Wallet, Briefcase, GraduationCap } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { Banners } from '@/components/layout/StatusIndicators'
import { OrbitMark } from '@/components/loaders/OrbitMark'
import { Stagger, StaggerItem, ease, m } from '@/components/motion/primitives'

const AREAS = [
  { icon: CalendarCheck, label: 'Plan', module: 'planner' },
  { icon: Repeat, label: 'Habits', module: 'habits' },
  { icon: GraduationCap, label: 'Learning', module: 'learning' },
  { icon: Briefcase, label: 'Jobs', module: 'jobs' },
  { icon: Dumbbell, label: 'Fitness', module: 'fitness' },
  { icon: HeartPulse, label: 'Health', module: 'health' },
  { icon: Wallet, label: 'Finance', module: 'finance' },
]

/** The brand side of the sign-in screens: the moving logo, and the parts of life it keeps in one place. Desktop only. */
function BrandPanel() {
  return (
    <aside
      aria-hidden
      className="relative isolate hidden flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-10 lg:flex"
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_25%_20%,rgb(139_92_246/0.22),transparent_70%),radial-gradient(55%_50%_at_85%_85%,rgb(99_102_241/0.18),transparent_70%)]" />
      <Logo />
      <div>
        <div className="lt-float mb-8 w-fit">
          <OrbitMark size={128} />
        </div>
        <p className="max-w-md text-[2.25rem] font-semibold leading-[1.15] tracking-display">Your whole life, on one calm page.</p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Tasks, habits, study, job search, gym, sleep and money. Every number comes from what you actually did.
        </p>
      </div>
      <Stagger gap={0.06} delay={0.2} className="flex flex-wrap gap-2">
        {AREAS.map(({ icon: Icon, label, module }) => (
          <StaggerItem
            key={label}
            data-module={module}
            className="flex items-center gap-2 rounded-full border border-border bg-card/60 py-1.5 pl-1.5 pr-3 text-xs font-medium"
          >
            <span className="lt-icon-tile h-6 w-6 rounded-full">
              <Icon className="h-3 w-3" />
            </span>
            {label}
          </StaggerItem>
        ))}
      </Stagger>
    </aside>
  )
}

export function AuthLayout({ title, subtitle, children, footer }) {
  useEffect(() => {
    document.title = `${title} · LifeTrack`
  }, [title])
  return (
    <div className="relative isolate min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <div aria-hidden className="lt-ambient" />
      <BrandPanel />
      <div className="flex min-h-dvh flex-col">
        <Banners />
        <m.div
          data-reveal
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: ease.out }}
          className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10"
        >
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-[1.75rem] font-semibold tracking-display">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link className="hover:underline" to="/privacy">
              Privacy
            </Link>{' '}
            ·{' '}
            <Link className="hover:underline" to="/terms">
              Terms
            </Link>
          </p>
        </m.div>
      </div>
    </div>
  )
}
