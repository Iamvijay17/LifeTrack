import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { renderPdf, toLatin1, textWidth } from '@/services/pdf'
import { buildInsightsReport, periodFor } from '@/domain/insights'
import { insightsToCsv, insightsToPdf, insightsFilename } from '@/features/insights/exports'
import { formatChange, formatValue } from '@/features/insights/format'
import { formatMoney } from '@/lib/money'

const TODAY = '2026-11-18'
const mocks = vi.hoisted(() => ({ rows: {}, closed: [], download: vi.fn(), downloadPdf: vi.fn() }))
vi.mock('@/hooks/store', () => ({
  useTable: (t) => ({ rows: mocks.rows[t] ?? [], loading: false, error: null, refetch: () => {} }),
  useTables: (...ts) => ({
    data: Object.fromEntries(ts.map((t) => [t, mocks.rows[t] ?? []])),
    loading: false,
    error: null,
    refetch: () => {},
  }),
}))
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: { currency: 'INR', timezone: 'Asia/Kolkata', week_starts_on: 1, workout_plan: { 1: 'push', 3: 'pull' } },
  }),
}))
vi.mock('@/hooks/useToday', () => ({ useToday: () => TODAY }))
vi.mock('@/features/security/useModuleLocks', () => ({
  useModuleLocks: () => ({ closed: mocks.closed, isLocked: (m) => mocks.closed.includes(m), unlock: () => {} }),
}))
vi.mock('@/services/csv', async (orig) => ({ ...(await orig()), download: mocks.download }))
vi.mock('@/services/pdf', async (orig) => ({ ...(await orig()), downloadPdf: mocks.downloadPdf }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('recharts', async (orig) => {
  const R = await orig()
  return { ...R, ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div> } // jsdom has no layout
})

import InsightsPage from '@/features/insights/InsightsPage'

const money = (p) => formatMoney(p, 'INR')
const study = (id, date, min) => ({ id, session_date: date, status: 'completed', duration_seconds: min * 60, problems_solved: 1 })
const seed = () => ({
  study_sessions: [
    study('a', '2026-10-05', 60),
    study('b', '2026-11-05', 120),
    { id: 'run', session_date: '2026-11-06', status: 'running', duration_seconds: null },
  ],
  transactions: [
    { id: 't1', txn_date: '2026-10-06', type: 'expense', amount_paise: 100000, category: 'Food' },
    { id: 't2', txn_date: '2026-11-06', type: 'expense', amount_paise: 300000, category: 'Rent, utilities' },
    { id: 't3', txn_date: '2026-11-07', type: 'income', amount_paise: 5000000, category: 'Salary' },
  ],
  workouts: [{ id: 'w1', workout_date: '2026-11-04', status: 'completed', duration_minutes: 45, kind: 'strength' }],
  habits: [{ id: 'h1', name: '=Read', color: '#8B5CF6', frequency: 'daily', start_date: '2026-10-01', days_of_week: [], weekly_target: 3 }],
  habit_logs: [{ id: 'l1', habit_id: 'h1', log_date: '2026-11-10', status: 'done' }],
})
const renderPage = () =>
  render(
    <MemoryRouter>
      <InsightsPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  mocks.rows = {}
  mocks.closed = []
  mocks.download.mockClear()
  mocks.downloadPdf.mockClear()
})

describe('PDF writer', () => {
  it('writes a structurally valid file: header, correct xref offsets, page count', () => {
    const blocks = [
      { type: 'heading', text: 'Heading (with) parens \\ and ₹1,200 — dash' },
      {
        type: 'table',
        columns: [
          { header: 'A', width: 1 },
          { header: 'B', width: 1, align: 'right' },
        ],
        rows: Array.from({ length: 120 }, (_, i) => [`row ${i}`, i]),
      },
      { type: 'bars', items: [{ label: 'x', value: 0.5, text: '50%' }] },
      {
        type: 'columns',
        title: 'c',
        items: [
          { label: 'a', value: 1 },
          { label: 'b', value: null },
          { label: 'c', value: 3 },
        ],
      },
    ]
    const bytes = renderPdf({ title: 'T', subtitle: 'S', footer: 'F', blocks })
    const s = new TextDecoder('latin1').decode(bytes)
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    const pages = Number(/\/Count (\d+)/.exec(s)[1])
    expect(pages).toBeGreaterThan(1) // 120 rows do not fit on one page
    expect(s).toContain(`Page ${pages} of ${pages}`)
    // every xref entry points at "<n> 0 obj"
    const start = Number(/startxref\n(\d+)/.exec(s)[1])
    const entries = [...s.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]))
    expect(entries.length).toBeGreaterThan(5)
    entries.forEach((off, i) => expect(s.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)))
    expect(s).toContain('Rs 1,200') // ₹ is not in the PDF font: written as Rs
    expect(s).toContain('\\(with\\)') // parentheses escaped
  })
  it('replaces characters the font lacks instead of printing garbage', () => {
    expect(toLatin1('₹5 – x…')).toBe('Rs 5 - x...')
    expect(toLatin1('日本')).toBe('??')
    expect(textWidth('WWW', 10)).toBeGreaterThan(textWidth('iii', 10))
  })
})

describe('exports', () => {
  const report = buildInsightsReport(
    {
      ...Object.fromEntries(
        [
          'learning_topics',
          'goals',
          'milestones',
          'job_applications',
          'application_history',
          'interview_events',
          'exercise_logs',
          'health_logs',
          'tasks',
          'focus_sessions',
        ].map((t) => [t, []]),
      ),
      ...seed(),
    },
    { kind: 'month', range: periodFor('month', TODAY), today: TODAY, plan: {}, tz: 'Asia/Kolkata' },
  )
  it('CSV: units, blanks for unavailable data, escaping, injection guard', () => {
    const csv = insightsToCsv(report, { currency: 'INR' })
    expect(csv).toContain('Period,2026-11-01 to 2026-11-30')
    expect(csv).toContain('Compared with,2026-10-01 to 2026-10-18')
    expect(csv).toMatch(/Career & Learning,Study time,minutes,120,60,60,100,better/)
    expect(csv).toMatch(/Finance,Expenses,currency,3000\.00,1000\.00,2000\.00,200,worse/)
    expect(csv).toMatch(/Fitness,Plan consistency,%,,,,,unavailable/) // no weekly plan in this report: blank, not 0
    expect(csv).toContain('"Rent, utilities"')
    expect(csv).toContain("'=Read") // a habit named "=Read" cannot become a formula
    expect(csv.split('\r\n').filter((l) => /^2026-11-\d\d,/.test(l))).toHaveLength(18) // one daily row per elapsed day, none for the future
  })
  it('PDF bytes and filenames', () => {
    const bytes = insightsToPdf(report, { money })
    expect(new TextDecoder('latin1').decode(bytes)).toContain('Monthly Insights')
    expect(insightsFilename(report, 'pdf')).toBe('lifetrack-insights-month-2026-11-01_to_2026-11-30.pdf')
  })
  it('formatters never show missing data as zero', () => {
    expect(formatValue('minutes', null)).toBe('—')
    expect(formatValue('count', 0)).toBe('0')
    expect(formatValue('rate', 0)).toBe('0%')
    expect(formatChange({ verdict: 'unavailable' })).toBe('n/a')
    expect(formatChange({ verdict: 'better', kind: 'rate', diff: 0.2, pct: null })).toBe('+20 pts')
    expect(formatChange({ verdict: 'worse', kind: 'count', diff: -3, pct: -0.3 })).toBe('−30%')
  })
})

describe('Insights page', () => {
  it('an empty account explains itself and offers no exports', () => {
    renderPage()
    expect(screen.getByText('No history to analyse yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PDF/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /CSV/ })).toBeDisabled()
  })

  it('shows headline figures with real zero and unavailable kept apart, and exports', async () => {
    mocks.rows = seed()
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByTestId('insights-range-note')).toHaveTextContent('counted through 18 Nov (18 days)')
    const tile = screen.getAllByText('Study time')[0].parentElement
    expect(tile).toHaveTextContent('2h') // 120 minutes, the running session is not counted
    // fitness has data but no weekly plan match: the comparison table says n/a for things with no baseline
    const table = screen.getByRole('table')
    expect(within(table).getByText('Plan consistency').closest('tr')).toHaveTextContent('n/a')
    await user.click(screen.getByRole('button', { name: /CSV/ }))
    expect(mocks.download).toHaveBeenCalledWith(
      'lifetrack-insights-month-2026-11-01_to_2026-11-30.csv',
      expect.stringContaining('LifeTrack Insights'),
    )
    await user.click(screen.getByRole('button', { name: /PDF/ }))
    expect(mocks.downloadPdf).toHaveBeenCalledWith('lifetrack-insights-month-2026-11-01_to_2026-11-30.pdf', expect.any(Uint8Array))
  })

  it('steps back a period and cannot step into the future', async () => {
    mocks.rows = seed()
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.getByTestId('insights-range-note')).not.toHaveTextContent('counted through') // October is complete
    await user.click(screen.getByRole('tab', { name: 'Quarter' }))
    expect(screen.getByText('Q4 2026')).toBeInTheDocument()
  })

  it('module tabs: finance numbers, and an honest empty state for a module never used', async () => {
    mocks.rows = seed()
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Finance' }))
    expect(screen.getByText('Where the money went')).toBeInTheDocument()
    expect(screen.getByText(/Largest expense/)).toHaveTextContent('₹3,000')
    await user.click(screen.getByRole('tab', { name: 'Career & Learning' }))
    expect(screen.getByText('Job search')).toBeInTheDocument()
    expect(screen.getByText('No job application history yet')).toBeInTheDocument()
  })

  it('a locked module is never rendered or exported', async () => {
    mocks.rows = seed()
    mocks.closed = ['finance']
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Finance' }))
    expect(screen.getByTestId('locked-finance')).toBeInTheDocument()
    expect(screen.queryByText(/Largest expense/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /CSV/ }))
    expect(mocks.download.mock.calls[0][1]).not.toContain('Rent')
    expect(mocks.download.mock.calls[0][1]).not.toContain('3000.00')
  })
})
