import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock } from 'lucide-react'
import { isSlipped } from '@/domain/recovery'
import { useNow } from '@/hooks/useNow'
import { plural } from '@/lib/utils'
import { m } from '@/components/motion/primitives'

/** Shown on the Planner when tasks have slipped: one line and a way into the recovery plan. It only counts, so it costs the Planner nothing extra. */
export function RecoveryBanner({ tasks, today, tz }) {
  const nowMs = useNow(60_000)
  const n = tasks.filter((t) => isSlipped(t, { today, tz, nowMs })).length
  if (!n) return null
  return (
    <m.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
      <Link
        to="/recovery"
        className="group flex items-center gap-3 rounded-xl border border-mod/30 bg-mod/10 px-4 py-3 text-sm transition-colors hover:border-mod/50 hover:bg-mod/15"
      >
        <span className="lt-icon-tile h-9 w-9 shrink-0 rounded-lg">
          <CalendarClock className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="font-semibold">{plural(n, 'task')} slipped.</strong>{' '}
          <span className="text-muted-foreground">Smart Recovery found new times that fit around your calendar.</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </m.div>
  )
}
