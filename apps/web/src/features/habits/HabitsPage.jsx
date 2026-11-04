import { useEffect, useRef, useState } from 'react'
import { Flame, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { Checkbox } from '@/components/ui/form'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { summarizeHabits } from '@/domain/habits'
import { celebrate } from '@/lib/celebrate'
import { HabitDialog } from './HabitDialog'
import { HabitRow } from './HabitRow'
import { HabitsOverview } from './HabitsOverview'
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

  // Finishing the last habit of the day earns confetti, but only at the moment it happens, not every time a finished day is opened.
  const remaining = day === today && !loading ? active.length - doneOnDay : null
  const wasRemaining = useRef(null)
  useEffect(() => {
    if (wasRemaining.current > 0 && remaining === 0) celebrate()
    wasRemaining.current = remaining
  }, [remaining])

  return (
    <>
      <PageHeader
        title="Habits"
        description="One tap a day builds the streak."
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
            <HabitsOverview
              active={active}
              day={day}
              today={today}
              weekStartsOn={weekStartsOn}
              doneOnDay={doneOnDay}
              bestCurrent={bestCurrent}
              longest={longest}
              avg30={avg30}
              onSelect={setDate}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DateNav date={day} onChange={setDate} today={today} />
              <Checkbox
                checked={showArchived}
                onChange={setShowArchived}
                label="Show archived"
                className="min-h-10 text-xs text-muted-foreground md:min-h-0"
              />
            </div>
            <Stagger as="ul" gap={0.04} className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {visible.map((s) => (
                <StaggerItem as="li" key={s.habit.id}>
                  <HabitRow s={s} date={day} onEdit={(habit) => setDialog({ open: true, habit })} />
                </StaggerItem>
              ))}
            </Stagger>
            <ConsistencyCard active={active} today={today} weekStartsOn={weekStartsOn} selected={day} onSelect={setDate} />
            <PerHabitStats active={active} />
          </div>
        )}
      </DataGate>
      <HabitDialog open={dialog.open} habit={dialog.habit} today={today} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </>
  )
}
