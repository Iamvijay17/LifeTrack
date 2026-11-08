import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { useTables } from '@/hooks/store'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { recordFocus } from '@/services/api'
import {
  MODE_LABEL,
  completedCount,
  dailyFocus,
  fmtClock,
  focusMinutes,
  focusableTasks,
  isValidMinutes,
  nextBreak,
  parseFocusTarget,
  plannedMinutes,
  weekRange,
  MAX_MINUTES,
  MIN_MINUTES,
} from '@/domain/focus'
import { fmtDay } from '@/lib/dates'
import { pageTitle } from '@/lib/nav'
import { celebrate } from '@/lib/celebrate'
import { beep } from './beep'
import { FocusSummary } from './FocusSummary'
import { SessionList } from './SessionList'
import { TimerCard } from './TimerCard'
import { useFocusTimer } from './useFocusTimer'

export default function FocusPage() {
  const today = useToday()
  const { settings } = useSettings()
  const prefs = settings.focus_prefs
  const { data, loading, error, refetch } = useTables('focus_sessions', 'tasks', 'learning_topics')
  const [setup, setSetup] = useState({ mode: 'focus', preset: '25', custom: '30', target: '', label: '' })

  const todays = useMemo(() => data.focus_sessions.filter((s) => s.session_date === today), [data.focus_sessions, today])
  const doneToday = completedCount(todays)
  const minutes = plannedMinutes({ ...setup, prefs })
  const validMinutes = isValidMinutes(minutes)

  const [record] = useAction(recordFocus)
  const timer = useFocusTimer({
    onFinish: async (t, completed) => {
      beep()
      if (t.mode === 'focus') {
        const saved = await record({
          plannedMinutes: t.plannedMinutes,
          actualSeconds: t.plannedMinutes * 60,
          completed,
          taskId: t.taskId,
          topicId: t.topicId,
          label: t.label,
          date: today,
        })
        if (saved) {
          toast.success('Focus session complete', { description: `${t.plannedMinutes} minutes recorded.` })
          celebrate({ count: 60 })
        }
        setSetup((s) => ({ ...s, mode: nextBreak(doneToday + 1, prefs.long_every) }))
      } else {
        toast('Break over — ready for the next focus block?')
        setSetup((s) => ({ ...s, mode: 'focus' }))
      }
    },
  })

  useEffect(() => {
    document.title = timer.timer ? `${fmtClock(timer.left)} · ${MODE_LABEL[timer.timer.mode]} — LifeTrack` : pageTitle('/focus')
    return () => {
      document.title = 'LifeTrack'
    }
  }, [timer.timer, timer.left])

  const start = () => {
    if (!validMinutes) return toast.error(`Choose a duration between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.`)
    timer.start({ mode: setup.mode, plannedMinutes: minutes, ...parseFocusTarget(setup.target), label: setup.label })
  }
  const [stopEarly] = useAction(
    async () => {
      const t = timer.timer
      const spent = timer.stop()
      if (t.mode !== 'focus') return
      const saved = await recordFocus({
        plannedMinutes: t.plannedMinutes,
        actualSeconds: spent,
        completed: false,
        taskId: t.taskId,
        topicId: t.topicId,
        label: t.label,
        date: today,
      })
      if (!saved) toast('Stopped — under a minute, so nothing was recorded.')
    },
    { success: 'Stopped and saved' },
  )
  const skipBreak = () => {
    timer.stop()
    setSetup((s) => ({ ...s, mode: 'focus' }))
  }
  const removeSession = useConfirmedDelete('focus_sessions', 'Session deleted')

  const { from, to } = weekRange(today, settings.week_starts_on)
  const week = useMemo(
    () => dailyFocus(data.focus_sessions, from, to).map((d) => ({ ...d, label: fmtDay(d.date, 'EEE') })),
    [data.focus_sessions, from, to],
  )
  const weekMinutes = week.reduce((a, d) => a + d.minutes, 0)
  const tasks = useMemo(() => focusableTasks(data.tasks), [data.tasks])
  const topics = useMemo(() => data.learning_topics.filter((t) => !t.archived), [data.learning_topics])

  return (
    <>
      <PageHeader title="Focus Mode" description="Pomodoro timer — every finished block is saved to your account." />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <TimerCard
            timer={timer}
            setup={setup}
            onSetup={setSetup}
            minutes={minutes}
            validMinutes={validMinutes}
            tasks={tasks}
            topics={topics}
            breakMinutes={setup.mode === 'short_break' ? prefs.short_break : prefs.long_break}
            onStart={start}
            onStop={() => stopEarly()}
            onSkipBreak={skipBreak}
          />
          <FocusSummary
            todayMinutes={focusMinutes(todays)}
            completedToday={doneToday}
            week={week}
            weekMinutes={weekMinutes}
            from={from}
            to={to}
          />
          <SessionList
            sessions={todays}
            tasks={data.tasks}
            topics={data.learning_topics}
            tz={settings.timezone}
            onDelete={(id) =>
              removeSession(id, { title: 'Delete this session?', description: 'Its focus time is removed from your totals.' })
            }
          />
        </div>
      </DataGate>
    </>
  )
}
