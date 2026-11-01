import { AlertTriangle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center', className)}>
      <div className="rounded-full bg-muted p-2.5"><Icon className="h-5 w-5 text-muted-foreground" /></div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-danger/40 bg-danger/5 px-6 py-8 text-center">
      <AlertTriangle className="h-5 w-5 text-danger" />
      <p className="text-sm font-medium">Couldn't load your data</p>
      <p className="max-w-md text-[13px] text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function PageSkeleton({ cards = 4 }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: cards }).map((_, i) => <Card key={i} className="space-y-3 p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-16" /></Card>)}</div>
      <Card className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</Card>
    </div>
  )
}

/** Standard gate: skeleton while loading, error with retry, otherwise children. */
export function DataGate({ loading, error, onRetry, children, cards }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (loading) return <PageSkeleton cards={cards} />
  return children
}
