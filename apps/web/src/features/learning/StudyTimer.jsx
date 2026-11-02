import { useState } from 'react'
import { AlertTriangle, Pause, Play, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormDialog } from '@/components/shared/FormDialog'
import { useConfirm } from '@/components/shared/Confirm'
import { useNow } from '@/hooks/useNow'
import { useAction } from '@/hooks/useAction'
import { startStudy, stopStudy, discardStudy } from '@/services/api'
import { elapsedSeconds, fmtHms, MAX_REASONABLE_TIMER_SECONDS, parseStudyTarget } from '@lifetrack/core/learning'
import { fmtDuration } from '@/lib/dates'

const clock = fmtHms

export function TargetSelect({ goals, topics, value, onChange }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="What are you studying?">
      <option value="">No specific goal / topic</option>
      {goals.filter((g) => g.status === 'active').length > 0 && <optgroup label="Goals">{goals.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={`g:${g.id}`}>{g.title}</option>)}</optgroup>}
      {[...new Set(topics.map((t) => t.group_name))].map((grp) => (
        <optgroup key={grp} label={grp}>{topics.filter((t) => t.group_name === grp && !t.archived).map((t) => <option key={t.id} value={`t:${t.id}`}>{t.name}</option>)}</optgroup>
      ))}
    </Select>
  )
}
export const parseTarget = parseStudyTarget

export function StudyTimer({ running, goals, topics, today }) {
  const confirm = useConfirm()
  const now = useNow(1000, !!running)
  const [target, setTarget] = useState('')
  const [stopOpen, setStopOpen] = useState(false)
  const [form, setForm] = useState({ minutes: '', problems: '0', notes: '' })
  const [start, starting] = useAction(() => startStudy(parseTarget(target, goals), today), { success: 'Timer started' })
  const [discard] = useAction(() => discardStudy(running), { success: 'Timer discarded — no time counted' })
  const [stop, stopping] = useAction(async () => {
    const mins = Number(form.minutes)
    await stopStudy(running, { minutes: Number.isFinite(mins) ? mins : undefined, problems_solved: Math.max(0, Math.floor(Number(form.problems) || 0)), notes: form.notes })
    setStopOpen(false)
  }, { success: 'Session saved' })

  const elapsed = running ? elapsedSeconds(running, now) : 0
  const stale = elapsed > MAX_REASONABLE_TIMER_SECONDS
  const label = running ? (goals.find((g) => g.id === running.goal_id)?.title ?? topics.find((t) => t.id === running.topic_id)?.name ?? 'Study session') : ''
  const submit = (e) => { e.preventDefault(); stop() }
  const minutesOver = Number(form.minutes) > elapsed / 60 + 0.5

  return (
    <Card className={running ? 'border-primary/50' : undefined}>
      <CardContent className="space-y-3">
        {running ? (<>
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium text-muted-foreground">Studying now</p><p className="text-sm font-medium">{label}</p></div>
            <span className="flex items-center gap-1.5 text-xs text-success"><span className="h-2 w-2 animate-pulse rounded-full bg-success" />Running on all devices</span>
          </div>
          <p className="text-center text-5xl font-semibold tabular-nums tracking-tight" aria-live="off" data-testid="timer-clock">{clock(elapsed)}</p>
          {stale && <p role="alert" className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-xs text-warning"><AlertTriangle className="h-4 w-4 shrink-0" />This timer has been running for over 12 hours. If you forgot to stop it, stop and enter the real minutes — only what you confirm is counted.</p>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { setForm({ minutes: String(Math.max(0, Math.round(elapsed / 60))), problems: '0', notes: '' }); setStopOpen(true) }}><Pause className="h-4 w-4" />Stop & save</Button>
            <Button variant="outline" aria-label="Discard timer" onClick={async () => { if (await confirm({ title: 'Discard this timer?', description: 'The time will NOT be counted as study time.', confirmLabel: 'Discard' })) discard() }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </>) : (<>
          <p className="text-sm font-medium">Start a study session</p>
          <TargetSelect goals={goals} topics={topics} value={target} onChange={setTarget} />
          <Button className="w-full" onClick={start} loading={starting}><Play className="h-4 w-4" />Start timer</Button>
          <p className="text-xs text-muted-foreground">Only sessions you stop and save count as study time.</p>
        </>)}
      </CardContent>
      <FormDialog open={stopOpen} onOpenChange={setStopOpen} title="Save study session" description={`Elapsed: ${fmtDuration(elapsed / 60)}`} pending={stopping} onSubmit={submit} submitLabel="Save session">
        <Field label="Minutes studied" hint="Adjust down if you took breaks. It can't exceed the elapsed time." error={minutesOver ? 'Capped at the elapsed time' : undefined}>
          <Input type="number" min={0} inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
        </Field>
        <Field label="Problems solved (DSA)"><Input type="number" min={0} inputMode="numeric" value={form.problems} onChange={(e) => setForm({ ...form, problems: e.target.value })} /></Field>
        <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What did you cover?" /></Field>
      </FormDialog>
    </Card>
  )
}
