import { useState } from 'react'
import { ArrowRight, CalendarPlus, ExternalLink, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { useConfirm } from '@/components/shared/Confirm'
import { STATUS_LABEL, JOB_STATUSES, DEFAULT_PREP } from '@/domain/jobs'
import { fmtDay, fmtDateTime } from '@/lib/dates'
import { dateStrInTz } from '@/lib/dates'
import { uid, pct } from '@/lib/utils'
import { paiseToLpa } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { setApplicationStatus } from '@/services/api'

const TONE = { selected: 'success', rejected: 'danger', withdrawn: 'neutral', interview: 'primary', assessment: 'warning' }
export const StatusBadge = ({ status }) => <Badge tone={TONE[status] ?? 'neutral'}>{STATUS_LABEL[status]}</Badge>

function Section({ title, icon: Icon, action, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" />}{title}</h3>{action}</div>
      {children}
    </section>
  )
}

export function ApplicationDetail({ app, history, events, tz, today, onClose, onEdit, onScheduleInterview, onEditInterview }) {
  const confirm = useConfirm()
  const [newItem, setNewItem] = useState('')
  const [move, moving] = useAction((s) => setApplicationStatus(app, s, today), { success: 'Status updated' })
  const [del] = useAction(async () => { await store.remove('job_applications', app.id); onClose() }, { success: 'Application deleted' })
  const [savePrep] = useAction((list) => store.update('job_applications', app.id, { prep_checklist: list }))
  const [delEvent] = useAction((id) => store.remove('interview_events', id), { success: 'Interview removed' })
  if (!app) return null
  const checklist = app.prep_checklist ?? []
  const doneCount = checklist.filter((i) => i.done).length
  const hist = history.filter((h) => h.application_id === app.id).sort((a, b) => a.changed_at.localeCompare(b.changed_at))
  const evs = events.filter((e) => e.application_id === app.id).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${app.company}`} description={app.job_title} className="md:max-w-2xl">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Status" className="h-9 w-40 md:h-9" disabled={moving} value={app.status} onChange={(e) => move(e.target.value)}>{JOB_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
          <Button variant="outline" size="sm" onClick={() => onEdit(app)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
          {app.jd_url && <a href={app.jd_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] hover:bg-muted/60"><ExternalLink className="h-3.5 w-3.5" />Job post</a>}
          <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={async () => { if (await confirm({ title: `Delete ${app.company}?`, description: 'This also deletes its status history and interviews.' })) del() }}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {[['Location', app.location], ['Package', app.salary_paise != null ? `${paiseToLpa(app.salary_paise)} LPA` : ''], ['Applied', app.applied_date && fmtDay(app.applied_date, 'd MMM yyyy')], ['Source', app.source], ['Contact', app.contact_person], ['Follow-up', app.followup_date && fmtDay(app.followup_date, 'd MMM yyyy')], ['Resume', app.resume_version]]
            .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {app.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{app.notes}</p>}

        <Section title="Interviews" icon={CalendarPlus} action={<Button variant="ghost" size="sm" onClick={() => onScheduleInterview(app.id)}><Plus className="h-3.5 w-3.5" />Schedule</Button>}>
          {evs.length === 0 ? <p className="text-sm text-muted-foreground">No interviews scheduled.</p> : <ul className="space-y-1.5">{evs.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{e.round_name}</p><p className="text-xs text-muted-foreground">{fmtDateTime(e.scheduled_at, tz)} · {e.mode}</p></div>
              <Badge tone={e.status === 'completed' ? 'success' : e.status === 'cancelled' ? 'neutral' : 'primary'}>{e.status}</Badge>
              <button aria-label="Edit interview" className="text-muted-foreground hover:text-foreground" onClick={() => onEditInterview(e)}><Pencil className="h-3.5 w-3.5" /></button>
              <button aria-label="Remove interview" className="text-muted-foreground hover:text-danger" onClick={async () => { if (await confirm({ title: 'Remove this interview?' })) delEvent(e.id) }}><X className="h-4 w-4" /></button>
            </li>))}</ul>}
        </Section>

        <Section title={`Preparation ${checklist.length ? `(${doneCount}/${checklist.length} · ${pct(doneCount, checklist.length)}%)` : ''}`} icon={ListChecks}
          action={checklist.length === 0 && <Button variant="ghost" size="sm" onClick={() => savePrep(DEFAULT_PREP.map((text) => ({ id: uid(), text, done: false })))}>Use template</Button>}>
          <ul className="space-y-1">{checklist.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <Checkbox checked={i.done} label={<span className={i.done ? 'text-muted-foreground line-through' : ''}>{i.text}</span>} onChange={(v) => savePrep(checklist.map((x) => (x.id === i.id ? { ...x, done: v } : x)))} />
              <button aria-label={`Remove ${i.text}`} className="text-muted-foreground hover:text-danger" onClick={() => savePrep(checklist.filter((x) => x.id !== i.id))}><X className="h-3.5 w-3.5" /></button>
            </li>))}</ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = newItem.trim(); if (t) { savePrep([...checklist, { id: uid(), text: t, done: false }]); setNewItem('') } }}>
            <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a prep item" aria-label="New prep item" /><Button type="submit" variant="outline">Add</Button>
          </form>
        </Section>

        <Section title="Status history">
          <ol className="space-y-1.5 border-l border-border pl-4">{hist.map((h) => (
            <li key={h.id} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
              <span className="flex flex-wrap items-center gap-1.5">{h.from_status ? <><StatusBadge status={h.from_status} /><ArrowRight className="h-3 w-3 text-muted-foreground" /></> : <span className="text-xs text-muted-foreground">Created as</span>}<StatusBadge status={h.to_status} /></span>
              <span className="text-xs text-muted-foreground">{fmtDay(dateStrInTz(h.changed_at, tz), 'd MMM yyyy')}</span></li>))}
            {hist.length === 0 && <li className="text-sm text-muted-foreground">History is recorded automatically from now on.</li>}</ol>
        </Section>
      </div>
    </Dialog>
  )
}
