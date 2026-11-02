import { useEffect, useState } from 'react'
import { Smile, Meh, Frown, Laugh, Angry } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/form'
import { EmptyState } from '@/components/shared/states'
import { useTable } from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { CONFLICT_KEYS } from '@lifetrack/constants/schema'
import { fmtDay } from '@/lib/dates'
import { JOURNAL_MOODS, journalCanSave, journalDirty, journalDraft } from '@lifetrack/core/notes'
import { cn } from '@/lib/utils'

const MOOD_ICON = { 1: Angry, 2: Frown, 3: Meh, 4: Smile, 5: Laugh }
const MOODS = JOURNAL_MOODS.map((m) => [m.value, MOOD_ICON[m.value], m.label])

export function Journal({ date }) {
  const { rows } = useTable('journal_entries')
  const entry = rows.find((r) => r.entry_date === date)
  const [form, setForm] = useState(journalDraft(null))
  const dirty = journalDirty(form, entry)
  useEffect(() => { setForm(journalDraft(entry)) }, [date, entry?.id, entry?.updated_at])

  const [save, pending] = useAction(() => store.upsert('journal_entries', { entry_date: date, ...form }, { onConflict: CONFLICT_KEYS.journal_entries }), { success: 'Journal saved' })
  const [clear] = useAction(() => store.remove('journal_entries', entry.id), { success: 'Entry deleted' })
  const past = [...rows].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).filter((r) => r.entry_date !== date).slice(0, 8)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3"><CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-[13px] font-medium">How was {fmtDay(date, 'EEEE')}?</p>
          <div className="flex gap-2">{MOODS.map(([v, Icon, label]) => (
            <button key={v} type="button" aria-pressed={form.mood === v} onClick={() => setForm((f) => ({ ...f, mood: f.mood === v ? null : v }))}
              className={cn('flex flex-1 flex-col items-center gap-1 rounded-md border border-border py-2 text-[11px] text-muted-foreground', form.mood === v && 'border-primary bg-primary/15 text-secondary')}>
              <Icon className="h-5 w-5" />{label}</button>))}</div>
        </div>
        <Field label="Reflection"><Textarea rows={6} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="What happened? What did you learn?" /></Field>
        <Field label="Wins"><Textarea rows={2} value={form.wins} onChange={(e) => setForm((f) => ({ ...f, wins: e.target.value }))} placeholder="Small or big — what went well?" /></Field>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{dirty ? 'Unsaved changes' : entry ? 'Saved' : ''}</span>
          <div className="flex gap-2">
            {entry && <Button variant="ghost" onClick={clear}>Delete</Button>}
            <Button onClick={save} loading={pending} disabled={!journalCanSave(form, entry)}>Save entry</Button>
          </div>
        </div>
      </CardContent></Card>
      <div className="space-y-2 lg:col-span-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent entries</h3>
        {past.length === 0 ? <EmptyState title="No other entries yet" description="Short daily notes build a useful record over time." /> : past.map((e) => (
          <Card key={e.id}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{fmtDay(e.entry_date, 'EEE, d MMM')}</p><p className="mt-1 line-clamp-3 text-sm">{e.content || e.wins || '—'}</p></CardContent></Card>
        ))}
      </div>
    </div>
  )
}
