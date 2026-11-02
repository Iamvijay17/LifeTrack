import { useMemo, useRef, useState } from 'react'
import { Archive, Check, Flame, Moon, Pencil, Plus, SkipForward, Trash2, Trophy, Undo2, RotateCcw } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { Heatmap, levelFor } from '@/components/shared/Heatmap'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, Progress } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { Select } from '@/components/ui/form'
import { HabitDialog } from '@/features/habits/HabitDialog'
import { useHabits } from '@/features/habits/habitData'
import { useConfirm } from '@/components/shared/Confirm'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { setHabitStatus } from '@/services/api'
import { isScheduled } from '@/domain/streaks'
import { addDays, eachDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

const scheduleLabel = (h) => h.frequency === 'daily' ? 'Every day' : h.frequency === 'weekly' ? `${h.weekly_target}× / week` : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter((_, i) => h.days_of_week.includes(i)).join(' · ')
const pctText = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`)

function HabitRow({ s, date, onEdit }) {
  const confirm = useConfirm()
  const { habit } = s
  const log = s.logs.find((l) => l.log_date === date)
  const [setStatus, pending] = useAction((st) => setHabitStatus(habit.id, date, st))
  const [archive] = useAction(() => store.update('habits', habit.id, { archived_at: habit.archived_at ? null : new Date().toISOString() }), { success: habit.archived_at ? 'Habit restored' : 'Habit archived' })
  const [del] = useAction(() => store.remove('habits', habit.id), { success: 'Habit deleted' })
  const lastTap = useRef(0)
  const tap = () => { const n = Date.now(); if (n - lastTap.current < 600) return; lastTap.current = n; setStatus(done ? null : 'done') } // ignore accidental double taps
  const done = log?.status === 'done'
  const off = log && !done
  const scheduled = habit.frequency === 'weekly' || isScheduled(habit, date)
  return (
    <li className={cn('flex items-center gap-3 rounded-lg border border-border bg-card p-3', habit.archived_at && 'opacity-60')}>
      <button type="button" disabled={pending || !!habit.archived_at} onClick={tap} aria-pressed={done} aria-label={`${done ? 'Undo' : 'Complete'} ${habit.name}`}
        style={done ? { background: habit.color, borderColor: habit.color } : { borderColor: habit.color }}
        className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90', done ? 'text-white' : 'text-transparent hover:text-muted-foreground')}>
        <Check className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', off && 'text-muted-foreground')}>{habit.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{scheduleLabel(habit)}</span>
          <span className="flex items-center gap-1"><Flame className={cn('h-3 w-3', s.current > 0 && 'text-warning')} />{s.current}{s.unit}</span>
          <span>{pctText(s.rate30)} (30d)</span>
          {off && <Badge>{log.status === 'rest' ? 'Rest day' : 'Skipped'}</Badge>}
          {!scheduled && !log && <Badge>Not scheduled</Badge>}
          {habit.archived_at && <Badge>Archived</Badge>}
        </div>
      </div>
      <Menu label={`Actions for ${habit.name}`} items={[
        { label: 'Skip this day', icon: SkipForward, hidden: !!habit.archived_at, onClick: () => setStatus('skipped') },
        { label: 'Rest day', icon: Moon, hidden: !!habit.archived_at, onClick: () => setStatus('rest') },
        { label: 'Clear check-in', icon: Undo2, hidden: !log, onClick: () => setStatus(null) },
        { label: 'Edit', icon: Pencil, onClick: () => onEdit(habit) },
        { label: habit.archived_at ? 'Restore' : 'Archive', icon: habit.archived_at ? RotateCcw : Archive, onClick: archive },
        { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: `Delete "${habit.name}"?`, description: 'This permanently deletes the habit and its whole history. Archive it instead to keep the history.' })) del() } },
      ]} />
    </li>
  )
}

export default function HabitsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const w = settings.week_starts_on
  const { stats, loading, error, refetch } = useHabits(today, w)
  const [date, setDate] = useState(null)
  const day = date ?? today
  const [dialog, setDialog] = useState({ open: false, habit: null })
  const [focus, setFocus] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const visible = stats.filter((s) => showArchived || !s.habit.archived_at)
  const active = stats.filter((s) => !s.habit.archived_at)
  const doneToday = active.filter((s) => s.logs.some((l) => l.log_date === day && l.status === 'done')).length
  const best = active.reduce((m, s) => Math.max(m, s.longest), 0)
  const bestCurrent = active.reduce((m, s) => Math.max(m, s.current), 0)
  const avg30 = (() => { const r = active.map((s) => s.rate30).filter((x) => x != null); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null })()

  const { levels, titles } = useMemo(() => {
    const levels = new Map(), titles = new Map()
    const from = addDays(today, -26 * 7 - 7)
    const subset = focus === 'all' ? active : active.filter((s) => s.habit.id === focus)
    for (const d of eachDay(from, today)) {
      let done = 0, planned = 0
      for (const s of subset) {
        const l = s.logs.find((x) => x.log_date === d)
        if (l?.status === 'skipped' || l?.status === 'rest') continue
        const sched = s.habit.frequency === 'weekly' ? l?.status === 'done' : isScheduled(s.habit, d)
        if (l?.status === 'done') { done++; planned++ } else if (sched) planned++
      }
      if (planned) { levels.set(d, levelFor(done / planned)); titles.set(d, `${done}/${planned} done`) }
    }
    return { levels, titles }
  }, [active, focus, today])

  return (
    <>
      <PageHeader title="Habits" description="One tap a day. Streaks are calculated from your real check-ins."
        actions={<Button onClick={() => setDialog({ open: true, habit: null })}><Plus className="h-4 w-4" />New habit</Button>} />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        {active.length === 0 && stats.length === 0 ? (
          <EmptyState icon={Flame} title="Build your first habit" description="Daily, weekly or on specific days. Check in with one tap and watch the streak grow." action={<Button onClick={() => setDialog({ open: true, habit: null })}>Create a habit</Button>} />
        ) : (<div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Check} label={day === today ? 'Done today' : 'Done that day'} value={`${doneToday}/${active.length}`} progress={active.length ? (doneToday / active.length) * 100 : 0} tone="success" />
            <StatCard icon={Flame} label="Best current streak" value={bestCurrent} sub="days / weeks" />
            <StatCard icon={Trophy} label="Longest streak" value={best} sub="across all habits" />
            <StatCard label="30-day completion" value={pctText(avg30)} sub="average of habits" progress={avg30 == null ? null : avg30 * 100} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DateNav date={day} onChange={setDate} today={today} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[rgb(var(--primary))]" />Show archived</label>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">{visible.map((s) => <HabitRow key={s.habit.id} s={s} date={day} onEdit={(h) => setDialog({ open: true, habit: h })} />)}</ul>
          <Card>
            <CardHeader><CardTitle>Consistency</CardTitle>
              <Select aria-label="Heatmap habit" className="h-8 w-44 md:h-8" value={focus} onChange={(e) => setFocus(e.target.value)}><option value="all">All habits</option>{active.map((s) => <option key={s.habit.id} value={s.habit.id}>{s.habit.name}</option>)}</Select>
            </CardHeader>
            <CardContent>
              {levels.size === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Check in on a habit and your heatmap starts filling in.</p> : <Heatmap levels={levels} titles={titles} today={today} weekStartsOn={w} selected={day} onSelect={setDate} />}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Per-habit stats</CardTitle></CardHeader><CardContent className="space-y-3">
            {active.map((s) => (
              <div key={s.habit.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[1fr_5rem_5rem_6rem]">
                <span className="truncate text-sm">{s.habit.name}</span>
                <span className="text-xs text-muted-foreground sm:text-right">Now <b className="text-foreground">{s.current}{s.unit}</b></span>
                <span className="hidden text-xs text-muted-foreground sm:block sm:text-right">Best <b className="text-foreground">{s.longest}{s.unit}</b></span>
                <span className="hidden text-xs text-muted-foreground sm:block sm:text-right">{pctText(s.rateAll)} overall</span>
                <Progress className="col-span-full" value={(s.rateAll ?? 0) * 100} label={`${s.habit.name} completion`} />
              </div>))}
          </CardContent></Card>
        </div>)}
      </DataGate>
      <HabitDialog open={dialog.open} habit={dialog.habit} today={today} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </>
  )
}
