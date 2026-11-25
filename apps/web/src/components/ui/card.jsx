import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** `interactive` adds the hover lift, for cards that are themselves a link or a button. */
export const Card = ({ className, interactive, ...p }) => <div className={cn('lt-card', interactive && 'lt-lift', className)} {...p} />
export const CardHeader = ({ className, ...p }) => (
  <div className={cn('flex items-center justify-between gap-2 px-[var(--pad)] pt-[var(--pad)]', className)} {...p} />
)
export const CardTitle = ({ className, as: Tag = 'h2', ...p }) => (
  <Tag className={cn('text-sm font-semibold tracking-tight text-foreground', className)} {...p} />
)
export const CardContent = ({ className, ...p }) => <div className={cn('p-[var(--pad)]', className)} {...p} />

/** The small "go to this module" link in a card header. Padding gives it a usable touch target without making the header taller. */
export const CardLink = ({ className, children, ...p }) => (
  <Link
    className={cn(
      'group -my-2 -mr-2 inline-flex items-center gap-0.5 rounded-md p-2 text-xs font-medium text-muted-foreground transition-colors hover:text-mod-text',
      className,
    )}
    {...p}
  >
    {children}
    <ArrowUpRight
      className="h-3 w-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
      aria-hidden
    />
  </Link>
)
