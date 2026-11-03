import { useMemo, useState } from 'react'
import { Plus, Target } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import { useToday } from '@/hooks/useToday'
import { goalRows, goalSummary, PERIODS, visibleGoals } from '@/domain/goals'
import { GoalCard } from './GoalCard'
import { GoalDialog } from './GoalDialog'
import { GoalStats } from './GoalStats'

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'history', label: 'History' },
]

export default function GoalsPage() {
  const today = useToday()
  const { data, loading, error, refetch } = useTables('goals', 'milestones', 'study_sessions')
  const [tab, setTab] = useState('active')
  const [period, setPeriod] = useState('')
  const [dlg, setDlg] = useState({ open: false, goal: null })

  const rows = useMemo(() => goalRows(data.goals, data.milestones, data.study_sessions), [data.goals, data.milestones, data.study_sessions])
  const shown = useMemo(() => visibleGoals(rows, { tab, period }), [rows, tab, period])
  const summary = useMemo(() => goalSummary(rows, data.milestones, today), [rows, data.milestones, today])
  const newGoal = () => setDlg({ open: true, goal: null })

  return (
    <>
      <PageHeader
        title="Goals & Milestones"
        description="Daily to yearly goals, broken into milestones."
        actions={
          <Button onClick={newGoal}>
            <Plus className="h-4 w-4" />
            New goal
          </Button>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-4">
          <GoalStats summary={summary} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented value={tab} onChange={setTab} options={TABS} />
            <Select aria-label="Filter by type" className="w-36" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="">All types</option>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          {shown.length === 0 ? (
            <EmptyState
              icon={Target}
              title={tab === 'active' ? 'No active goals' : 'No completed or archived goals yet'}
              description={
                tab === 'active'
                  ? 'Set a goal, break it into milestones and watch the progress bar fill.'
                  : 'Finished goals are kept here as your history.'
              }
              action={tab === 'active' ? <Button onClick={newGoal}>Create a goal</Button> : undefined}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {shown.map((row) => (
                <GoalCard key={row.goal.id} row={row} today={today} onEdit={(goal) => setDlg({ open: true, goal })} />
              ))}
            </div>
          )}
        </div>
      </DataGate>
      <GoalDialog open={dlg.open} goal={dlg.goal} today={today} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
    </>
  )
}
