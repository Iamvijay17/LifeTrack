import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** One labelled figure in a module widget. `value` of null reads as "not logged" rather than a zero. */
export function Fact({ label, value, sub, tone, className }) {
  return (
    <div className={cn('min-w-0 rounded-lg bg-surface-2/60 p-2.5', className)}>
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 min-w-0">
        <span
          className={cn(
            'block truncate text-base font-semibold tabular-nums tracking-display',
            tone === 'danger' && 'text-danger',
            tone === 'success' && 'text-success',
            value == null && 'font-normal text-muted-foreground',
          )}
        >
          {value ?? 'not logged'}
        </span>
        {sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  )
}

/** A grid of Facts: two across, three once the widget is wide enough (it measures itself, so the widget's size setting is respected). */
export const FactGrid = ({ className, ...p }) => (
  <dl className={cn('grid grid-cols-2 gap-2 [@container(min-width:28rem)]:grid-cols-3', className)} {...p} />
)

/** Small heading inside a widget. */
export const Subhead = ({ children, className }) => <h3 className={cn('lt-eyebrow mb-1.5', className)}>{children}</h3>

/** What a module widget shows before anything has been logged: says how to start, and links there. */
export function WidgetEmpty({ children, to, cta }) {
  return (
    <div className="py-6 text-center text-sm text-muted-foreground">
      <p>{children}</p>
      {to && (
        <Link to={to} className="mt-1.5 inline-block text-mod-text underline underline-offset-2">
          {cta}
        </Link>
      )}
    </div>
  )
}

/** Hours with one decimal: 210 minutes -> "3.5 h". */
export const hoursText = (minutes) => `${Math.round(minutes / 6) / 10} h`
