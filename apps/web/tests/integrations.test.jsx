import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
  disconnect: vi.fn(async () => ({})),
  calendars: vi.fn(async () => [{ id: 'primary', name: 'Me', primary: true }]),
  syncCalendar: vi.fn(),
  backup: vi.fn(),
  backups: vi.fn(async () => []),
  downloadBackup: vi.fn(),
}))
const rows = vi.hoisted(() => ({ integrations: [], integration_events: [] }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }))
vi.mock('@/services/integrations', async (orig) => ({ ...(await orig()), integrations: api }))
vi.mock('@/hooks/store', async (orig) => ({
  ...(await orig()),
  useTable: (t) => ({ rows: rows[t] ?? [], loading: false }),
  refetch: vi.fn(),
}))
vi.mock('@/services/backup', () => ({ buildExport: async () => ({ app: 'lifetrack', version: 1, tables: {} }) }))

const { default: IntegrationsPage } = await import('@/features/integrations/IntegrationsPage')
const { ConfirmProvider } = await import('@/components/shared/Confirm')
const open = (url = '/integrations') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ConfirmProvider>
        <IntegrationsPage />
      </ConfirmProvider>
    </MemoryRouter>,
  )
const row = (o) => ({
  id: 'r',
  status: 'connected',
  account_email: 'me@gmail.com',
  last_error: '',
  last_sync_at: new Date().toISOString(),
  settings: {},
  ...o,
})

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockClear?.())
  rows.integrations = []
  rows.integration_events = []
  api.capabilities.mockResolvedValue({ configured: true })
})

describe('Integration Center', () => {
  it('is honest when Google is not set up: says so and cannot connect', async () => {
    api.capabilities.mockResolvedValue({ configured: false })
    open()
    expect(await screen.findByText(/not set up on this server yet, so nothing can be connected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect google drive/i })).toBeDisabled()
    expect(screen.getAllByText('Not connected')).toHaveLength(2)
  })
  it('says when the service cannot be reached', async () => {
    api.capabilities.mockRejectedValue(new Error('The integration service is not reachable.'))
    open()
    expect(await screen.findByText(/not reachable/i)).toBeInTheDocument()
  })
  it('lists the permissions each integration asks for', async () => {
    open()
    expect(await screen.findAllByText(/What LifeTrack can do with your Google account/)).toHaveLength(2)
    expect(screen.getByText(/cannot see anything else in your Drive/i)).toBeInTheDocument()
  })
  it('back from Google: finishes the connection as the signed-in person, once, and clears the code from the address bar', async () => {
    const { toast } = await import('sonner')
    api.finish.mockResolvedValue('google_drive')
    window.history.replaceState(null, '', '/integrations#gcode=4%2F0Abc&gstate=signed.state')
    open()
    await waitFor(() => expect(api.finish).toHaveBeenCalledTimes(1))
    expect(api.finish).toHaveBeenCalledWith('4/0Abc', 'signed.state')
    expect(window.location.hash).toBe('')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Google Drive connected'))
  })
  it('explains a connection that was started from a different account, and connects nothing', async () => {
    const { toast } = await import('sonner')
    api.finish.mockRejectedValue(Object.assign(new Error('x'), { code: 'wrong_account' }))
    window.history.replaceState(null, '', '/integrations#gcode=c&gstate=s')
    open()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/different LifeTrack account/)))
    expect(window.location.hash).toBe('')
  })
  it('starts the connection through the server', async () => {
    const user = userEvent.setup()
    api.start.mockResolvedValue('about:blank#google')
    open()
    const btn = await screen.findByRole('button', { name: /connect google drive/i })
    await waitFor(() => expect(btn).toBeEnabled())
    await user.click(btn)
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('google_drive'))
  })
  it('shows a connected account, its last sync and the activity, and disconnects after confirming', async () => {
    const user = userEvent.setup()
    rows.integrations = [row({ provider: 'google_drive' })]
    rows.integration_events = [
      {
        id: 'e1',
        provider: 'google_drive',
        kind: 'backup',
        message: 'Backup saved to your Drive: b.json',
        created_at: new Date().toISOString(),
      },
    ]
    open()
    expect(await screen.findByText('me@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Backup saved')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^disconnect$/i }))
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'))
    expect(api.disconnect).not.toHaveBeenCalled() // nothing happens until confirmed
    await user.click(within(dialog).getByRole('button', { name: /^disconnect$/i }))
    await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith('google_drive'))
  })
  it('a Drive backup is only uploaded after an explicit confirmation', async () => {
    const user = userEvent.setup()
    rows.integrations = [row({ provider: 'google_drive' })]
    api.backup.mockResolvedValue({ id: 'F1', name: 'b.json' })
    open()
    await user.click(await screen.findByRole('button', { name: /back up now/i }))
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'))
    expect(within(dialog).getByText(/complete copy of your LifeTrack data/i)).toBeInTheDocument()
    expect(api.backup).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: /upload backup/i }))
    await waitFor(() => expect(api.backup).toHaveBeenCalledTimes(1))
  })
  it('shows revoked access with a way to reconnect', async () => {
    rows.integrations = [row({ provider: 'google_calendar', status: 'revoked' })]
    open()
    expect(await screen.findByText('Access revoked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect again/i })).toBeInTheDocument()
  })
  it('asks the person to decide a sync conflict instead of overwriting', async () => {
    const user = userEvent.setup()
    rows.integrations = [row({ provider: 'google_calendar' })]
    const when = '2026-11-25T04:30:00.000Z'
    api.syncCalendar.mockResolvedValueOnce({
      counts: { imported: 0, exported: 0, updated: 0 },
      remoteGone: [],
      conflicts: [{ localId: 'L1', local: { title: 'Mine', starts_at: when }, remote: { title: 'Theirs', starts_at: when } }],
    })
    api.syncCalendar.mockResolvedValueOnce({ counts: { imported: 0, exported: 0, updated: 1 }, remoteGone: [], conflicts: [] })
    open()
    await user.click(await screen.findByRole('button', { name: /sync now/i }))
    const region = await screen.findByRole('region', { name: /need your decision/i })
    expect(within(region).getByText(/Mine/)).toBeInTheDocument()
    await user.click(within(region).getByRole('button', { name: /use google's/i }))
    await waitFor(() => expect(api.syncCalendar).toHaveBeenLastCalledWith('primary', { L1: 'remote' }))
  })
})
