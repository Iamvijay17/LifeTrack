import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { addDays, eachDay } from '@lifetrack/utils'
import { buildReport } from '@/domain/report'
import { renderPdf, safeFilename } from '@/services/pdf'
import { niceTicks } from '@/services/pdf/engine'
import { buildReportPdf, ExportError, validateRequest } from '@/features/reports/pdf/buildReportPdf'
import { buckets, MODULES } from '@/features/reports/pdf/templates'
import { formatMoney } from '@/lib/money'
import { testFontBytes } from './pdfFonts'

const fontBytes = testFontBytes()
const OUT = process.env.PDF_SAMPLES_DIR // when set, every PDF built here is also written there for a look at the real pages
const keep = (name, bytes) => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, `${name}.pdf`), bytes)
}
const info = async (bytes) => {
  const doc = await PDFDocument.load(bytes)
  return { pages: doc.getPageCount(), sizes: doc.getPages().map((p) => p.getSize()), title: doc.getTitle(), author: doc.getAuthor() }
}

const TODAY = '2026-11-25'
const settings = { currency: 'INR', timezone: 'Asia/Kolkata', week_starts_on: 1, workout_plan: { 1: 'push', 3: 'pull', 5: 'legs' } }
const money = (p) => formatMoney(p, 'INR')
const EMPTY = () =>
  Object.fromEntries(
    [
      'tasks',
      'habits',
      'habit_logs',
      'study_sessions',
      'focus_sessions',
      'workouts',
      'exercise_logs',
      'health_logs',
      'transactions',
      'goals',
      'milestones',
      'job_applications',
      'application_history',
      'interview_events',
      'learning_topics',
      'budgets',
      'savings_goals',
    ].map((t) => [t, []]),
  )

/** Deterministic records over `days` days: enough of every kind to exercise each module. */
function dataset(days, { long = false } = {}) {
  const d = EMPTY()
  const start = addDays(TODAY, -(days - 1))
  d.learning_topics.push(
    { id: 'tp1', group_name: 'DSA', name: 'Graphs' },
    { id: 'tp2', group_name: 'Systems', name: 'Databases & Indexing' },
  )
  d.goals.push(
    {
      id: 'g1',
      title: long
        ? 'Master data structures and algorithms well enough to crack product-company interviews without any hesitation '.repeat(2)
        : 'Crack DSA rounds',
      category: 'Learning',
      status: 'active',
      target_minutes: 6000,
      due_date: '2027-01-31',
    },
    { id: 'g2', title: 'Ship the side project', category: 'Career', status: 'active', manual_progress: 40 },
  )
  d.habits.push(
    { id: 'h1', name: 'Read 30 minutes', frequency: 'daily', start_date: start, days_of_week: [], weekly_target: 3 },
    { id: 'h2', name: 'Meditate — 10 min ☀️', frequency: 'daily', start_date: start, days_of_week: [], weekly_target: 3 },
  )
  d.savings_goals.push({ id: 's1', name: 'Emergency fund', target_paise: 50000000, saved_paise: 18500000, target_date: '2027-06-30' })
  d.budgets.push(
    { id: 'b1', month: `${TODAY.slice(0, 7)}-01`, category: 'Food', amount_paise: 1500000 },
    { id: 'b2', month: `${TODAY.slice(0, 7)}-01`, category: '', amount_paise: 6000000 },
  )
  eachDay(start, TODAY).forEach((date, i) => {
    if (i % 2 === 0)
      d.study_sessions.push({
        id: `st${i}`,
        session_date: date,
        status: 'completed',
        duration_seconds: (40 + (i % 5) * 20) * 60,
        topic_id: i % 4 ? 'tp1' : 'tp2',
        goal_id: i % 6 === 0 ? 'g1' : null,
        problems_solved: i % 3,
      })
    if (i % 3 === 0)
      d.workouts.push({
        id: `w${i}`,
        workout_date: date,
        status: 'completed',
        name: i % 2 ? 'Push day' : 'Pull day',
        kind: 'strength',
        duration_minutes: 50 + (i % 4) * 5,
        cardio_minutes: i % 6 ? null : 15,
        cardio_distance_km: i % 6 ? null : 2.4,
        notes:
          long && i % 9 === 0
            ? 'Felt strong today and added weight on every lift, but the left shoulder was slightly sore during overhead work so I stopped early and stretched for a while afterwards.'
            : '',
      })
    if (i % 3 === 0)
      d.exercise_logs.push({
        id: `e${i}`,
        workout_id: `w${i}`,
        exercise_name: i % 2 ? 'Bench Press' : 'Barbell Row',
        set_number: 1,
        reps: 8,
        weight_kg: 40 + (i % 5) * 2.5,
      })
    d.health_logs.push({
      id: `hl${i}`,
      log_date: date,
      sleep_minutes: 360 + ((i * 17) % 120),
      bedtime: '23:00',
      wake_time: '06:30',
      water_ml: 1800 + (i % 5) * 200,
      steps: 5000 + ((i * 331) % 6000),
      energy_level: 1 + (i % 5),
      weight_kg: 78 - i * 0.02,
    })
    d.transactions.push({
      id: `tx${i}`,
      txn_date: date,
      type: 'expense',
      amount_paise: (350 + ((i * 137) % 4200)) * 100 + (i % 3) * 50,
      category: ['Food', 'Transport', 'Rent, utilities', 'Entertainment'][i % 4],
      note:
        long && i % 7 === 0
          ? 'Dinner with the whole team after the quarterly review, split across three cards and one cash payment'
          : i % 5
            ? ''
            : 'Swiggy – ₹ order',
      payment_method: ['upi', 'card', 'cash'][i % 3],
    })
    if (i % 15 === 0)
      d.transactions.push({
        id: `in${i}`,
        txn_date: date,
        type: 'income',
        amount_paise: 8500000 + i * 1000,
        category: 'Salary',
        note: '',
        payment_method: 'bank',
      })
    if (i % 15 === 3)
      d.transactions.push({
        id: `sv${i}`,
        txn_date: date,
        type: 'savings',
        amount_paise: 1500000,
        category: 'SIP',
        note: '',
        payment_method: 'bank',
      })
    d.habit_logs.push(
      { id: `l1${i}`, habit_id: 'h1', log_date: date, status: i % 4 ? 'done' : 'skipped' },
      { id: `l2${i}`, habit_id: 'h2', log_date: date, status: i % 3 ? 'done' : 'skipped' },
    )
    d.tasks.push({
      id: `t${i}`,
      title: `Task ${i}`,
      due_date: date,
      status: i % 3 ? 'done' : 'pending',
      category: ['Work', 'Personal', 'Learning'][i % 3],
      priority: 'medium',
      start_time: i % 2 ? '09:30:00' : null,
      end_time: i % 2 ? '10:30:00' : null,
      location: i % 4 ? '' : 'Home office',
    })
  })
  d.job_applications.push(
    {
      id: 'j1',
      company: 'Acme Technologies Private Limited',
      job_title: 'Senior Frontend Engineer — Platform',
      applied_date: addDays(TODAY, -10),
      status: 'interview',
      location: 'Bengaluru',
      salary_paise: 3500000000,
      followup_date: addDays(TODAY, 3),
    },
    {
      id: 'j2',
      company: 'Globex',
      job_title: 'Full-stack Engineer',
      applied_date: addDays(TODAY, -5),
      status: 'applied',
      location: 'Remote',
    },
    { id: 'j3', company: 'Initech', job_title: 'Engineer', applied_date: addDays(TODAY, -2), status: 'rejected' },
  )
  d.interview_events.push({
    id: 'i1',
    application_id: 'j1',
    round_name: 'Technical round 1',
    scheduled_at: `${addDays(TODAY, 2)}T05:30:00Z`,
    mode: 'video',
    status: 'scheduled',
  })
  return d
}
const ctxFor = (data, from, to = TODAY) => ({
  data,
  from,
  to,
  today: TODAY,
  settings,
  money,
  report: buildReport(data, from, to, { today: TODAY, settings, weekStartsOn: 1 }),
})
const ALL = MODULES.map((m) => m.id)
const run = (ctx, opts) =>
  buildReportPdf(ctx, { title: 'Test report', modules: ALL, fontBytes, now: new Date('2026-11-25T10:12:00Z'), ...opts })

describe('PDF engine', { timeout: 90000 }, () => {
  it('builds a valid A4 document with metadata and numbered pages, however long the table', async () => {
    const rows = Array.from({ length: 300 }, (_, i) => [`Row ${i}`, `₹${(i * 1234567).toLocaleString('en-IN')}`, 'x'.repeat(i % 40)])
    const bytes = await renderPdf(
      {
        title: 'Long table',
        footer: 'Footer',
        blocks: [
          { type: 'heading', text: 'Rows' },
          { type: 'table', columns: [{ header: 'A' }, { header: 'B', align: 'right' }, { header: 'C' }], rows },
        ],
      },
      { fontBytes },
    )
    keep('engine-long-table', bytes)
    const i = await info(bytes)
    expect(i.pages).toBeGreaterThan(4)
    expect(i.sizes[0]).toEqual({ width: 595.28, height: 841.89 })
    expect(i.title).toBe('Long table')
    expect(i.author).toBe('LifeTrack')
  })

  it('never lets one very long word or unbroken string run off the page', async () => {
    const word = 'Supercalifragilisticexpialidocious'.repeat(8)
    const bytes = await renderPdf(
      {
        title: word,
        blocks: [
          { type: 'text', text: word },
          {
            type: 'table',
            columns: [
              { header: 'Narrow', width: 1 },
              { header: 'Wide', width: 6 },
            ],
            rows: [[word, word]],
          },
          { type: 'bars', items: [{ label: word, value: 0.4, text: word }] },
        ],
      },
      { fontBytes },
    )
    keep('engine-long-word', bytes)
    expect((await info(bytes)).pages).toBeGreaterThanOrEqual(1)
  })

  it('draws ₹, accents, CJK fallbacks and emoji without throwing', async () => {
    const bytes = await renderPdf(
      {
        title: '₹ 1,23,456.78 · Café — naïve “quotes” → 日本 😀',
        blocks: [{ type: 'text', text: 'Zoë paid ₹5,00,000 for “résumé” – 100% ✓ ☀️     end' }],
      },
      { fontBytes },
    )
    keep('engine-unicode', bytes)
    expect((await info(bytes)).pages).toBe(1)
  })

  it('handles empty and null data in every block type', async () => {
    const bytes = await renderPdf(
      {
        title: 'Empty',
        blocks: [
          { type: 'table', columns: [{ header: 'A' }], rows: [] },
          { type: 'bars', items: [] },
          { type: 'chart', title: 'No data', labels: ['a'], series: [{ name: 's', values: [null] }] },
          { type: 'kpis', items: [] },
          { type: 'text', text: '' },
        ],
      },
      { fontBytes },
    )
    keep('engine-empty', bytes)
    expect((await info(bytes)).pages).toBe(1)
  })

  it('charts with many points keep labels apart and with a single point still render', async () => {
    const labels = Array.from({ length: 365 }, (_, i) => `Day ${i + 1}`)
    const bytes = await renderPdf(
      {
        title: 'Charts',
        blocks: [
          {
            type: 'chart',
            title: 'Daily',
            unit: 'min',
            labels,
            series: [{ name: 'Study', values: labels.map((_, i) => (i % 9 === 0 ? null : (i * 7) % 180)) }],
          },
          {
            type: 'chart',
            kind: 'line',
            title: 'Two series',
            unit: '₹',
            labels: labels.slice(0, 40),
            series: [
              { name: 'Income', values: labels.slice(0, 40).map((_, i) => i * 1000) },
              { name: 'Expenses', values: labels.slice(0, 40).map((_, i) => 40000 - i * 600) },
            ],
          },
          { type: 'chart', title: 'One', unit: 'x', labels: ['only'], series: [{ name: 'a', values: [5] }] },
        ],
      },
      { fontBytes },
    )
    keep('engine-charts', bytes)
    expect((await info(bytes)).pages).toBeGreaterThanOrEqual(1)
  })

  it('switches to landscape for wide tables', async () => {
    const cols = Array.from({ length: 14 }, (_, i) => ({ header: `Column ${i + 1}`, align: 'right' }))
    const bytes = await renderPdf(
      {
        title: 'Wide',
        blocks: [
          { type: 'text', text: 'Portrait first' },
          { type: 'orientation', value: 'landscape' },
          { type: 'table', columns: cols, rows: Array.from({ length: 60 }, (_, r) => cols.map((_, c) => `${r * c * 1234.5}`)) },
        ],
      },
      { fontBytes },
    )
    keep('engine-landscape', bytes)
    const i = await info(bytes)
    expect(i.sizes[0].width).toBeLessThan(i.sizes[0].height)
    expect(i.sizes.at(-1).width).toBeGreaterThan(i.sizes.at(-1).height)
  })

  it('rejects an unknown block instead of silently dropping content', async () => {
    await expect(renderPdf({ title: 'x', blocks: [{ type: 'nope' }] }, { fontBytes })).rejects.toThrow('Unknown report block')
  })

  it('tick scales and filenames are sane', () => {
    expect(niceTicks(0)).toEqual([0, 1])
    expect(niceTicks(97).at(-1)).toBeGreaterThanOrEqual(97)
    expect(niceTicks(4_300_000).length).toBeLessThanOrEqual(7)
    expect(niceTicks(1, 4, { integer: true })).toEqual([0, 1])
    expect(niceTicks(3, 4, { integer: true }).every(Number.isInteger)).toBe(true)
    const w = niceTicks(78.2, 4, { min: 77.1 }) // a weight line does not start at zero
    expect(w[0]).toBeGreaterThan(60)
    expect(w.at(-1)).toBeGreaterThanOrEqual(78.2)
    expect(safeFilename('Q3 report: ₹/finance*?')).toBe('Q3-report-finance.pdf')
    expect(safeFilename('')).toBe('report.pdf')
  })
})

describe('report export', { timeout: 90000 }, () => {
  it('a month of real-shaped data produces a multi-page report with every section', async () => {
    const { bytes, included, skipped } = await run(ctxFor(dataset(30), addDays(TODAY, -29)))
    keep('report-month', bytes)
    expect(included).toHaveLength(ALL.length)
    expect(skipped).toHaveLength(0)
    expect((await info(bytes)).pages).toBeGreaterThan(3)
  })

  it('a year of data with long text paginates and still finishes', async () => {
    const { bytes } = await run(ctxFor(dataset(365, { long: true }), addDays(TODAY, -364)))
    keep('report-year-long', bytes)
    expect((await info(bytes)).pages).toBeGreaterThan(10)
  }, 60000)

  it('only includes sections that have data', async () => {
    const data = EMPTY()
    data.transactions.push({
      id: 'a',
      txn_date: TODAY,
      type: 'expense',
      amount_paise: 12345600,
      category: 'Rent',
      note: '',
      payment_method: 'upi',
    })
    const { bytes, included, skipped } = await run(ctxFor(data, addDays(TODAY, -6)))
    keep('report-finance-only', bytes)
    expect(included).toContain('Finance & Expenses')
    expect(skipped).toEqual(expect.arrayContaining(['Job Switch', 'Gym & Fitness', 'Career & Learning']))
  })

  it('an empty period explains itself instead of producing a blank file', async () => {
    await expect(run(ctxFor(EMPTY(), addDays(TODAY, -6)))).rejects.toMatchObject({ name: 'ExportError', code: 'empty' })
  })

  it('validates the request before doing any work', () => {
    const base = { from: '2026-11-01', to: '2026-11-30', today: TODAY, modules: ['summary'], title: 'T' }
    expect(() => validateRequest(base)).not.toThrow()
    expect(() => validateRequest({ ...base, from: '2026-12-01', to: '2026-12-31' })).toThrow(ExportError)
    expect(() => validateRequest({ ...base, from: '2026-11-30', to: '2026-11-01' })).toThrow('start date')
    expect(() => validateRequest({ ...base, modules: [] })).toThrow('Select at least one')
    expect(() => validateRequest({ ...base, title: '  ' })).toThrow('title')
  })

  it('a period that runs into the future counts only elapsed days; missing optional fields are fine', async () => {
    const data = dataset(10)
    data.workouts.forEach((w) => Object.assign(w, { name: null, notes: undefined, cardio_minutes: undefined }))
    data.job_applications.forEach((a) => Object.assign(a, { location: undefined, salary_paise: undefined, followup_date: null }))
    const { bytes } = await run(ctxFor(data, addDays(TODAY, -9), addDays(TODAY, 20)), { orientation: 'landscape' })
    keep('report-future-landscape', bytes)
    const i = await info(bytes)
    expect(i.sizes.every((s) => s.width > s.height)).toBe(true)
  })

  it('reports progress from start to finish', async () => {
    const seen = []
    await run(ctxFor(dataset(20), addDays(TODAY, -19)), { onProgress: (f) => seen.push(f) })
    expect(seen[0]).toBeLessThan(0.2)
    expect(seen.at(-1)).toBe(1)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it('buckets days, weeks and months by the length of the period', () => {
    expect(buckets('2026-11-01', '2026-11-07', 1).unit).toBe('day')
    expect(buckets('2026-09-01', '2026-11-25', 1).unit).toBe('week')
    expect(buckets('2026-01-01', '2026-11-25', 1).unit).toBe('month')
    expect(buckets('2026-12-01', '2026-11-25', 1)).toEqual([])
  })
})
