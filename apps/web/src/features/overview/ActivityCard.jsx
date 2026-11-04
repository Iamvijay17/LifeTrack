import { Activity, BookOpen, Briefcase, CheckCircle2, Dumbbell, Repeat, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { relativeTime } from '@/lib/format'

const ICONS = { task: CheckCircle2, study: BookOpen, workout: Dumbbell, money: Wallet, job: Briefcase, habit: Repeat }
const MODULE = { task: 'planner', study: 'learning', workout: 'fitness', money: 'finance', job: 'jobs', habit: 'habits' }

/** The latest things you did. `items` is recentActivity(). */
export function ActivityCard({ items, className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-mod-text" aria-hidden />
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
                <li key={i} data-module={MODULE[a.kind]} className="flex items-center gap-2.5 text-sm">
                  <span className="lt-icon-soft h-6 w-6 rounded-[6px]">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
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
