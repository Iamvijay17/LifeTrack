import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BarChart3, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { FirstUseHint } from '@/components/shared/FirstUseHint'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { useTable, useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useModuleLocks } from '@/features/security/useModuleLocks'
import { buildInsightsReport } from '@/domain/insights'
import { tableClosed } from '@lifetrack/core/moduleLocks'
import { fmtDay } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { download } from '@/services/csv'
import { downloadPdf } from '@/services/pdf'
import { insightsFilename, insightsToCsv, insightsToPdf } from './exports'
import { KIND_NAME, periodLabel } from './format'
import { FinanceTab, FitnessTab, HabitsTab, LearningTab } from './Modules'
import { Overview } from './Overview'
import { usePeriod } from './usePeriod'

const TABLES = [
  'habits',
  'habit_logs',
  'study_sessions',
  'focus_sessions',
  'learning_topics',
  'goals',
  'milestones',
  'job_applications',
  'application_history',
  'interview_events',
  'workouts',
  'exercise_logs',
  'health_logs',
  'transactions',
  'tasks',
]
const NONE = []
const KINDS = ['week', 'month', 'quarter', 'year', 'custom'].map((value) => ({
  value,
  label: value === 'custom' ? 'Custom' : value[0].toUpperCase() + value.slice(1),
}))
const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'learning', label: 'Career & Learning' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'finance', label: 'Finance' },
  { value: 'habits', label: 'Habits & Routine' },
]

export default function InsightsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const { closed } = useModuleLocks()
  const closedKey = closed.join()
  const { data: loaded, loading, error, refetch } = useTables(...TABLES)
  // Optional table (migration 0018): a missing one must not take the page down; habits are then counted as never paused.
  const { rows: habitPauses } = useTable('habit_pauses')
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview'
  const period = usePeriod(today, settings.week_starts_on, 'month')
  const money = (paise, opts) => formatMoney(paise, settings.currency, opts)

  // A locked module's tables are treated as empty (the database hands a locked session nothing), so no figure from it reaches the page or an export.
  const data = useMemo(
    () => ({
      ...Object.fromEntries(Object.entries(loaded).map(([t, rows]) => [t, tableClosed(closed, t) ? NONE : rows])),
      habit_pauses: habitPauses,
    }),
    [loaded, habitPauses, closedKey], // eslint-disable-line react-hooks/exhaustive-deps -- `closed` changes exactly when its key does
  )
  const locked = {
    finance: tableClosed(closed, 'transactions'),
    fitness: tableClosed(closed, 'workouts'),
    health: tableClosed(closed, 'health_logs'),
    jobs: tableClosed(closed, 'job_applications'),
  }

  const report = useMemo(
    () =>
      buildInsightsReport(data, {
        kind: period.kind,
        range: period.range,
        today,
        weekStartsOn: settings.week_starts_on,
        plan: settings.workout_plan,
        tz: settings.timezone,
      }),
    [data, period.kind, period.range, today, settings.week_starts_on, settings.workout_plan, settings.timezone],
  )

  const exportCsv = () => {
    download(insightsFilename(report, 'csv'), insightsToCsv(report, { currency: settings.currency }))
    toast.success('CSV report downloaded')
  }
  const exportPdf = () => {
    try {
      downloadPdf(insightsFilename(report, 'pdf'), insightsToPdf(report, { money }))
      toast.success('PDF report downloaded')
    } catch (e) {
      toast.error(`Could not build the PDF: ${e.message}`)
    }
  }

  const { current, partial, future } = report.ranges
  const n = report.notes
  const notes = [
    n.duplicates && `${n.duplicates} duplicate record${n.duplicates === 1 ? '' : 's'} merged`,
    n.orphans && `${n.orphans} record${n.orphans === 1 ? '' : 's'} of deleted items ignored`,
    n.future && `${n.future} future-dated record${n.future === 1 ? '' : 's'} ignored`,
    n.unfinished && `${n.unfinished} unfinished or discarded study session${n.unfinished === 1 ? '' : 's'} not counted`,
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        title="Insights"
        description="Trends, consistency and period-over-period comparisons from your own records."
        actions={
          <>
            <Button variant="outline" onClick={exportPdf} disabled={!report.hasAnyData || future}>
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!report.hasAnyData || future}>
              <FileSpreadsheet className="h-4 w-4" />
              CSV
            </Button>
          </>
        }
      />
      <FirstUseHint id="insights" title="Compare periods">
        Pick a period to compare it with the one before, and export the report as PDF or CSV.
      </FirstUseHint>

      <div className="mb-2 flex flex-wrap items-center gap-3 print:hidden">
        <Segmented aria-label="Report period" value={period.kind} onChange={period.setKind} options={KINDS} />
        {period.kind === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From"
              className="w-36"
              value={period.custom.from}
              max={period.custom.to}
              onChange={(e) => e.target.value && period.setCustom({ ...period.custom, from: e.target.value })}
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="date"
              aria-label="To"
              className="w-36"
              value={period.custom.to}
              min={period.custom.from}
              max={today}
              onChange={(e) => e.target.value && period.setCustom({ ...period.custom, to: e.target.value })}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label={`Previous ${period.kind}`} onClick={period.prev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium tabular-nums" aria-live="polite">
              {periodLabel(period.kind, period.range, fmtDay)}
            </span>
            <Button variant="outline" size="icon" aria-label={`Next ${period.kind}`} onClick={period.next} disabled={!period.canNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {period.offset !== 0 && (
              <Button variant="ghost" size="sm" onClick={period.reset}>
                Current
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground" data-testid="insights-range-note">
        {KIND_NAME[period.kind]} report · {fmtDay(period.range.from, 'd MMM yyyy')} – {fmtDay(period.range.to, 'd MMM yyyy')}
        {future
          ? ' · this period has not started yet'
          : partial
            ? ` · counted through ${fmtDay(current.upto, 'd MMM')} (${current.days} ${current.days === 1 ? 'day' : 'days'}); future days are not counted`
            : ''}
      </p>

      <DataGate loading={loading} error={error} onRetry={refetch} skeleton="chart">
        {!report.hasAnyData ? (
          <EmptyState
            icon={BarChart3}
            title="No history to analyse yet"
            description="Insights are built only from what you record: study sessions, workouts, transactions, habits and tasks. Log a few days and the trends, comparisons and reports will appear here. Nothing is estimated in the meantime."
          />
        ) : (
          <div className="space-y-4">
            <Segmented
              aria-label="Insight area"
              value={tab}
              onChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}
              options={TABS}
            />
            {future ? (
              <EmptyState
                icon={BarChart3}
                title="This period has not started yet"
                description="Nothing is counted for days that have not happened. Go back to the current period, or pick an earlier one."
              />
            ) : tab === 'overview' ? (
              <Overview report={report} money={money} />
            ) : tab === 'learning' ? (
              <LearningTab report={report} money={money} locked={locked} />
            ) : tab === 'fitness' ? (
              <FitnessTab report={report} money={money} locked={locked} />
            ) : tab === 'finance' ? (
              <FinanceTab report={report} money={money} locked={locked} />
            ) : (
              <HabitsTab report={report} money={money} />
            )}
            {notes.length > 0 && <p className="text-xs text-muted-foreground">Data notes: {notes.join(' · ')}.</p>}
          </div>
        )}
      </DataGate>
    </>
  )
}
