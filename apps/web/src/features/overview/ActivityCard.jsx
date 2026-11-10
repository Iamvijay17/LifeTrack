import { Activity, BookOpen, Briefcase, CheckCircle2, Dumbbell, Moon, Repeat, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { relativeTime } from '@/lib/format'

const ICONS = { task: CheckCircle2, study: BookOpen, workout: Dumbbell, money: Wallet, job: Briefcase, habit: Repeat, sleep: Moon }
const MODULE = { task: 'planner', study: 'learning', workout: 'fitness', money: 'finance', job: 'jobs', habit: 'habits', sleep: 'health' }
/** The category shown beside each entry, so the feed can be scanned by module. */
const CATEGORY = { task: 'Planner', study: 'Learning', workout: 'Fitness', money: 'Finance', job: 'Jobs', habit: 'Habits', sleep: 'Health' }

/** The latest things you did across every module. `items` is recentActivity(). */
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
                <li key={`${a.kind}-${a.at}-${i}`} data-module={MODULE[a.kind]} className="flex items-center gap-2.5 text-sm">
                  <span className="lt-icon-soft h-7 w-7 shrink-0 rounded-[7px]">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.text}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      <span className="font-medium text-mod-text">{CATEGORY[a.kind]}</span> ·{' '}
                      <time dateTime={a.at} title={new Date(a.at).toLocaleString()}>
                        {relativeTime(a.at)}
                      </time>
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
