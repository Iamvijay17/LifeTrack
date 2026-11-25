import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const svc = vi.hoisted(() => ({
  platformAvailable: vi.fn(() => true),
  isPlatformAdmin: vi.fn(),
  systemOverview: vi.fn(),
  systemMetrics: vi.fn(),
  systemErrors: vi.fn(),
  dbOverviewCached: vi.fn(),
  dbQueryReportCached: vi.fn(),
  dbCacheStats: vi.fn(() => ({ hitRate: null })),
}))
vi.mock('@/services/platform', async (orig) => ({ ...(await orig()), ...svc }))

const { default: SystemHealthPage } = await import('@/features/system/SystemHealthPage')
const now = new Date().toISOString()
const overview = (o = {}) => ({
  generated_at: now,
  hours: 24,
  latency_ms: 3,
  connections: { total: 9, active: 1, idle: 7, idle_in_transaction: 0, max: 60 },
  database: { size_bytes: 52_428_800, blocks_hit: 1e6, blocks_read: 2e3, rollbacks: 4, deadlocks: 0 },
  cache_hit_ratio: 0.998,
  tables: [
    {
      table: 'tasks',
      rows: 90000,
      dead_rows: 0,
      size_bytes: 20_000_000,
      seq_scans: 800,
      seq_rows_read: 40_000_000,
      index_scans: 100,
      last_vacuum: null,
      last_analyze: null,
    },
  ],
  indexes: [{ table: 'tasks', index: 'tasks_user_created_idx', scans: 0, size_bytes: 3_000_000, unique: false, primary: false }],
  slow_queries: [],
  statements_available: false,
  aggregation: { count_audit_ms: 1.2, group_by_day_ms: 2.5 },
  trend: [],
  ...o,
})
const openDb = async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <SystemHealthPage />
    </MemoryRouter>,
  )
  await user.click(await screen.findByRole('tab', { name: 'Database performance' }))
  return user
}
beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockReset?.())
  svc.platformAvailable.mockReturnValue(true)
  svc.isPlatformAdmin.mockResolvedValue(true)
  svc.dbCacheStats.mockReturnValue({ hitRate: null })
  svc.systemOverview.mockResolvedValue({
    generated_at: now,
    database: { ok: true, latency_ms: 3, slow_queries: [] },
    api: { requests: 0 },
    errors: {},
    jobs: [],
    webhooks: {},
    incidents: [],
    storage: {},
  })
  svc.systemMetrics.mockResolvedValue({ hours: 24, series: [] })
  svc.systemErrors.mockResolvedValue({ total: 0, items: [] })
  svc.dbOverviewCached.mockResolvedValue(overview())
  svc.dbQueryReportCached.mockResolvedValue({ hours: 24, rows: [] })
})

describe('System Health → Database performance', () => {
  it('lives inside the existing page and is for administrators only', async () => {
    svc.isPlatformAdmin.mockResolvedValue(false)
    render(
      <MemoryRouter>
        <SystemHealthPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Database performance' })).toBeNull()
    expect(svc.dbOverviewCached).not.toHaveBeenCalled()
  })
  it('shows real connection, size, cache and latency numbers', async () => {
    await openDb()
    const view = await screen.findByTestId('db-performance')
    expect(view).toHaveTextContent('9 / 60')
    expect(view).toHaveTextContent('50.0 MB')
    expect(view).toHaveTextContent('99.80%')
    expect(view).toHaveTextContent('3 ms')
    expect(view).toHaveTextContent('Count of audit history 1.2 ms')
  })
  it('turns the numbers into prioritised findings, with the evidence', async () => {
    await openDb()
    const list = await screen.findByTestId('findings')
    expect(list).toHaveTextContent('Most reads of “tasks” scan the whole table')
    expect(list).toHaveTextContent('40,000,000')
    expect(within(list).getAllByText('high').length).toBe(1)
    expect(list).toHaveTextContent('tasks_user_created_idx') // the unused-index note, lowest priority, listed after
    expect(screen.getByTestId('perf-status')).toHaveAttribute('data-status', 'degraded')
  })
  it('is honest when there is nothing to report or nothing measured', async () => {
    svc.dbOverviewCached.mockResolvedValue(overview({ tables: [], indexes: [] }))
    await openDb()
    expect(await screen.findByTestId('no-findings')).toBeInTheDocument()
    expect(screen.getByText(/No measurements in this window yet/)).toBeInTheDocument()
    expect(screen.getByText(/pg_stat_statements extension is not enabled/)).toBeInTheDocument() // never an invented number
    expect(screen.getByTestId('perf-status')).toHaveAttribute('data-status', 'operational')
  })
  it("lists the browsers' query statistics (virtualised) and flags rows-per-call", async () => {
    svc.dbQueryReportCached.mockResolvedValue({
      hours: 24,
      rows: Array.from({ length: 80 }, (_, i) => ({
        location: i === 0 ? 'tasks.select' : `t${i}.select`,
        table: i === 0 ? 'tasks' : `t${i}`,
        operation: 'select',
        calls: 10,
        errors: 0,
        slow: 0,
        avg_ms: 20,
        max_ms: 90,
        rows_avg: i === 0 ? 3000 : 5,
      })),
    })
    svc.dbOverviewCached.mockResolvedValue(overview({ tables: [], indexes: [] }))
    await openDb()
    const list = await screen.findByTestId('virtual-list')
    expect(list.querySelectorAll('[role=listitem]').length).toBeLessThan(40) // 80 rows, only the visible ones are in the page
    expect(list).toHaveTextContent('tasks.select')
    expect(await screen.findByTestId('findings')).toHaveTextContent('return many rows per call')
  })
  it('a failure is an error with a retry, not an empty page', async () => {
    svc.dbOverviewCached.mockRejectedValue(new Error('boom'))
    await openDb()
    expect(await screen.findByText(/boom/)).toBeInTheDocument()
  })
})
