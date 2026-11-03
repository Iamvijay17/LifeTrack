import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  daysLeft,
  goalRows,
  goalSummary,
  isOverdue,
  nextMilestonePosition,
  periodLabel,
  progressSourceLabel,
  remainingText,
  sortMilestones,
  visibleGoals,
} from '@/domain/goals'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  setStatus: vi.fn(),
  toggle: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('@/hooks/store', () => ({ insert: mocks.insert, update: mocks.update, remove: mocks.remove }))
vi.mock('@/services/api', () => ({ setGoalStatus: mocks.setStatus, toggleMilestone: mocks.toggle }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { Milestones } from '@/features/goals/Milestones'
import { GoalDialog } from '@/features/goals/GoalDialog'
import { GoalCard } from '@/features/goals/GoalCard'
import { GoalStats } from '@/features/goals/GoalStats'

const TODAY = '2026-11-02'
const G = (o) => ({
  id: 'g1',
  title: 'Ship v1',
  status: 'active',
  period: 'monthly',
  category: 'Career',
  notes: '',
  due_date: null,
  start_date: null,
  target_minutes: 0,
  manual_progress: 0,
  ...o,
})
const M = (o) => ({
  id: Math.random().toString(36).slice(2),
  goal_id: 'g1',
  title: 'm',
  done: false,
  position: 0,
  created_at: '2026-11-01T00:00:00Z',
  due_date: null,
  ...o,
})

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.insert.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
  mocks.remove.mockResolvedValue(undefined)
  mocks.setStatus.mockResolvedValue({})
  mocks.toggle.mockResolvedValue({})
})

describe('goals domain', () => {
  it('days left uses calendar days in both directions', () => {
    expect([
      daysLeft(G({ due_date: '2026-11-05' }), TODAY),
      daysLeft(G({ due_date: TODAY }), TODAY),
      daysLeft(G({ due_date: '2026-10-30' }), TODAY),
      daysLeft(G(), TODAY),
    ]).toEqual([3, 0, -3, null])
    expect([
      remainingText(G({ due_date: '2026-11-05' }), TODAY),
      remainingText(G({ due_date: TODAY }), TODAY),
      remainingText(G({ due_date: '2026-10-30' }), TODAY),
      remainingText(G(), TODAY),
    ]).toEqual(['3d left', 'Due today', '3d overdue', null])
  })
  it('days left is not shifted by month/year boundaries', () => {
    expect(daysLeft(G({ due_date: '2027-01-01' }), '2026-12-31')).toBe(1)
    expect(daysLeft(G({ due_date: '2026-03-01' }), '2026-02-28')).toBe(1)
  })
  it('new milestones go after the highest position, even after deletions', () => {
    expect(nextMilestonePosition([])).toBe(0)
    expect(nextMilestonePosition([M({ position: 0 }), M({ position: 1 })])).toBe(2)
    expect(nextMilestonePosition([M({ position: 5 })])).toBe(6)
  })
  it('sorts milestones by position then creation time without mutating the input', () => {
    const input = [
      M({ id: 'b', position: 1 }),
      M({ id: 'c', position: 0, created_at: '2026-11-02T00:00:00Z' }),
      M({ id: 'a', position: 0 }),
    ]
    expect(sortMilestones(input).map((m) => m.id)).toEqual(['a', 'c', 'b'])
    expect(input[0].id).toBe('b')
  })
  it('goal rows carry progress and ONLY their own milestones, in order', () => {
    const rows = goalRows(
      [G(), G({ id: 'g2', title: 'Other' })],
      [M({ id: 'x', goal_id: 'g1', position: 1, done: true }), M({ id: 'y', goal_id: 'g1', position: 0 }), M({ id: 'z', goal_id: 'g2' })],
      [],
    )
    expect(rows[0].milestones.map((m) => m.id)).toEqual(['y', 'x'])
    expect(rows[0].progress).toMatchObject({ percent: 50, source: 'milestones' })
    expect(rows[1].milestones).toHaveLength(1)
  })
  const rows = goalRows(
    [
      G({ id: 'a', due_date: '2026-12-01' }),
      G({ id: 'b', due_date: '2026-11-10', period: 'weekly' }),
      G({ id: 'c' }),
      G({ id: 'd', status: 'completed' }),
      G({ id: 'e', status: 'archived' }),
      G({ id: 'f', status: 'active', due_date: '2026-10-01' }),
    ],
    [],
    [],
  )
  it('active tab: soonest target first, goals without a date last; history shows completed and archived', () => {
    expect(visibleGoals(rows, { tab: 'active' }).map((r) => r.goal.id)).toEqual(['f', 'b', 'a', 'c'])
    expect(
      visibleGoals(rows, { tab: 'history' })
        .map((r) => r.goal.id)
        .sort(),
    ).toEqual(['d', 'e'])
  })
  it('filters by period', () => {
    expect(visibleGoals(rows, { tab: 'active', period: 'weekly' }).map((r) => r.goal.id)).toEqual(['b'])
  })
  it('summary: counts, overdue, completion share of CLOSED goals, average progress of active ones', () => {
    const s = goalSummary(rows, [M({ done: true }), M({ done: false })], TODAY)
    expect(s).toMatchObject({ active: 4, overdue: 1, completed: 1, completedShare: 50, milestonesDone: 1, milestonesTotal: 2 })
    expect(s.avg).toBe(0)
  })
  it('summary has no fake numbers when empty', () => {
    expect(goalSummary([], [], TODAY)).toMatchObject({ active: 0, avg: null, completedShare: null })
  })
  it('only ACTIVE goals can be overdue', () => {
    expect(isOverdue(G({ due_date: '2026-10-01' }), TODAY)).toBe(true)
    expect(isOverdue(G({ due_date: '2026-10-01', status: 'completed' }), TODAY)).toBe(false)
    expect(isOverdue(G(), TODAY)).toBe(false)
  })
  it('labels periods and progress sources', () => {
    expect(periodLabel('yearly')).toBe('Yearly')
    expect(
      [{ source: 'milestones', done: 2, total: 5 }, { source: 'study' }, { source: 'completed' }, { source: 'manual' }].map(
        progressSourceLabel,
      ),
    ).toEqual(['2/5 milestones', 'Study time', 'Completed', 'Manual progress'])
  })
})

describe('Milestones', () => {
  const list = (ms = [], p = {}) => render(<Milestones goal={G()} milestones={ms} {...p} />)
  it('refuses an empty title inline (no toast) and does not save', async () => {
    const user = userEvent.setup()
    list()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name the milestone first.')
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('adds a milestone after the existing ones, then clears the form', async () => {
    const user = userEvent.setup()
    list([M({ position: 0 }), M({ position: 4 })])
    await user.type(screen.getByLabelText('New milestone'), '  Design  ')
    fireEvent.change(screen.getByLabelText('Milestone due date'), { target: { value: '2026-11-20' } })
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith('milestones', { goal_id: 'g1', title: 'Design', due_date: '2026-11-20', position: 5 }),
    )
    await waitFor(() => expect(screen.getByLabelText('New milestone')).toHaveValue(''))
  })
  it('a blank due date is stored as null', async () => {
    const user = userEvent.setup()
    list()
    await user.type(screen.getByLabelText('New milestone'), 'Build')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith('milestones', expect.objectContaining({ due_date: null, position: 0 })))
  })
  it('toggling and deleting act on the right milestone', async () => {
    const user = userEvent.setup()
    const a = M({ id: 'a', title: 'Design' }),
      b = M({ id: 'b', title: 'Build', done: true })
    list([a, b])
    await user.click(screen.getByRole('button', { name: 'Mark done: Design' }))
    expect(mocks.toggle).toHaveBeenCalledWith(a)
    expect(screen.getByRole('button', { name: 'Mark not done: Build' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Delete milestone Build' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('milestones', 'b'))
  })
})

describe('GoalDialog', () => {
  const open = (p = {}) => render(<GoalDialog open onOpenChange={() => {}} today={TODAY} {...p} />)
  it('rejects a target date before the start date, and requires a title', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Create goal' }))
    expect(await screen.findByText('Name the goal')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Goal'), 'X')
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-12-10' } })
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2026-12-01' } })
    await user.click(screen.getByRole('button', { name: 'Create goal' }))
    expect(await screen.findByText('Target date must be on or after the start date')).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('stores hours as minutes and blank dates as null; defaults the start to today and the period to the filter', async () => {
    const user = userEvent.setup()
    open({ defaultPeriod: 'yearly' })
    expect(screen.getByLabelText('Start date')).toHaveValue(TODAY)
    expect(screen.getByLabelText('Type')).toHaveValue('yearly')
    await user.type(screen.getByLabelText('Goal'), 'Read 20 books')
    await user.clear(screen.getByLabelText('Study target (hours)'))
    await user.type(screen.getByLabelText('Study target (hours)'), '1.5')
    await user.click(screen.getByRole('button', { name: 'Create goal' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'goals',
        expect.objectContaining({ title: 'Read 20 books', period: 'yearly', target_minutes: 90, due_date: null, start_date: TODAY }),
      ),
    )
  })
  it('editing pre-fills every field and updates the same goal', async () => {
    const user = userEvent.setup()
    open({ goal: G({ title: 'Ship v1', target_minutes: 600, manual_progress: 40, due_date: '2026-12-31', category: 'Fitness' }) })
    expect(screen.getByLabelText('Study target (hours)')).toHaveValue(10)
    expect(screen.getByLabelText('Manual progress (%)')).toHaveValue(40)
    expect(screen.getByLabelText('Category')).toHaveValue('Fitness')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        'goals',
        'g1',
        expect.objectContaining({ target_minutes: 600, manual_progress: 40, due_date: '2026-12-31' }),
      ),
    )
  })
  it('keeps what you typed when the page re-renders', async () => {
    const user = userEvent.setup()
    const { rerender } = open()
    await user.type(screen.getByLabelText('Goal'), 'Keep me')
    rerender(<GoalDialog open onOpenChange={() => {}} today={TODAY} />)
    expect(screen.getByLabelText('Goal')).toHaveValue('Keep me')
  })
})

describe('GoalCard', () => {
  const row = (goal, milestones = [], progress) => ({ goal, milestones, progress: progress ?? { percent: 40, source: 'manual' } })
  const card = (r, p = {}) => render(<GoalCard row={r} today={TODAY} onEdit={() => {}} {...p} />)
  const openMenu = (user, title = 'Ship v1') => user.click(screen.getByRole('button', { name: `Actions for ${title}` }))
  it('shows what the bar measures, the dates and the time left', () => {
    card(row(G({ start_date: '2026-11-01', due_date: '2026-11-12' })))
    expect(screen.getByText('Manual progress')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('1 Nov → 12 Nov 2026')).toBeInTheDocument()
    expect(screen.getByText('10d left')).toBeInTheDocument()
  })
  it('flags an overdue active goal', () => {
    card(row(G({ due_date: '2026-10-30' })))
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('3d overdue')).toBeInTheDocument()
  })
  it('a completed goal shows no overdue/time-left even if its date has passed', () => {
    card(row(G({ status: 'completed', due_date: '2026-10-30' }), [], { percent: 100, source: 'completed' }))
    expect(screen.queryByText('Overdue')).toBeNull()
    expect(screen.queryByText(/overdue|left/)).toBeNull()
    expect(screen.getByText('completed')).toBeInTheDocument()
  })
  it('offers only the status changes that make sense for the current status', async () => {
    const user = userEvent.setup()
    const { unmount } = card(row(G({ status: 'active' })))
    await openMenu(user)
    expect(screen.getByRole('menuitem', { name: 'Mark completed' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Reopen' })).toBeNull()
    unmount()
    card(row(G({ status: 'completed' })))
    await openMenu(user)
    expect(screen.queryByRole('menuitem', { name: 'Mark completed' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Reopen' })).toBeInTheDocument()
  })
  it('completing calls the status operation with the goal', async () => {
    const user = userEvent.setup()
    const g = G()
    card(row(g))
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Mark completed' }))
    expect(mocks.setStatus).toHaveBeenCalledWith(g, 'completed')
  })
  it('delete asks first and says milestones go too', async () => {
    const user = userEvent.setup()
    mocks.confirm.mockResolvedValue(true)
    card(row(G()))
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('goals', 'g1'))
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(/milestones are deleted too/)
  })
  it('milestones are collapsed until expanded, and the count reflects done/total', async () => {
    const user = userEvent.setup()
    card(row(G(), [M({ title: 'Design', done: true }), M({ title: 'Build' })], { percent: 50, source: 'milestones', done: 1, total: 2 }))
    expect(screen.getByText('1/2 milestones')).toBeInTheDocument()
    expect(screen.queryByLabelText('New milestone')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Milestones \(1\/2\)/ }))
    expect(screen.getByLabelText('New milestone')).toBeInTheDocument()
    expect(screen.getByText('Design')).toBeInTheDocument()
  })
})

describe('GoalStats', () => {
  it('shows dashes instead of fake percentages when there is nothing to average', () => {
    render(
      <GoalStats
        summary={{ active: 0, overdue: 0, completed: 0, completedShare: null, avg: null, milestonesDone: 0, milestonesTotal: 0 }}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/of closed goals/)).toBeNull()
    expect(screen.getByText('0/0')).toBeInTheDocument()
  })
  it('shows the completion share of closed goals', () => {
    render(
      <GoalStats summary={{ active: 2, overdue: 1, completed: 3, completedShare: 75, avg: 42, milestonesDone: 4, milestonesTotal: 9 }} />,
    )
    expect(screen.getByText('75% of closed goals')).toBeInTheDocument()
    expect(screen.getByText('1 overdue')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })
})
