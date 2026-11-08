import { Link } from 'react-router-dom'
import { Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'

/** The nearest-deadline active goals. `rows` is dashboardGoals(). */
export function GoalsCard({ rows, className }) {
  return (
    <Card data-module="goals" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4 text-mod-text" aria-hidden />
          Goal progress
        </CardTitle>
        <CardLink to="/goals">All goals</CardLink>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No active goals.{' '}
            <Link to="/goals" className="text-mod-text underline underline-offset-2">
              Create one
            </Link>
          </p>
        ) : (
          <ul className="space-y-3.5">
            {rows.map(({ goal, progress }) => (
              <li key={goal.id}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{goal.title}</span>
                  <span className="font-medium tabular-nums text-muted-foreground">{progress.percent}%</span>
                </div>
                <Progress value={progress.percent} tone={progress.percent >= 100 ? 'success' : 'primary'} label={goal.title} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
