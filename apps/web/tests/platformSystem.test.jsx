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
}))
vi.mock('@/services/platform', async (orig) => ({ ...(await orig()), ...svc }))

const { default: SystemHealthPage } = await import('@/features/system/SystemHealthPage')
const open = () =>
  render(
    <MemoryRouter>
      <SystemHealthPage />
    </MemoryRouter>,
  )
const now = new Date().toISOString()
const overview = (o = {}) => ({
  generated_at: now,
  database: { ok: true, latency_ms: 3, slow_queries: [] },
  api: {
    requests: 120,
    errors_4xx: 4,
    errors_5xx: 0,
    auth_failures: 2,
    rate_limited: 1,
    avg_ms: 85,
    max_ms: 400,
    slow: 0,
    hist: [80, 30, 8, 2, 0, 0],
  },
  errors: { total_24h: 2, distinct_24h: 1, sync_24h: 0, by_category: {} },
  jobs: [{ job: 'webhook-dispatch', last_run: now, last_status: 'ok', last_error: '', runs_24h: 1440, failures_24h: 0 }],
  webhooks: { pending: 0, dead: 0, failed_24h: 0, delivered_24h: 7 },
  last_backup_at: null,
  incidents: [],
  storage: { errors_rows: 1, request_log_rows: 5, job_runs_rows: 3, audit_rows: 40 },
  ...o,
})

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockClear?.())
  svc.platformAvailable.mockReturnValue(true)
  svc.isPlatformAdmin.mockResolvedValue(true)
  svc.systemOverview.mockResolvedValue(overview())
  svc.systemMetrics.mockResolvedValue({
    hours: 24,
    series: Array.from({ length: 24 }, (_, i) => ({
      hour: new Date(Date.now() - (23 - i) * 3600e3).toISOString(),
      requests: i,
      errors_4xx: 0,
      errors_5xx: 0,
      auth_failures: 0,
      avg_ms: 80,
      max_ms: 200,
      client_errors: 0,
    })),
  })
  svc.systemErrors.mockResolvedValue({
    total: 1,
    items: [
      {
        id: 'x',
        category: 'frontend',
        message: 'Boom',
        stack: 'Error: Boom\n  at f',
        route: '/tasks',
        release: '',
        occurrences: 3,
        first_seen: now,
        last_seen: now,
      },
    ],
  })
})

describe('System Health', () => {
  it('is closed to people who are not administrators and asks the server nothing else', async () => {
    svc.isPlatformAdmin.mockResolvedValue(false)
    open()
    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(svc.systemOverview).not.toHaveBeenCalled()
    expect(svc.systemErrors).not.toHaveBeenCalled()
  })
  it('shows overall status, every component, KPIs and the latest errors for an administrator', async () => {
    open()
    const banner = await screen.findByTestId('overall-status')
    expect(banner).toHaveAttribute('data-status', 'operational')
    for (const name of ['Backend', 'Database', 'API', 'Sync engine', 'Background jobs', 'Webhook delivery'])
      expect(screen.getByTestId(`component-${name}`)).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument() // requests
    expect(screen.getByText(/p95 250 ms/)).toBeInTheDocument()
    expect(await screen.findByText('Boom')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Boom'))
    expect(screen.getByTestId('error-stack')).toHaveTextContent('Error: Boom')
  })
  it('turns degraded or down with a reason when something is wrong', async () => {
    svc.systemOverview.mockResolvedValue(
      overview({
        api: {
          requests: 100,
          errors_4xx: 0,
          errors_5xx: 30,
          auth_failures: 0,
          rate_limited: 0,
          avg_ms: 90,
          max_ms: 300,
          slow: 0,
          hist: [100, 0, 0, 0, 0, 0],
        },
        webhooks: { pending: 1, dead: 2, failed_24h: 2, delivered_24h: 0 },
        incidents: [{ at: now, kind: 'api', title: 'High API error rate', detail: '30 of 100 requests failed with a server error' }],
      }),
    )
    open()
    const banner = await screen.findByTestId('overall-status')
    expect(banner).toHaveAttribute('data-status', 'down')
    expect(within(banner).getByText(/30\.0% of requests failed/)).toBeInTheDocument()
    expect(screen.getByText('High API error rate')).toBeInTheDocument()
  })
  it('does not call an idle installation broken', async () => {
    svc.systemOverview.mockResolvedValue(overview({ api: { requests: 0 }, jobs: [], hist: [] }))
    open()
    expect(await screen.findByTestId('overall-status')).toHaveAttribute('data-status', 'operational')
    expect(screen.getByTestId('component-API')).toHaveTextContent('No data yet')
  })
  it('reports a failure to load', async () => {
    svc.systemOverview.mockRejectedValue(new Error('Administrator access required.'))
    open()
    expect(await screen.findByText(/Administrator access required\./)).toBeInTheDocument()
  })
  it('explains when there is no server', async () => {
    svc.platformAvailable.mockReturnValue(false)
    open()
    expect(await screen.findByText(/needs a supabase project/i)).toBeInTheDocument()
    expect(svc.isPlatformAdmin).not.toHaveBeenCalled()
  })
})
