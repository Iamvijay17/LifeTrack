import { useMemo, useState } from 'react'
import { BookOpen, CalendarClock, Code2, Plus, Target } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { counted, countedMinutes, historyOf, problemsSolved, revisionStatus, topicGroups, topicTotals, weekSeries } from '@/domain/learning'
import { isStudyGoal } from '@lifetrack/core/learning'
import { addDays, eachDay, fmtDay, fmtDuration, startOfWeek } from '@/lib/dates'
import { AnimatedValue, ProgressRing } from '@/components/motion/primitives'
import { SparkBars } from '@/components/shared/chartParts'
import { OverviewTab } from './OverviewTab'
import { GoalsTab } from './GoalsTab'
import { TopicsTab } from './TopicsTab'
import { SessionsTab } from './SessionsTab'
import { SessionDialog } from './SessionDialog'
import { StudyGoalDialog } from './StudyGoalDialog'
import { TopicDialog } from './TopicDialog'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'goals', label: 'Goals' },
  { value: 'topics', label: 'Topics' },
  { value: 'sessions', label: 'Sessions' },
]
const closed = { open: false }

export default function LearningPage() {
  const today = useToday()
  const { settings } = useSettings()
  const { data, loading, error, refetch } = useTables('study_sessions', 'goals', 'learning_topics')
  const [tab, setTab] = useState('overview')
  const [goalDlg, setGoalDlg] = useState({ ...closed, goal: null })
  const [sessDlg, setSessDlg] = useState({ ...closed, session: null })
  const [topicDlg, setTopicDlg] = useState({ ...closed, topic: null })

  const studyGoals = useMemo(() => data.goals.filter(isStudyGoal), [data.goals])
  const topics = useMemo(() => data.learning_topics.filter((t) => !t.archived), [data.learning_topics])
  const sessions = data.study_sessions
  const running = sessions.find((s) => s.status === 'running')
  const completed = useMemo(() => counted(sessions), [sessions])
  const weekStart = startOfWeek(today, settings.week_starts_on)
  const weekEnd = addDays(weekStart, 6)
  const week = useMemo(
    () => weekSeries(completed, weekStart, eachDay(weekStart, weekEnd), (d) => fmtDay(d, 'EEE')),
    [completed, weekStart, weekEnd],
  )
  const todayMinutes = countedMinutes(completed.filter((s) => s.session_date === today))
  const weekMinutes = countedMinutes(completed.filter((s) => s.session_date >= weekStart && s.session_date <= weekEnd))
  const totals = useMemo(() => topicTotals(topics, sessions), [topics, sessions])
  const history = useMemo(() => historyOf(completed), [completed])
  const target = settings.daily_study_target_minutes

  const newGoal = () => setGoalDlg({ open: true, goal: null })
  return (
    <>
      <PageHeader
        title="Career & Learning"
        description="Track real study time, goals and DSA practice."
        actions={
          <>
            <Button variant="outline" onClick={() => setSessDlg({ open: true, session: null })}>
              <Plus className="h-4 w-4" />
              Log session
            </Button>
            <Button onClick={newGoal}>
              <Target className="h-4 w-4" />
              New goal
            </Button>
          </>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <section className="lt-hero col-span-2 flex items-center gap-4 p-4 md:gap-5 md:p-5 lg:row-span-2">
              <ProgressRing
                value={target ? Math.min(100, (todayMinutes / target) * 100) : null}
                size={116}
                stroke={11}
                label="Study time against today's target"
              >
                <BookOpen className="h-6 w-6 text-mod-text" aria-hidden />
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Today</p>
                <p className="lt-stat-value mt-1 text-[2rem] leading-none">
                  <AnimatedValue value={fmtDuration(todayMinutes)} />
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{target ? `target ${fmtDuration(target)}` : 'no daily target set'}</p>
                <SparkBars values={week.map((w) => w.hours)} highlight={week.findIndex((w) => w.d === today)} className="mt-3 h-8" />
              </div>
            </section>
            <StatCard
              icon={BookOpen}
              label="This week"
              value={fmtDuration(weekMinutes)}
              sub={`${week.filter((w) => w.hours > 0).length} active days`}
            />
            <StatCard icon={Code2} label="DSA problems" value={problemsSolved(sessions)} sub="all time" />
            <StatCard
              icon={Target}
              label="Active goals"
              value={studyGoals.filter((g) => g.status === 'active').length}
              sub={`${studyGoals.filter((g) => g.status === 'completed').length} completed`}
            />
            <StatCard
              icon={CalendarClock}
              label="Due for revision"
              value={topics.filter((t) => revisionStatus(t, today).due).length}
              sub={`of ${topics.length} topics`}
            />
          </div>
          <Segmented value={tab} onChange={setTab} options={TABS} />

          {tab === 'overview' && (
            <OverviewTab running={running} goals={data.goals} topics={topics} today={today} week={week} weekMinutes={weekMinutes} />
          )}
          {tab === 'goals' && (
            <GoalsTab
              goals={studyGoals}
              sessions={sessions}
              today={today}
              onCreate={newGoal}
              onEdit={(goal) => setGoalDlg({ open: true, goal })}
            />
          )}
          {tab === 'topics' && (
            <TopicsTab
              totals={totals}
              today={today}
              onCreate={() => setTopicDlg({ open: true, topic: null })}
              onEdit={(topic) => setTopicDlg({ open: true, topic })}
            />
          )}
          {tab === 'sessions' && (
            <SessionsTab
              history={history}
              goals={data.goals}
              topics={topics}
              onCreate={() => setSessDlg({ open: true, session: null })}
              onEdit={(session) => setSessDlg({ open: true, session })}
            />
          )}
        </div>
      </DataGate>
      <StudyGoalDialog
        open={goalDlg.open}
        goal={goalDlg.goal}
        topics={topics}
        onOpenChange={(o) => setGoalDlg((d) => ({ ...d, open: o }))}
      />
      <SessionDialog
        open={sessDlg.open}
        session={sessDlg.session}
        goals={data.goals}
        topics={topics}
        today={today}
        onOpenChange={(o) => setSessDlg((d) => ({ ...d, open: o }))}
      />
      <TopicDialog
        open={topicDlg.open}
        topic={topicDlg.topic}
        groups={topicGroups(topics)}
        today={today}
        onOpenChange={(o) => setTopicDlg((d) => ({ ...d, open: o }))}
      />
    </>
  )
}
