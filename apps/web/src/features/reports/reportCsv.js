import { reportToRows } from '@/domain/report'
import { toCsv } from '@/services/csv'

export const DAILY_COLUMNS = [
  { header: 'Date', value: (r) => r.date },
  { header: 'Daily score', value: (r) => r.score ?? '' },
  { header: 'Tasks done', value: (r) => r.tasksDone },
  { header: 'Tasks planned', value: (r) => r.tasksPlanned },
  { header: 'Study (min)', value: (r) => r.studyMinutes },
  { header: 'Focus (min)', value: (r) => r.focusMinutes },
  { header: 'Workout', value: (r) => (r.workout ? 'yes' : '') },
  { header: 'Habits done', value: (r) => r.habitsDone },
  { header: 'Sleep (h)', value: (r) => r.sleepHours ?? '' },
  { header: 'Spent (paise)', value: (r) => r.spentPaise },
]

/** A report as one CSV file: the summary metrics, a blank line, then the day-by-day table. */
export function reportToCsv(report, money) {
  const { summary } = reportToRows(report, money)
  return [
    toCsv(summary, [
      { header: 'Metric', value: (x) => x.metric },
      { header: 'Value', value: (x) => x.value },
    ]),
    '',
    toCsv(report.daily, DAILY_COLUMNS),
  ].join('\r\n')
}

export const reportFilename = (from, to) => `lifetrack-report-${from}_to_${to}.csv`
