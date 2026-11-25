import { useEffect, useState } from 'react'
import { AlertTriangle, CloudOff, Inbox } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'
import { Button } from '@/components/ui/button'
import { SkeletonLoader } from '@/components/loaders/SkeletonLoader'
import { ease, m } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

const SLOW_MS = 8000

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
  const online = useOnline()
  const Icon = online ? AlertTriangle : CloudOff
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-danger/40 bg-danger/5 px-6 py-8 text-center">
      <Icon className="h-5 w-5 text-danger" aria-hidden />
      <p className="text-sm font-medium">{online ? "Couldn't load your data" : "You're offline"}</p>
      <p className="max-w-md text-[13px] text-muted-foreground">
        {online ? message : 'LifeTrack needs a connection to load your data. It will reload by itself when you are back online.'}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function PageSkeleton({ cards = 4, variant = 'page' }) {
  return <SkeletonLoader variant={variant} cards={cards} header={false} />
}

/** True once `on` has been true for `ms` without a break (used to say "still loading" on a slow connection). */
function useLingering(on, ms) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!on) return setLate(false)
    const t = setTimeout(() => setLate(true), ms)
    return () => clearTimeout(t)
  }, [on, ms])
  return late
}

/**
 * Standard gate: a skeleton shaped like the page while loading, an error with retry, otherwise the children, which rise over the skeleton's
 * place. `skeleton` picks the placeholder (see SkeletonLoader). On a slow connection a quiet "still loading" line appears with a retry.
 */
export function DataGate({ loading, error, onRetry, children, cards, skeleton = 'page' }) {
  const slow = useLingering(loading && !error, SLOW_MS)
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (loading)
    return (
      <>
        <PageSkeleton cards={cards} variant={skeleton} />
        {slow && (
          <p role="status" className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            This is taking longer than usual…
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="-m-2 rounded-md p-2 font-medium text-mod-text underline underline-offset-2"
              >
                Retry
              </button>
            )}
          </p>
        )}
      </>
    )
  return (
    <m.div data-reveal initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: ease.out }}>
      {children}
    </m.div>
  )
}
