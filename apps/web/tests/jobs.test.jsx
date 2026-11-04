import '@testing-library/jest-dom/vitest'
import { pickOption, pickDate, pickTime } from './pickers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within, renderHook, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  isFollowupOverdue,
  filterApplications,
  appliedInWeek,
  upcomingInterviews,
  nextInterviews,
  groupInterviewsByDay,
  weeklyApplications,
  activePipelineCount,
  applicationSources,
  addChecklistItem,
  toggleChecklistItem,
  removeChecklistItem,
  checklistProgress,
  newChecklist,
  dueFollowups,
} from '@/domain/jobs'
import { formatLpa } from '@/lib/money'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), remove: vi.fn(), setStatus: vi.fn(), confirm: vi.fn() }))
vi.mock('@/hooks/store', () => ({ insert: mocks.insert, update: mocks.update, remove: mocks.remove }))
vi.mock('@/services/api', () => ({ setApplicationStatus: mocks.setStatus }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ApplicationDialog } from '@/features/jobs/ApplicationDialog'
import { InterviewDialog } from '@/features/jobs/InterviewDialog'
import { PrepChecklist, usePrepChecklist } from '@/features/jobs/PrepChecklist'
import { StatusHistory } from '@/features/jobs/StatusHistory'
import { Board } from '@/features/jobs/Board'
import { JobsToolbar } from '@/features/jobs/JobsToolbar'
import { ApplicationDetail } from '@/features/jobs/ApplicationDetail'

const TODAY = '2026-11-02'
const A = (o) => ({
  id: Math.random().toString(36).slice(2),
  company: 'Acme',
  job_title: 'Dev',
  status: 'applied',
  created_at: '2026-11-01T00:00:00Z',
  source: '',
  location: '',
  notes: '',
  contact_person: '',
  applied_date: null,
  followup_date: null,
  salary_paise: null,
  prep_checklist: [],
  ...o,
})

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.insert.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
  mocks.remove.mockResolvedValue(undefined)
  mocks.setStatus.mockResolvedValue({})
})

describe('jobs domain', () => {
  it('follow-ups are overdue only for applications still in play', () => {
    expect(isFollowupOverdue(A({ followup_date: '2026-11-01' }), TODAY)).toBe(true)
    expect(isFollowupOverdue(A({ followup_date: TODAY }), TODAY)).toBe(true)
    expect(isFollowupOverdue(A({ followup_date: '2026-11-03' }), TODAY)).toBe(false)
    expect(isFollowupOverdue(A({ followup_date: null }), TODAY)).toBe(false)
    for (const status of ['selected', 'offer', 'rejected', 'withdrawn'])
      expect(isFollowupOverdue(A({ status, followup_date: '2026-10-01' }), TODAY)).toBe(false)
  })
  it('keeps dueFollowups and the card badge consistent (same open-status rule)', () => {
    const apps = [A({ id: 'x', followup_date: '2026-10-30' }), A({ id: 'y', status: 'rejected', followup_date: '2026-10-30' })]
    expect(dueFollowups(apps, TODAY).map((a) => a.id)).toEqual(['x'])
    expect(apps.filter((a) => isFollowupOverdue(a, TODAY)).map((a) => a.id)).toEqual(['x'])
  })
  it('counts the active pipeline and distinct sources', () => {
    const apps = [
      A({ status: 'interested' }),
      A({ status: 'interview', source: 'LinkedIn' }),
      A({ status: 'offer', source: 'LinkedIn' }),
      A({ status: 'rejected', source: 'Referral' }),
    ]
    expect(activePipelineCount(apps)).toBe(2)
    expect(applicationSources(apps)).toEqual(['LinkedIn', 'Referral'])
  })
  it('counts applications in a week window inclusively', () => {
    const apps = [
      A({ applied_date: '2026-11-02' }),
      A({ applied_date: '2026-11-08' }),
      A({ applied_date: '2026-11-09' }),
      A({ applied_date: '2026-11-01' }),
      A({ applied_date: null }),
    ]
    expect(appliedInWeek(apps, '2026-11-02')).toBe(2)
  })
  it('filters by text, status and source, newest first', () => {
    const apps = [
      A({ id: 'a', company: 'Globex', created_at: '2026-11-01T00:00:00Z' }),
      A({ id: 'b', company: 'Initech', notes: 'great Team', status: 'interview', source: 'Referral', created_at: '2026-11-03T00:00:00Z' }),
    ]
    expect(filterApplications(apps).map((a) => a.id)).toEqual(['b', 'a'])
    expect(filterApplications(apps, { q: 'TEAM' }).map((a) => a.id)).toEqual(['b'])
    expect(filterApplications(apps, { status: 'applied' }).map((a) => a.id)).toEqual(['a'])
    expect(filterApplications(apps, { source: 'Referral' }).map((a) => a.id)).toEqual(['b'])
    expect(filterApplications(apps, { q: 'zzz' })).toEqual([])
  })
  it('weekly application series covers N weeks ending this week', () => {
    const s = weeklyApplications([A({ applied_date: '2026-11-03' }), A({ applied_date: '2026-10-27' })], TODAY, 1, 3)
    expect(s.map((x) => x.count)).toEqual([0, 1, 1])
    expect(s).toHaveLength(3)
  })
  const NOW = Date.parse('2026-11-02T10:00:00Z')
  const E = (id, at, o) => ({ id, application_id: 'a1', scheduled_at: at, status: 'scheduled', ...o })
  it('finds interviews in the next 7 days, scheduled only, with their application (orphans dropped)', () => {
    const apps = [A({ id: 'a1' })]
    const ev = [
      E('in', '2026-11-05T10:00:00Z'),
      E('past', '2026-11-01T10:00:00Z'),
      E('far', '2026-11-20T10:00:00Z'),
      E('done', '2026-11-04T10:00:00Z', { status: 'completed' }),
      E('orphan', '2026-11-04T10:00:00Z', { application_id: 'gone' }),
    ]
    expect(upcomingInterviews(ev, apps, NOW).map((e) => e.id)).toEqual(['in'])
    expect(upcomingInterviews(ev, apps, NOW)[0].app.id).toBe('a1')
  })
  it('lists the next interviews soonest first, capped', () => {
    const ev = [
      E('c', '2026-11-09T10:00:00Z'),
      E('a', '2026-11-03T10:00:00Z'),
      E('b', '2026-11-04T10:00:00Z'),
      E('old', '2026-10-01T10:00:00Z'),
    ]
    expect(nextInterviews(ev, NOW, 2).map((e) => e.id)).toEqual(['a', 'b'])
  })
  it("groups interviews by the day in the USER's timezone, not UTC", () => {
    // 20:00 UTC on 2 Nov is 01:30 on 3 Nov in Kolkata
    const ev = [E('late', '2026-11-02T20:00:00Z'), E('early', '2026-11-03T03:30:00Z')]
    const ist = groupInterviewsByDay(ev, 'Asia/Kolkata')
    expect([...ist.keys()]).toEqual(['2026-11-03'])
    expect(ist.get('2026-11-03').map((e) => e.id)).toEqual(['late', 'early'])
    expect([...groupInterviewsByDay(ev, 'UTC').keys()]).toEqual(['2026-11-02', '2026-11-03'])
  })
  it('checklist helpers never mutate and ignore blank items', () => {
    const base = [{ id: '1', text: 'a', done: false }]
    expect(addChecklistItem(base, '   ')).toBe(base)
    const added = addChecklistItem(base, ' b ')
    expect(added).toHaveLength(2)
    expect(added[1]).toMatchObject({ text: 'b', done: false })
    expect(base).toHaveLength(1)
    expect(toggleChecklistItem(added, '1', true)[0].done).toBe(true)
    expect(base[0].done).toBe(false)
    expect(removeChecklistItem(added, '1')).toHaveLength(1)
    expect(checklistProgress([{ done: true }, { done: false }, { done: true }])).toEqual({ done: 2, total: 3, percent: 67 })
    expect(checklistProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
    expect(newChecklist().length).toBeGreaterThan(3)
  })
  it('formats packages', () => {
    expect(formatLpa(180000000)).toBe('18 LPA')
    expect(formatLpa(null)).toBeNull()
  })
})

describe('ApplicationDialog', () => {
  const open = (p = {}) => render(<ApplicationDialog open onOpenChange={() => {}} today={TODAY} {...p} />)
  it('requires company and title, and validates the URL', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Company is required')).toBeInTheDocument()
    expect(screen.getByText('Job title is required')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Company'), 'Acme')
    await user.type(screen.getByLabelText('Job title'), 'Dev')
    fireEvent.change(screen.getByLabelText('Job description URL'), { target: { value: 'ftp://nope' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Must start with http:// or https://')).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('stores the package as paise (1 LPA = 1,00,000 rupees = 10,000,000 paise) and blank dates as null', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Company'), 'Acme')
    await user.type(screen.getByLabelText('Job title'), 'Dev')
    await user.type(screen.getByLabelText('Package (LPA)'), '18.5')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'job_applications',
        expect.objectContaining({
          company: 'Acme',
          salary_paise: 185000000,
          applied_date: null,
          followup_date: null,
          status: 'interested',
        }),
      ),
    )
    expect(mocks.insert.mock.calls[0][1]).not.toHaveProperty('salary_lpa')
  })
  it('rejects a non-numeric package', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Company'), 'A')
    await user.type(screen.getByLabelText('Job title'), 'B')
    await user.type(screen.getByLabelText('Package (LPA)'), 'lots')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter a number like 12 or 18.5')).toBeInTheDocument()
  })
  it('opened from the Applied column it pre-fills today as the applied date', () => {
    open({ defaultStatus: 'applied' })
    expect(screen.getByLabelText('Status')).toHavePickerValue('applied')
    expect(screen.getByLabelText('Applied on')).toHavePickerValue(TODAY)
  })
  it('editing pre-fills (including the LPA) and updates the same record', async () => {
    const user = userEvent.setup()
    open({ app: A({ id: 'j1', company: 'Globex', salary_paise: 120000000, status: 'interview' }) })
    expect(screen.getByLabelText('Company')).toHaveValue('Globex')
    expect(screen.getByLabelText('Package (LPA)')).toHaveValue('12')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        'job_applications',
        'j1',
        expect.objectContaining({ salary_paise: 120000000, status: 'interview' }),
      ),
    )
  })
})

describe('InterviewDialog', () => {
  const apps = [A({ id: 'a1', company: 'Acme' }), A({ id: 'a2', company: 'Globex' })]
  const open = (p = {}) => render(<InterviewDialog open onOpenChange={() => {}} apps={apps} tz="Asia/Kolkata" today={TODAY} {...p} />)
  it("converts the wall-clock time in the user's timezone to the stored instant", async () => {
    const user = userEvent.setup()
    open({ applicationId: 'a1' })
    expect(screen.getByLabelText('Time (Asia/Kolkata)')).toBeInTheDocument()
    await pickDate(user, screen.getByLabelText('Date'), '2026-11-10')
    await pickTime(user, screen.getByLabelText(/^Time/), '15:00')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1))
    const row = mocks.insert.mock.calls[0][1]
    expect(row).toMatchObject({ application_id: 'a1', round_name: 'Technical round', scheduled_at: '2026-11-10T09:30:00.000Z' })
    expect(row).not.toHaveProperty('date')
    expect(row).not.toHaveProperty('time')
  })
  it('edit pre-fills the local date and time from the stored instant', () => {
    open({
      event: {
        id: 'e1',
        application_id: 'a2',
        round_name: 'HR',
        scheduled_at: '2026-11-10T20:00:00Z',
        mode: 'phone',
        link: '',
        status: 'scheduled',
        notes: '',
      },
    })
    expect(screen.getByLabelText('Date')).toHavePickerValue('2026-11-11')
    expect(screen.getByLabelText(/^Time/)).toHavePickerValue('01:30')
    expect(screen.getByLabelText('Application')).toHavePickerValue('a2')
  })
  it('defaults to the first application when none is preselected, and requires one', async () => {
    const user = userEvent.setup()
    open({ apps: [] })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Choose an application')).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

describe('prep checklist', () => {
  it('adds, toggles and removes items, saving the whole list each time', async () => {
    const user = userEvent.setup()
    const app = A({ id: 'j1', prep_checklist: [{ id: 'i1', text: 'Research', done: false }] })
    const Host = () => {
      const c = usePrepChecklist(app)
      return <PrepChecklist checklist={c} />
    }
    render(<Host />)
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith('job_applications', 'j1', {
        prep_checklist: [{ id: 'i1', text: 'Research', done: true }],
      }),
    )
    await user.type(screen.getByLabelText('New prep item'), 'Mock interview')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(mocks.update.mock.calls.at(-1)[2].prep_checklist.map((i) => i.text)).toEqual(['Research', 'Mock interview']))
    await user.click(screen.getByRole('button', { name: 'Remove Research' }))
    await waitFor(() => expect(mocks.update.mock.calls.at(-1)[2].prep_checklist).toEqual([]))
  })
  it('does not save a blank item', async () => {
    const user = userEvent.setup()
    const Host = () => {
      const c = usePrepChecklist(A({ id: 'j1' }))
      return <PrepChecklist checklist={c} />
    }
    render(<Host />)
    await user.type(screen.getByLabelText('New prep item'), '   ')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('usePrepChecklist exposes the list and a template action', async () => {
    const { result } = renderHook(() => usePrepChecklist(A({ id: 'j1' })))
    expect(result.current.list).toEqual([])
    await act(async () => {
      await result.current.applyTemplate()
    })
    expect(mocks.update.mock.calls[0][2].prep_checklist.length).toBeGreaterThan(3)
  })
})

describe('StatusHistory', () => {
  it('shows "Created as" for the first entry and from → to afterwards; explains an empty history', () => {
    const { rerender } = render(
      <StatusHistory
        tz="UTC"
        history={[
          { id: '1', from_status: null, to_status: 'applied', changed_at: '2026-11-01T00:00:00Z' },
          { id: '2', from_status: 'applied', to_status: 'interview', changed_at: '2026-11-02T00:00:00Z' },
        ]}
      />,
    )
    expect(screen.getByText('Created as')).toBeInTheDocument()
    expect(screen.getAllByText('Applied')).toHaveLength(2)
    expect(screen.getByText('Interview')).toBeInTheDocument()
    rerender(<StatusHistory tz="UTC" history={[]} />)
    expect(screen.getByText(/recorded automatically/)).toBeInTheDocument()
  })
})

describe('Board', () => {
  const apps = [
    A({ id: 'a1', company: 'Acme', status: 'applied' }),
    A({ id: 'a2', company: 'Globex', status: 'offer', followup_date: '2026-10-01' }),
  ]
  it('puts each application in its status column (Wishlist … Offer …)', () => {
    render(<Board apps={apps} today={TODAY} onOpen={() => {}} onAdd={() => {}} />)
    expect(within(screen.getByTestId('col-applied')).getByText('Acme')).toBeInTheDocument()
    expect(within(screen.getByTestId('col-offer')).getByText('Globex')).toBeInTheDocument()
    expect(within(screen.getByTestId('col-interested')).getByText('Wishlist')).toBeInTheDocument()
    expect(within(screen.getByTestId('col-interested')).getByText('Drop here')).toBeInTheDocument()
  })
  it('shows "Follow up" only for open applications with a due follow-up', () => {
    render(
      <Board
        apps={[...apps, A({ id: 'a3', company: 'Initech', status: 'applied', followup_date: '2026-10-01' })]}
        today={TODAY}
        onOpen={() => {}}
        onAdd={() => {}}
      />,
    )
    expect(screen.getAllByText('Follow up')).toHaveLength(1)
    expect(within(screen.getByTestId('col-applied')).getByText('Follow up')).toBeInTheDocument()
  })
  it('dropping a card on another column changes its status; dropping on its own column does nothing', () => {
    render(<Board apps={apps} today={TODAY} onOpen={() => {}} onAdd={() => {}} />)
    const dataTransfer = { getData: () => 'a1', setData: () => {} }
    fireEvent.drop(screen.getByTestId('col-applied'), { dataTransfer })
    expect(mocks.setStatus).not.toHaveBeenCalled()
    fireEvent.drop(screen.getByTestId('col-interview'), { dataTransfer })
    expect(mocks.setStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), 'interview', TODAY)
  })
  it('only the Wishlist and Applied columns offer "+ Add", pre-selecting that status', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<Board apps={[]} today={TODAY} onOpen={() => {}} onAdd={onAdd} />)
    expect(screen.getAllByRole('button', { name: '+ Add' })).toHaveLength(2)
    await user.click(within(screen.getByTestId('col-applied')).getByRole('button', { name: '+ Add' }))
    expect(onAdd).toHaveBeenCalledWith('applied')
  })
})

describe('JobsToolbar', () => {
  const props = { onViewChange: () => {}, onFiltersChange: () => {}, filters: { q: '', status: '', source: '' }, sources: ['LinkedIn'] }
  it('offers search + source on the board, adds the status filter on the table, and hides filters on calendar/insights', () => {
    const { rerender } = render(<JobsToolbar view="board" {...props} />)
    expect(screen.getByLabelText('Search applications')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by status')).toBeNull()
    expect(screen.getByLabelText('Filter by source')).toBeInTheDocument()
    rerender(<JobsToolbar view="table" {...props} />)
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument()
    rerender(<JobsToolbar view="calendar" {...props} />)
    expect(screen.queryByLabelText('Search applications')).toBeNull()
  })
  it('hides the source filter when no application has a source', () => {
    render(<JobsToolbar view="board" {...props} sources={[]} />)
    expect(screen.queryByLabelText('Filter by source')).toBeNull()
  })
  it('reports filter changes without losing the others', async () => {
    const user = userEvent.setup()
    const onFiltersChange = vi.fn()
    render(<JobsToolbar view="table" {...props} filters={{ q: '', status: '', source: 'LinkedIn' }} onFiltersChange={onFiltersChange} />)
    await pickOption(user, screen.getByLabelText('Filter by status'), 'interview')
    expect(onFiltersChange).toHaveBeenCalledWith({ q: '', status: 'interview', source: 'LinkedIn' })
  })
})

describe('ApplicationDetail', () => {
  const app = A({ id: 'j1', company: 'Acme', job_title: 'Dev', salary_paise: 150000000, location: 'Pune' })
  const detail = (p = {}) =>
    render(
      <ApplicationDetail
        app={app}
        history={[]}
        events={[]}
        tz="UTC"
        today={TODAY}
        onClose={() => {}}
        onEdit={() => {}}
        onScheduleInterview={() => {}}
        onEditInterview={() => {}}
        {...p}
      />,
    )
  it('shows only the facts that exist', () => {
    detail()
    expect(screen.getByText('15 LPA')).toBeInTheDocument()
    expect(screen.getByText('Pune')).toBeInTheDocument()
    expect(screen.queryByText('Contact')).toBeNull()
  })
  it('closes after a CONFIRMED delete, and not when cancelled', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.confirm.mockResolvedValueOnce(false)
    detail({ onClose })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    mocks.confirm.mockResolvedValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('job_applications', 'j1'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(/status history and interviews/)
  })
  it('does not close if the delete fails', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.confirm.mockResolvedValue(true)
    mocks.remove.mockRejectedValue(new Error('nope'))
    detail({ onClose })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })
  it('changing the status goes through the status operation (which records history)', async () => {
    const user = userEvent.setup()
    detail()
    await pickOption(user, screen.getByLabelText('Status'), 'interview')
    await waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'j1' }), 'interview', TODAY))
  })
})
