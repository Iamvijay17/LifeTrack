import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const svc = vi.hoisted(() => ({
  platformAvailable: vi.fn(() => true),
  listAuditEvents: vi.fn(),
  exportAuditEvents: vi.fn(async () => []),
  previewRestore: vi.fn(),
  applyRestore: vi.fn(),
  verifyAuditChain: vi.fn(async () => ({ ok: true, checked: 12 })),
  eraseAuditHistory: vi.fn(async () => 7),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }))
vi.mock('@/services/platform', async (orig) => ({ ...(await orig()), ...svc }))
vi.mock('@/services/auditLog', () => ({ logAudit: vi.fn() }))

const { default: AuditPage } = await import('@/features/audit/AuditPage')
const { ConfirmProvider } = await import('@/components/shared/Confirm')
const { toast } = await import('sonner')
const open = (url = '/audit') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ConfirmProvider>
        <AuditPage />
      </ConfirmProvider>
    </MemoryRouter>,
  )
const ev = (o) => ({
  id: 'e' + Math.random().toString(16).slice(2, 8),
  seq: 1,
  occurred_at: '2026-11-24T10:30:00Z',
  action: 'update',
  operation: 'update',
  entity: 'tasks',
  record_id: '3f2de126-0ce4-4c08-926d-1ada427b105f',
  summary: 'Pay rent',
  changed_fields: ['priority'],
  old_values: { priority: 'low' },
  new_values: { priority: 'high' },
  truncated: false,
  request_id: 'req-1',
  source: 'web',
  ...o,
})

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockClear?.())
  svc.platformAvailable.mockReturnValue(true)
  svc.listAuditEvents.mockResolvedValue({
    rows: [
      ev({ id: 'e-update' }),
      ev({
        id: 'e-create',
        action: 'create',
        operation: 'insert',
        changed_fields: [],
        old_values: null,
        new_values: { title: 'Pay rent', priority: 'low' },
      }),
    ],
    total: 2,
  })
})

describe('Audit History page', () => {
  it('lists events with plain descriptions, and compares before and after on demand', async () => {
    open()
    expect(await screen.findByText(/Updated task “Pay rent”: changed priority/)).toBeInTheDocument()
    expect(screen.getByText('Created task “Pay rent”')).toBeInTheDocument()
    expect(screen.queryByTestId('audit-detail')).toBeNull()
    await userEvent.click(screen.getByText(/Updated task/))
    const detail = await screen.findByTestId('audit-detail')
    const row = within(detail).getByRole('row', { name: /Priority/ })
    expect(within(row).getByText('low')).toBeInTheDocument()
    expect(within(row).getByText('high')).toBeInTheDocument()
    expect(within(detail).getByText('req-1')).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: /restore earlier values/i })).toBeInTheDocument()
  })
  it('does not offer to restore a creation', async () => {
    open()
    await userEvent.click(await screen.findByText('Created task “Pay rent”'))
    expect(within(await screen.findByTestId('audit-detail')).queryByRole('button', { name: /restore/i })).toBeNull()
  })
  it('filters by module, action and search, and starts again from the first page', async () => {
    open('/audit?module=Finance%20%26%20Expenses&action=delete')
    await screen.findByText(/Updated task/)
    const filters = svc.listAuditEvents.mock.calls.at(-1)[0].filters
    expect(filters.actions).toEqual(['delete'])
    expect(filters.entities).toContain('transactions')
    expect(filters.entities).not.toContain('tasks')
    await userEvent.type(screen.getByPlaceholderText(/search record/i), 'rent')
    await waitFor(() => expect(svc.listAuditEvents.mock.calls.at(-1)[0].filters.search).toBe('rent'))
    expect(svc.listAuditEvents.mock.calls.at(-1)[0].page).toBe(0)
  })
  it('pages through older events', async () => {
    svc.listAuditEvents.mockResolvedValue({
      rows: Array.from({ length: 25 }, (_, i) => ev({ id: `p${i}`, summary: `Item ${i}` })),
      total: 60,
    })
    open()
    expect(await screen.findByText('1–25 of 60')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /newer/i })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /older/i }))
    await waitFor(() => expect(svc.listAuditEvents.mock.calls.at(-1)[0].page).toBe(1))
  })
  it('has loading, empty, filtered-empty and error states', async () => {
    svc.listAuditEvents.mockResolvedValue({ rows: [], total: 0 })
    const { unmount } = open()
    expect(await screen.findByText('No history yet')).toBeInTheDocument()
    unmount()
    svc.listAuditEvents.mockResolvedValue({ rows: [], total: 0 })
    const second = open('/audit?action=delete')
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument()
    second.unmount()
    svc.listAuditEvents.mockRejectedValue(new Error('Network down'))
    open()
    expect(await screen.findByText(/Network down/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument()
  })
  it('explains itself instead of showing dead controls when there is no server', async () => {
    svc.platformAvailable.mockReturnValue(false)
    open()
    expect(await screen.findByText(/needs a supabase project/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
    expect(svc.listAuditEvents).not.toHaveBeenCalled()
  })
  it('verifies the history and exports the log', async () => {
    svc.exportAuditEvents.mockResolvedValue([ev({ id: 'x' })])
    const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    open()
    await screen.findByText(/Updated task/)
    await userEvent.click(screen.getByRole('button', { name: /verify integrity/i }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'History intact',
        expect.objectContaining({ description: expect.stringContaining('12 events') }),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }))
    await waitFor(() => expect(url).toHaveBeenCalled())
    const blob = url.mock.calls[0][0]
    const text = await new Promise((r) => {
      const fr = new FileReader()
      fr.onload = () => r(fr.result)
      fr.readAsText(blob)
    })
    expect(text).toContain('Updated task')
    expect(text).not.toContain('"high"') // values are not exported
    url.mockRestore()
  })
})

describe('erasing the history', () => {
  it('needs the typed word, then erases and says a note is kept', async () => {
    open()
    await screen.findByText(/Updated task/)
    await userEvent.click(screen.getByRole('button', { name: 'erase it' }))
    const dialog = await screen.findByRole('dialog')
    const go = within(dialog).getByRole('button', { name: 'Erase history' })
    expect(go).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(/Type ERASE/), 'erase')
    expect(go).toBeDisabled() // case matters
    await userEvent.clear(within(dialog).getByLabelText(/Type ERASE/))
    await userEvent.type(within(dialog).getByLabelText(/Type ERASE/), 'ERASE')
    await userEvent.click(go)
    await waitFor(() => expect(svc.eraseAuditHistory).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith('Erased 7 events', expect.objectContaining({ description: expect.stringContaining('note') }))
  })
})

describe('restoring', () => {
  const preview = (o) => ({
    restorable: true,
    mode: 'revert',
    entity: 'tasks',
    record_id: 'r',
    changes: [{ field: 'priority', current: 'high', restore_to: 'low' }],
    conflicts: [],
    applied: false,
    ...o,
  })
  const start = async () => {
    open()
    await userEvent.click(await screen.findByText(/Updated task/))
    await userEvent.click(await screen.findByRole('button', { name: /restore earlier values/i }))
    return screen.findByRole('dialog')
  }
  it('previews exactly what will change and needs an explicit confirmation before restoring', async () => {
    svc.previewRestore.mockResolvedValue(preview())
    svc.applyRestore.mockResolvedValue(preview({ applied: true }))
    const dialog = await start()
    expect(await within(dialog).findByText('After restoring')).toBeInTheDocument()
    expect(within(dialog).getByText('high')).toBeInTheDocument()
    const go = within(dialog).getByRole('button', { name: 'Restore' })
    expect(go).toBeDisabled()
    expect(svc.applyRestore).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('checkbox'))
    expect(go).toBeEnabled()
    await userEvent.click(go)
    await waitFor(() => expect(svc.applyRestore).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith('Earlier values restored', expect.anything())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(svc.listAuditEvents.mock.calls.length).toBeGreaterThan(1) // the list reloads to show the new restore event
  })
  it('refuses on a conflict: shows what changed since and cannot be confirmed', async () => {
    svc.previewRestore.mockResolvedValue(
      preview({
        restorable: false,
        reason: 'conflict',
        message: 'This record was changed after that event. Nothing was overwritten.',
        conflicts: [{ field: 'priority', expected: 'high', current: 'medium' }],
      }),
    )
    const dialog = await start()
    expect(await within(dialog).findByText(/changed after that event/)).toBeInTheDocument()
    expect(within(dialog).getByText(/is now “medium”/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Restore' })).toBeDisabled()
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
  })
  it('keeps the dialog open and says why if applying fails at the last moment', async () => {
    svc.previewRestore.mockResolvedValue(preview())
    svc.applyRestore.mockResolvedValue({
      applied: false,
      reason: 'conflict',
      message: 'This record was changed after that event. Nothing was overwritten.',
    })
    const dialog = await start()
    await userEvent.click(await within(dialog).findByRole('checkbox'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('changed after that event')))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
