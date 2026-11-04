import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

const ROUTES = { goal: '/goals', habit: '/habits', health: '/health' }
const QUICK_KIND = { task: 'task', money: 'expense' }

/** First steps for a new account, ticked off by real data. `guide` is gettingStartedSteps(); gone once complete or dismissed. */
export function GettingStartedCard({ guide, onQuick, onDismiss }) {
  const row = 'flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm md:min-h-0'
  return (
    <Card data-testid="getting-started">
      <CardHeader>
        <CardTitle>Get started with LifeTrack</CardTitle>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss the getting started guide" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={(guide.done / guide.total) * 100} tone="success" label="Getting started progress" />
        <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          {guide.steps.map((s) => {
            const body = (
              <>
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                    s.done ? 'border-success bg-success/15 text-success' : 'border-muted-foreground/50',
                  )}
                >
                  {s.done && <Check className="h-3 w-3" aria-hidden />}
                </span>
                <span className={cn(s.done && 'text-muted-foreground line-through')}>
                  {s.done && <span className="sr-only">Done: </span>}
                  {s.label}
                </span>
              </>
            )
            return (
              <li key={s.key}>
                {s.done ? (
                  <div className={row}>{body}</div>
                ) : ROUTES[s.key] ? (
                  <Link to={ROUTES[s.key]} className={cn(row, 'hover:bg-muted/40')}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={() => onQuick(QUICK_KIND[s.key])} className={cn(row, 'hover:bg-muted/40')}>
                    {body}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
