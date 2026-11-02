import { useMemo, useState } from 'react'
import { Archive, CheckCircle2, ChevronDown, ChevronUp, Circle, Pencil, Plus, RotateCcw, Target, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form'
import { Badge, Progress, Segmented } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirm } from '@/components/shared/Confirm'
import { GoalDialog } from '@/features/goals/GoalDialog'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { goalPercent, isOverdue, daysLeft, PERIODS } from '@/domain/goals'
import { setGoalStatus, toggleMilestone } from '@/services/api'
import { isValidDay, fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

function Milestones({ goal, milestones }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const mine = milestones.filter((m) => m.goal_id === goal.id).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
  const [add, adding] = useAction(async () => {
    const t = title.trim()
    if (!t) throw new Error('Name the milestone first.')
    if (due && !isValidDay(due)) throw new Error('Enter a valid date.')
    await store.insert('milestones', { goal_id: goal.id, title: t, due_date: due || null, position: mine.length })
    setTitle(''); setDue('')
  })
  const [toggle] = useAction(toggleMilestone)
  const [remove] = useAction((id) => store.remove('milestones', id))
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <ul className="space-y-1">{mine.map((m) => (
        <li key={m.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/40">
          <button onClick={() => toggle(m)} aria-label={`${m.done ? 'Mark not done' : 'Mark done'}: ${m.title}`} aria-pressed={m.done}>{m.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}</button>
          <span className={cn('min-w-0 flex-1 truncate', m.done && 'text-muted-foreground line-through')}>{m.title}</span>
          {m.due_date && <span className="text-xs text-muted-foreground">{fmtDay(m.due_date, 'd MMM')}</span>}
          <button onClick={() => remove(m.id)} aria-label={`Delete milestone ${m.title}`} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
        </li>))}</ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
        <Input aria-label="New milestone" placeholder="Add a milestone" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        <Input aria-label="Milestone due date" type="date" className="w-36 shrink-0" value={due} onChange={(e) => setDue(e.target.value)} />
        <Button type="submit" variant="outline" loading={adding}>Add</Button>
      </form>
    </div>
  )
}

export default function GoalsPage() {
  const today = useToday()
  const confirm = useConfirm()
  const { data, loading, error, refetch } = useTables('goals', 'milestones', 'study_sessions')
  const [tab, setTab] = useState('active')
  const [period, setPeriod] = useState('')
  const [open, setOpen] = useState({})
  const [dlg, setDlg] = useState({ open: false, goal: null })
  const [setStatus] = useAction(setGoalStatus)
  const [del] = useAction((id) => store.remove('goals', id), { success: 'Goal deleted' })

  const rows = useMemo(() => data.goals.map((g) => ({ g, p: goalPercent(g, data.milestones, data.study_sessions) })), [data])
  const shown = rows.filter(({ g }) => (tab === 'active' ? g.status === 'active' : g.status !== 'active') && (!period || g.period === period))
    .sort((a, b) => (a.g.due_date ?? '9999').localeCompare(b.g.due_date ?? '9999'))
  const active = rows.filter((r) => r.g.status === 'active')
  const completed = rows.filter((r) => r.g.status === 'completed')
  const avg = active.length ? Math.round(active.reduce((a, r) => a + r.p.percent, 0) / active.length) : null
  const closed = completed.length + rows.filter((r) => r.g.status === 'archived').length

  return (
    <>
      <PageHeader title="Goals & Milestones" description="Daily to yearly goals, broken into milestones." actions={<Button onClick={() => setDlg({ open: true, goal: null })}><Plus className="h-4 w-4" />New goal</Button>} />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Target} label="Active" value={active.length} sub={`${active.filter((r) => isOverdue(r.g, today)).length} overdue`} />
            <StatCard icon={CheckCircle2} label="Completed" value={completed.length} sub={closed ? `${Math.round((completed.length / closed) * 100)}% of closed goals` : undefined} tone="success" />
            <StatCard icon={Target} label="Average progress" value={avg == null ? '—' : `${avg}%`} progress={avg} />
            <StatCard icon={Target} label="Milestones done" value={`${data.milestones.filter((m) => m.done).length}/${data.milestones.length}`} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active' }, { value: 'history', label: 'History' }]} />
            <Select aria-label="Filter by type" className="w-36" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">All types</option>{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select>
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={Target} title={tab === 'active' ? 'No active goals' : 'No completed or archived goals yet'} description={tab === 'active' ? 'Set a goal, break it into milestones and watch the progress bar fill.' : 'Finished goals are kept here as your history.'} action={tab === 'active' ? <Button onClick={() => setDlg({ open: true, goal: null })}>Create a goal</Button> : undefined} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">{shown.map(({ g, p }) => {
              const over = isOverdue(g, today), left = daysLeft(g, today), ms = data.milestones.filter((m) => m.goal_id === g.id)
              return (
                <Card key={g.id} data-testid="goal-card"><CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{g.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5"><Badge tone="primary">{PERIODS.find((x) => x.value === g.period)?.label}</Badge><Badge>{g.category}</Badge>{g.status !== 'active' && <Badge tone={g.status === 'completed' ? 'success' : 'neutral'}>{g.status}</Badge>}{over && <Badge tone="danger">Overdue</Badge>}</div></div>
                    <Menu label={`Actions for ${g.title}`} items={[
                      { label: 'Edit', icon: Pencil, onClick: () => setDlg({ open: true, goal: g }) },
                      { label: 'Mark completed', icon: CheckCircle2, hidden: g.status === 'completed', onClick: () => setStatus(g, 'completed') },
                      { label: 'Reopen', icon: RotateCcw, hidden: g.status === 'active', onClick: () => setStatus(g, 'active') },
                      { label: 'Archive', icon: Archive, hidden: g.status === 'archived', onClick: () => setStatus(g, 'archived') },
                      { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: 'Delete this goal?', description: 'Its milestones are deleted too. Notes and study sessions stay.' })) del(g.id) } },
                    ]} />
                  </div>
                  {g.notes && <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">{g.notes}</p>}
                  <div className="mt-3 space-y-1.5"><div className="flex justify-between text-xs"><span className="text-muted-foreground">{p.source === 'milestones' ? `${p.done}/${p.total} milestones` : p.source === 'study' ? 'Study time' : p.source === 'completed' ? 'Completed' : 'Manual progress'}</span><span className="font-medium tabular-nums">{p.percent}%</span></div>
                    <Progress value={p.percent} tone={p.percent >= 100 ? 'success' : over ? 'danger' : 'primary'} label={`${g.title} progress`} /></div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{g.start_date ? `${fmtDay(g.start_date, 'd MMM')} → ` : ''}{g.due_date ? fmtDay(g.due_date, 'd MMM yyyy') : 'No target date'}</span>{g.status === 'active' && left != null && <span>{left < 0 ? `${-left}d overdue` : left === 0 ? 'Due today' : `${left}d left`}</span>}</div>
                  <button onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))} aria-expanded={!!open[g.id]} className="mt-3 flex w-full items-center justify-between text-xs font-medium text-secondary">
                    Milestones ({ms.filter((m) => m.done).length}/{ms.length}){open[g.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
                  {open[g.id] && <Milestones goal={g} milestones={data.milestones} />}
                </CardContent></Card>)
            })}</div>)}
        </div>
      </DataGate>
      <GoalDialog open={dlg.open} goal={dlg.goal} today={today} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
    </>
  )
}
