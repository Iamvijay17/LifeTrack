import { Link } from 'react-router-dom'
import { Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'

/** The nearest-deadline active goals. `rows` is dashboardGoals(). */
export function GoalsCard({ rows }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          Goal progress
        </CardTitle>
        <Link to="/goals" className="text-xs text-secondary underline underline-offset-2">
          All goals
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No active goals.{' '}
            <Link to="/goals" className="text-secondary underline underline-offset-2">
              Create one
            </Link>
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ goal, progress }) => (
              <li key={goal.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="truncate">{goal.title}</span>
                  <span className="text-muted-foreground tabular-nums">{progress.percent}%</span>
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
