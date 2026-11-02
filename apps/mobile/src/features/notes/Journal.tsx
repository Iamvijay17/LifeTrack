import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { fmtDay } from '@lifetrack/utils'
import { CONFLICT_KEYS } from '@lifetrack/constants/schema'
import { JOURNAL_MOODS, journalCanSave, journalDirty, journalDraft } from '@lifetrack/core/notes'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useTable } from '../../data/useTable'
import { useTheme } from '../../providers/ThemeProvider'
import { Chip, EmptyState } from '../../ui/controls'
import { Button, Card, Field, Txt } from '../../ui'

export function Journal({ date }: { date: string }) {
  const { colors } = useTheme()
  const { rows } = useTable<any>('journal_entries')
  const entry = rows.find((r) => r.entry_date === date)
  const [form, setForm] = useState(journalDraft(null))
  const dirty = journalDirty(form, entry)
  useEffect(() => { setForm(journalDraft(entry)) }, [date, entry?.id, entry?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => { await store.upsert('journal_entries', { entry_date: date, ...form }, { onConflict: CONFLICT_KEYS.journal_entries }) })
  const [clear] = useAction(async () => { if (entry) await store.remove('journal_entries', entry.id) })
  const past = [...rows].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).filter((r) => r.entry_date !== date).slice(0, 8)
  return (
    <View style={{ gap: 14 }}>
      <Card>
        <Text style={{ color: colors.foreground, fontWeight: '600' }}>How was {fmtDay(date, 'EEEE')}?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
          {JOURNAL_MOODS.map((m: { value: number; label: string }) => <Chip key={m.value} label={m.label} selected={form.mood === m.value} onPress={() => setForm((f) => ({ ...f, mood: f.mood === m.value ? null : m.value }))} />)}
        </View>
        <Field label="Reflection" value={form.content} onChangeText={(t) => setForm((f) => ({ ...f, content: t }))} placeholder="What happened? What did you learn?" multiline numberOfLines={6} style={{ minHeight: 140, textAlignVertical: 'top', paddingTop: 12 }} />
        <Field label="Wins" value={form.wins} onChangeText={(t) => setForm((f) => ({ ...f, wins: t }))} placeholder="Small or big — what went well?" multiline numberOfLines={2} style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 12 }} />
        <Txt variant="small" muted>{dirty ? 'Unsaved changes' : entry ? 'Saved' : ''}</Txt>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {entry ? <View style={{ flex: 1 }}><Button title="Delete" variant="ghost" onPress={() => clear()} /></View> : null}
          <View style={{ flex: 2 }}><Button title="Save entry" onPress={save} loading={pending} disabled={!journalCanSave(form, entry)} /></View>
        </View>
      </Card>
      <Txt variant="small" muted>RECENT ENTRIES</Txt>
      {past.length === 0 ? <EmptyState title="No other entries yet" description="Short daily notes build a useful record over time." /> : past.map((e) => (
        <Card key={e.id}><Txt variant="small" muted>{fmtDay(e.entry_date, 'EEE, d MMM')}</Txt><Text numberOfLines={3} style={{ color: colors.foreground }}>{e.content || e.wins || '—'}</Text></Card>
      ))}
    </View>
  )
}
