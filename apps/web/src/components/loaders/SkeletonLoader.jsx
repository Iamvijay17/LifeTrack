import { Skeleton } from '@/components/ui/misc'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const N = (n) => Array.from({ length: n })

function Header() {
  return (
    <div className="flex items-center gap-3.5">
      <Skeleton className="h-11 w-11 shrink-0 rounded-[0.875rem]" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-6 w-44 max-w-full" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
    </div>
  )
}

function StatCards({ cards }) {
  if (cards <= 0) return null
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {N(cards).map((_, i) => (
        <Card key={i} className="space-y-3 p-4" style={{ animationDelay: `${i * 40}ms` }}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-20" />
          <div aria-hidden className="h-1.5 w-full rounded-full bg-muted/60" />
        </Card>
      ))}
    </div>
  )
}

function Rows({ rows }) {
  return (
    <Card className="space-y-3 p-4">
      {N(rows).map((_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </Card>
  )
}

/** A chart card: title, then bars at the height of the real charts (h-56 / h-64 match `ChartCard`) so the page doesn't jump when data arrives. */
function ChartCard({ className }) {
  const heights = [40, 62, 35, 78, 55, 90, 48, 70, 30, 66, 52, 84]
  return (
    <Card className={cn('space-y-4 p-4', className)}>
      <Skeleton className="h-4 w-36" />
      <div aria-hidden className="flex h-48 items-end gap-2 sm:h-56">
        {heights.map((h, i) => (
          <div key={i} className="skeleton min-w-0 flex-1 rounded-t-md" style={{ height: `${h}%` }} />
        ))}
      </div>
    </Card>
  )
}

function TableCard({ rows }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 border-b border-border p-3">
        {N(4).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {N(rows).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 flex-[2]" />
            <Skeleton className="hidden h-3.5 flex-1 sm:block" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </Card>
  )
}

function CalendarCard() {
  return (
    <Card className="space-y-3 p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <div aria-hidden className="grid grid-cols-7 gap-1">
        {N(7).map((_, i) => (
          <Skeleton key={i} className="h-3 w-6 justify-self-center" />
        ))}
        {N(35).map((_, i) => (
          <div key={i} className="skeleton aspect-square min-h-10 rounded-md opacity-70 sm:aspect-auto sm:h-20" />
        ))}
      </div>
    </Card>
  )
}

function ProfileCards({ cards }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {N(Math.max(cards, 3)).map((_, i) => (
        <Card key={i} className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-52 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-10" />
          <Skeleton className="h-10 w-2/3" />
        </Card>
      ))}
    </div>
  )
}

/**
 * Placeholder shapes for content that is being fetched. They keep the page's layout (same card grid, chart heights and row sizes as the real
 * thing), so nothing jumps when data lands. Preferred over a spinner. They fade in after a beat (`.lt-delayed`), so a fast load never flashes one.
 *
 * `header` adds a page-title placeholder; pages that render their own title above a DataGate leave it off.
 * variant: 'page' (title, stat cards, list) · 'dashboard' · 'cards' · 'list' · 'chart' · 'table' · 'calendar' · 'profile' · 'text'
 */
export function SkeletonLoader({
  variant = 'page',
  cards = 4,
  rows = 4,
  label = 'Loading',
  className,
  delayed = true,
  header = variant === 'page',
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('space-y-4', delayed && 'lt-delayed', className)}>
      <span className="sr-only">{label}…</span>
      {header && <Header />}
      {(variant === 'page' || variant === 'cards' || variant === 'dashboard' || variant === 'chart') && <StatCards cards={cards} />}
      {(variant === 'page' || variant === 'list') && <Rows rows={rows} />}
      {variant === 'dashboard' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard className="lg:col-span-2" />
          <Rows rows={5} />
          <Rows rows={3} />
          <Rows rows={3} />
          <Rows rows={3} />
        </div>
      )}
      {variant === 'chart' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard />
          <ChartCard />
        </div>
      )}
      {variant === 'table' && <TableCard rows={rows + 3} />}
      {variant === 'calendar' && <CalendarCard />}
      {variant === 'profile' && <ProfileCards cards={cards} />}
      {variant === 'text' && (
        <div className="space-y-2">
          {N(rows).map((_, i) => (
            <Skeleton key={i} className={cn('h-4', i === rows - 1 ? 'w-2/3' : 'w-full')} />
          ))}
        </div>
      )}
    </div>
  )
}
