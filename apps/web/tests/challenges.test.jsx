import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  tables: {},
  createChallenge: vi.fn(),
  updateChallenge: vi.fn(),
  checkInChallenge: vi.fn(),
  updateCheckin: vi.fn(),
  removeCheckin: vi.fn(),
  pauseChallenge: vi.fn(),
  resumeChallenge: vi.fn(),
  cancelChallenge: vi.fn(),
  completeChallenge: vi.fn(),
  deleteChallenge: vi.fn(),
  settleChallenges: vi.fn(),
  saveChallengeTemplate: vi.fn(),
  deleteRow: vi.fn(),
  confirm: vi.fn(),
  ask: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/services/api', () => ({
  createChallenge: mocks.createChallenge,
  updateChallenge: mocks.updateChallenge,
  checkInChallenge: mocks.checkInChallenge,
  updateCheckin: mocks.updateCheckin,
  removeCheckin: mocks.removeCheckin,
  pauseChallenge: mocks.pauseChallenge,
  resumeChallenge: mocks.resumeChallenge,
  cancelChallenge: mocks.cancelChallenge,
  completeChallenge: mocks.completeChallenge,
  deleteChallenge: mocks.deleteChallenge,
  settleChallenges: mocks.settleChallenges,
  saveChallengeTemplate: mocks.saveChallengeTemplate,
  deleteRow: mocks.deleteRow,
}))
vi.mock('@/hooks/store', () => {
  const rows = (t) => mocks.tables[t] ?? []
  const useTable = (t) => ({ rows: rows(t), loading: false, error: null, refetch: () => {} })
  return {
    useTable,
    useTables: (...ts) => ({ data: Object.fromEntries(ts.map((t) => [t, rows(t)])), loading: false, error: null, refetch: () => {} }),
    upsert: vi.fn(),
  }
})
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('@/components/shared/Prompt', () => ({ usePrompt: () => mocks.ask }))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/lib/celebrate', () => ({ celebrate: vi.fn(), tick: vi.fn() }))

import ChallengesPage from '@/features/challenges/ChallengesPage'
import { ChallengeCard } from '@/features/challenges/ChallengeCard'
import { CheckInDialog } from '@/features/challenges/CheckInDialog'
import { ChallengeDialog } from '@/features/challenges/ChallengeDialog'
import { challengeCards } from '@/domain/challenges'
import { pickOption } from './pickers'

const TODAY = '2026-11-12' // Thursday; 08:00 UTC is 13:30 in Asia/Kolkata, the default timezone
const C = (o = {}) => ({
  id: 'c1',
  title: 'Read daily',
  description: '',
  kind: 'daily',
  target: 1,
  unit: '',
  start_date: '2026-11-01',
  end_date: '2026-11-30',
  status: 'active',
  category: 'Learning',
  color: '#8B5CF6',
  habit_id: null,
  milestones: [],
  pauses: [],
  notes: '',
  created_at: '2026-11-01T00:00:00Z',
  final_pct: null,
  ...o,
})
const K = (challenge_id, day, o = {}) => ({
  id: `${challenge_id}-${day}`,
  challenge_id,
  checkin_date: day,
  amount: 1,
  note: '',
  evidence: [],
  ...o,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-12T08:00:00Z') })
  Object.values(mocks).forEach((m) => m?.mockReset?.())
  mocks.tables = {
    challenges: [],
    challenge_checkins: [],
    challenge_templates: [],
    habit_logs: [],
    habits: [],
    user_settings: [{ timezone: 'Asia/Kolkata', week_starts_on: 1 }],
  }
  mocks.settleChallenges.mockResolvedValue([])
  mocks.checkInChallenge.mockResolvedValue({ checkin: {}, completed: null })
  mocks.createChallenge.mockImplementation(async (v) => ({ id: 'new', ...v }))
  mocks.confirm.mockResolvedValue(true)
})
afterEach(() => vi.useRealTimers())

const page = (url = '/challenges') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ChallengesPage />
    </MemoryRouter>,
  )

describe('the Challenges page', () => {
  it('invites the first challenge and points at templates', () => {
    page()
    expect(screen.getByText('No active challenges')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse templates' })).toBeInTheDocument()
  })

  it('shows each running challenge with its progress, rhythm and pace in words', () => {
    mocks.tables.challenges = [
      C(),
      C({ id: 'c2', title: 'Steps', kind: 'total', target: 1000, unit: 'steps', start_date: '2026-11-01', end_date: '2026-11-30' }),
    ]
    mocks.tables.challenge_checkins = ['01', '02', '03'].map((d) => K('c1', `2026-11-${d}`))
    page()
    expect(screen.getByText('Read daily')).toBeInTheDocument()
    expect(screen.getByText('Steps')).toBeInTheDocument()
    expect(screen.getByText('Every day · 1 Nov to 30 Nov')).toBeInTheDocument()
    expect(screen.getAllByText('Behind').length).toBeGreaterThan(0) // eight days missed in a row on c1
    expect(screen.getByText('3 of 30 days')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '10% complete' })).toBeInTheDocument()
  })

  it('checks in for today with one tap on a yes/no challenge, and offers undo once done', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    mocks.tables.challenges = [C()]
    page()
    await user.click(screen.getByRole('button', { name: 'Check in today for Read daily' }))
    expect(mocks.checkInChallenge).toHaveBeenCalledWith('c1', { date: TODAY, today: TODAY })
  })

  it('shows today as done, counted, and lets it be undone', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    mocks.tables.challenges = [C()]
    mocks.tables.challenge_checkins = [K('c1', TODAY)]
    page()
    expect(screen.getByText('Done today')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "Undo today's check-in for Read daily" }))
    expect(mocks.removeCheckin).toHaveBeenCalledWith('c1-' + TODAY)
  })

  it('says a day was counted from the linked habit instead of offering a second check-in', () => {
    mocks.tables.challenges = [C({ habit_id: 'h1' })]
    mocks.tables.habits = [{ id: 'h1', name: 'Read', archived_at: null }]
    mocks.tables.habit_logs = [{ habit_id: 'h1', log_date: TODAY, status: 'done' }]
    page()
    expect(screen.getByText('Counted from your habit')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Check in today/ })).not.toBeInTheDocument()
  })

  it('offers to top up a challenge with an amount rather than a second check-in', () => {
    mocks.tables.challenges = [C({ target: 20, unit: 'pages' })]
    mocks.tables.challenge_checkins = [K('c1', TODAY, { amount: 8 })]
    page()
    expect(screen.getByRole('button', { name: /Add more/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check in today for Read daily' })).not.toBeInTheDocument()
  })

  it('shows a paused challenge with Resume instead of a check-in', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    mocks.tables.challenges = [C({ status: 'paused', pauses: [{ from: '2026-11-10', to: null }] })]
    page()
    expect(screen.getByText('Paused days are not counted')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Resume/ }))
    expect(mocks.resumeChallenge).toHaveBeenCalledWith('c1', TODAY)
  })

  it('closes what has finished, once, when the page opens, and says so', async () => {
    mocks.settleChallenges.mockResolvedValue([{ id: 'c9', title: 'Old run', final_pct: 100 }])
    page()
    await waitFor(() => expect(mocks.settleChallenges).toHaveBeenCalledWith(TODAY))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Challenge complete: Old run'))
    expect(mocks.settleChallenges).toHaveBeenCalledTimes(1)
  })

  it('opens a challenge from a link and shows its calendar, milestones and check-ins with evidence', async () => {
    mocks.tables.challenges = [C()]
    mocks.tables.challenge_checkins = [
      K('c1', '2026-11-03', { note: 'Chapter 4', evidence: [{ label: 'Photo', url: 'https://example.com/p.jpg' }] }),
    ]
    page('/challenges?c=c1')
    const dlg = await screen.findByRole('dialog', { name: 'Read daily' })
    expect(within(dlg).getByRole('grid', { name: 'Progress calendar for November 2026' })).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: 'Tuesday 3 November: done' })).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: 'Wednesday 4 November: missed' })).toBeInTheDocument()
    expect(within(dlg).getByText('Chapter 4')).toBeInTheDocument()
    const link = within(dlg).getByRole('link', { name: /Photo/ })
    expect(link).toHaveAttribute('href', 'https://example.com/p.jpg')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(within(dlg).getByText('Halfway there')).toBeInTheDocument()
  })

  it('asks before cancelling and before deleting, and does nothing if you say no', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    mocks.tables.challenges = [C()]
    mocks.confirm.mockResolvedValue(false)
    page('/challenges?c=c1')
    const dlg = await screen.findByRole('dialog', { name: 'Read daily' })
    await user.click(within(dlg).getByRole('button', { name: 'Cancel challenge' }))
    await user.click(within(dlg).getByRole('button', { name: /Delete/ }))
    expect(mocks.confirm).toHaveBeenCalledTimes(2)
    expect(mocks.cancelChallenge).not.toHaveBeenCalled()
    expect(mocks.deleteChallenge).not.toHaveBeenCalled()
    mocks.confirm.mockResolvedValue(true)
    await user.click(within(dlg).getByRole('button', { name: 'Cancel challenge' }))
    expect(mocks.cancelChallenge).toHaveBeenCalledWith('c1')
  })

  it('does not offer to edit or check in on a finished challenge, and lists it in History', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    mocks.tables.challenges = [
      C({ status: 'completed', final_pct: 100, completed_at: '2026-11-10T00:00:00Z' }),
      C({ id: 'c2', title: 'Dropped', status: 'cancelled', cancelled_at: '2026-11-05T00:00:00Z' }),
    ]
    page()
    expect(screen.getByText('No active challenges')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByText('Achieved · 100%')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Run again/ })).toHaveLength(2)
  })

  it('shows analytics and the calendar view from real numbers', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    mocks.tables.challenges = [C()]
    mocks.tables.challenge_checkins = ['09', '10', '11'].map((d) => K('c1', `2026-11-${d}`))
    page()
    await user.click(screen.getByRole('tab', { name: 'Analytics' }))
    expect(screen.getByText('Check-ins per week')).toBeInTheDocument()
    expect(screen.getByText('3 check-ins on 3 different days in total.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Calendar' }))
    expect(screen.getByRole('button', { name: /11 November.*1 of 1 challenges done/ })).toBeInTheDocument()
  })

  it('lists built-in templates and starts the form from one', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    page('/challenges?tab=templates')
    expect(screen.getByText('30 days of reading')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /Use/ })[0])
    const dlg = await screen.findByRole('dialog', { name: 'New challenge' })
    expect(within(dlg).getByLabelText('Name')).toHaveValue('30 days of reading')
  })
})

describe('the challenge form', () => {
  const open = (props = {}) => render(<ChallengeDialog open onOpenChange={vi.fn()} templates={[]} habits={[]} today={TODAY} {...props} />)

  it('explains every problem instead of saving, and saves nothing', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    open()
    await user.click(screen.getByRole('button', { name: 'Start challenge' }))
    expect(await screen.findByText('Give your challenge a name.')).toBeInTheDocument()
    expect(mocks.createChallenge).not.toHaveBeenCalled()
  })

  it('creates a challenge with the dates, target, unit and milestones that were typed', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const onCreated = vi.fn()
    open({ onCreated })
    await user.type(screen.getByLabelText('Name'), '  Run 5k  ')
    await user.clear(screen.getByLabelText('Amount per day'))
    await user.type(screen.getByLabelText('Amount per day'), '5')
    await user.type(screen.getByLabelText(/Unit, e.g. pages/), 'km')
    await user.type(screen.getByLabelText(/Milestones/), '40 Warmed up{Enter}80 Nearly')
    await user.click(screen.getByRole('button', { name: 'Start challenge' }))
    await waitFor(() => expect(mocks.createChallenge).toHaveBeenCalledTimes(1))
    expect(mocks.createChallenge.mock.calls[0][0]).toMatchObject({
      title: 'Run 5k',
      kind: 'daily',
      target: 5,
      unit: 'km',
      start_date: TODAY,
      end_date: '2026-12-11',
      habit_id: null,
      milestones: [
        { pct: 40, title: 'Warmed up' },
        { pct: 80, title: 'Nearly' },
      ],
    })
    expect(onCreated).toHaveBeenCalled()
  })

  it('keeps a weekly target within seven days', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    open()
    await user.type(screen.getByLabelText('Name'), 'Gym')
    await user.click(screen.getByRole('tab', { name: 'Weekly' }))
    const target = screen.getByLabelText('Days per week')
    await user.clear(target)
    await user.type(target, '9')
    await user.click(screen.getByRole('button', { name: 'Start challenge' }))
    expect(await screen.findByText('A week only has 7 days.')).toBeInTheDocument()
    expect(mocks.createChallenge).not.toHaveBeenCalled()
  })

  it('fills the form from a template and lets it be changed', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    open({
      templates: [
        {
          id: 't1',
          name: 'Morning run',
          kind: 'weekly',
          target: 3,
          unit: '',
          duration_days: 42,
          category: 'Fitness',
          color: '#F97316',
          milestones: [],
        },
      ],
    })
    await pickOption(user, screen.getByRole('combobox', { name: /Start from a template/ }), 't1')
    expect(screen.getByLabelText('Name')).toHaveValue('Morning run')
    expect(screen.getByLabelText('Days per week')).toHaveValue('3')
  })

  it('locks the kind once a challenge has check-ins', () => {
    open({ challenge: C(), checkinCount: 3 })
    expect(screen.getByText('The kind is fixed once there are check-ins.')).toBeInTheDocument()
  })
})

describe('the check-in form', () => {
  const card = () => challengeCards([C({ target: 20, unit: 'pages' })], [], [], TODAY)[0]
  const open = (props = {}) =>
    render(<CheckInDialog open onOpenChange={vi.fn()} card={card()} habitLogs={[]} checkins={[]} today={TODAY} {...props} />)

  it('checks in with the amount, a note and evidence', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    open()
    await user.clear(screen.getByLabelText(/Amount/))
    await user.type(screen.getByLabelText(/Amount/), '12')
    await user.type(screen.getByLabelText(/Note/), 'Chapter 3')
    await user.type(screen.getByLabelText('Evidence link 1'), 'https://example.com/a')
    await user.click(screen.getByRole('button', { name: 'Check in' }))
    await waitFor(() => expect(mocks.checkInChallenge).toHaveBeenCalledTimes(1))
    expect(mocks.checkInChallenge).toHaveBeenCalledWith('c1', {
      date: TODAY,
      amount: 12,
      note: 'Chapter 3',
      evidence: [{ label: '', url: 'https://example.com/a' }],
      today: TODAY,
    })
  })

  it('refuses a link that is not http(s) and does not send it', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    open()
    await user.type(screen.getByLabelText('Evidence link 1'), 'javascript:alert(1)')
    expect(screen.getByRole('alert')).toHaveTextContent('http:// or https://')
    await user.click(screen.getByRole('button', { name: 'Check in' }))
    expect(mocks.checkInChallenge).not.toHaveBeenCalled()
  })

  it('explains that a day already has a check-in instead of creating a second', () => {
    open({ checkins: [K('c1', TODAY)] })
    expect(screen.getByText('You already checked in for that day.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check in' })).toBeDisabled()
  })

  it('edits an existing check-in without touching its day', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const existing = K('c1', '2026-11-05', { amount: 8, note: 'before' })
    open({ existing, checkins: [existing] })
    await user.clear(screen.getByLabelText(/Note/))
    await user.type(screen.getByLabelText(/Note/), 'after')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocks.updateCheckin).toHaveBeenCalledWith(
        'c1-2026-11-05',
        { amount: 8, note: 'after', evidence: [{ label: '', url: '' }] },
        TODAY,
      ),
    )
  })
})

describe('the card', () => {
  it('labels the timeline in words, not only colour', () => {
    const card = challengeCards([C()], [K('c1', '2026-11-03')], [], TODAY)[0]
    render(
      <MemoryRouter>
        <ChallengeCard
          card={card}
          today={TODAY}
          onOpen={() => {}}
          onCheckIn={() => {}}
          onQuickCheckIn={() => {}}
          onUndo={() => {}}
          onResume={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('img', { name: 'Timeline of Read daily: 1 of 30 done' })).toBeInTheDocument()
    expect(document.querySelector('[title="Tue 3 Nov: done"]')).toBeTruthy()
    expect(document.querySelector('[title="Wed 4 Nov: missed"]')).toBeTruthy()
  })
})
