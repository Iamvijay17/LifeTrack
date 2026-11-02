import { Activity, BookOpen, Briefcase, CheckCircle2, Dumbbell, Repeat, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { relativeTime } from '@/lib/format'

const ICONS = { task: CheckCircle2, study: BookOpen, workout: Dumbbell, money: Wallet, job: Briefcase, habit: Repeat }

/** The latest things you did. `items` is recentActivity(). */
export function ActivityCard({ items, className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Your activity will show up here.</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((a, i) => {
              const Icon = ICONS[a.kind]
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{a.text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.at)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
