import { useEffect, useState } from 'react'
import { Switch, View, Text } from 'react-native'
import { NOTE_CATEGORIES } from '@lifetrack/core/notes'
import { blankNote, noteFormSchema, noteToForm, noteToPayload } from '@lifetrack/schemas'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { useTheme } from '../../providers/ThemeProvider'
import { Markdown } from '../../ui/Markdown'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, Segmented, SelectField } from '../../ui/controls'
import { Button, Field } from '../../ui'

export function NoteForm({ visible, note, goals, tasks, categories, onClose }: { visible: boolean; note: any | null; goals: any[]; tasks: any[]; categories: string[]; onClose: () => void }) {
  const { colors } = useTheme()
  const { values, errors, set, reset, validate } = useZodForm(noteFormSchema, blankNote())
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  useEffect(() => { if (visible) { setMode('write'); reset(note ? noteToForm(note) : blankNote()) } }, [visible, note?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = noteToPayload(v)
    if (note) await store.update('notes', note.id, row); else await store.insert('notes', row)
    onClose()
  })
  const cats = [...new Set([...NOTE_CATEGORIES, ...categories, values.category])].filter(Boolean)
  return (
    <Sheet visible={visible} title={note ? 'Edit note' : 'New note'} onClose={onClose} footer={<Button title={note ? 'Save changes' : 'Save note'} onPress={save} loading={pending} />}>
      <Field label="Title" value={values.title} onChangeText={(t) => set('title', t)} error={errors.title} placeholder="Untitled" maxLength={160} />
      <Segmented value={mode} onChange={setMode} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
      {mode === 'write'
        ? <Field label="Content (Markdown)" value={values.body} onChangeText={(t) => set('body', t)} error={errors.body} multiline numberOfLines={10} autoCapitalize="sentences" placeholder={'# Heading\n- bullet\n- [ ] checklist item\n**bold**, *italic*, `code`'} style={{ minHeight: 200, textAlignVertical: 'top', paddingTop: 12, fontFamily: 'Courier', fontSize: 14 }} />
        : <View style={{ minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }}><Markdown source={values.body} /></View>}
      <ChipGroup label="Category" value={values.category} options={cats.map((c) => ({ value: c, label: c }))} onChange={(v) => set('category', v)} />
      <Field label="Tags (comma separated)" value={values.tags} onChangeText={(t) => set('tags', t)} placeholder="react, interview" autoCapitalize="none" maxLength={200} />
      <SelectField label="Attach to goal" value={values.goal_id} onChange={(v) => set('goal_id', v)} options={[{ value: '', label: 'None' }, ...goals.map((g) => ({ value: g.id, label: g.title }))]} />
      <SelectField label="Attach to task" value={values.task_id} onChange={(v) => set('task_id', v)} options={[{ value: '', label: 'None' }, ...tasks.map((t) => ({ value: t.id, label: t.title }))]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.foreground, fontWeight: '500' }}>Pin to top</Text>
        <Switch accessibilityLabel="Pin to top" value={values.pinned} onValueChange={(v) => set('pinned', v)} trackColor={{ true: colors.primary }} />
      </View>
    </Sheet>
  )
}
