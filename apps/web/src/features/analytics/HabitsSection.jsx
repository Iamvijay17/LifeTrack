import { Repeat } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { Progress } from '@/components/ui/misc'
import { pctText } from '@/lib/format'
import { Block, EmptyNote, Panel } from './Layout'

export function HabitsSection({ habits: h }) {
  return (
    <Block icon={Repeat} title="Habits">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completion" value={pctText(h.rate)} progress={h.rate == null ? null : h.rate * 100} tone="success" />
        <StatCard label="Longest streak" value={h.longestStreak} sub="any habit, all time" />
        <StatCard label="Active habits" value={h.active} />
      </div>
      <Panel title="Most consistent habits">
        {h.ranked.length === 0 ? (
          <EmptyNote>No habit activity in this range.</EmptyNote>
        ) : (
          <ul className="space-y-3">
            {h.ranked.slice(0, 8).map((x) => (
              <li key={x.habit.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="truncate">{x.habit.name}</span>
                  <span className="text-muted-foreground">
                    {pctText(x.rate)} · {x.done}/{x.expected}
                  </span>
                </div>
                <Progress value={x.rate * 100} tone={x.rate >= 0.8 ? 'success' : 'primary'} label={x.habit.name} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Block>
  )
}
