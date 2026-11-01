import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Briefcase, Check, CheckSquare, Droplets, Dumbbell, Plus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormDialog } from '@/components/shared/FormDialog'
import { TaskDialog } from '@/features/planner/TaskDialog'
import { TransactionDialog } from '@/features/finance/TransactionDialog'
import { ApplicationDialog } from '@/features/jobs/dialogs'
import { WorkoutDialog } from '@/features/fitness/dialogs'
import { WaterDialog } from '@/features/health/WaterDialog'
import { TargetSelect, parseTarget } from '@/features/learning/StudyTimer'
import { useHabits } from '@/features/habits/habitData'
import { useTables } from '@/hooks/store'
import { useToday } from '@/hooks/useToday'
import { useSettings } from '@/hooks/useSettings'
import { useAction } from '@/hooks/useAction'
import { setHabitStatus, startStudy } from '@/services/api'
import { cn } from '@/lib/utils'

export const QUICK = [
  { kind: 'task', label: 'Add task', icon: CheckSquare },
  { kind: 'study', label: 'Start study', icon: BookOpen },
  { kind: 'workout', label: 'Log workout', icon: Dumbbell },
  { kind: 'expense', label: 'Add expense', icon: Wallet },
  { kind: 'water', label: 'Log water', icon: Droplets },
  { kind: 'habit', label: 'Complete habit', icon: Check },
  { kind: 'application', label: 'Job application', icon: Briefcase },
]

const Ctx = createContext({ open: () => {} })
export const useQuick = () => useContext(Ctx)

function StudyStart({ onClose }) {
  const nav = useNavigate()
  const today = useToday()
  const { data } = useTables('goals', 'learning_topics', 'study_sessions')
  const [target, setTarget] = useState('')
  const running = data.study_sessions.find((s) => s.status === 'running')
  const [start, pending] = useAction(async () => { await startStudy(parseTarget(target, data.goals), today); onClose(); nav('/learning') }, { success: 'Timer started' })
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Start study session" description={running ? 'A timer is already running.' : 'The timer keeps running on all your devices.'} pending={pending} submitLabel="Start timer"
      onSubmit={(e) => { e.preventDefault(); if (running) { onClose(); nav('/learning') } else start() }}>
      {running ? <p className="text-sm text-muted-foreground">Stop it on the Learning page before starting another.</p> : <TargetSelect goals={data.goals} topics={data.learning_topics} value={target} onChange={setTarget} />}
    </FormDialog>
  )
}

function HabitQuick({ onClose }) {
  const today = useToday()
  const { settings } = useSettings()
  const { stats } = useHabits(today, settings.week_starts_on)
  const [toggle, pending] = useAction((id, done) => setHabitStatus(id, today, done ? null : 'done'))
  const list = stats.filter((s) => !s.habit.archived_at && (s.due || s.today))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Complete habits" description="Tap to check in for today.">
      {list.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No habits due today. 🎉</p> : (
        <ul className="space-y-2">{list.map((s) => { const done = s.today?.status === 'done'; return (
          <li key={s.habit.id}><button disabled={pending} onClick={() => toggle(s.habit.id, done)} aria-pressed={done}
            className={cn('flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left', done && 'bg-success/10')}>
            <span className={cn('grid h-6 w-6 place-items-center rounded-full border-2', done ? 'border-success bg-success text-white' : 'border-muted-foreground/50')}>{done && <Check className="h-3.5 w-3.5" />}</span>
            <span className={cn('flex-1 text-sm', done && 'text-muted-foreground line-through')}>{s.habit.name}</span></button></li>) })}</ul>)}
    </Dialog>
  )
}

function QuickWorkout({ onClose }) {
  const today = useToday()
  const { data } = useTables('routines', 'exercises')
  return <WorkoutDialog open onOpenChange={(o) => !o && onClose()} routines={data.routines} library={data.exercises} today={today} date={today} />
}

export function QuickActionsProvider({ children }) {
  const [kind, setKind] = useState(null)
  const [menu, setMenu] = useState(false)
  const today = useToday()
  const close = useCallback(() => setKind(null), [])
  const value = useMemo(() => ({ open: setKind, menu: () => setMenu(true) }), [])
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={menu} onOpenChange={setMenu} title="Quick add">
        <div className="grid grid-cols-2 gap-2">{QUICK.map(({ kind: k, label, icon: Icon }) => (
          <button key={k} onClick={() => { setMenu(false); setKind(k) }} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-3 text-left text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"><Icon className="h-4 w-4 text-secondary" />{label}</button>))}</div>
      </Dialog>
      {kind === 'task' && <TaskDialog open onOpenChange={(o) => !o && close()} defaultDate={today} />}
      {kind === 'expense' && <TransactionDialog open onOpenChange={(o) => !o && close()} today={today} defaultType="expense" />}
      {kind === 'application' && <ApplicationDialog open onOpenChange={(o) => !o && close()} today={today} />}
      {kind === 'water' && <WaterDialog open onOpenChange={(o) => !o && close()} date={today} />}
      {kind === 'study' && <StudyStart onClose={close} />}
      {kind === 'habit' && <HabitQuick onClose={close} />}
      {kind === 'workout' && <QuickWorkout onClose={close} />}
    </Ctx.Provider>
  )
}

/** Desktop header button. */
export function QuickAddMenu() {
  const { menu } = useQuick()
  return <Button size="sm" className="hidden md:inline-flex" onClick={menu}><Plus className="h-4 w-4" />Quick add</Button>
}

/** Mobile floating action button. Must be rendered OUTSIDE the blurred header (backdrop-filter breaks position:fixed). */
export function QuickFab() {
  const { menu } = useQuick()
  return <button onClick={menu} aria-label="Quick add" className="fixed bottom-[4.5rem] right-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 active:scale-95 md:hidden" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}><Plus className="h-6 w-6" /></button>
}
