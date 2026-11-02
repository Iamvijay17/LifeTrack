import { useState } from 'react'
import { Text, View } from 'react-native'
import { elapsedSeconds, fmtHms, MAX_REASONABLE_TIMER_SECONDS, parseStudyTarget } from '@lifetrack/core/learning'
import { fmtDuration } from '@lifetrack/utils'
import { api } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useNow } from '../../hooks/useNow'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { confirm } from '../../ui/confirm'
import { SelectField, type SelectOption } from '../../ui/controls'
import { Button, Card, Field, Txt } from '../../ui'

export function studyTargetOptions(goals: any[], topics: any[]): SelectOption[] {
  const out: SelectOption[] = [{ value: '', label: 'No specific goal / topic' }]
  for (const g of goals.filter((x) => x.status === 'active')) out.push({ value: `g:${g.id}`, label: g.title, group: 'Goals' })
  for (const t of topics.filter((x) => !x.archived)) out.push({ value: `t:${t.id}`, label: t.name, group: t.group_name })
  return out
}

/** Study timer backed by the database (one running timer per user, visible on every device). */
export function StudyTimer({ running, goals, topics, today }: { running: any | null; goals: any[]; topics: any[]; today: string }) {
  const { colors } = useTheme()
  const now = useNow(1000, !!running)
  const [target, setTarget] = useState('')
  const [stopOpen, setStopOpen] = useState(false)
  const [form, setForm] = useState({ minutes: '', problems: '0', notes: '' })
  const [start, starting] = useAction(() => api.startStudy(parseStudyTarget(target, goals), today))
  const [discard] = useAction(() => api.discardStudy(running))
  const [stop, stopping] = useAction(async () => {
    const mins = Number(form.minutes)
    await api.stopStudy(running, { minutes: Number.isFinite(mins) ? mins : undefined, problems_solved: Math.max(0, Math.floor(Number(form.problems) || 0)), notes: form.notes })
    setStopOpen(false)
  })

  const elapsed = running ? elapsedSeconds(running, now) : 0
  const stale = elapsed > MAX_REASONABLE_TIMER_SECONDS
  const label = running ? (goals.find((g) => g.id === running.goal_id)?.title ?? topics.find((t) => t.id === running.topic_id)?.name ?? 'Study session') : ''
  const over = Number(form.minutes) > elapsed / 60 + 0.5
  return (
    <Card>
      {running ? (
        <View style={{ gap: 12 }}>
          <Txt variant="small" muted>Studying now · running on all devices</Txt>
          <Txt variant="heading">{label}</Txt>
          <Text accessibilityRole="timer" accessibilityLabel={`Elapsed ${fmtDuration(elapsed / 60)}`} style={{ color: colors.foreground, fontSize: 44, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{fmtHms(elapsed)}</Text>
          {stale ? <Text accessibilityRole="alert" style={{ color: colors.warning }}>This timer has been running for over 12 hours. If you forgot to stop it, stop and enter the real minutes — only what you confirm is counted.</Text> : null}
          <Button title="Stop & save" onPress={() => { setForm({ minutes: String(Math.max(0, Math.round(elapsed / 60))), problems: '0', notes: '' }); setStopOpen(true) }} />
          <Button title="Discard timer" variant="ghost" onPress={async () => { if (await confirm('Discard this timer?', 'The time will NOT be counted as study time.', 'Discard')) discard() }} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Txt variant="heading">Start a study session</Txt>
          <SelectField label="What are you studying?" value={target} options={studyTargetOptions(goals, topics)} onChange={setTarget} />
          <Button title="Start timer" onPress={start} loading={starting} />
          <Txt variant="small" muted>Only sessions you stop and save count as study time.</Txt>
        </View>
      )}
      <Sheet visible={stopOpen} title="Save study session" onClose={() => setStopOpen(false)} footer={<Button title="Save session" onPress={stop} loading={stopping} />}>
        <Txt muted>Elapsed: {fmtDuration(elapsed / 60)}</Txt>
        <Field label="Minutes studied" value={form.minutes} onChangeText={(t) => setForm({ ...form, minutes: t })} keyboardType="number-pad" error={over ? 'Capped at the elapsed time' : undefined} />
        <Field label="Problems solved (DSA)" value={form.problems} onChangeText={(t) => setForm({ ...form, problems: t })} keyboardType="number-pad" />
        <Field label="Notes" value={form.notes} onChangeText={(t) => setForm({ ...form, notes: t })} placeholder="What did you cover?" multiline style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
      </Sheet>
    </Card>
  )
}
