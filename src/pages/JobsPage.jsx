import { useMemo, useState } from 'react'
import { Briefcase, CalendarPlus, Plus, Search, Send, TrendingUp, Trophy, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { ApplicationDialog, InterviewDialog } from '@/features/jobs/dialogs'
import { ApplicationDetail } from '@/features/jobs/ApplicationDetail'
import { Board, JobsTable, Reminders, InterviewCalendar } from '@/features/jobs/views'
import { WeeklyApplicationsChart, SalaryChart } from '@/features/analytics/JobCharts'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { dueFollowups, funnel, JOB_STATUSES, STATUS_LABEL } from '@/domain/jobs'
import { addDays, startOfWeek } from '@/lib/dates'

export default function JobsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const tz = settings.timezone, w = settings.week_starts_on
  const { data, loading, error, refetch } = useTables('job_applications', 'application_history', 'interview_events')
  const [view, setView] = useState('board')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [appDlg, setAppDlg] = useState({ open: false, app: null, status: 'interested' })
  const [intDlg, setIntDlg] = useState({ open: false, event: null, appId: null })
  const [openId, setOpenId] = useState(null)

  const apps = data.job_applications
  const detail = apps.find((a) => a.id === openId) ?? null
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return apps.filter((a) => (!status || a.status === status) && (!source || a.source === source) && (!s || [a.company, a.job_title, a.location, a.notes, a.contact_person].some((x) => x?.toLowerCase().includes(s))))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [apps, q, status, source])
  const sources = [...new Set(apps.map((a) => a.source).filter(Boolean))]

  const weekStart = startOfWeek(today, w)
  const thisWeek = apps.filter((a) => a.applied_date && a.applied_date >= weekStart && a.applied_date <= addDays(weekStart, 6)).length
  const f = funnel(apps, data.application_history, data.interview_events, '0000-01-01', '9999-12-31')
  const active = apps.filter((a) => ['interested', 'preparing', 'applied', 'assessment', 'interview'].includes(a.status)).length
  const now = new Date().toISOString(), soon = new Date(Date.now() + 7 * 864e5).toISOString()
  const upcoming = data.interview_events.filter((e) => e.status === 'scheduled' && e.scheduled_at >= now && e.scheduled_at <= soon).map((e) => ({ ...e, app: apps.find((a) => a.id === e.application_id) })).filter((e) => e.app)
  const followups = dueFollowups(apps, today)
  const scheduleFor = (appId) => setIntDlg({ open: true, event: null, appId })

  return (
    <>
      <PageHeader title="Job Switch" description="Every application, interview and status change in one place."
        actions={<><Button variant="outline" onClick={() => scheduleFor(null)} disabled={apps.length === 0}><CalendarPlus className="h-4 w-4" />Interview</Button><Button onClick={() => setAppDlg({ open: true, app: null, status: 'interested' })}><Plus className="h-4 w-4" />Application</Button></>} />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Send} label="Applied this week" value={thisWeek} sub={`${f.applied} all time`} />
            <StatCard icon={Briefcase} label="Active pipeline" value={active} sub={`${apps.length} total tracked`} />
            <StatCard icon={Users} label="Interview rate" value={f.conversion == null ? '—' : `${Math.round(f.conversion * 100)}%`} sub={`${f.interviews} of ${f.applied} applied`} />
            <StatCard icon={Trophy} label="Offers" value={f.offers} sub={`${f.rejections} rejections`} />
          </div>
          <Reminders followups={followups} upcoming={upcoming} tz={tz} onOpen={(a) => setOpenId(a.id)} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented value={view} onChange={setView} options={[{ value: 'board', label: 'Board' }, { value: 'table', label: 'Table' }, { value: 'calendar', label: 'Interviews' }, { value: 'insights', label: 'Insights' }]} />
            {(view === 'board' || view === 'table') && (
              <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                <div className="relative min-w-40 max-w-xs flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" placeholder="Search…" aria-label="Search applications" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                {view === 'table' && <Select aria-label="Filter by status" className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{JOB_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>}
                {sources.length > 0 && <Select aria-label="Filter by source" className="w-36" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</Select>}
              </div>)}
          </div>

          {apps.length === 0 && view !== 'calendar' && view !== 'insights' ? (
            <EmptyState icon={Briefcase} title="No applications yet" description="Add the roles you're interested in and move them across the board as they progress. Status history is kept automatically." action={<Button onClick={() => setAppDlg({ open: true, app: null, status: 'interested' })}>Add your first application</Button>} />
          ) : view === 'board' ? <Board apps={filtered} today={today} onOpen={(a) => setOpenId(a.id)} onAdd={(s) => setAppDlg({ open: true, app: null, status: s })} />
          : view === 'table' ? (filtered.length ? <JobsTable apps={filtered} today={today} onOpen={(a) => setOpenId(a.id)} /> : <EmptyState title="No matches" description="Try clearing the search or filters." />)
          : view === 'calendar' ? <InterviewCalendar events={data.interview_events} apps={apps} tz={tz} today={today} weekStartsOn={w} onOpen={(a) => setOpenId(a.id)} onEditEvent={(e) => setIntDlg({ open: true, event: e, appId: e.application_id })} />
          : (<div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>Applications per week</CardTitle></CardHeader><CardContent><WeeklyApplicationsChart apps={apps} today={today} weekStartsOn={w} /></CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Package progression</CardTitle></CardHeader><CardContent><SalaryChart apps={apps} tz={tz} /></CardContent></Card>
            </div>)}
        </div>
      </DataGate>

      <ApplicationDialog open={appDlg.open} app={appDlg.app} defaultStatus={appDlg.status} today={today} onOpenChange={(o) => setAppDlg((d) => ({ ...d, open: o }))} />
      <InterviewDialog open={intDlg.open} event={intDlg.event} applicationId={intDlg.appId} apps={apps} tz={tz} today={today} onOpenChange={(o) => setIntDlg((d) => ({ ...d, open: o }))} />
      {detail && <ApplicationDetail app={detail} history={data.application_history} events={data.interview_events} tz={tz} today={today} onClose={() => setOpenId(null)}
        onEdit={(a) => setAppDlg({ open: true, app: a, status: a.status })} onScheduleInterview={scheduleFor} onEditInterview={(e) => setIntDlg({ open: true, event: e, appId: e.application_id })} />}
    </>
  )
}
