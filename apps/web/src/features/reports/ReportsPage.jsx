import { useMemo, useState } from 'react'
import { Download, FileDown } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { Button } from '@/components/ui/button'
import { useTables } from '@/hooks/store'
import { useDateRange } from '@/hooks/useDateRange'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { buildReport } from '@/domain/report'
import { useModuleLocks } from '@/features/security/useModuleLocks'
import { tableClosed } from '@lifetrack/core/moduleLocks'
import { fmtDay } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { download } from '@/services/csv'
import { DailyActivityTable } from './DailyActivityTable'
import { ReportCharts } from './ReportCharts'
import { ReportSummary } from './ReportSummary'
import { reportFilename, reportToCsv } from './reportCsv'
import { ExportPdfDialog } from './pdf/ExportPdfDialog'
import { MODULE_TABLES } from './pdf/templates'

const TABLES = [
  'tasks',
  'habits',
  'habit_logs',
  'study_sessions',
  'focus_sessions',
  'workouts',
  'health_logs',
  'transactions',
  'goals',
  'milestones',
  'job_applications',
  'application_history',
  'interview_events',
  'user_settings',
  'learning_topics',
  'exercise_logs',
  'budgets',
  'savings_goals',
]
const LABELS = { week: 'This week', month: 'This month', year: 'This year', custom: 'Custom' }

export default function ReportsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const { closed } = useModuleLocks()
  const { data: loaded, loading, error, refetch } = useTables(...TABLES)
  // A locked module's tables are treated as empty, so nothing from it reaches the page or an export.
  const closedKey = closed.join()
  const data = useMemo(
    () => Object.fromEntries(Object.entries(loaded).map(([t, rows]) => [t, tableClosed(closed, t) ? [] : rows])),
    [loaded, closedKey], // eslint-disable-line react-hooks/exhaustive-deps -- `closed` changes exactly when its key does
  )
  const [pdfOpen, setPdfOpen] = useState(false)
  const available = Object.keys(MODULE_TABLES).filter((id) => !tableClosed(closed, MODULE_TABLES[id][0]))
  const range = useDateRange(today, settings.week_starts_on, 'week')
  const { from, to } = range
  const money = (paise) => formatMoney(paise, settings.currency)

  const report = useMemo(
    () => buildReport(data, from, to, { today, settings, weekStartsOn: settings.week_starts_on }),
    [data, from, to, today, settings],
  )
  const exportCsv = () => download(reportFilename(from, to), reportToCsv(report, money))

  return (
    <>
      <PageHeader
        title="Reports"
        description="Summaries of any period, ready to print or export."
        actions={
          <>
            <Button variant="outline" onClick={() => setPdfOpen(true)} disabled={loading || !!error || from > today}>
              <FileDown className="h-4 w-4" />
              Export PDF
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!report.daily.length}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </>
        }
      />
      <DateRangePicker range={range} labels={LABELS} className="mb-5 flex flex-wrap items-center gap-3 print:hidden" />
      <p className="mb-4 text-sm text-muted-foreground">
        {fmtDay(from, 'd MMM yyyy')} – {fmtDay(to, 'd MMM yyyy')}
        {to > today ? ' (future days are not counted)' : ''}
      </p>
      <DataGate loading={loading} error={error} onRetry={refetch} skeleton="chart">
        <div className="space-y-5">
          <ReportSummary s={report.summary} money={money} />
          <ReportCharts report={report} />
          <DailyActivityTable daily={report.daily} money={money} />
        </div>
      </DataGate>
      <ExportPdfDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        ctx={{ data, report, from, to, today, settings, money }}
        available={available}
      />
    </>
  )
}
