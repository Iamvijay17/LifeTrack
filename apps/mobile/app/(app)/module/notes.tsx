import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fmtDay } from '@lifetrack/utils'
import { filterNotes, noteCategories, notePreview, noteTags } from '@lifetrack/core/notes'
import { store } from '../../../src/data/client'
import { useTables } from '../../../src/hooks/useTables'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { Journal } from '../../../src/features/notes/Journal'
import { NoteForm } from '../../../src/features/notes/NoteForm'
import { Markdown } from '../../../src/ui/Markdown'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { ActionSheet, Sheet, afterSheetClose } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, Chip, DataGate, DateNav, EmptyState, Segmented, pullToRefresh } from '../../../src/ui/controls'
import { Button, Card, Field, Txt } from '../../../src/ui'

export default function Notes() {
  const { colors } = useTheme()
  const today = useToday()
  const [tab, setTab] = useState<'notes' | 'journal'>('notes')
  const [date, setDate] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('')
  const [form, setForm] = useState<{ open: boolean; note: any | null }>({ open: false, note: null })
  const [view, setView] = useState<any | null>(null)
  const [menu, setMenu] = useState(false)
  const { data, loading, refreshing, error, refetch } = useTables('notes', 'goals', 'tasks')
  const categories = useMemo(() => noteCategories(data.notes), [data.notes])
  const tags = useMemo(() => noteTags(data.notes), [data.notes])
  const [limit, setLimit] = useState(40) // render in pages: a few thousand notes must not mount at once
  const list: any[] = useMemo(() => filterNotes(data.notes, { q, category, tag }), [data.notes, q, category, tag])
  const [patch] = useAction((id: string, p: Record<string, unknown>) => store.update('notes', id, p))
  const [del] = useAction((id: string) => store.remove('notes', id))
  const day = date ?? today
  const goalName = (id: string | null) => data.goals.find((g: any) => g.id === id)?.title
  const taskName = (id: string | null) => data.tasks.find((t: any) => t.id === id)?.title
  const cur = view ? (data.notes.find((x: any) => x.id === view.id) ?? view) : null

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Notes & Journal" action={tab === 'notes' ? <Button title="＋ New" onPress={() => setForm({ open: true, note: null })} /> : undefined} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'notes', label: 'Notes' }, { value: 'journal', label: 'Daily journal' }]} />
        {tab === 'journal' ? (<>
          <DateNav date={day} today={today} onChange={setDate} />
          <Journal date={day} />
        </>) : (
          <DataGate loading={loading} error={error} onRetry={refetch}>
            <Field label="Search notes" value={q} onChangeText={setQ} placeholder="Search…" autoCapitalize="none" returnKeyType="search" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="All" selected={category === ''} onPress={() => setCategory('')} />
              {categories.map((c) => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(category === c ? '' : c)} />)}
            </ScrollView>
            {tags.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {tags.map((t) => <Chip key={t} label={`#${t}`} selected={tag === t} onPress={() => setTag(tag === t ? '' : t)} />)}
              </ScrollView>
            ) : null}
            {data.notes.length === 0
              ? <EmptyState title="No notes yet" description="Capture ideas, meeting notes and things you learn. Add tags and attach notes to goals or tasks." action={{ label: 'Write your first note', onPress: () => setForm({ open: true, note: null }) }} />
              : list.length === 0 ? <Txt muted style={{ textAlign: 'center' }}>No notes match your search.</Txt>
              : list.slice(0, limit).map((n) => (
                <Card key={n.id} onPress={() => setView(n)}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '600', fontSize: 16 }}>{n.pinned ? '📌 ' : ''}{n.title || 'Untitled'}</Text>
                  <Text numberOfLines={3} style={{ color: colors.mutedForeground }}>{notePreview(n.body) || ' '}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <Badge tone="primary">{n.category}</Badge>
                    {(n.tags ?? []).map((t: string) => <Badge key={t}>#{t}</Badge>)}
                  </View>
                  <Txt variant="small" muted>{fmtDay(n.updated_at.slice(0, 10), 'd MMM yyyy')}{goalName(n.goal_id) ? ` · Goal: ${goalName(n.goal_id)}` : ''}{taskName(n.task_id) ? ` · Task: ${taskName(n.task_id)}` : ''}</Txt>
                </Card>
              ))}
            {list.length > limit ? <Button title={`Show more (${list.length - limit})`} variant="ghost" onPress={() => setLimit(limit + 40)} /> : null}
          </DataGate>
        )}
      </ScrollView>

      <Sheet visible={!!cur} title={cur?.title || 'Untitled'} onClose={() => setView(null)} footer={cur ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="More…" variant="ghost" onPress={() => setMenu(true)} /></View>
          <View style={{ flex: 1 }}><Button title="Edit" onPress={() => { setView(null); afterSheetClose(() => setForm({ open: true, note: cur })) }} /></View>
        </View>) : undefined}>
        {cur ? (<>
          <Txt variant="small" muted>{cur.category} · updated {fmtDay(cur.updated_at.slice(0, 10), 'd MMM yyyy')}</Txt>
          <Markdown source={cur.body} />
          {(cur.tags?.length > 0 || goalName(cur.goal_id) || taskName(cur.task_id)) ? (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(cur.tags ?? []).map((t: string) => <Badge key={t}>#{t}</Badge>)}
              {goalName(cur.goal_id) ? <Badge tone="success">Goal: {goalName(cur.goal_id)}</Badge> : null}
              {taskName(cur.task_id) ? <Badge tone="warning">Task: {taskName(cur.task_id)}</Badge> : null}
            </View>) : null}
        </>) : null}
        <ActionSheet visible={menu && !!cur} title={cur?.title || 'Untitled'} onClose={() => setMenu(false)} actions={cur ? [
          { label: cur.pinned ? 'Unpin' : 'Pin', onPress: () => patch(cur.id, { pinned: !cur.pinned }) },
          { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this note?', cur.title || 'Untitled note')) { setView(null); del(cur.id) } } },
        ] : []} />
      </Sheet>
      <NoteForm visible={form.open} note={form.note} goals={data.goals} tasks={data.tasks.filter((t: any) => t.status !== 'cancelled')} categories={categories} onClose={() => setForm({ open: false, note: null })} />
    </SafeAreaView>
  )
}
