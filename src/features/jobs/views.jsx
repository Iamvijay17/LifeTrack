import { useState } from 'react'
import { Bell, Calendar, ChevronLeft, ChevronRight, ExternalLink, MapPin, MoveRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { StatusBadge } from './ApplicationDetail'
import { JOB_STATUSES, STATUS_LABEL } from '@/domain/jobs'
import { addDays, addMonths, dateStrInTz, eachDay, fmtDay, fmtDateTime, monthEnd, monthStart, startOfWeek, weekday } from '@/lib/dates'
import { paiseToLpa } from '@/lib/money'
import { setApplicationStatus } from '@/services/api'
import { useAction } from '@/hooks/useAction'
import { cn } from '@/lib/utils'

const lpa = (p) => (p != null ? `${paiseToLpa(p)} LPA` : null)

function MoveMenu({ app, today }) {
  const [move] = useAction((s) => setApplicationStatus(app, s, today), { success: 'Status updated' })
  return <Menu label={`Move ${app.company}`} trigger={<span className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"><MoveRight className="h-3 w-3" />Move</span>} items={JOB_STATUSES.filter((s) => s !== app.status).map((s) => ({ label: STATUS_LABEL[s], onClick: () => move(s) }))} />
}

function AppCard({ app, today, onOpen }) {
  const overdue = app.followup_date && app.followup_date <= today && !['selected', 'rejected', 'withdrawn'].includes(app.status)
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', app.id); e.dataTransfer.effectAllowed = 'move' }}
      className="cursor-grab rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-muted-foreground/50 active:cursor-grabbing" data-testid="app-card">
      <button type="button" onClick={() => onOpen(app)} className="block w-full text-left">
        <p className="truncate text-sm font-medium">{app.company}</p>
        <p className="truncate text-xs text-muted-foreground">{app.job_title}</p>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {app.location && <Badge><MapPin className="h-3 w-3" />{app.location}</Badge>}
        {lpa(app.salary_paise) && <Badge tone="success">{lpa(app.salary_paise)}</Badge>}
        {overdue && <Badge tone="warning"><Bell className="h-3 w-3" />Follow up</Badge>}
      </div>
      <div className="mt-1 flex justify-end"><MoveMenu app={app} today={today} /></div>
    </div>
  )
}

export function Board({ apps, today, onOpen, onAdd }) {
  const [over, setOver] = useState(null)
  const [move] = useAction((app, s) => setApplicationStatus(app, s, today), { success: 'Status updated' })
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
      {JOB_STATUSES.map((s) => {
        const items = apps.filter((a) => a.status === s)
        return (
          <div key={s} data-testid={`col-${s}`} onDragOver={(e) => { e.preventDefault(); setOver(s) }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const app = apps.find((a) => a.id === e.dataTransfer.getData('text/plain')); if (app && app.status !== s) move(app, s) }}
            className={cn('w-64 shrink-0 snap-start rounded-lg border border-border bg-card/50 p-2 transition-colors', over === s && 'border-primary bg-primary/5')}>
            <div className="mb-2 flex items-center justify-between px-1"><StatusBadge status={s} /><span className="text-xs text-muted-foreground">{items.length}</span></div>
            <div className="space-y-2">
              {items.map((a) => <AppCard key={a.id} app={a} today={today} onOpen={onOpen} />)}
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Drop here</p>}
            </div>
            {(s === 'interested' || s === 'applied') && <Button variant="ghost" size="sm" className="mt-2 w-full text-muted-foreground" onClick={() => onAdd(s)}>+ Add</Button>}
          </div>)
      })}
    </div>
  )
}

export function JobsTable({ apps, today, onOpen }) {
  return (
    <>
      <Card className="hidden overflow-hidden md:block"><table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr>{['Company', 'Role', 'Status', 'Applied', 'Package', 'Follow-up', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody>{apps.map((a) => (
          <tr key={a.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30" onClick={() => onOpen(a)}>
            <td className="px-4 py-2.5 font-medium">{a.company}</td><td className="px-4 py-2.5 text-muted-foreground">{a.job_title}</td><td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
            <td className="px-4 py-2.5 text-muted-foreground">{a.applied_date ? fmtDay(a.applied_date, 'd MMM') : '—'}</td><td className="px-4 py-2.5 text-muted-foreground">{lpa(a.salary_paise) ?? '—'}</td>
            <td className={cn('px-4 py-2.5', a.followup_date && a.followup_date <= today && 'text-warning')}>{a.followup_date ? fmtDay(a.followup_date, 'd MMM') : '—'}</td>
            <td className="px-2" onClick={(e) => e.stopPropagation()}><MoveMenu app={a} today={today} /></td>
          </tr>))}</tbody>
      </table></Card>
      <div className="space-y-2 md:hidden">{apps.map((a) => (
        <Card key={a.id}><CardContent className="p-3">
          <button className="block w-full text-left" onClick={() => onOpen(a)}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{a.company}</p><p className="truncate text-xs text-muted-foreground">{a.job_title}</p></div><StatusBadge status={a.status} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{[a.applied_date && `Applied ${fmtDay(a.applied_date, 'd MMM')}`, lpa(a.salary_paise), a.location].filter(Boolean).join(' · ')}</p>
          </button>
          <div className="mt-1 flex justify-end"><MoveMenu app={a} today={today} /></div>
        </CardContent></Card>))}</div>
    </>
  )
}

export function Reminders({ followups, upcoming, tz, onOpen }) {
  if (!followups.length && !upcoming.length) return null
  return (
    <Card className="border-warning/30"><CardContent className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium"><Bell className="h-4 w-4 text-warning" />Reminders</p>
      <ul className="space-y-1 text-sm">
        {followups.map((a) => <li key={a.id}><button className="text-left hover:underline" onClick={() => onOpen(a)}>Follow up with <b>{a.company}</b> <span className="text-muted-foreground">({fmtDay(a.followup_date, 'd MMM')})</span></button></li>)}
        {upcoming.map((e) => <li key={e.id}><button className="text-left hover:underline" onClick={() => onOpen(e.app)}>Interview: <b>{e.app?.company}</b> · {e.round_name} <span className="text-muted-foreground">({fmtDateTime(e.scheduled_at, tz)})</span></button></li>)}
      </ul>
    </CardContent></Card>
  )
}

export function InterviewCalendar({ events, apps, tz, today, weekStartsOn, onOpen, onEditEvent }) {
  const [month, setMonth] = useState(monthStart(today))
  const [sel, setSel] = useState(today)
  const from = startOfWeek(month, weekStartsOn)
  const to = addDays(startOfWeek(monthEnd(month), weekStartsOn), 6)
  const byDay = new Map()
  for (const e of events) { const d = dateStrInTz(e.scheduled_at, tz); byDay.set(d, [...(byDay.get(d) ?? []), e]) }
  const heads = Array.from({ length: 7 }, (_, i) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][(weekStartsOn + i) % 7])
  const dayEvents = (byDay.get(sel) ?? []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const upcoming = events.filter((e) => e.status === 'scheduled' && e.scheduled_at >= new Date().toISOString()).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 6)
  const appOf = (e) => apps.find((a) => a.id === e.application_id)
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3"><CardContent>
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="text-sm font-medium">{fmtDay(month, 'MMMM yyyy')}</p>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">{heads.map((h, i) => <span key={i}>{h}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">{eachDay(from, to).map((d) => {
          const n = byDay.get(d)?.length ?? 0
          return (<button key={d} onClick={() => setSel(d)} aria-label={`${fmtDay(d, 'd MMMM')}${n ? `, ${n} interview${n > 1 ? 's' : ''}` : ''}`}
            className={cn('relative aspect-square rounded-md text-sm transition-colors hover:bg-muted', d.slice(0, 7) !== month.slice(0, 7) && 'text-muted-foreground/40', d === today && 'font-semibold text-secondary', sel === d && 'bg-primary/20 ring-1 ring-primary')}>
            {Number(d.slice(8))}{n > 0 && <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />}</button>)
        })}</div>
      </CardContent></Card>
      <div className="space-y-4 lg:col-span-2">
        <Card><CardContent className="space-y-2"><p className="text-sm font-medium">{fmtDay(sel, 'EEEE, d MMM')}</p>
          {dayEvents.length === 0 ? <p className="text-sm text-muted-foreground">No interviews.</p> : dayEvents.map((e) => (
            <button key={e.id} className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40" onClick={() => onEditEvent(e)}>
              <span><b>{appOf(e)?.company}</b> · {e.round_name}<br /><span className="text-xs text-muted-foreground">{fmtDateTime(e.scheduled_at, tz)} · {e.mode}</span></span>
              <Badge tone={e.status === 'completed' ? 'success' : e.status === 'cancelled' ? 'neutral' : 'primary'}>{e.status}</Badge></button>))}
        </CardContent></Card>
        <Card><CardContent className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium"><Calendar className="h-4 w-4" />Upcoming</p>
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled.</p> : upcoming.map((e) => <button key={e.id} className="block w-full text-left text-sm hover:underline" onClick={() => appOf(e) && onOpen(appOf(e))}>{appOf(e)?.company} · {e.round_name}<span className="block text-xs text-muted-foreground">{fmtDateTime(e.scheduled_at, tz)}</span></button>)}
        </CardContent></Card>
      </div>
    </div>
  )
}
