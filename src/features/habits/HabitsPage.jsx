import { useState } from 'react'
import { Check, Flame, Plus, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { summarizeHabits } from '@/domain/habits'
import { pctText } from '@/lib/format'
import { HabitDialog } from './HabitDialog'
import { HabitRow } from './HabitRow'
import { ConsistencyCard } from './ConsistencyCard'
import { PerHabitStats } from './PerHabitStats'
import { useHabits } from './useHabits'

export default function HabitsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const weekStartsOn = settings.week_starts_on
  const { stats, loading, error, refetch } = useHabits(today, weekStartsOn)
  const [date, setDate] = useState(null)
  const day = date ?? today
  const [dialog, setDialog] = useState({ open: false, habit: null })
  const [showArchived, setShowArchived] = useState(false)

  const { active, doneOnDay, longest, bestCurrent, avg30 } = summarizeHabits(stats, day)
  const visible = stats.filter((s) => showArchived || !s.habit.archived_at)
  const newHabit = () => setDialog({ open: true, habit: null })

  return (
    <>
      <PageHeader
        title="Habits"
        description="One tap a day. Streaks are calculated from your real check-ins."
        actions={
          <Button onClick={newHabit}>
            <Plus className="h-4 w-4" />
            New habit
          </Button>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        {active.length === 0 && stats.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="Build your first habit"
            description="Daily, weekly or on specific days. Check in with one tap and watch the streak grow."
            action={<Button onClick={newHabit}>Create a habit</Button>}
          />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                icon={Check}
                label={day === today ? 'Done today' : 'Done that day'}
                value={`${doneOnDay}/${active.length}`}
                progress={active.length ? (doneOnDay / active.length) * 100 : 0}
                tone="success"
              />
              <StatCard icon={Flame} label="Best current streak" value={bestCurrent} sub="days / weeks" />
              <StatCard icon={Trophy} label="Longest streak" value={longest} sub="across all habits" />
              <StatCard
                label="30-day completion"
                value={pctText(avg30)}
                sub="average of habits"
                progress={avg30 == null ? null : avg30 * 100}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DateNav date={day} onChange={setDate} today={today} />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="accent-[rgb(var(--primary))]"
                />
                Show archived
              </label>
            </div>
            <ul className="grid gap-2 md:grid-cols-2">
              {visible.map((s) => (
                <HabitRow key={s.habit.id} s={s} date={day} onEdit={(habit) => setDialog({ open: true, habit })} />
              ))}
            </ul>
            <ConsistencyCard active={active} today={today} weekStartsOn={weekStartsOn} selected={day} onSelect={setDate} />
            <PerHabitStats active={active} />
          </div>
        )}
      </DataGate>
      <HabitDialog open={dialog.open} habit={dialog.habit} today={today} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </>
  )
}
