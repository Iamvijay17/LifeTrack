import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { QUICK_KINDS } from '@lifetrack/core/dashboard'
import { parseStudyTarget } from '@lifetrack/core/learning'
import { api } from '../../data/client'
import { useTable } from '../../data/useTable'
import { useTables } from '../../hooks/useTables'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../hooks/useSettings'
import { useToday } from '../../hooks/useToday'
import { habitStats } from '@lifetrack/core/habits'
import { useTheme } from '../../providers/ThemeProvider'
import { ApplicationForm } from '../jobs/forms'
import { WorkoutForm } from '../fitness/forms'
import { TransactionForm } from '../finance/forms'
import { WaterSheet } from '../health/WaterSheet'
import { studyTargetOptions } from '../learning/StudyTimer'
import { TaskForm } from '../planner/TaskForm'
import { Sheet, afterSheetClose } from '../../ui/Sheet'
import { SelectField } from '../../ui/controls'
import { Button, Txt } from '../../ui'

export type QuickKind = (typeof QUICK_KINDS)[number]['kind']
const Ctx = createContext<{ open: (k: QuickKind) => void }>({ open: () => {} })
export const useQuick = () => useContext(Ctx)

function StudyStart({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const today = useToday()
  const { data } = useTables('goals', 'learning_topics', 'study_sessions')
  const [target, setTarget] = useState('')
  const running = data.study_sessions.some((s: any) => s.status === 'running')
  const [start, pending] = useAction(async () => { await api.startStudy(parseStudyTarget(target, data.goals), today); onClose(); afterSheetClose(() => router.push('/module/learning')) })
  return (
    <Sheet visible title="Start study session" onClose={onClose} footer={running ? <Button title="Open timer" onPress={() => { onClose(); afterSheetClose(() => router.push('/module/learning')) }} /> : <Button title="Start timer" onPress={start} loading={pending} />}>
      {running ? <Txt muted>A timer is already running. Stop it on the Learning screen before starting another.</Txt>
        : (<><Txt muted>The timer keeps running on all your devices.</Txt><SelectField label="What are you studying?" value={target} options={studyTargetOptions(data.goals, data.learning_topics)} onChange={setTarget} /></>)}
    </Sheet>
  )
}

function HabitQuick({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const { data, loading } = useTables('habits', 'habit_logs')
  const [toggle, pending] = useAction((id: string, done: boolean) => api.setHabitStatus(id, today, done ? null : 'done'))
  const list: any[] = (habitStats(data.habits, data.habit_logs, today, settings.week_starts_on) as any[]).filter((s) => !s.habit.archived_at && (s.due || s.today))
  return (
    <Sheet visible title="Complete habits" onClose={onClose}>
      <Txt muted>Tap to check in for today.</Txt>
      {loading ? <Txt muted>Loading…</Txt> : list.length === 0 ? <Txt muted style={{ textAlign: 'center' }}>No habits due today. 🎉</Txt> : list.map((s) => {
        const done = s.today?.status === 'done'
        return <Button key={s.habit.id} title={`${done ? '✓ ' : '○ '}${s.habit.name}`} variant={done ? 'primary' : 'ghost'} disabled={pending} onPress={() => toggle(s.habit.id, done)} />
      })}
      <View style={{ height: 4, backgroundColor: colors.background }} />
    </Sheet>
  )
}

function WaterQuick({ onClose }: { onClose: () => void }) {
  const today = useToday()
  const { settings } = useSettings()
  const { rows } = useTable<any>('health_logs')
  return <WaterSheet visible onClose={onClose} date={today} current={rows.find((h) => h.log_date === today)?.water_ml ?? 0} goal={settings.water_goal_ml} />
}
function WorkoutQuick({ onClose }: { onClose: () => void }) {
  const today = useToday()
  const { data } = useTables('routines', 'exercises')
  return <WorkoutForm visible workout={null} sets={[]} routines={data.routines} library={data.exercises} today={today} date={today} routineId={null} onClose={onClose} />
}

/** Opens the same forms the full screens use, from anywhere. Each is mounted only while open so its tables load on demand. */
export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<QuickKind | null>(null)
  const today = useToday()
  const close = useCallback(() => setKind(null), [])
  const value = useMemo(() => ({ open: setKind }), [])
  return (
    <Ctx.Provider value={value}>
      {children}
      {kind === 'task' ? <TaskForm visible task={null} defaultDate={today} onClose={close} /> : null}
      {kind === 'expense' ? <TransactionForm visible txn={null} defaultType="expense" today={today} onClose={close} /> : null}
      {kind === 'application' ? <ApplicationForm visible app={null} defaultStatus="interested" today={today} onClose={close} /> : null}
      {kind === 'water' ? <WaterQuick onClose={close} /> : null}
      {kind === 'study' ? <StudyStart onClose={close} /> : null}
      {kind === 'habit' ? <HabitQuick onClose={close} /> : null}
      {kind === 'workout' ? <WorkoutQuick onClose={close} /> : null}
    </Ctx.Provider>
  )
}
