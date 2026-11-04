import { useMemo, useState } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fmtDay } from '@lifetrack/utils'
import { groupTasksForDay, taskFlags } from '@lifetrack/core/tasks'
import { api, store } from '../../../src/data/client'
import { haptics } from '../../../src/lib/haptics'
import { useTables } from '../../../src/hooks/useTables'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { TaskForm } from '../../../src/features/planner/TaskForm'
import { ActionSheet } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, DataGate, DateNav, EmptyState, pullToRefresh } from '../../../src/ui/controls'
import { CheckCircle } from '../../../src/ui/motion'
import { Button, Txt } from '../../../src/ui'

const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const

function TaskRow({ task, today, showDue, onMenu }: { task: any; today: string; showDue?: boolean; onMenu: (t: any) => void }) {
  const { colors } = useTheme()
  const { done, inactive, overdue } = taskFlags(task, today)
  const [setStatus, pending] = useAction((s: string) => api.setTaskStatus(task, s, today))
  const mark = done ? '✓' : inactive ? '✕' : task.status === 'in_progress' ? '◐' : ''
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: pending ? 0.6 : 1 }}>
      {inactive || task.status === 'in_progress' ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false, busy: pending }} accessibilityLabel={`Complete ${task.title}`} disabled={pending} onPress={() => { haptics.success(); setStatus('done') }} hitSlop={8}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.mutedForeground, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, fontWeight: '700' }}>{mark}</Text>
          </View>
        </Pressable>
      ) : (
        <CheckCircle done={done} disabled={pending} onPress={() => setStatus(done ? 'pending' : 'done')} label={done ? `Mark ${task.title} as not done` : `Complete ${task.title}`} />
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} onPress={() => onMenu(task)} style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={{ color: done || inactive ? colors.mutedForeground : colors.foreground, textDecorationLine: done || inactive ? 'line-through' : 'none', fontSize: 16 }}>{task.title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Badge tone="primary">{task.category}</Badge>
          {task.priority !== 'medium' ? <Badge tone={PRIORITY_TONE[task.priority as keyof typeof PRIORITY_TONE]}>{task.priority}</Badge> : null}
          {task.status === 'in_progress' ? <Badge tone="warning">In progress</Badge> : null}
          {task.status === 'skipped' ? <Badge>Skipped</Badge> : null}
          {task.status === 'cancelled' ? <Badge>Cancelled</Badge> : null}
          {task.recurrence !== 'none' ? <Badge>↻ {task.recurrence}</Badge> : null}
          {(showDue || overdue) && task.due_date ? <Badge tone={overdue ? 'danger' : 'neutral'}>{overdue ? 'Overdue · ' : ''}{fmtDay(task.due_date, 'd MMM')}</Badge> : null}
        </View>
      </Pressable>
    </View>
  )
}

export default function Planner() {
  const { colors } = useTheme()
  const today = useToday()
  const [date, setDate] = useState<string | null>(null)
  const day = date ?? today
  const { data, loading, refreshing, error, refetch } = useTables('tasks')
  const [form, setForm] = useState<{ open: boolean; task: any | null }>({ open: false, task: null })
  const [menuTask, setMenuTask] = useState<any | null>(null)
  const [setStatus] = useAction((t: any, s: string) => api.setTaskStatus(t, s, today))
  const [del] = useAction((id: string) => store.remove('tasks', id))

  const sections = useMemo(() => {
    const g = groupTasksForDay(data.tasks, day, today)
    return {
      g,
      list: [
        { title: 'Overdue', data: g.overdue, showDue: true },
        { title: 'Top priorities', data: g.priorities },
        { title: 'Pending', data: g.pending },
        { title: 'Completed', data: g.done },
        { title: 'Skipped / cancelled', data: g.off },
        { title: 'No due date', data: g.someday, showDue: false },
      ].filter((s) => s.data.length > 0),
    }
  }, [data.tasks, day, today])

  const t = menuTask
  const open = t && !taskFlags(t, today).done && !taskFlags(t, today).inactive
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt variant="title">Planner</Txt>
          <Button title="＋ New" onPress={() => setForm({ open: true, task: null })} />
        </View>
        <DateNav date={day} today={today} onChange={setDate} />
      </View>
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <SectionList
          sections={sections.list as any}
          keyExtractor={(t: any) => t.id}
          refreshControl={pullToRefresh(refreshing, refetch)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
          renderSectionHeader={({ section }: any) => (
            <Text accessibilityRole="header" style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginTop: 16, letterSpacing: 0.5 }}>{section.title} · {section.data.length}</Text>
          )}
          renderItem={({ item, section }: any) => <TaskRow task={item} today={today} showDue={section.showDue} onMenu={setMenuTask} />}
          ListEmptyComponent={<EmptyState title="Nothing planned for this day" description="Add tasks to build a plan. Daily progress is calculated from what you plan and finish." action={{ label: 'Add a task', onPress: () => setForm({ open: true, task: null }) }} />}
        />
      </DataGate>
      <ActionSheet visible={!!t} title={t?.title ?? ''} onClose={() => setMenuTask(null)} actions={t ? [
        { label: 'Start', hidden: !open || t.status === 'in_progress', onPress: () => setStatus(t, 'in_progress') },
        { label: 'Skip', hidden: !open, onPress: () => setStatus(t, 'skipped') },
        { label: 'Cancel task', hidden: !open, onPress: () => setStatus(t, 'cancelled') },
        { label: 'Reopen', hidden: !!open, onPress: () => setStatus(t, 'pending') },
        { label: 'Edit', onPress: () => setForm({ open: true, task: t }) },
        { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this task?', t.recurrence !== 'none' ? 'Only this occurrence is deleted.' : t.title)) del(t.id) } },
      ] : []} />
      <TaskForm visible={form.open} task={form.task} defaultDate={day} onClose={() => setForm({ open: false, task: null })} />
    </SafeAreaView>
  )
}
