import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Briefcase, CalendarPlus, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import {
  activePipelineCount,
  appliedInWeek,
  applicationSources,
  dueFollowups,
  filterApplications,
  funnel,
  upcomingInterviews,
} from '@/domain/jobs'
import { startOfWeek } from '@/lib/dates'
import { ApplicationDialog } from './ApplicationDialog'
import { ApplicationDetail } from './ApplicationDetail'
import { Board } from './Board'
import { InterviewCalendar } from './InterviewCalendar'
import { InterviewDialog } from './InterviewDialog'
import { JobInsights } from './JobInsights'
import { JobsStats } from './JobsStats'
import { JobsTable } from './JobsTable'
import { JobsToolbar } from './JobsToolbar'
import { Reminders } from './Reminders'

const ALL_TIME = ['0000-01-01', '9999-12-31']

export default function JobsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const { timezone: tz, week_starts_on: weekStartsOn } = settings
  const { data, loading, error, refetch } = useTables('job_applications', 'application_history', 'interview_events')
  const [view, setView] = useState('board')
  const [filters, setFilters] = useState({ q: '', status: '', source: '' })
  const [appDlg, setAppDlg] = useState({ open: false, app: null, status: 'interested' })
  const [intDlg, setIntDlg] = useState({ open: false, event: null, appId: null })
  const [openId, setOpenId] = useState(null)
  const [params, setParams] = useSearchParams()
  // Deep link from global search and the dashboard: /jobs?app=<id>
  useEffect(() => {
    const id = params.get('app')
    if (!id || loading) return
    setOpenId(id)
    setParams({}, { replace: true })
  }, [params, loading, setParams])

  const apps = data.job_applications
  const detail = apps.find((a) => a.id === openId) ?? null
  const filtered = useMemo(() => filterApplications(apps, filters), [apps, filters])
  const sources = useMemo(() => applicationSources(apps), [apps])
  const stats = useMemo(
    () => funnel(apps, data.application_history, data.interview_events, ...ALL_TIME),
    [apps, data.application_history, data.interview_events],
  )
  const appliedThisWeek = appliedInWeek(apps, startOfWeek(today, weekStartsOn))
  const upcoming = upcomingInterviews(data.interview_events, apps, Date.now())
  const followups = dueFollowups(apps, today)

  const addApplication = (status = 'interested') => setAppDlg({ open: true, app: null, status })
  const scheduleInterview = (appId) => setIntDlg({ open: true, event: null, appId })
  const editInterview = (event) => setIntDlg({ open: true, event, appId: event.application_id })
  const open = (a) => setOpenId(a.id)

  return (
    <>
      <PageHeader
        title="Job Switch"
        description="Every application, interview and status change in one place."
        actions={
          <>
            <Button variant="outline" onClick={() => scheduleInterview(null)} disabled={apps.length === 0}>
              <CalendarPlus className="h-4 w-4" />
              Interview
            </Button>
            <Button onClick={() => addApplication()}>
              <Plus className="h-4 w-4" />
              Application
            </Button>
          </>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <JobsStats appliedThisWeek={appliedThisWeek} active={activePipelineCount(apps)} total={apps.length} funnel={stats} />
          <Reminders followups={followups} upcoming={upcoming} tz={tz} onOpen={open} />
          <JobsToolbar view={view} onViewChange={setView} filters={filters} onFiltersChange={setFilters} sources={sources} />

          {apps.length === 0 && view !== 'calendar' && view !== 'insights' ? (
            <EmptyState
              icon={Briefcase}
              title="No applications yet"
              description="Add the roles you're interested in and move them across the board as they progress. Status history is kept automatically."
              action={<Button onClick={() => addApplication()}>Add your first application</Button>}
            />
          ) : view === 'board' ? (
            <Board apps={filtered} today={today} onOpen={open} onAdd={addApplication} />
          ) : view === 'table' ? (
            filtered.length ? (
              <JobsTable apps={filtered} today={today} onOpen={open} />
            ) : (
              <EmptyState title="No matches" description="Try clearing the search or filters." />
            )
          ) : view === 'calendar' ? (
            <InterviewCalendar
              events={data.interview_events}
              apps={apps}
              tz={tz}
              today={today}
              weekStartsOn={weekStartsOn}
              onOpen={open}
              onEditEvent={editInterview}
            />
          ) : (
            <JobInsights apps={apps} today={today} weekStartsOn={weekStartsOn} tz={tz} />
          )}
        </div>
      </DataGate>

      <ApplicationDialog
        open={appDlg.open}
        app={appDlg.app}
        defaultStatus={appDlg.status}
        today={today}
        onOpenChange={(o) => setAppDlg((d) => ({ ...d, open: o }))}
      />
      <InterviewDialog
        open={intDlg.open}
        event={intDlg.event}
        applicationId={intDlg.appId}
        apps={apps}
        tz={tz}
        today={today}
        onOpenChange={(o) => setIntDlg((d) => ({ ...d, open: o }))}
      />
      {detail && (
        <ApplicationDetail
          app={detail}
          history={data.application_history}
          events={data.interview_events}
          tz={tz}
          today={today}
          onClose={() => setOpenId(null)}
          onEdit={(a) => setAppDlg({ open: true, app: a, status: a.status })}
          onScheduleInterview={scheduleInterview}
          onEditInterview={editInterview}
        />
      )}
    </>
  )
}
