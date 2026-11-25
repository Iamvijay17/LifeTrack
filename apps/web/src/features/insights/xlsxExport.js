// The Insights report as an Excel workbook: the same figures as the CSV and PDF (one calculation, three formats), one sheet per table. Numbers are real
// numbers (rates as percentages, money in major units); a blank cell means "no data was recorded", 0 means "recorded, and zero".
import { buildXlsx } from '@/services/xlsx'
import { KIND_NAME } from './format'

const UNIT = { minutes: 'minutes', rate: '%', money: 'currency', kg: 'kg', count: 'count' }
const cell = (kind, v) => (v == null ? null : kind === 'rate' ? Math.round(v * 1000) / 10 : kind === 'money' ? Math.round(v) / 100 : v)
const pct = (v) => (v == null ? null : Math.round(v * 1000) / 10)
const minor = (v) => (v == null ? null : Math.round(v) / 100)

export const insightsFilenameXlsx = (report) => {
  const { from, to } = report.ranges.current
  return `lifetrack-insights-${report.kind}-${from}_to_${to}.xlsx`
}

/** @returns Uint8Array (.xlsx) */
export function insightsToXlsx(report, { currency = 'INR', generated = new Date().toISOString().slice(0, 10) } = {}) {
  const c = report.current
  const { current, previous, partial } = report.ranges
  const sheets = []
  sheets.push({
    name: 'Report',
    headerRows: 1,
    rows: [
      ['LifeTrack Insights', `${KIND_NAME[report.kind]} report`],
      ['Generated', generated],
      ['Period', `${current.from} to ${current.to}`],
      ['Counted through', current.days ? current.upto : 'nothing yet (period has not started)'],
      ['Compared with', previous.days ? `${previous.from} to ${previous.upto}` : 'no earlier period'],
      [
        'Note',
        partial ? 'The period is still running: it is compared with the same number of days of the previous one.' : 'Complete period.',
      ],
      [
        'Note',
        `Blank cells mean no data was recorded; 0 means it was recorded and the value is zero. Money is in ${currency} (major units).`,
      ],
    ],
    widths: [20, 90],
  })
  sheets.push({
    name: 'Summary',
    headerRows: 1,
    rows: [
      ['Area', 'Metric', 'Unit', 'This period', 'Previous period', 'Change', 'Change %', 'Verdict'],
      ...report.comparison.map((r) => [
        r.group,
        r.label,
        UNIT[r.kind],
        cell(r.kind, r.cur),
        cell(r.kind, r.prev),
        r.diff == null ? null : cell(r.kind, r.diff),
        pct(r.pct),
        r.verdict,
      ]),
    ],
  })
  const daily = c.daily ?? []
  sheets.push({
    name: 'Daily',
    headerRows: 1,
    rows: [
      [
        'Date',
        'Study (min)',
        'Focus (min)',
        'Workouts',
        'Workout (min)',
        'Habits done',
        'Tasks done',
        'Tasks due',
        `Income (${currency})`,
        `Expenses (${currency})`,
        `Saved (${currency})`,
        'Sleep (min)',
      ],
      ...daily.map((r) => [
        r.date,
        r.studyMin,
        r.focusMin,
        r.workouts,
        r.workoutMin,
        r.habitsDone,
        r.tasksDone,
        r.tasksPlanned,
        minor(r.income),
        minor(r.expense),
        minor(r.savings),
        r.sleepMin ?? null,
      ]),
    ],
  })
  if (c.finance?.categories.length)
    sheets.push({
      name: 'Expenses by category',
      headerRows: 1,
      rows: [
        ['Category', `Amount (${currency})`, 'Share %'],
        ...c.finance.categories.map((r) => [r.category, minor(r.paise), pct(r.share)]),
      ],
    })
  if (c.habits?.perHabit.length)
    sheets.push({
      name: 'Habits',
      headerRows: 1,
      rows: [
        ['Habit', 'Done', 'Expected', 'Completion %', 'Longest streak'],
        ...c.habits.perHabit.map((r) => [r.name, r.done, r.expected, pct(r.rate), r.longest]),
      ],
    })
  if (c.time?.parts?.length)
    sheets.push({
      name: 'Time distribution',
      headerRows: 1,
      rows: [['Activity', 'Minutes', 'Share %'], ...c.time.parts.map((r) => [r.label, r.minutes, pct(r.share)])],
    })
  sheets.push({
    name: 'Month over month',
    headerRows: 1,
    rows: [
      ['Month', ...report.comparison.map((d) => `${d.label} (${UNIT[d.kind]})`)],
      ...report.history.map((h) => [
        h.month + (h.partial ? ' (so far)' : ''),
        ...report.comparison.map((d) => cell(d.kind, h.values[d.key])),
      ]),
    ],
  })
  return buildXlsx(sheets)
}
