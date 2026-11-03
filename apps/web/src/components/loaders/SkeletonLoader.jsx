import { Skeleton } from '@/components/ui/misc'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Placeholder shapes for ordinary content fetching (preferred over a spinner: the page keeps its layout).
 * variant: 'page' (title + stat cards + list) · 'cards' · 'list' · 'text'
 */
export function SkeletonLoader({ variant = 'page', cards = 4, rows = 4, label = 'Loading', className }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('space-y-4', className)}>
      <span className="sr-only">{label}…</span>
      {variant === 'page' && <Skeleton className="h-8 w-48" />}
      {(variant === 'page' || variant === 'cards') && cards > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Card key={i} className="space-y-3 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </Card>
          ))}
        </div>
      )}
      {(variant === 'page' || variant === 'list') && (
        <Card className="space-y-3 p-4">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </Card>
      )}
      {variant === 'text' && (
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className={cn('h-4', i === rows - 1 ? 'w-2/3' : 'w-full')} />
          ))}
        </div>
      )}
    </div>
  )
}
