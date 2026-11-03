import { useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { fmtDateTime, fmtDay, dateStrInTz, paiseToLpa, uid } from '@lifetrack/utils'
import { DEFAULT_PREP, JOB_STATUSES, STATUS_LABEL, applicationEvents, applicationHistory, interviewTone, prepProgress, statusTone } from '@lifetrack/core/jobs'
import { api, store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet, afterSheetClose } from '../../ui/Sheet'
import { confirm } from '../../ui/confirm'
import { Badge, Chip, ProgressBar } from '../../ui/controls'
import { Button, Field, Txt } from '../../ui'

export const StatusBadge = ({ status }: { status: string }) => <Badge tone={statusTone(status) as any}>{(STATUS_LABEL as any)[status]}</Badge>

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  )
}

export function ApplicationDetail({ app, history, events, tz, today, onClose, onEdit, onSchedule, onEditInterview }: { app: any | null; history: any[]; events: any[]; tz: string; today: string; onClose: () => void; onEdit: (a: any) => void; onSchedule: (appId: string) => void; onEditInterview: (e: any) => void }) {
  const { colors } = useTheme()
  const [newItem, setNewItem] = useState('')
  const [move, moving] = useAction((s: string) => api.setApplicationStatus(app, s, today))
  const [del] = useAction(async () => { await store.remove('job_applications', app.id); onClose() })
  const [savePrep] = useAction((list: any[]) => store.update('job_applications', app.id, { prep_checklist: list }))
  const [delEvent] = useAction((id: string) => store.remove('interview_events', id))
  if (!app) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>
  const checklist: any[] = app.prep_checklist ?? []
  const prep = prepProgress(checklist)
  const hist = applicationHistory(app.id, history) as any[]
  const evs = applicationEvents(app.id, events) as any[]
  const facts = [['Location', app.location], ['Package', app.salary_paise != null ? `${paiseToLpa(app.salary_paise)} LPA` : ''], ['Applied', app.applied_date && fmtDay(app.applied_date, 'd MMM yyyy')], ['Source', app.source], ['Contact', app.contact_person], ['Follow-up', app.followup_date && fmtDay(app.followup_date, 'd MMM yyyy')], ['Resume', app.resume_version]].filter(([, v]) => v)
  return (
    <Sheet visible title={app.company} onClose={onClose}>
      <Txt muted>{app.job_title}</Txt>
      <Section title="Status">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {JOB_STATUSES.map((s: string) => <Chip key={s} label={(STATUS_LABEL as any)[s]} selected={app.status === s} onPress={() => { if (!moving && app.status !== s) move(s) }} />)}
        </View>
      </Section>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 100 }}><Button title="Edit" variant="ghost" onPress={() => { onClose(); afterSheetClose(() => onEdit(app)) }} /></View>
        {app.jd_url ? <View style={{ flex: 1, minWidth: 100 }}><Button title="Job post" variant="ghost" onPress={() => Linking.openURL(app.jd_url).catch(() => {})} /></View> : null}
        <View style={{ flex: 1, minWidth: 100 }}><Button title="Delete" variant="danger" onPress={async () => { if (await confirm(`Delete ${app.company}?`, 'This also deletes its status history and interviews.')) del() }} /></View>
      </View>
      {facts.length ? <View style={{ gap: 6 }}>{facts.map(([k, v]) => <View key={k as string} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="small" muted>{k}</Txt><Txt variant="small">{v}</Txt></View>)}</View> : null}
      {app.notes ? <View style={{ backgroundColor: colors.muted, borderRadius: 8, padding: 12 }}><Txt>{app.notes}</Txt></View> : null}

      <Section title="Interviews" action={<Button title="＋ Schedule" variant="ghost" onPress={() => { onClose(); afterSheetClose(() => onSchedule(app.id)) }} />}>
        {evs.length === 0 ? <Txt muted>No interviews scheduled.</Txt> : evs.map((e) => (
          <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit interview ${e.round_name}`} onPress={() => { onClose(); afterSheetClose(() => onEditInterview(e)) }} style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontWeight: '600' }}>{e.round_name}</Text>
              <Txt variant="small" muted>{fmtDateTime(e.scheduled_at, tz)} · {e.mode}</Txt>
            </Pressable>
            <Badge tone={interviewTone(e.status) as any}>{e.status}</Badge>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove interview ${e.round_name}`} onPress={async () => { if (await confirm('Remove this interview?')) delEvent(e.id) }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </Section>

      <Section title={`Preparation${checklist.length ? ` (${prep.done}/${prep.total} · ${prep.percent}%)` : ''}`} action={checklist.length === 0 ? <Button title="Use template" variant="ghost" onPress={() => savePrep((DEFAULT_PREP as string[]).map((text) => ({ id: uid(), text, done: false })))} /> : undefined}>
        {checklist.length ? <ProgressBar value={prep.percent} label="Preparation progress" /> : null}
        {checklist.map((i) => (
          <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: i.done }} accessibilityLabel={i.text} onPress={() => savePrep(checklist.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))} style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: i.done ? colors.success : colors.mutedForeground, backgroundColor: i.done ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{i.done ? <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text> : null}</View>
              <Text style={{ flex: 1, color: i.done ? colors.mutedForeground : colors.foreground, textDecorationLine: i.done ? 'line-through' : 'none' }}>{i.text}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${i.text}`} onPress={() => savePrep(checklist.filter((x) => x.id !== i.id))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.mutedForeground, fontSize: 16 }}>✕</Text></Pressable>
          </View>
        ))}
        <Field label="New prep item" value={newItem} onChangeText={setNewItem} placeholder="Add a prep item" returnKeyType="done" onSubmitEditing={() => { const t = newItem.trim(); if (t) { savePrep([...checklist, { id: uid(), text: t, done: false }]); setNewItem('') } }} />
      </Section>

      <Section title="Status history">
        {hist.length === 0 ? <Txt muted>History is recorded automatically from now on.</Txt> : hist.map((h) => (
          <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {h.from_status ? <><StatusBadge status={h.from_status} /><Text style={{ color: colors.mutedForeground }}>→</Text></> : <Txt variant="small" muted>Created as</Txt>}
            <StatusBadge status={h.to_status} />
            <Txt variant="small" muted>{fmtDay(dateStrInTz(h.changed_at, tz), 'd MMM yyyy')}</Txt>
          </View>
        ))}
      </Section>
    </Sheet>
  )
}
