import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fmtDay, fmtDuration } from '@lifetrack/utils'
import { goalProgress, isGoalOverdue, sessionName, studyOverview, topicRevision, topicTotals } from '@lifetrack/core/learning'
import { store } from '../../../src/data/client'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { LearningGoalForm, SessionForm, TopicForm } from '../../../src/features/learning/forms'
import { StudyTimer } from '../../../src/features/learning/StudyTimer'
import { BarChart } from '../../../src/ui/charts'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { ActionSheet } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, DataGate, EmptyState, ProgressBar, Segmented, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { Button, Card, Txt } from '../../../src/ui'

type Tab = 'overview' | 'goals' | 'topics' | 'sessions'
export default function Learning() {
  const { colors } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const { data, loading, refreshing, error, refetch } = useTables('study_sessions', 'goals', 'learning_topics')
  const [tab, setTab] = useState<Tab>('overview')
  const [goalForm, setGoalForm] = useState<{ open: boolean; goal: any | null }>({ open: false, goal: null })
  const [sessForm, setSessForm] = useState<{ open: boolean; session: any | null }>({ open: false, session: null })
  const [topicForm, setTopicForm] = useState<{ open: boolean; topic: any | null }>({ open: false, topic: null })
  const [menu, setMenu] = useState<{ kind: 'goal' | 'topic' | 'session'; item: any } | null>(null)
  const [del] = useAction((table: string, id: string) => store.remove(table, id))

  const topics = data.learning_topics.filter((t: any) => !t.archived)
  const sessions = data.study_sessions
  const o = useMemo(() => studyOverview(sessions, data.goals, today, settings.week_starts_on), [sessions, data.goals, today, settings.week_starts_on])
  const totals: any[] = useMemo(() => topicTotals(topics, sessions), [topics, sessions])
  const groups = [...new Set(topics.map((t: any) => t.group_name))] as string[]
  const target = settings.daily_study_target_minutes
  const weekData = o.week.map((w) => ({ label: fmtDay(w.d, 'EEE'), value: w.hours }))

  const menuActions = menu ? ({
    goal: [
      { label: 'Edit', onPress: () => setGoalForm({ open: true, goal: menu.item }) },
      { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this goal?', 'Study sessions stay in your history.')) del('goals', menu.item.id) } },
    ],
    topic: [
      { label: 'Edit notes & revisions', onPress: () => setTopicForm({ open: true, topic: menu.item }) },
      { label: 'Delete', destructive: true, onPress: async () => { if (await confirm(`Delete ${menu.item.name}?`, 'Past sessions stay, but lose their topic link.')) del('learning_topics', menu.item.id) } },
    ],
    session: [
      { label: 'Edit', onPress: () => setSessForm({ open: true, session: menu.item }) },
      { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this session?', `${fmtDuration(menu.item.duration_seconds / 60)} of study time will be removed.`)) del('study_sessions', menu.item.id) } },
    ],
  })[menu.kind] : []

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Career & Learning" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Log session" variant="ghost" onPress={() => setSessForm({ open: true, session: null })} /></View>
          <View style={{ flex: 1 }}><Button title="New goal" onPress={() => setGoalForm({ open: true, goal: null })} /></View>
        </View>
        <DataGate loading={loading} error={error} onRetry={refetch}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Today" value={fmtDuration(o.todayMin)} sub={target ? `target ${fmtDuration(target)}` : 'no daily target set'} progress={target ? Math.min(100, (o.todayMin / target) * 100) : null} tone="success" />
            <StatTile label="This week" value={fmtDuration(o.weekMin)} sub={`${o.activeDays} active days`} />
            <StatTile label="DSA problems" value={o.problems} sub="all time" />
            <StatTile label="Active goals" value={o.activeGoals} sub={`${o.completedGoals} completed`} />
          </View>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'goals', label: 'Goals' }, { value: 'topics', label: 'Topics' }, { value: 'sessions', label: 'Sessions' }]} />

          {tab === 'overview' ? (<>
            <StudyTimer running={o.running} goals={data.goals} topics={topics} today={today} />
            <Card><Txt variant="heading">This week (hours)</Txt><BarChart data={weekData} unit="h" summary={`Hours studied this week: ${weekData.map((d) => `${d.label} ${d.value}`).join(', ')}`} /></Card>
          </>) : null}

          {tab === 'goals' ? (data.goals.length === 0
            ? <EmptyState title="No goals yet" description="Set a target in hours, then log sessions against it to see real progress." action={{ label: 'Create a goal', onPress: () => setGoalForm({ open: true, goal: null }) }} />
            : data.goals.map((g: any) => {
              const p = goalProgress(g, sessions)
              const overdue = isGoalOverdue(g, today)
              return (
                <Card key={g.id} onPress={() => setMenu({ kind: 'goal', item: g })}>
                  <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: 16 }}>{g.title}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 6 }}>
                    <Badge tone="primary">{g.category}</Badge>
                    {g.status !== 'active' ? <Badge tone={g.status === 'completed' ? 'success' : 'neutral'}>{g.status}</Badge> : null}
                    {g.due_date ? <Badge tone={overdue ? 'danger' : 'neutral'}>{fmtDay(g.due_date, 'd MMM')}</Badge> : null}
                  </View>
                  <ProgressBar value={p.percent ?? 0} color={(p.percent ?? 0) >= 100 ? colors.success : colors.primary} label={g.title} />
                  <Txt variant="small" muted>{fmtDuration(p.done)} {p.target ? `of ${fmtDuration(p.target)} · ${p.percent}%` : '· no target set'}</Txt>
                </Card>
              )
            })) : null}

          {tab === 'topics' ? (<>
            <Button title="Add topic" variant="ghost" onPress={() => setTopicForm({ open: true, topic: null })} />
            {groups.length === 0 ? <EmptyState title="No topics yet" description="Default topics are created on first sign-in. Add your own any time." /> : null}
            {groups.map((grp) => (
              <View key={grp} style={{ gap: 8 }}>
                <Text accessibilityRole="header" style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{grp}</Text>
                {totals.filter((t) => t.topic.group_name === grp).map(({ topic, minutes, problems }) => {
                  const { next, due } = topicRevision(topic, today)
                  return (
                    <Card key={topic.id} onPress={() => setMenu({ kind: 'topic', item: topic })}>
                      <Text style={{ color: colors.foreground, fontWeight: '600' }}>{topic.name}</Text>
                      <Txt variant="small" muted>{minutes > 0 ? fmtDuration(minutes) : 'No time logged'}{problems > 0 ? ` · ${problems} problems` : ''}</Txt>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        {due ? <Badge tone="warning">Revise today</Badge> : null}
                        {next && !due ? <Badge>Revise {fmtDay(next, 'd MMM')}</Badge> : null}
                        {topic.notes ? <Badge>Has notes</Badge> : null}
                      </View>
                    </Card>
                  )
                })}
              </View>
            ))}
          </>) : null}

          {tab === 'sessions' ? (o.history.length === 0
            ? <EmptyState title="No completed sessions yet" description="Use the timer or log a session manually. Running timers don't count until you save them." />
            : o.history.slice(0, 100).map((s: any) => (
              <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Session actions: ${sessionName(s, data.goals, topics)}`} onPress={() => setMenu({ kind: 'session', item: s })}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '600', flex: 1 }}>{sessionName(s, data.goals, topics)}</Text>
                    <Text style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>{fmtDuration(s.duration_seconds / 60)}</Text>
                  </View>
                  <Txt variant="small" muted>{fmtDay(s.session_date)} · {s.source === 'timer' ? 'Timer' : 'Manual'}{s.problems_solved > 0 ? ` · ${s.problems_solved} problems` : ''}</Txt>
                  {s.notes ? <Txt variant="small" muted>{s.notes}</Txt> : null}
                </Card>
              </Pressable>
            ))) : null}
        </DataGate>
      </ScrollView>
      <ActionSheet visible={!!menu} title={menu?.kind === 'session' ? 'Session' : menu?.item?.title ?? menu?.item?.name ?? ''} onClose={() => setMenu(null)} actions={menuActions} />
      <LearningGoalForm visible={goalForm.open} goal={goalForm.goal} topics={topics} onClose={() => setGoalForm({ open: false, goal: null })} />
      <SessionForm visible={sessForm.open} session={sessForm.session} goals={data.goals} topics={topics} today={today} onClose={() => setSessForm({ open: false, session: null })} />
      <TopicForm visible={topicForm.open} topic={topicForm.topic} groups={groups} today={today} onClose={() => setTopicForm({ open: false, topic: null })} />
    </SafeAreaView>
  )
}
