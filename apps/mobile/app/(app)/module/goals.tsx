import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fmtDay } from '@lifetrack/utils'
import { daysLeft, daysLeftLabel, goalList, goalSourceLabel, goalsSummary, isOverdue, orderedMilestones, PERIODS, periodLabel } from '@lifetrack/core/goals'
import { milestoneFormSchema } from '@lifetrack/schemas'
import { api, store } from '../../../src/data/client'
import { useTables } from '../../../src/hooks/useTables'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { GoalForm } from '../../../src/features/goals/GoalForm'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { ActionSheet } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, Chip, DataGate, DateField, EmptyState, ProgressBar, Segmented, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { Button, Card, Field, Txt } from '../../../src/ui'

function Milestones({ goal, milestones }: { goal: any; milestones: any[] }) {
  const { colors } = useTheme()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [error, setError] = useState('')
  const mine = orderedMilestones(goal.id, milestones)
  const [add, adding] = useAction(async () => {
    const r = milestoneFormSchema.safeParse({ title, due_date: due })
    if (!r.success) { setError(r.error.issues[0].message); return }
    setError('')
    await store.insert('milestones', { goal_id: goal.id, title: r.data.title, due_date: r.data.due_date || null, position: mine.length })
    setTitle(''); setDue('')
  })
  const [toggle] = useAction((m: any) => api.toggleMilestone(m))
  const [remove] = useAction((id: string) => store.remove('milestones', id))
  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 8 }}>
      {mine.map((m: any) => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: m.done }} accessibilityLabel={`${m.done ? 'Mark not done' : 'Mark done'}: ${m.title}`} onPress={() => toggle(m)}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: m.done ? colors.success : colors.mutedForeground, backgroundColor: m.done ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {m.done ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
            </View>
          </Pressable>
          <Text style={{ flex: 1, color: m.done ? colors.mutedForeground : colors.foreground, textDecorationLine: m.done ? 'line-through' : 'none' }}>{m.title}</Text>
          {m.due_date ? <Txt variant="small" muted>{fmtDay(m.due_date, 'd MMM')}</Txt> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete milestone ${m.title}`} onPress={async () => { if (await confirm('Delete this milestone?', m.title)) remove(m.id) }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Field label="New milestone" value={title} onChangeText={setTitle} error={error} placeholder="Add a milestone" maxLength={160} returnKeyType="done" onSubmitEditing={add} />
      <DateField label="Milestone due date" value={due} onChange={setDue} clearable />
      <Button title="Add milestone" variant="ghost" onPress={add} loading={adding} />
    </View>
  )
}

export default function Goals() {
  const { colors } = useTheme()
  const today = useToday()
  const { data, loading, refreshing, error, refetch } = useTables('goals', 'milestones', 'study_sessions')
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [period, setPeriod] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState<{ open: boolean; goal: any | null }>({ open: false, goal: null })
  const [menu, setMenu] = useState<any | null>(null)
  const [setStatus] = useAction((g: any, s: string) => api.setGoalStatus(g, s))
  const [del] = useAction((id: string) => store.remove('goals', id))

  const shown: any[] = useMemo(() => goalList(data.goals, data.milestones, data.study_sessions, { tab, period }), [data, tab, period])
  const sum = useMemo(() => goalsSummary(data.goals, data.milestones, data.study_sessions, today), [data, today])
  const g = menu
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Goals & Milestones" action={<Button title="＋ New" onPress={() => setForm({ open: true, goal: null })} />} />
        <DataGate loading={loading} error={error} onRetry={refetch}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Active" value={sum.active} sub={`${sum.overdue} overdue`} />
            <StatTile label="Completed" value={sum.completed} sub={sum.completedShare != null ? `${sum.completedShare}% of closed goals` : undefined} />
            <StatTile label="Average progress" value={sum.avgProgress == null ? '—' : `${sum.avgProgress}%`} progress={sum.avgProgress} />
            <StatTile label="Milestones done" value={`${sum.milestonesDone}/${sum.milestonesTotal}`} />
          </View>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active' }, { value: 'history', label: 'History' }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="All types" selected={period === ''} onPress={() => setPeriod('')} />
            {PERIODS.map((p: any) => <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod(p.value)} />)}
          </ScrollView>
          {shown.length === 0
            ? <EmptyState title={tab === 'active' ? 'No active goals' : 'No completed or archived goals yet'} description={tab === 'active' ? 'Set a goal, break it into milestones and watch the progress bar fill.' : 'Finished goals are kept here as your history.'} action={tab === 'active' ? { label: 'Create a goal', onPress: () => setForm({ open: true, goal: null }) } : undefined} />
            : shown.map(({ g: goal, p }: any) => {
              const over = isOverdue(goal, today), left = daysLeft(goal, today)
              const ms = data.milestones.filter((m: any) => m.goal_id === goal.id)
              return (
                <Card key={goal.id}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${goal.title}`} onPress={() => setMenu(goal)} style={{ gap: 6 }}>
                    <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: 16 }}>{goal.title}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <Badge tone="primary">{periodLabel(goal.period)}</Badge><Badge>{goal.category}</Badge>
                      {goal.status !== 'active' ? <Badge tone={goal.status === 'completed' ? 'success' : 'neutral'}>{goal.status}</Badge> : null}
                      {over ? <Badge tone="danger">Overdue</Badge> : null}
                    </View>
                    {goal.notes ? <Txt variant="small" muted>{goal.notes}</Txt> : null}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="small" muted>{goalSourceLabel(p)}</Txt><Txt variant="small">{p.percent}%</Txt></View>
                    <ProgressBar value={p.percent} color={p.percent >= 100 ? colors.success : over ? colors.danger : colors.primary} label={`${goal.title} progress`} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Txt variant="small" muted>{goal.start_date ? `${fmtDay(goal.start_date, 'd MMM')} → ` : ''}{goal.due_date ? fmtDay(goal.due_date, 'd MMM yyyy') : 'No target date'}</Txt>
                      {goal.status === 'active' && left != null ? <Txt variant="small" muted>{daysLeftLabel(left)}</Txt> : null}
                    </View>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: !!open[goal.id] }} onPress={() => setOpen((o) => ({ ...o, [goal.id]: !o[goal.id] }))} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={{ color: colors.secondary, fontWeight: '600' }}>Milestones ({ms.filter((m: any) => m.done).length}/{ms.length}) {open[goal.id] ? '▴' : '▾'}</Text>
                  </Pressable>
                  {open[goal.id] ? <Milestones goal={goal} milestones={data.milestones} /> : null}
                </Card>
              )
            })}
        </DataGate>
      </ScrollView>
      <ActionSheet visible={!!g} title={g?.title ?? ''} onClose={() => setMenu(null)} actions={g ? [
        { label: 'Edit', onPress: () => setForm({ open: true, goal: g }) },
        { label: 'Mark completed', hidden: g.status === 'completed', onPress: () => setStatus(g, 'completed') },
        { label: 'Reopen', hidden: g.status === 'active', onPress: () => setStatus(g, 'active') },
        { label: 'Archive', hidden: g.status === 'archived', onPress: () => setStatus(g, 'archived') },
        { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this goal?', 'Its milestones are deleted too. Notes and study sessions stay.')) del(g.id) } },
      ] : []} />
      <GoalForm visible={form.open} goal={form.goal} today={today} onClose={() => setForm({ open: false, goal: null })} />
    </SafeAreaView>
  )
}
