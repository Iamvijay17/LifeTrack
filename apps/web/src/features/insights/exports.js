import { toCsv } from '@/services/csv'
import { renderPdf } from '@/services/pdf'
import { stampInTz } from '@/features/reports/pdf/buildReportPdf'
import { fmtDay } from '@/lib/dates'
import { formatChange, formatValue, KIND_NAME, periodLabel } from './format'

const UNIT = { minutes: 'minutes', rate: '%', money: 'currency', kg: 'kg', count: 'count' }
/** Raw numbers for spreadsheets: rates as percentages, money in major units, blank for "no data". */
const raw = (kind, v) => (v == null ? '' : kind === 'rate' ? Math.round(v * 1000) / 10 : kind === 'money' ? (v / 100).toFixed(2) : v)

export const insightsFilename = (report, ext) => {
  const { from, to } = report.ranges.current
  return `lifetrack-insights-${report.kind}-${from}_to_${to}.${ext}`
}

const headerLines = (report, currency) => {
  const { current, previous, partial } = report.ranges
  return [
    ['LifeTrack Insights', `${KIND_NAME[report.kind]} report`],
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
  ]
}

/** One CSV file: metadata, the period-over-period summary, then the detail tables. */
export function insightsToCsv(report, { currency = 'INR' } = {}) {
  const c = report.current
  const parts = []
  const table = (rows, columns) => parts.push(toCsv(rows, columns), '')
  table(headerLines(report, currency), [
    { header: 'Item', value: (r) => r[0] },
    { header: 'Value', value: (r) => r[1] },
  ])
  parts.push('Summary')
  table(report.comparison, [
    { header: 'Area', value: (r) => r.group },
    { header: 'Metric', value: (r) => r.label },
    { header: 'Unit', value: (r) => UNIT[r.kind] },
    { header: 'This period', value: (r) => raw(r.kind, r.cur) },
    { header: 'Previous period', value: (r) => raw(r.kind, r.prev) },
    { header: 'Change', value: (r) => (r.diff == null ? '' : raw(r.kind, r.diff)) },
    { header: 'Change %', value: (r) => (r.pct == null ? '' : Math.round(r.pct * 1000) / 10) },
    { header: 'Verdict', value: (r) => r.verdict },
  ])
  if (c.time) {
    parts.push('Time distribution')
    table(c.time.parts, [
      { header: 'Activity', value: (r) => r.label },
      { header: 'Minutes', value: (r) => r.minutes },
      { header: 'Share %', value: (r) => (r.share == null ? '' : Math.round(r.share * 1000) / 10) },
    ])
  }
  if (c.finance?.categories.length) {
    parts.push('Expenses by category')
    table(c.finance.categories, [
      { header: 'Category', value: (r) => r.category },
      { header: `Amount (${currency})`, value: (r) => (r.paise / 100).toFixed(2) },
      { header: 'Share %', value: (r) => Math.round(r.share * 1000) / 10 },
    ])
  }
  if (c.habits?.perHabit.length) {
    parts.push('Habits')
    table(c.habits.perHabit, [
      { header: 'Habit', value: (r) => r.name },
      { header: 'Done', value: (r) => r.done },
      { header: 'Expected', value: (r) => r.expected },
      { header: 'Completion %', value: (r) => (r.rate == null ? '' : Math.round(r.rate * 1000) / 10) },
      { header: 'Longest streak', value: (r) => r.longest },
    ])
  }
  parts.push('Month over month')
  table(report.history, [
    { header: 'Month', value: (r) => r.month + (r.partial ? ' (so far)' : '') },
    ...report.comparison.map((def) => ({ header: `${def.label} (${UNIT[def.kind]})`, value: (r) => raw(def.kind, r.values[def.key]) })),
  ])
  parts.push('Daily')
  table(c.daily, [
    { header: 'Date', value: (r) => r.date },
    { header: 'Study (min)', value: (r) => r.studyMin },
    { header: 'Focus (min)', value: (r) => r.focusMin },
    { header: 'Workouts', value: (r) => r.workouts },
    { header: 'Workout (min)', value: (r) => r.workoutMin },
    { header: 'Habits done', value: (r) => r.habitsDone },
    { header: 'Tasks done', value: (r) => r.tasksDone },
    { header: 'Tasks due', value: (r) => r.tasksPlanned },
    { header: 'Income', value: (r) => (r.income / 100).toFixed(2) },
    { header: 'Expenses', value: (r) => (r.expense / 100).toFixed(2) },
    { header: 'Saved', value: (r) => (r.savings / 100).toFixed(2) },
    { header: 'Sleep (min)', value: (r) => r.sleepMin ?? '' },
  ])
  return parts.join('\r\n')
}

/** The PDF spec for the report (see services/pdf/engine.js). `money` formats minor units in the user's currency. */
export function insightsPdfSpec(report, { money, currency = 'INR', timezone = 'Asia/Kolkata', now = new Date() }) {
  const c = report.current
  const { previous, partial, current } = report.ranges
  const blocks = []
  const headline = ['studyMinutes', 'workouts', 'expense', 'habitRate', 'taskRate']
    .map((k) => report.comparison.find((r) => r.key === k))
    .filter((r) => r && r.cur != null)
    .map((r) => ({
      label: r.label,
      value: formatValue(r.kind, r.cur, money),
      sub: r.prev == null ? 'No earlier period' : `${formatChange(r, money)} vs previous`,
    }))
  if (headline.length) blocks.push({ type: 'heading', text: 'At a glance' }, { type: 'kpis', items: headline })
  blocks.push({
    type: 'note',
    text: current.days
      ? `Counted through ${fmtDay(current.upto, 'd MMM yyyy')} (${current.days} day${current.days === 1 ? '' : 's'}). ${
          previous.days
            ? `Compared with ${fmtDay(previous.from, 'd MMM')} - ${fmtDay(previous.upto, 'd MMM yyyy')}.`
            : 'No earlier period to compare with.'
        }${partial ? ' The period is still running, so it is compared with the same number of days of the one before.' : ''}`
      : 'This period has not started yet, so nothing is counted.',
  })
  blocks.push({
    type: 'note',
    text: 'A dash means no data was recorded for that period; 0 means it was recorded and the value is zero.',
  })

  const groups = [...new Set(report.comparison.map((r) => r.group))]
  for (const g of groups) {
    const rows = report.comparison.filter((r) => r.group === g)
    blocks.push({ type: 'heading', text: g })
    blocks.push({
      type: 'table',
      columns: [
        { header: 'Metric', width: 3 },
        { header: 'This period', width: 2, align: 'right' },
        { header: 'Previous', width: 2, align: 'right' },
        { header: 'Change', width: 2, align: 'right' },
      ],
      rows: rows.map((r) => [r.label, formatValue(r.kind, r.cur, money), formatValue(r.kind, r.prev, money), formatChange(r, money)]),
    })
  }

  if (c.time?.totalMinutes) {
    blocks.push({ type: 'heading', text: 'Time distribution' })
    blocks.push({
      type: 'bars',
      items: c.time.parts.map((p) => ({
        label: p.label,
        value: p.share ?? 0,
        text: `${formatValue('minutes', p.minutes)} (${formatValue('rate', p.share)})`,
      })),
    })
  }
  if (c.finance?.categories.length) {
    blocks.push({ type: 'heading', text: 'Top expense categories' })
    blocks.push({
      type: 'bars',
      items: c.finance.categories
        .slice(0, 8)
        .map((x) => ({ label: x.category, value: x.share, text: `${money(x.paise)} (${Math.round(x.share * 100)}%)` })),
    })
  }
  if (c.habits?.perHabit.length) {
    blocks.push({ type: 'heading', text: 'Habits' })
    blocks.push({
      type: 'bars',
      items: c.habits.perHabit
        .slice(0, 12)
        .map((h) => ({ label: h.name, value: h.rate ?? 0, text: `${Math.round((h.rate ?? 0) * 100)}% (${h.done}/${h.expected})` })),
    })
  }
  if (c.series.rows.length > 1) {
    blocks.push({ type: 'heading', text: `Trends by ${c.series.unit}` })
    if (c.series.rows.some((r) => r.studyHours != null))
      blocks.push({
        type: 'columns',
        title: 'Study hours',
        items: c.series.rows.map((r) => ({ label: r.label, value: r.studyHours })),
        unit: 'hours',
        format: (v) => `${v}`,
      })
    if (c.series.rows.some((r) => r.expense != null))
      blocks.push({
        type: 'columns',
        title: 'Expenses',
        unit: currency,
        items: c.series.rows.map((r) => ({ label: r.label, value: r.expense == null ? null : r.expense / 100 })),
        format: (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v))),
      })
    if (c.series.rows.some((r) => r.habitRate != null))
      blocks.push({
        type: 'columns',
        title: 'Habit completion',
        unit: '%',
        items: c.series.rows.map((r) => ({ label: r.label, value: r.habitRate })),
        format: (v) => `${v}`,
      })
  }
  blocks.push({ type: 'heading', text: 'Month over month' })
  const cols = ['studyMinutes', 'workouts', 'expense', 'habitRate', 'taskRate'].map((k) => report.comparison.find((r) => r.key === k))
  blocks.push({
    type: 'table',
    columns: [{ header: 'Month', width: 2 }, ...cols.map((d) => ({ header: d.label, width: 2, align: 'right' }))],
    rows: report.history.map((h) => [h.label + (h.partial ? ' *' : ''), ...cols.map((d) => formatValue(d.kind, h.values[d.key], money))]),
  })
  blocks.push({ type: 'note', text: '* month still in progress.' })
  const n = report.notes
  if (n.duplicates || n.orphans || n.future || n.unfinished)
    blocks.push({
      type: 'note',
      text: `Data notes: ${[n.duplicates && `${n.duplicates} duplicate record(s) merged`, n.orphans && `${n.orphans} record(s) of deleted items ignored`, n.future && `${n.future} future-dated record(s) ignored`, n.unfinished && `${n.unfinished} unfinished or discarded study session(s) not counted`].filter(Boolean).join('; ')}.`,
    })

  const title = `LifeTrack ${KIND_NAME[report.kind]} Insights`
  const period = periodLabel(report.kind, current, fmtDay)
  return {
    title,
    subtitle: 'Trends, consistency and period-over-period comparisons from your own records',
    meta: [
      { label: 'Period', value: period },
      { label: 'Counted through', value: current.days ? fmtDay(current.upto, 'd MMM yyyy') : 'Not started' },
      {
        label: 'Compared with',
        value: previous.days ? `${fmtDay(previous.from, 'd MMM')} – ${fmtDay(previous.upto, 'd MMM yyyy')}` : 'No earlier period',
      },
      { label: 'Currency', value: currency },
    ],
    generated: `Generated ${stampInTz(now, timezone)}`,
    footer: `LifeTrack Insights · ${period}`,
    runningHead: `${title} · ${period}`,
    keywords: ['LifeTrack', 'insights', report.kind],
    blocks,
  }
}

/** The report as PDF bytes. */
export const insightsToPdf = (report, opts, render = { onProgress: undefined, fontBytes: undefined }) =>
  renderPdf(insightsPdfSpec(report, opts), render)
