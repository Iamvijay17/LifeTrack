import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const svc = vi.hoisted(() => ({
  platformAvailable: vi.fn(() => true),
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(async () => {}),
  updateApiKey: vi.fn(),
  apiUsage: vi.fn(),
  listApiRequests: vi.fn(),
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(async () => {}),
  deleteWebhook: vi.fn(async () => {}),
  rotateWebhookSecret: vi.fn(),
  listDeliveries: vi.fn(),
  listAttempts: vi.fn(async () => []),
  retryDelivery: vi.fn(async () => {}),
  deliverNow: vi.fn(async () => ({ claimed: 0 })),
  sendTest: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }))
vi.mock('@/services/platform', async (orig) => ({ ...(await orig()), ...svc }))

const { default: DevelopersPage } = await import('@/features/developers/DevelopersPage')
const { ConfirmProvider } = await import('@/components/shared/Confirm')
const { toast } = await import('sonner')
const open = (url = '/developers') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ConfirmProvider>
        <DevelopersPage />
      </ConfirmProvider>
    </MemoryRouter>,
  )
const KEY = 'lt_live_' + 'Z'.repeat(43)
const key = (o) => ({
  id: 'k1',
  name: 'CI',
  description: '',
  key_prefix: 'lt_live_ZZZZZZZ',
  scopes: ['tasks:read'],
  rate_limit_per_min: 60,
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  request_count: 0,
  created_at: '2026-11-01T00:00:00Z',
  ...o,
})
const hook = (o) => ({
  id: 'w1',
  url: 'https://hooks.example.com/in',
  description: '',
  events: ['task.created'],
  enabled: true,
  timeout_ms: 5000,
  max_attempts: 6,
  consecutive_failures: 0,
  disabled_reason: '',
  last_delivery_at: null,
  created_at: '2026-11-01T00:00:00Z',
  ...o,
})

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockClear?.())
  svc.platformAvailable.mockReturnValue(true)
  svc.listApiKeys.mockResolvedValue([])
  svc.apiUsage.mockResolvedValue({
    totals: { requests: 0, ok: 0, client_errors: 0, server_errors: 0, rate_limited: 0 },
    daily: [],
    top: [],
  })
  svc.listApiRequests.mockResolvedValue({ rows: [], total: 0 })
  svc.listWebhooks.mockResolvedValue([])
  svc.listDeliveries.mockResolvedValue({ rows: [], total: 0 })
})

describe('API keys', () => {
  it('shows an empty state with a way forward', async () => {
    open()
    expect(await screen.findByText('No API keys yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create your first key/i })).toBeInTheDocument()
  })
  it('creates a key with chosen permissions and shows the secret exactly once', async () => {
    svc.createApiKey.mockResolvedValue({ key: KEY, id: 'k1', name: 'Home server', key_prefix: 'lt_live_ZZZZZZZ', scopes: ['tasks:read'] })
    open()
    await userEvent.click(await screen.findByRole('button', { name: /^new key$/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /create key/i }))
    expect(await within(dialog).findByText('Give the key a name.')).toBeInTheDocument()
    expect(within(dialog).getByText('Choose at least one permission.')).toBeInTheDocument()
    expect(svc.createApiKey).not.toHaveBeenCalled()
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Home server')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /tasks:read/ }))
    svc.listApiKeys.mockResolvedValue([key({ name: 'Home server' })])
    await userEvent.click(within(dialog).getByRole('button', { name: /create key/i }))
    await waitFor(() =>
      expect(svc.createApiKey).toHaveBeenCalledWith({
        name: 'Home server',
        description: '',
        scopes: ['tasks:read'],
        expiresDays: 90,
        rateLimit: 60,
      }),
    )
    const secret = await screen.findByTestId('secret-value')
    expect(secret).toHaveTextContent(KEY)
    expect(screen.getAllByText(/cannot be shown again|will not be able to see this again/i).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /i have saved it/i }))
    await waitFor(() => expect(screen.queryByTestId('secret-value')).toBeNull())
    // the list only ever carries the prefix
    const card = await screen.findByTestId('api-key')
    expect(within(card).getByText(/lt_live_ZZZZZZZ…/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(KEY)
  })
  it('revokes only after confirmation', async () => {
    svc.listApiKeys.mockResolvedValue([key()])
    open()
    await userEvent.click(await screen.findByRole('button', { name: /revoke/i }))
    const dialog = await screen.findByRole('dialog')
    expect(svc.revokeApiKey).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: /revoke key/i }))
    await waitFor(() => expect(svc.revokeApiKey).toHaveBeenCalledWith('k1'))
  })
  it('shows revoked and expired keys as such, without revoke or edit', async () => {
    svc.listApiKeys.mockResolvedValue([
      key({ id: 'a', name: 'Old', revoked_at: '2026-11-02T00:00:00Z' }),
      key({ id: 'b', name: 'Stale', expires_at: '2020-01-01T00:00:00Z' }),
    ])
    open()
    expect(await screen.findByText('Revoked')).toBeInTheDocument()
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /revoke/i })).toHaveLength(1)
  })
  it('lists request activity and filters to errors', async () => {
    svc.listApiKeys.mockResolvedValue([key()])
    svc.listApiRequests.mockResolvedValue({
      rows: [
        {
          id: 1,
          key_id: 'k1',
          request_id: 'r-1',
          method: 'GET',
          path: '/v1/tasks',
          status: 429,
          duration_ms: 3,
          error_code: 'rate_limited',
          created_at: '2026-11-24T10:00:00Z',
        },
      ],
      total: 1,
    })
    open('/developers?tab=activity')
    expect(await screen.findByText('GET /v1/tasks')).toBeInTheDocument()
    expect(screen.getByText('429 rate_limited')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /errors only/i }))
    await waitFor(() => expect(svc.listApiRequests.mock.calls.at(-1)[0].onlyErrors).toBe(true))
  })
})

describe('webhooks', () => {
  it('validates the address and events before anything is sent', async () => {
    open('/developers?tab=webhooks')
    await userEvent.click(await screen.findByRole('button', { name: /add a webhook/i }))
    const dialog = await screen.findByRole('dialog')
    const url = within(dialog).getByLabelText('Endpoint URL')
    await userEvent.clear(url)
    await userEvent.type(url, 'http://localhost:3000/hook')
    await userEvent.click(within(dialog).getByRole('button', { name: /add webhook/i }))
    expect(await within(dialog).findByText(/use an https/i)).toBeInTheDocument()
    expect(within(dialog).getByText('Choose at least one event.')).toBeInTheDocument()
    await userEvent.clear(url)
    await userEvent.type(url, 'https://10.0.0.5/hook')
    await userEvent.click(within(dialog).getByRole('button', { name: /add webhook/i }))
    expect(await within(dialog).findByText(/IP address|internal/i)).toBeInTheDocument()
    expect(svc.createWebhook).not.toHaveBeenCalled()
  })
  it('registers an endpoint and shows its signing secret once', async () => {
    svc.createWebhook.mockResolvedValue({ id: 'w1', secret: 'whsec_' + 'a'.repeat(48) })
    open('/developers?tab=webhooks')
    await userEvent.click(await screen.findByRole('button', { name: /add a webhook/i }))
    const dialog = await screen.findByRole('dialog')
    const url = within(dialog).getByLabelText('Endpoint URL')
    await userEvent.clear(url)
    await userEvent.type(url, 'https://hooks.example.com/in')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /task\.completed/ }))
    svc.listWebhooks.mockResolvedValue([hook({ events: ['task.completed'] })])
    await userEvent.click(within(dialog).getByRole('button', { name: /add webhook/i }))
    await waitFor(() =>
      expect(svc.createWebhook).toHaveBeenCalledWith({
        url: 'https://hooks.example.com/in',
        description: '',
        events: ['task.completed'],
        timeoutMs: 5000,
        maxAttempts: 6,
      }),
    )
    expect(await screen.findByTestId('secret-value')).toHaveTextContent(/^whsec_a{48}$/)
    await userEvent.click(screen.getByRole('button', { name: /i have saved it/i }))
    expect(await screen.findByTestId('webhook')).toHaveTextContent('task.completed')
  })
  it('can be switched off, tested and deleted (with confirmation)', async () => {
    svc.listWebhooks.mockResolvedValue([hook()])
    svc.sendTest.mockResolvedValue({ claimed: 1, delivered: 1 })
    open('/developers?tab=webhooks')
    await userEvent.click(await screen.findByRole('switch', { name: /disable/i }))
    await waitFor(() =>
      expect(svc.updateWebhook).toHaveBeenCalledWith('w1', expect.objectContaining({ enabled: false, events: ['task.created'] })),
    )
    await userEvent.click(screen.getByRole('button', { name: /send test/i }))
    await waitFor(() => expect(svc.sendTest).toHaveBeenCalledWith('w1'))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(svc.deleteWebhook).not.toHaveBeenCalled()
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /delete webhook/i }))
    await waitFor(() => expect(svc.deleteWebhook).toHaveBeenCalledWith('w1'))
  })
  it('shows delivery status and attempts, and retries a dead-lettered delivery', async () => {
    svc.listWebhooks.mockResolvedValue([hook()])
    svc.listDeliveries.mockResolvedValue({
      rows: [
        {
          id: 'd1',
          endpoint_id: 'w1',
          event_type: 'task.created',
          status: 'dead',
          attempts: 3,
          next_attempt_at: '2026-11-24T10:00:00Z',
          last_status: 500,
          last_error: 'HTTP 500',
          delivered_at: null,
          created_at: '2026-11-24T09:00:00Z',
        },
        {
          id: 'd2',
          endpoint_id: 'w1',
          event_type: 'task.completed',
          status: 'delivered',
          attempts: 1,
          next_attempt_at: '2026-11-24T10:00:00Z',
          last_status: 200,
          last_error: '',
          delivered_at: '2026-11-24T09:01:00Z',
          created_at: '2026-11-24T09:00:30Z',
        },
      ],
      total: 2,
    })
    svc.listAttempts.mockResolvedValue([
      { id: 1, attempt: 1, ok: false, status: 500, error: 'HTTP 500', duration_ms: 31, created_at: '2026-11-24T09:00:05Z' },
    ])
    open('/developers?tab=webhooks')
    expect(await screen.findByText('Failed (dead letter)')).toBeInTheDocument()
    expect(screen.getByText('Delivered')).toBeInTheDocument()
    await userEvent.click(screen.getAllByTestId('delivery')[0].querySelector('button[aria-expanded]'))
    expect(await screen.findByRole('list', { name: 'Delivery attempts' })).toHaveTextContent('HTTP 500')
    expect(screen.getAllByRole('button', { name: /retry/i })).toHaveLength(1) // only the failed one
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(svc.retryDelivery).toHaveBeenCalledWith('d1'))
    expect(toast.success).toHaveBeenCalledWith('Queued for another attempt')
  })
})

describe('documentation', () => {
  it('documents the endpoints that exist and nothing else, and works without a server', async () => {
    svc.platformAvailable.mockReturnValue(false)
    open('/developers?tab=docs')
    const docs = await screen.findByTestId('api-docs')
    const { RESOURCES } = await import('@lifetrack/core/platformApi')
    for (const name of Object.keys(RESOURCES)) expect(within(docs).getAllByText(`/v1/${name}`).length).toBeGreaterThan(0)
    expect(within(docs).queryByText('DELETE')).toBeNull()
    expect(within(docs).getByText(/rate limit/i, { selector: 'h3' })).toBeInTheDocument()
    expect(within(docs).getAllByText(/X-LifeTrack-Signature/).length).toBeGreaterThan(0)
    expect(within(docs).getAllByText('429').length).toBeGreaterThan(0)
  })
  it('says plainly when keys and webhooks need a server', async () => {
    svc.platformAvailable.mockReturnValue(false)
    open()
    expect(await screen.findByText(/needs a supabase project/i)).toBeInTheDocument()
    expect(svc.listApiKeys).not.toHaveBeenCalled()
  })
})
