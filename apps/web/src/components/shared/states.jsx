import { AlertTriangle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SkeletonLoader } from '@/components/loaders/SkeletonLoader'
import { ease, m } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

/** Nothing here yet. A floating icon inside soft rings, tinted by the module, and always a next step when one exists. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <m.div
      data-reveal
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: ease.out }}
      className={cn(
        'relative isolate flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40%_60%_at_50%_30%,rgb(var(--mod)/0.1),transparent)]" />
      <div className="relative mb-2 grid h-20 w-20 place-items-center">
        <span aria-hidden className="absolute inset-0 rounded-full border border-mod/15" />
        <span aria-hidden className="absolute inset-[10px] rounded-full border border-mod/25" />
        <div className="lt-float lt-icon-tile h-11 w-11 rounded-[0.875rem]">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      {description && <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </m.div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-danger/40 bg-danger/5 px-6 py-8 text-center">
      <AlertTriangle className="h-5 w-5 text-danger" />
      <p className="text-sm font-medium">Couldn't load your data</p>
      <p className="max-w-md text-[13px] text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function PageSkeleton({ cards = 4 }) {
  return <SkeletonLoader variant="page" cards={cards} />
}

/** Standard gate: skeleton while loading, error with retry, otherwise children (which fade up over the skeleton's place). */
export function DataGate({ loading, error, onRetry, children, cards }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (loading) return <PageSkeleton cards={cards} />
  return (
    <m.div data-reveal initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: ease.out }}>
      {children}
    </m.div>
  )
}
